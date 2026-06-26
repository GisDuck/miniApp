import { buildImageUrl, ensureImageBucket, getObjectKeyFromUrl, minio, minioBucket } from "./minio.js";

const MANIFEST_KEY = "img/manifest.json";

type ImageManifest = Record<string, number>;

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

export async function readImageManifest(): Promise<ImageManifest> {
  await ensureImageBucket();

  try {
    const buffer = await readObjectAsBuffer(MANIFEST_KEY);
    const manifest = JSON.parse(buffer.toString("utf8")) as unknown;

    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(manifest).filter((entry): entry is [string, number] => {
        return typeof entry[1] === "number" && entry[1] >= 0;
      }),
    );
  } catch {
    return {};
  }
}

export async function writeImageManifest(manifest: ImageManifest) {
  await ensureImageBucket();

  const buffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");

  await minio.putObject(minioBucket, MANIFEST_KEY, buffer, buffer.length, {
    "Content-Type": "application/json; charset=utf-8",
  });
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

export async function uploadNextImage(uuid: string, buffer: Buffer) {
  await ensureImageBucket();

  const manifest = await readImageManifest();
  const nextIndex = (manifest[uuid] ?? -1) + 1;
  const url = buildImageUrl(uuid, nextIndex);

  await minio.putObject(minioBucket, getObjectKeyFromUrl(url), buffer, buffer.length, {
    "Content-Type": "image/webp",
  });

  manifest[uuid] = nextIndex;
  await writeImageManifest(manifest);

  return {
    id: `${uuid}:${nextIndex}`,
    uuid,
    index: nextIndex,
    url,
  };
}
