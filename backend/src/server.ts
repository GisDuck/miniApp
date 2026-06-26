import "dotenv/config";
import { buildApp } from "./app";
import { prisma } from "./lib/prisma";

const app = buildApp();

const port = Number(process.env.PORT ?? 3000);

async function startServer() {
  try {
    await app.listen({
      port,
      host: "0.0.0.0",
    });

    console.log(`Server started on port ${port}`);
  } catch (error) {
    app.log.error({ err: error }, "server_start_failed");
    await prisma.$disconnect();
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
