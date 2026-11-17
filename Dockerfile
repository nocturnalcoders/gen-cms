FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
# Compiles the server to dist/ and builds the admin panel. The admin build is memory hungry:
# give the machine doing the build at least 4 GB, or raise the limit on a bigger one.
ARG BUILD_HEAP_MB=2048
RUN NODE_OPTIONS=--max-old-space-size=${BUILD_HEAP_MB} npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
RUN mkdir -p public/uploads && chown node:node public/uploads
USER node
EXPOSE 1337
CMD ["sh", "-c", "node scripts/ensure-database.js && exec npm run start"]
