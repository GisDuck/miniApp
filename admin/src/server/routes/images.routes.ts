import type { FastifyPluginAsync } from "fastify";

import {
  getImagesFromManifest,
  isWebp,
  readImageManifest,
  uploadNextImage,
} from "../lib/images.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPrematureCloseError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_STREAM_PREMATURE_CLOSE"
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
};
