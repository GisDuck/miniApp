FROM node:22-slim AS build

WORKDIR /app/admin

ENV DATABASE_URL="postgresql://user:password@localhost:5432/shop_db?schema=public"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY admin/package*.json ./
RUN npm ci

COPY admin ./

RUN npm run build


FROM node:22-slim AS production

WORKDIR /app/admin

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://user:password@localhost:5432/shop_db?schema=public"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY admin/package*.json ./
RUN npm ci

COPY admin/prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm prune --omit=dev

COPY --from=build /app/admin/dist ./dist

EXPOSE 8080

CMD ["node", "dist/server/server.js"]
