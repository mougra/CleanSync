# Clean Planner / CleanSync

Веб-приложение для домашней уборки: челленджи по дням с прогрессом, привычки с напоминаниями, чек-листы по зонам, статьи-советы, достижения и статистика. Адаптивный веб + PWA.

## Стек

| Слой | Технологии |
|---|---|
| Приложение | Nuxt 4.4.8 (SSR, версия зафиксирована точно), Vue 3.5, Pinia, тёмная тема, i18n RU/EN, авторизация на httpOnly cookies, PWA (манифест + Web Push) |
| Контент и SEO | `@nuxt/content` (статьи-советы в Markdown), `@nuxtjs/seo`: карта сайта, robots, canonical, og-теги, schema.org |
| API | Node.js 24, Express 4, TypeScript (tsx), PostgreSQL, JWT (access + refresh), nodemailer, web-push, helmet + rate-limit |
| Качество | ESLint 9 (flat config), Prettier, Vitest + supertest, `typecheck` по обоим пакетам |
| Данные | Миграции `node-pg-migrate`, идемпотентный сид, бэкапы скриптом с ротацией |
| Инфра | Docker Compose (Postgres + backend + web), Caddy для HTTPS |

## Быстрый старт

Требования: Node.js 24+, Docker.

```bash
npm run install:all                            # зависимости всех пакетов

docker compose up -d postgres                  # база данных

cp backend/.env.example backend/.env           # и поправь секреты

npm --prefix backend run db:setup              # миграции + сид

npm run dev                                    # API + приложение
```

- API — <http://localhost:5000>, состояние БД видно на `GET /api/health`
- Приложение (Nuxt, SSR) — <http://localhost:3000>
- Визуальный эталон дизайн-системы — <http://localhost:3000/dev/ui-kit>

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Express + Nuxt параллельно |
| `npm run typecheck` | `tsc --noEmit` (backend) + `nuxt typecheck` (web) |
| `npm run lint` | ESLint по обоим пакетам |
| `npm test` | Vitest: тесты API |
| `npm run build` | production-сборка Nuxt |
| `npm --prefix backend run migrate:up` | применить миграции |
| `npm --prefix backend run seed` | справочные данные (достижения, челленджи, шаблоны) |
| `npm --prefix backend run db:setup` | `migrate:up` + `seed` |

## Структура

```
backend/    Express API: app.ts (сборка приложения), server.ts (запуск), auth.ts, cookies.ts, db.ts,
            seed.ts, seed-challenges.ts, seed-habits.ts, migrations/, routes/, services/, tests/
web/        Nuxt 4 (SSR): nuxt.config.ts, content.config.ts, content/tips/ (статьи),
            app/{pages,components,composables,layouts,assets/css}, server/routes (источник карты сайта),
            public/{photos,icons}
shared/     Общие типы
docs/       DEPLOY.md — выкладка на VPS, HTTPS, бэкапы, 152-ФЗ
            design/mockups/ — макеты интерфейса с описью, design/photos.md — источники фото
scripts/    backup-db.sh — бэкап базы с ротацией
```

## Состояние проекта

Закрыты: стабилизация (миграции, идемпотентный сид, линт, тесты), каркас Nuxt, дизайн-система, навигация,
челленджи, экран «Сегодня», контент и SEO-фундамент, геймификация (25 достижений), привычки, PWA с
push-напоминаниями, чек-листы и свои задачи, экран достижений, статистика, безопасность и подготовка к запуску.

Осталось до публичного запуска: аналитика посещаемости и мониторинг (Sentry), CI, юридические страницы
по 152-ФЗ, а также наполнение контентом и открытые решения (название бренда, домен, монетизация).

**План по фазам, открытые вопросы и решения — в [docs/PLAN.md](docs/PLAN.md),
выкладка на сервер — в [docs/DEPLOY.md](docs/DEPLOY.md).**

Документация для разработки и агентов — в [CLAUDE.md](CLAUDE.md).
