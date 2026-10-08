# Продакшен-образ бэкенда.
#
# Сервер запускается через tsx (TypeScript без шага сборки), поэтому tsx —
# зависимость рантайма, а не разработки: см. backend/package.json.
FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production

# Сначала зависимости: слой кэшируется, пока не менялся package.json
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

EXPOSE 5000

# Контейнер здоров, когда API отвечает и база доступна
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
