declare module "fastify" {
  interface FastifyRequest {
    adminUsername?: string;
  }
}

export {};
