FROM node:22.14.0-bookworm-slim

WORKDIR /workspace

COPY automotive-search/package.json automotive-search/package-lock.json ./
COPY automotive-search/apps/api/package.json apps/api/package.json
COPY automotive-search/apps/web/package.json apps/web/package.json

RUN npm ci --omit=dev --workspace=@automotive-search/api --include-workspace-root

COPY automotive-search/database/migrations database/migrations
COPY automotive-search/database/seeds database/seeds
COPY automotive-search/database/generators database/generators

USER node
