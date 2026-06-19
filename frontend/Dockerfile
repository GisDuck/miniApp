FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ARG TGMINIAPP_VITE_API_URL=/api
ENV VITE_API_URL=$TGMINIAPP_VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
