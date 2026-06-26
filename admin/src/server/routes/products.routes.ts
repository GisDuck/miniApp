import type { FastifyPluginAsync } from "fastify";

import { getImagesFromManifest, readImageManifest } from "../lib/images.js";
import {
  getMoySkladAssortment,
  getMoySkladProductFolders,
  type MoySkladAssortmentRow,
  type MoySkladMeta,
} from "../lib/moysklad.js";
import type {
  AdminProductDetails,
  AdminProductListItem,
  AdminProductVariant,
} from "../types.js";

type ImageManifest = Awaited<ReturnType<typeof readImageManifest>>;

type ProductBuild = {
  id: string;
  meta: MoySkladMeta;
  code: string;
  title: string;
  description: string;
  isActive: boolean;
  categoryId: string;
  categoryTitle: string;
  variants: AdminProductVariant[];
};

function getPrice(row: MoySkladAssortmentRow) {
  const priceTypeName = process.env.MOYSKLAD_PRICE_TYPE_NAME;
  const price =
    (priceTypeName
      ? row.salePrices?.find((salePrice) => salePrice.priceType?.name === priceTypeName)
      : row.salePrices?.[0]) ?? row.salePrices?.[0];

  return Math.round((price?.value ?? 0) / 100);
}

function getOptionLabel(row: MoySkladAssortmentRow) {
  return row.characteristics?.[0]?.value ?? row.name;
}

function getActiveAttribute(row: MoySkladAssortmentRow) {
  const activeAttribute = row.attributes?.find((attribute) => {
    return attribute.name?.toLowerCase() === "isactive";
  });

  return activeAttribute?.value !== false;
}

function getCategoryTitle(row: MoySkladAssortmentRow) {
  return row.pathName?.trim() || "Без категории";
}

function getUuidFromHref(href?: string) {
  return href?.split("/").pop() ?? null;
}

function mapVariant(row: MoySkladAssortmentRow, images: ImageManifest) {
  const variantImages = getImagesFromManifest(row.id, images);

  return {
    id: row.id,
    productId: getUuidFromHref(row.product?.meta.href) ?? row.id,
    code: row.code ?? row.id,
    optionLabel: getOptionLabel(row),
    title: row.name,
    description: row.description ?? null,
    price: getPrice(row),
    maxQuantity: Math.max(0, Math.floor(row.stock ?? row.quantity ?? 0)),
    isActive: !row.archived && getActiveAttribute(row),
    images: variantImages,
  } satisfies AdminProductVariant;
}

async function getAdminProducts() {
  const [folders, rows, imageManifest] = await Promise.all([
    getMoySkladProductFolders(),
    getMoySkladAssortment(),
    readImageManifest(),
  ]);
  const foldersByHref = new Map(
    folders
      .filter((folder) => !folder.archived)
      .map((folder) => [
        folder.meta.href,
        {
          id: folder.id,
          title: folder.pathName ? `${folder.pathName}/${folder.name}` : folder.name,
        },
      ]),
  );
  const productsById = new Map<string, ProductBuild>();
  const variants = rows.filter((row) => row.meta.type === "variant");

  for (const row of rows) {
    if (row.meta.type === "variant") {
      continue;
    }

    const folder = row.productFolder?.meta.href
      ? foldersByHref.get(row.productFolder.meta.href)
      : null;
    const product: ProductBuild = {
      id: row.id,
      meta: row.meta,
      code: row.code ?? row.id,
      title: row.name,
      description: row.description ?? "",
      isActive: !row.archived && getActiveAttribute(row),
      categoryId: folder?.id ?? row.productFolder?.meta.href ?? getCategoryTitle(row),
      categoryTitle: folder?.title ?? getCategoryTitle(row),
      variants: [],
    };

    if (!row.variantsCount) {
      product.variants.push(mapVariant(row, imageManifest));
    }

    productsById.set(product.id, product);
  }

  for (const row of variants) {
    const productId = getUuidFromHref(row.product?.meta.href);

    if (!productId) {
      continue;
    }

    const product =
      productsById.get(productId) ??
      ({
        id: productId,
        meta: row.product?.meta ?? row.meta,
        code: productId,
        title: row.name,
        description: "",
        isActive: true,
        categoryId: getCategoryTitle(row),
        categoryTitle: getCategoryTitle(row),
        variants: [],
      } satisfies ProductBuild);

    product.variants.push(mapVariant(row, imageManifest));
    productsById.set(product.id, product);
  }

  return Array.from(productsById.values()).map((product) => ({
    ...product,
    variants: product.variants.sort((first, second) =>
      first.title.localeCompare(second.title, "ru"),
    ),
  }));
}

function toListItem(product: ProductBuild): AdminProductListItem {
  const mainVariant =
    product.variants.find((variant) => variant.isActive && variant.maxQuantity > 0) ??
    product.variants[0] ??
    null;

  return {
    id: product.id,
    code: product.code,
    title: mainVariant?.title ?? product.title,
    description: product.description,
    isActive: product.isActive,
    categoryId: product.categoryId,
    categoryTitle: product.categoryTitle,
    previewImageUrl: mainVariant?.images[0]?.url ?? null,
    variantsCount: product.variants.length,
    inStockCount: product.variants.filter((variant) => variant.isActive && variant.maxQuantity > 0).length,
    updatedAt: null,
  };
}

function toDetails(product: ProductBuild): AdminProductDetails {
  return {
    id: product.id,
    code: product.code,
    title: product.title,
    description: product.description,
    isActive: product.isActive,
    categoryId: product.categoryId,
    categoryTitle: product.categoryTitle,
    variants: product.variants,
  };
}

export const productsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const query = request.query as {
      q?: string;
      categoryId?: string;
      active?: string;
      stock?: string;
    };
    const search = query.q?.trim().toLowerCase();
    const products = await getAdminProducts();

    return products
      .filter((product) => {
        if (query.categoryId && product.categoryId !== query.categoryId) {
          return false;
        }

        if (query.active === "true" && !product.isActive) {
          return false;
        }

        if (query.active === "false" && product.isActive) {
          return false;
        }

        if (
          query.stock === "in" &&
          product.variants.every((variant) => variant.maxQuantity <= 0)
        ) {
          return false;
        }

        if (
          query.stock === "out" &&
          product.variants.some((variant) => variant.maxQuantity > 0)
        ) {
          return false;
        }

        if (!search) {
          return true;
        }

        return [
          product.title,
          product.code,
          product.description,
          product.categoryTitle,
          ...product.variants.flatMap((variant) => [
            variant.title,
            variant.optionLabel,
            variant.code,
          ]),
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(search));
      })
      .map(toListItem);
  });

  app.get("/:productId", async (request, reply) => {
    const params = request.params as {
      productId: string;
    };
    const products = await getAdminProducts();
    const product = products.find((item) => item.id === params.productId);

    if (!product) {
      return reply.status(404).send({
        message: "Товар не найден",
      });
    }

    return toDetails(product);
  });
};
