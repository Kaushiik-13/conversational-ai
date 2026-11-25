FROM node:22.14.0-bookworm-slim

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/web-next/package.json apps/web-next/package.json

RUN npm ci --omit=dev --workspace=@automotive-search/api --include-workspace-root

COPY database/migrations database/migrations
COPY database/seeds database/seeds
COPY database/generators database/generators
COPY packages/cube-query/src packages/cube-query/src
COPY semantic/automotive/catalog.yaml semantic/automotive/catalog.yaml

USER node
