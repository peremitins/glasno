# --- СТАДИЯ СБОРКИ ---
FROM node:20-alpine AS build

# Включаем corepack и надёжно активируем pnpm (с ретраями на сетевые флейки)
ENV PNPM_VERSION=10.33.0
RUN corepack enable \
  && for i in 1 2 3 4 5; do \
    corepack prepare "pnpm@${PNPM_VERSION}" --activate && break; \
    echo "corepack prepare pnpm failed (attempt ${i}/5), retrying..." >&2; \
    sleep $((i * 2)); \
  done

WORKDIR /app

# pnpm-workspace.yaml обязателен: в нём onlyBuiltDependencies для нативных пакетов
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm config set fetch-retries 5 \
  && pnpm config set fetch-retry-factor 2 \
  && pnpm config set fetch-retry-mintimeout 10000 \
  && pnpm config set fetch-retry-maxtimeout 60000 \
  && pnpm config set fetch-timeout 600000 \
  && pnpm install --frozen-lockfile

COPY . .

# Сборка основного приложения (Nitro складывает сервер в .output).
# Лендинг (apps/landing) собирается отдельно в CI и деплоится статикой.
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# --- СТАДИЯ МИГРАЦИЙ ---
# Полный build-слой: drizzle-kit (devDep) и server/infrastructure/db/migrations внутри.
FROM build AS migrate
WORKDIR /app

# --- СТАДИЯ РАНТАЙМА ---
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=build /app/.output ./.output
COPY --from=build /app/.output/public/_nuxt /app/webvisor-assets-seed
COPY deploy/webvisor/seed-webvisor-assets.sh /usr/local/bin/seed-webvisor-assets.sh
RUN chmod +x /usr/local/bin/seed-webvisor-assets.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV NITRO_PORT=3000
EXPOSE 3000

# Liveness-пробник для Docker / reverse-proxy.
# wget из busybox уже есть в alpine, /api/health не дёргает БД.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/seed-webvisor-assets.sh"]
CMD ["node", ".output/server/index.mjs"]
