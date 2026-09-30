# syntax=docker/dockerfile:1

# ---- build: install all deps, compile TypeScript, drop dev deps -------------
# Runs on the build host's platform: the output (dist + production node_modules) is plain JS, so it can be
# copied into an image of any target arch. Revisit this if a production dependency ever ships native code.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 3000
# busybox wget (used by the compose healthcheck) is part of the alpine base image
CMD ["node", "dist/index.js"]
