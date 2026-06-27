import { buildImageUrl, ensureImageBucket, getObjectKeyFromUrl, minio, minioBucket } from "./minio.js";

const MANIFEST_KEY = process.env.PRODUCT_IMAGE_MANIFEST_KEY ?? "img/manifest.json";

type ImageManifest = Record<string, number>;
type ImageLogger = {
  debug: (payload: Record<string, unknown>, message: string) => void;
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
};

export function isWebp(buffer: Buffer) {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

async function readObjectAsBuffer(objectName: string) {
  const stream = await minio.getObject(minioBucket, objectName);
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function readImageManifest(logger?: ImageLogger): Promise<ImageManifest> {
  await ensureImageBucket();

  try {
    logger?.debug({ manifestKey: MANIFEST_KEY }, "image_manifest_read_started");
    const buffer = await readObjectAsBuffer(MANIFEST_KEY);
    const manifest = JSON.parse(buffer.toString("utf8")) as unknown;

    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      logger?.warn({ manifestKey: MANIFEST_KEY }, "image_manifest_invalid_shape");
      return {};
    }

    const normalizedManifest = Object.fromEntries(
      Object.entries(manifest).filter((entry): entry is [string, number] => {
        return typeof entry[1] === "number" && entry[1] >= 0;
      }),
    );

    logger?.debug(
      {
        manifestKey: MANIFEST_KEY,
        entriesCount: Object.keys(normalizedManifest).length,
      },
      "image_manifest_read_completed",
    );

    return normalizedManifest;
  } catch (error) {
    logger?.info(
      {
        err: error,
        manifestKey: MANIFEST_KEY,
      },
      "image_manifest_missing_or_unreadable",
    );
    return {};
  }
}

export async function writeImageManifest(manifest: ImageManifest, logger?: ImageLogger) {
  await ensureImageBucket();

  const buffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");

  logger?.debug(
    {
      manifestKey: MANIFEST_KEY,
      entriesCount: Object.keys(manifest).length,
      bytes: buffer.length,
    },
    "image_manifest_write_started",
  );

  await minio.putObject(minioBucket, MANIFEST_KEY, buffer, buffer.length, {
    "Content-Type": "application/json; charset=utf-8",
  });

  logger?.info(
    {
      manifestKey: MANIFEST_KEY,
      entriesCount: Object.keys(manifest).length,
    },
    "image_manifest_write_completed",
  );
}

export function getImagesFromManifest(uuid: string, manifest: ImageManifest) {
  const max = manifest[uuid];

  if (max === undefined) {
    return [];
  }

  return Array.from({ length: Math.floor(max) + 1 }, (_, index) => ({
    id: `${uuid}:${index}`,
    uuid,
    index,
    url: buildImageUrl(uuid, index),
  }));
}

export async function uploadNextImage(uuid: string, buffer: Buffer, logger?: ImageLogger) {
  await ensureImageBucket();

  const manifest = await readImageManifest(logger);
  const nextIndex = (manifest[uuid] ?? -1) + 1;
  const url = buildImageUrl(uuid, nextIndex);
  const objectKey = getObjectKeyFromUrl(url);

  logger?.info(
    {
      uuid,
      index: nextIndex,
      objectKey,
      bytes: buffer.length,
      bucket: minioBucket,
    },
    "image_upload_to_minio_started",
  );

  await minio.putObject(minioBucket, objectKey, buffer, buffer.length, {
    "Content-Type": "image/webp",
  });

  logger?.info(
    {
      uuid,
      index: nextIndex,
      objectKey,
      bytes: buffer.length,
      bucket: minioBucket,
    },
    "image_upload_to_minio_completed",
  );

  manifest[uuid] = nextIndex;
  await writeImageManifest(manifest, logger);

  return {
    id: `${uuid}:${nextIndex}`,
    uuid,
    index: nextIndex,
    url,
  };
}
