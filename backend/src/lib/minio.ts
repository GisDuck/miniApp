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

