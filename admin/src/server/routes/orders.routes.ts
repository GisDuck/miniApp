import type { FastifyPluginAsync } from "fastify";

import { getImagesFromManifest, readImageManifest } from "../lib/images.js";
import {
  getMoySkladCustomerOrder,
  getMoySkladCustomerOrders,
  type MoySkladCustomerOrder,
} from "../lib/moysklad.js";
import type { AdminOrder, OrderStatus } from "../types.js";

type ImageManifest = Awaited<ReturnType<typeof readImageManifest>>;

function getStatus(order: MoySkladCustomerOrder): OrderStatus {
  const stateHref = order.state?.meta?.href;
  const stateName = order.state?.name?.trim().toLowerCase().replace(/ё/g, "е") ?? "";
  const stateByHref: Array<[string | undefined, OrderStatus]> = [
    [process.env.MOYSKLAD_ORDER_CREATED_STATE_HREF, "CREATED"],
    [process.env.MOYSKLAD_ORDER_PREPARING_STATE_HREF, "PREPARING"],
    [process.env.MOYSKLAD_ORDER_CHANGED_STATE_HREF, "PREPARING"],
    [process.env.MOYSKLAD_ORDER_DELIVERING_STATE_HREF, "DELIVERING"],
    [process.env.MOYSKLAD_ORDER_READY_STATE_HREF, "READY_FOR_PICKUP"],
    [process.env.MOYSKLAD_ORDER_COMPLETED_STATE_HREF, "COMPLETED"],
    [process.env.MOYSKLAD_ORDER_CANCELED_STATE_HREF, "CANCELED"],
  ];
  const matchedState = stateByHref.find(([href]) => href && href === stateHref);

  if (matchedState) {
    return matchedState[1];
  }

  if (stateName.includes("отмен") || stateName.includes("cancel")) {
    return "CANCELED";
  }

  if (stateName.includes("заверш") || stateName.includes("complete")) {
    return "COMPLETED";
  }

  if (stateName.includes("внесли измен") || stateName.includes("собран")) {
    return "PREPARING";
  }

  return "CREATED";
}

function getUuidFromHref(href?: string) {
  return href?.split("/").pop() ?? null;
}

function mapOrder(order: MoySkladCustomerOrder, imageManifest: ImageManifest): AdminOrder {
  const items = (order.positions?.rows ?? []).map((position, index) => {
    const variantId = position.assortment?.id ?? getUuidFromHref(position.assortment?.meta.href);
    const images = variantId ? getImagesFromManifest(variantId, imageManifest) : [];
    const price = Math.round((position.price ?? 0) / 100);
    const quantity = position.quantity ?? 0;

    return {
      id: position.id ?? `${order.id}:${index}`,
      productVariantId: variantId,
      title: position.assortment?.name ?? "Товар",
      price,
      quantity,
      totalPrice: price * quantity,
      imageUrl: images[0]?.url ?? null,
    };
  });

  return {
    id: order.id,
    name: order.name,
    status: getStatus(order),
    stateName: order.state?.name ?? null,
    totalPrice: Math.round((order.sum ?? 0) / 100),
    customerName: order.agent?.name ?? "",
    customerPhone: order.agent?.phone ?? "",
    shipmentAddress: order.shipmentAddress ?? null,
    createdAt: new Date(order.created ?? order.moment ?? Date.now()).toISOString(),
    updatedAt: new Date(order.updated ?? order.created ?? Date.now()).toISOString(),
    items,
  };
}

export const ordersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      status?: OrderStatus;
      q?: string;
    };
    const search = query.q?.trim().toLowerCase();
    const [orders, imageManifest] = await Promise.all([
      getMoySkladCustomerOrders(),
      readImageManifest(),
    ]);

    return orders.map((order) => mapOrder(order, imageManifest)).filter((order) => {
      if (query.status && order.status !== query.status) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        order.id,
        order.name,
        order.customerName,
        order.customerPhone,
        order.stateName ?? "",
      ].some((value) => value.toLowerCase().includes(search));
    });
  });

  app.get("/:orderId", async (request, reply) => {
    const params = request.params as {
      orderId: string;
    };

    try {
      const [order, imageManifest] = await Promise.all([
        getMoySkladCustomerOrder(params.orderId),
        readImageManifest(),
      ]);

      return mapOrder(order, imageManifest);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return reply.status(404).send({
          message: "Заказ не найден",
        });
      }

      throw error;
    }
  });
};
