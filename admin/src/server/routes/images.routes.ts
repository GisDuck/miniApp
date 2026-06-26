import type { FastifyPluginAsync } from "fastify";

import {
  getImagesFromManifest,
  isWebp,
  readImageManifest,
  uploadNextImage,
} from "../lib/images.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const imagesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/images/:uuid", async (request, reply) => {
    const params = request.params as {
      uuid: string;
    };

    if (!UUID_PATTERN.test(params.uuid)) {
      return reply.status(400).send({
        message: "Некорректный UUID",
      });
    }

    return getImagesFromManifest(params.uuid, await readImageManifest());
  });

  app.post("/images/:uuid/upload", async (request, reply) => {
    const params = request.params as {
      uuid: string;
    };

    if (!UUID_PATTERN.test(params.uuid)) {
      return reply.status(400).send({
        message: "Некорректный UUID",
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

    return reply.status(201).send(await uploadNextImage(params.uuid, buffer));
  });
};
