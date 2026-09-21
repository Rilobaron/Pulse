# Build with the repository root as context:
#   docker build -f apps/api/Dockerfile .

# ─── Manifests shared by every install stage ──────────────
# Only package.json files + lockfile, so dependency layers stay cached
# until a manifest actually changes.
FROM node:22-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

# ─── Build: full install (incl. tsup/tsc) and bundle the API ──
FROM manifests AS build
RUN npm ci --workspace=@pulse/api --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@pulse/api

# ─── Prod deps: only runtime dependencies of @pulse/api ───
# tsup leaves every entry of `dependencies` external (express, mongoose,
# bullmq, ...), so they must exist as node_modules in the final image.
FROM manifests AS prod-deps
RUN npm ci --workspace=@pulse/api --include-workspace-root=false --omit=dev \
 && npm cache clean --force \
 && rm -rf node_modules/@pulse

# ─── Runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S pulse && adduser -S pulse -G pulse
COPY --from=prod-deps --chown=pulse:pulse /app/node_modules ./node_modules
COPY --from=build --chown=pulse:pulse /app/apps/api/dist ./apps/api/dist
USER pulse
EXPOSE 4000
CMD ["node", "apps/api/dist/server.cjs"]
