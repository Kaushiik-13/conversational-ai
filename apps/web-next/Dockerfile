FROM node:22.14.0-bookworm-slim AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/web-next/package.json apps/web-next/package.json

RUN npm ci --workspace=@automotive-search/web-next --include-workspace-root

COPY apps/web-next apps/web-next

ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace=@automotive-search/web-next

FROM node:22.14.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /workspace

COPY --from=build --chown=node:node /workspace/apps/web-next/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web-next/.next/static ./apps/web-next/.next/static
COPY --from=build --chown=node:node /workspace/apps/web-next/public ./apps/web-next/public

USER node

EXPOSE 3000

CMD ["node", "apps/web-next/server.js"]
