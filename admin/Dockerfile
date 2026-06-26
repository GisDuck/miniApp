FROM node:22-slim AS build

WORKDIR /app/admin

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY admin/package*.json ./
RUN npm ci

COPY admin ./

RUN npm run build


FROM node:22-slim AS production

WORKDIR /app/admin

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY admin/package*.json ./
RUN npm ci

RUN npm prune --omit=dev

COPY --from=build /app/admin/dist ./dist

EXPOSE 8080

CMD ["node", "dist/server/server.js"]
