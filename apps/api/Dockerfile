# ─── Base: install all workspace dependencies ─────────────
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=@pulse/api --include-workspace-root=false

# ─── Build: bundle the API ────────────────────────────────
FROM base AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@pulse/api

# ─── Runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S pulse && adduser -S pulse -G pulse
COPY --from=build --chown=pulse:pulse /app/apps/api/dist ./apps/api/dist
USER pulse
EXPOSE 4000
CMD ["node", "apps/api/dist/server.cjs"]
