# ─── Build ────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@pulse/web --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace=@pulse/web

# ─── Runtime: Nginx serving the SPA + proxying /api ───────
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
