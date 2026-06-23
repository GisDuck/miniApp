import { Client } from "minio";

const endpoint = process.env.MINIO_ENDPOINT ?? "minio";
const port = Number(process.env.MINIO_PORT ?? 9000);
const useSSL = process.env.MINIO_USE_SSL === "true";
const accessKey = process.env.MINIO_ROOT_USER ?? "";
const secretKey = process.env.MINIO_ROOT_PASSWORD ?? "";

export const minioBucket = process.env.MINIO_BUCKET ?? "shop";

export const minio = new Client({
  endPoint: endpoint,
  port,
  useSSL,
  accessKey,
  secretKey,
});

let bucketReadyPromise: Promise<void> | null = null;

export function getObjectKeyFromUrl(url: string) {
  return url.replace(/^\/+/, "");
}

export function buildImageUrl(productId: number, variantId: number, index: number) {
  return `/img/${productId}/${variantId}/${index}.webp`;
}

export async function ensureImageBucket() {
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      const exists = await minio.bucketExists(minioBucket);

      if (!exists) {
        await minio.makeBucket(minioBucket);
      }

      await minio.setBucketPolicy(
        minioBucket,
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                AWS: ["*"],
              },
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${minioBucket}/img/*`],
            },
          ],
        }),
      );
    })();
  }

  return bucketReadyPromise;
}
