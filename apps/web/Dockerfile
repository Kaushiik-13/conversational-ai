FROM node:22.14.0-bookworm-slim AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --workspace=@automotive-search/web --include-workspace-root

COPY apps/web apps/web

RUN npm run build --workspace=@automotive-search/web

FROM nginx:1.29.1-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist/web/browser /usr/share/nginx/html

EXPOSE 8080
