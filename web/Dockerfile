# Продакшен-образ Nuxt-приложения: собираем на этапе build, в рантайм кладём
# только готовый сервер Nitro — без исходников и node_modules целиком.
FROM node:24-alpine AS build

WORKDIR /app

# Node 24 нужен из-за @nuxt/content: он использует встроенный модуль node:sqlite,
# а в Node 20/22 его нет.
COPY package*.json ./
RUN npm ci

COPY . .

# Публичный адрес сайта нужен ИМЕННО НА СБОРКЕ: от него зависят canonical,
# og:url, hreflang и адреса в карте сайта. Если оставить localhost, модуль
# nuxt-seo посчитает домен черновым и вовсе не поставит canonical —
# в рантайме эту величину уже не подменить.
ARG NUXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NUXT_PUBLIC_SITE_URL=$NUXT_PUBLIC_SITE_URL

# Сборка требует доступного API: источник карты сайта запрашивает список челленджей.
# Если API недоступен на этапе сборки, источник вернёт пустой список — сборка не падает.
RUN npm run build

FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=build /app/.output ./.output

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
