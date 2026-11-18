FROM node:22.14.0-bookworm-slim

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --omit=dev --workspace=@api --include-workspace-root

COPY database/migrations database/migrations
COPY database/seeds database/seeds
COPY database/generators database/generators

USER node
