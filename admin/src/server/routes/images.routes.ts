import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";

import { buildImageUrl, ensureImageBucket, getObjectKeyFromUrl, minio, minioBucket } from "../lib/minio.js";
import { prisma } from "../lib/prisma.js";

function isWebp(buffer: Buffer) {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

async function getNextImageSlot(productVariantId: number) {
  const lastImage = await prisma.productVariantImage.findFirst({
    where: {
      productVariantId,
    },
    orderBy: {
      sortOrder: "desc",
    },
    select: {
      sortOrder: true,
    },
  });

  return (lastImage?.sortOrder ?? -1) + 1;
}

async function moveImagesToSortOrder(
  tx: Prisma.TransactionClient,
  imageIds: number[],
  currentSortOrders: number[],
) {
  const temporaryStart = Math.min(0, ...currentSortOrders) - imageIds.length - 1;

  for (const [index, id] of imageIds.entries()) {
    await tx.productVariantImage.update({
      where: {
        id,
      },
      data: {
        sortOrder: temporaryStart - index,
      },
    });
  }

  for (const [index, id] of imageIds.entries()) {
    await tx.productVariantImage.update({
      where: {
        id,
      },
      data: {
        sortOrder: index,
      },
    });
  }
}

async function compactImageOrder(tx: Prisma.TransactionClient, productVariantId: number) {
  const images = await tx.productVariantImage.findMany({
    where: {
      productVariantId,
    },
    orderBy: {
      sortOrder: "asc",
    },
    select: {
      id: true,
      sortOrder: true,
    },
  });

  await moveImagesToSortOrder(
    tx,
    images.map((image) => image.id),
    images.map((image) => image.sortOrder),
  );
}

export const imagesRoutes: FastifyPluginAsync = async (app) => {
  app.post("/variants/:variantId/images/upload", async (request, reply) => {
    const params = request.params as {
      variantId: string;
    };
    const variantId = Number(params.variantId);

    if (!Number.isInteger(variantId) || variantId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id варианта",
      });
    }

    const file = await request.file();

    if (!file) {
      return reply.status(400).send({
        message: "Выберите webp-файл",
      });
    }

    if (file.mimetype !== "image/webp" || !file.filename.toLowerCase().endsWith(".webp")) {
      return reply.status(400).send({
        message: "Можно загружать только webp",
      });
    }

    const buffer = await file.toBuffer();

    if (!isWebp(buffer)) {
      return reply.status(400).send({
        message: "Файл не похож на webp-изображение",
      });
    }

    const variant = await prisma.productVariant.findUnique({
      where: {
        id: variantId,
      },
      select: {
        id: true,
        productId: true,
      },
    });

    if (!variant) {
      return reply.status(404).send({
        message: "Вариант не найден",
      });
    }

    await ensureImageBucket();

    const sortOrder = await getNextImageSlot(variantId);
    const imageUrl = buildImageUrl(variant.productId, variant.id, sortOrder + 1);

    const duplicate = await prisma.productVariantImage.findFirst({
      where: {
        productVariantId: variantId,
        url: imageUrl,
      },
      select: {
        id: true,
        sortOrder: true,
      },
    });

    if (duplicate) {
      return reply.status(409).send({
        message: "Картинка с таким путем уже есть у варианта",
      });
    }

    await minio.putObject(minioBucket, getObjectKeyFromUrl(imageUrl), buffer, buffer.length, {
      "Content-Type": "image/webp",
    });

    const image = await prisma.productVariantImage.create({
      data: {
        productVariantId: variantId,
        url: imageUrl,
        sortOrder,
      },
    });

    return reply.status(201).send(image);
  });

  app.post("/variants/:variantId/images/attach", async (request, reply) => {
    const params = request.params as {
      variantId: string;
    };
    const variantId = Number(params.variantId);
    const body = (request.body ?? {}) as {
      url?: string;
    };
    const url = (body.url ?? "").trim();

    if (!Number.isInteger(variantId) || variantId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id варианта",
      });
    }

    if (!url) {
      return reply.status(400).send({
        message: "Укажите путь картинки",
      });
    }

    const variant = await prisma.productVariant.findUnique({
      where: {
        id: variantId,
      },
      select: {
        id: true,
        sortOrder: true,
      },
    });

    if (!variant) {
      return reply.status(404).send({
        message: "Вариант не найден",
      });
    }

    const duplicate = await prisma.productVariantImage.findFirst({
      where: {
        productVariantId: variantId,
        url,
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      return reply.status(409).send({
        message: "Эта картинка уже назначена варианту",
      });
    }

    const sortOrder = await getNextImageSlot(variantId);
    const image = await prisma.productVariantImage.create({
      data: {
        productVariantId: variantId,
        url,
        sortOrder,
      },
    });

    return reply.status(201).send(image);
  });

  app.patch("/variants/:variantId/images/reorder", async (request, reply) => {
    const params = request.params as {
      variantId: string;
    };
    const variantId = Number(params.variantId);
    const body = (request.body ?? {}) as {
      imageIds?: number[];
    };
    const imageIds = body.imageIds ?? [];

    if (!Number.isInteger(variantId) || variantId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id варианта",
      });
    }

    if (!Array.isArray(imageIds) || imageIds.some((id) => !Number.isInteger(id))) {
      return reply.status(400).send({
        message: "Передайте список id картинок",
      });
    }

    const images = await prisma.productVariantImage.findMany({
      where: {
        productVariantId: variantId,
      },
      select: {
        id: true,
        sortOrder: true,
      },
    });
    const existingIds = images.map((image) => image.id).sort((a, b) => a - b);
    const requestedIds = [...imageIds].sort((a, b) => a - b);

    if (
      existingIds.length !== requestedIds.length ||
      existingIds.some((id, index) => id !== requestedIds[index])
    ) {
      return reply.status(400).send({
        message: "Список картинок не совпадает с картинками варианта",
      });
    }

    await prisma.$transaction(async (tx) => {
      await moveImagesToSortOrder(
        tx,
        imageIds,
        images.map((image) => image.sortOrder),
      );
    });

    return prisma.productVariantImage.findMany({
      where: {
        productVariantId: variantId,
      },
      orderBy: {
        sortOrder: "asc",
      },
    });
  });

  app.delete("/variant-images/:imageId", async (request, reply) => {
    const params = request.params as {
      imageId: string;
    };
    const imageId = Number(params.imageId);

    if (!Number.isInteger(imageId) || imageId <= 0) {
      return reply.status(400).send({
        message: "Некорректный id картинки",
      });
    }

    const deletedImage = await prisma.productVariantImage.deleteMany({
      where: {
        id: imageId,
      },
    });

    if (deletedImage.count === 0) {
      return reply.status(404).send({
        message: "Картинка уже удалена",
      });
    }

    return {
      ok: true,
    };
  });
};
