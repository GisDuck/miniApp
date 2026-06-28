import type { FastifyPluginAsync } from "fastify";

import {
  deleteImage,
  getImagesFromManifest,
  isWebp,
  readImageManifest,
  swapImages,
  uploadNextImage,
} from "../lib/images.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseImageIndex(value: string) {
  const index = Number(value);

  return Number.isInteger(index) && index >= 0 ? index : null;
}

function isPrematureCloseError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ERR_STREAM_PREMATURE_CLOSE" || error.code === "ECONNRESET")
  );
}

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
    const contentLength = Number(request.headers["content-length"] ?? 0) || null;
    const startedAt = Date.now();

    request.log.info(
      {
        uuid: params.uuid,
        contentLength,
        contentType: request.headers["content-type"],
      },
      "admin_image_upload_started",
    );

    if (!UUID_PATTERN.test(params.uuid)) {
      request.log.warn({ uuid: params.uuid }, "admin_image_upload_invalid_uuid");
      return reply.status(400).send({
        message: "Некорректный UUID",
      });
    }

    let file: Awaited<ReturnType<typeof request.file>>;

    try {
      file = await request.file();
    } catch (error) {
      request.log.error(
        {
          err: error,
          uuid: params.uuid,
          contentLength,
        },
        "admin_image_upload_file_read_failed",
      );

      if (isPrematureCloseError(error)) {
        return reply.status(400).send({
          message: "Передача файла оборвалась. Проверьте SSH-туннель и попробуйте еще раз.",
        });
      }

      throw error;
    }

    if (!file) {
      request.log.warn({ uuid: params.uuid }, "admin_image_upload_missing_file");
      return reply.status(400).send({
        message: "Выберите webp-файл",
      });
    }

    request.log.info(
      {
        uuid: params.uuid,
        fieldname: file.fieldname,
        filename: file.filename,
        mimetype: file.mimetype,
        encoding: file.encoding,
      },
      "admin_image_upload_file_received",
    );

    if (file.mimetype !== "image/webp" || !file.filename.toLowerCase().endsWith(".webp")) {
      request.log.warn(
        {
          uuid: params.uuid,
          filename: file.filename,
          mimetype: file.mimetype,
        },
        "admin_image_upload_invalid_type",
      );
      return reply.status(400).send({
        message: "Можно загружать только webp",
      });
    }

    let buffer: Buffer;

    try {
      buffer = await file.toBuffer();
    } catch (error) {
      request.log.error(
        {
          err: error,
          uuid: params.uuid,
          filename: file.filename,
          mimetype: file.mimetype,
          contentLength,
        },
        "admin_image_upload_buffer_read_failed",
      );

      if (isPrematureCloseError(error)) {
        return reply.status(400).send({
          message: "Передача файла оборвалась. Попробуйте загрузить файл еще раз.",
        });
      }

      throw error;
    }

    request.log.info(
      {
        uuid: params.uuid,
        filename: file.filename,
        bytes: buffer.length,
        truncated: file.file.truncated,
      },
      "admin_image_upload_buffer_read_completed",
    );

    if (!isWebp(buffer)) {
      request.log.warn(
        {
          uuid: params.uuid,
          filename: file.filename,
          bytes: buffer.length,
        },
        "admin_image_upload_invalid_webp_signature",
      );
      return reply.status(400).send({
        message: "Файл не похож на webp-изображение",
      });
    }

    try {
      const uploadedImage = await uploadNextImage(params.uuid, buffer, request.log);

      request.log.info(
        {
          uuid: params.uuid,
          index: uploadedImage.index,
          url: uploadedImage.url,
          bytes: buffer.length,
          durationMs: Date.now() - startedAt,
        },
        "admin_image_upload_completed",
      );

      return reply.status(201).send(uploadedImage);
    } catch (error) {
      request.log.error(
        {
          err: error,
          uuid: params.uuid,
          filename: file.filename,
          bytes: buffer.length,
          durationMs: Date.now() - startedAt,
        },
        "admin_image_upload_storage_failed",
      );
      throw error;
    }
  });

  app.delete("/images/:uuid/:index", async (request, reply) => {
    const params = request.params as {
      uuid: string;
      index: string;
    };
    const index = parseImageIndex(params.index);

    if (!UUID_PATTERN.test(params.uuid) || index === null) {
      return reply.status(400).send({
        message: "Некорректный путь картинки",
      });
    }

    request.log.info(
      {
        uuid: params.uuid,
        index,
      },
      "admin_image_delete_started",
    );

    const images = await deleteImage(params.uuid, index, request.log);

    if (!images) {
      return reply.status(404).send({
        message: "Картинка не найдена",
      });
    }

    return images;
  });

  app.patch("/images/:uuid/reorder", async (request, reply) => {
    const params = request.params as {
      uuid: string;
    };
    const body = (request.body ?? {}) as {
      fromIndex?: number;
      toIndex?: number;
    };

    if (
      !UUID_PATTERN.test(params.uuid) ||
      !Number.isInteger(body.fromIndex) ||
      !Number.isInteger(body.toIndex)
    ) {
      return reply.status(400).send({
        message: "Некорректный порядок картинок",
      });
    }

    const fromIndex = Number(body.fromIndex);
    const toIndex = Number(body.toIndex);

    request.log.info(
      {
        uuid: params.uuid,
        fromIndex,
        toIndex,
      },
      "admin_image_reorder_started",
    );

    const images = await swapImages(
      params.uuid,
      fromIndex,
      toIndex,
      request.log,
    );

    if (!images) {
      return reply.status(404).send({
        message: "Картинки не найдены",
      });
    }

    return images;
  });
};
