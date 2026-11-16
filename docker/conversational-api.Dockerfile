FROM node:22.14.0-bookworm-slim AS dependencies

WORKDIR /workspace/automotive-search

COPY automotive-search/package.json automotive-search/package-lock.json ./
COPY automotive-search/apps/api/package.json apps/api/package.json
COPY automotive-search/apps/web/package.json apps/web/package.json

RUN npm ci --workspace=@automotive-search/api --include-workspace-root

FROM dependencies AS build

COPY automotive-search/apps/api apps/api
COPY automotive-search/database/migrations database/migrations
COPY automotive-search/database/seeds database/seeds
COPY packages/cube-query /workspace/packages/cube-query
COPY semantic/automotive/catalog.yaml /workspace/semantic/automotive/catalog.yaml

RUN npm run build --workspace=@automotive-search/api \
    && npm prune --omit=dev --workspace=@automotive-search/api --include-workspace-root

FROM node:22.14.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV API_PORT=3000
ENV CUBE_QUERY_PACKAGE_ENTRY=/workspace/packages/cube-query/src/qgen.mjs

WORKDIR /workspace/automotive-search

COPY --from=build --chown=node:node /workspace/automotive-search/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/automotive-search/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/automotive-search/database/migrations ./database/migrations
COPY --from=build --chown=node:node /workspace/automotive-search/database/seeds ./database/seeds
COPY --from=build --chown=node:node /workspace/packages/cube-query /workspace/packages/cube-query
COPY --from=build --chown=node:node /workspace/semantic/automotive/catalog.yaml /workspace/semantic/automotive/catalog.yaml

USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
