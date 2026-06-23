import { OrderStatus } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";

const ORDER_STATUS_VALUES = Object.values(OrderStatus);

type AdminOrder = Prisma.OrderGetPayload<{
  include: {
    user: {
      include: {
        telegramUser: true;
      };
    };
    items: {
      include: {
        productVariant: {
          include: {
            product: {
              include: {
                category: true;
              };
            };
            images: true;
          };
        };
      };
    };
  };
}>;

function parseDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function mapOrder(order: AdminOrder) {
  return {
    id: order.id,
    status: order.status,
    totalPrice: order.totalPrice,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    userId: order.userId,
    telegramUser: order.user.telegramUser
      ? {
          telegramId: order.user.telegramUser.telegramId.toString(),
          username: order.user.telegramUser.username,
          firstName: order.user.telegramUser.firstName,
        }
      : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      title: item.variantTitleSnapshot,
      price: item.priceSnapshot,
      quantity: item.quantity,
      totalPrice: item.priceSnapshot * item.quantity,
      currentVariant: item.productVariant
        ? {
            id: item.productVariant.id,
            productId: item.productVariant.productId,
            title: item.productVariant.title,
            optionLabel: item.productVariant.optionLabel,
            price: item.productVariant.price,
            maxQuantity: item.productVariant.maxQuantity,
            isActive: item.productVariant.isActive,
            categoryTitle: item.productVariant.product.category.title,
            imageUrl:
              item.productVariant.images.sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ??
              null,
          }
        : null,
    })),
  };
}

export const ordersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      status?: OrderStatus;
      q?: string;
      from?: string;
      to?: string;
    };
    const search = query.q?.trim();
    const from = parseDate(query.from);
    const to = parseDate(query.to);

    const where: Prisma.OrderWhereInput = {
      status: query.status && ORDER_STATUS_VALUES.includes(query.status) ? query.status : undefined,
      createdAt:
        from || to
          ? {
              gte: from ?? undefined,
              lte: to ?? undefined,
            }
          : undefined,
      OR: search
        ? [
            Number.isInteger(Number(search))
              ? {
                  id: Number(search),
                }
              : {},
            {
              customerName: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              customerPhone: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              user: {
                telegramUser: {
                  username: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              },
            },
          ]
        : undefined,
    };

    const orders = await prisma.order.findMany({
      where,
      include: {
        user: {
          include: {
            telegramUser: true,
          },
        },
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  include: {
                    category: true,
                  },
                },
                images: {
                  orderBy: {
                    sortOrder: "asc",
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    return orders.map(mapOrder);
  });

  app.get("/:orderId", async (request, reply) => {
    const params = request.params as {
      orderId: string;
    };
    const orderId = Number(params.orderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id заказа",
      });
    }

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        user: {
          include: {
            telegramUser: true,
          },
        },
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  include: {
                    category: true,
                  },
                },
                images: {
                  orderBy: {
                    sortOrder: "asc",
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return reply.status(404).send({
        message: "Заказ не найден",
      });
    }

    return mapOrder(order);
  });

  app.patch("/:orderId/status", async (request, reply) => {
    const params = request.params as {
      orderId: string;
    };
    const orderId = Number(params.orderId);
    const body = (request.body ?? {}) as {
      status?: OrderStatus;
      restoreStock?: boolean;
    };
    const nextStatus = body.status;
    const restoreStock = Boolean(body.restoreStock);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id заказа",
      });
    }

    if (!nextStatus || !ORDER_STATUS_VALUES.includes(nextStatus)) {
      return reply.status(400).send({
        message: "Некорректный статус заказа",
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: {
            id: orderId,
          },
          include: {
            items: true,
          },
        });

        if (!order) {
          throw new Error("ORDER_NOT_FOUND");
        }

        if (restoreStock && nextStatus !== OrderStatus.CANCELED) {
          throw new Error("RESTORE_ONLY_ON_CANCEL");
        }

        if (restoreStock) {
          if (order.status === OrderStatus.CANCELED) {
            throw new Error("ALREADY_CANCELED");
          }

          const updatedOrder = await tx.order.updateMany({
            where: {
              id: orderId,
              status: {
                not: OrderStatus.CANCELED,
              },
            },
            data: {
              status: OrderStatus.CANCELED,
            },
          });

          if (updatedOrder.count !== 1) {
            throw new Error("ALREADY_CANCELED");
          }

          for (const item of order.items) {
            if (!item.productVariantId) {
              continue;
            }

            await tx.productVariant.update({
              where: {
                id: item.productVariantId,
              },
              data: {
                maxQuantity: {
                  increment: item.quantity,
                },
              },
            });
          }

          return;
        }

        await tx.order.update({
          where: {
            id: orderId,
          },
          data: {
            status: nextStatus,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
        return reply.status(404).send({
          message: "Заказ не найден",
        });
      }

      if (error instanceof Error && error.message === "RESTORE_ONLY_ON_CANCEL") {
        return reply.status(400).send({
          message: "Остатки можно вернуть только при отмене заказа",
        });
      }

      if (error instanceof Error && error.message === "ALREADY_CANCELED") {
        return reply.status(409).send({
          message: "Заказ уже отменен, повторный возврат остатков заблокирован",
        });
      }

      throw error;
    }

    const order = await prisma.order.findUniqueOrThrow({
      where: {
        id: orderId,
      },
      include: {
        user: {
          include: {
            telegramUser: true,
          },
        },
        items: {
          include: {
            productVariant: {
              include: {
                product: {
                  include: {
                    category: true,
                  },
                },
                images: {
                  orderBy: {
                    sortOrder: "asc",
                  },
                },
              },
            },
          },
        },
      },
    });

    return mapOrder(order);
  });
};
