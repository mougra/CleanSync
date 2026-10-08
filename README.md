# Clean Planner / CleanSync

Веб-приложение для домашней уборки: челленджи по дням с прогрессом, инсайты-статьи, чек-листы, достижения и статистика.

## Стек

| Слой | Технологии |
|---|---|
| Приложение | Nuxt 4.4.8 (SSR), Vue 3.5, Pinia 4, шрифт Onest, тёмная тема, i18n RU/EN, авторизация на httpOnly cookies |
| Прежний SPA | Vue 3 + Vite 6, @tanstack/vue-query — эталон до паритета, затем удаляется |
| Backend | Node.js, Express 4, TypeScript (tsx), PostgreSQL, JWT (access + refresh), nodemailer |
| Качество | ESLint 9 (flat config), Prettier, Vitest (+ supertest), Playwright |
| Данные | Миграции `node-pg-migrate`, идемпотентный сид |
| Инфра | Docker Compose (PostgreSQL), concurrently |

## Быстрый старт

Требования: Node.js 20+, Docker.

```bash
npm run install:all                            # зависимости всех пакетов

docker compose up -d postgres                  # база данных

cp backend/.env.example backend/.env           # и поправь секреты
cp web/.env.example web/.env                   # опционально

npm --prefix backend run db:setup              # миграции + сид

npm run dev                                    # API + приложение
```

- API — <http://localhost:5000>, состояние БД видно на `GET /api/health`
- Приложение (Nuxt, SSR) — <http://localhost:3000>
- Прежний SPA, если нужен для сравнения — `npm run dev:legacy` → <http://localhost:5173>

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Express + Nuxt параллельно |
| `npm run dev:legacy` | Express + прежний SPA |
| `npm run typecheck` | `tsc --noEmit` + `nuxt typecheck` + `vue-tsc --noEmit` |
| `npm run lint` | ESLint по трём пакетам |
| `npm test` | Vitest (backend + прежний SPA) |
| `npm run build` | production-сборка Nuxt |
| `npm --prefix backend run migrate:up` | применить миграции |
| `npm --prefix backend run seed` | справочные данные (достижения, шаблоны) |
| `npm --prefix backend run db:setup` | `migrate:up` + `seed` |

## Структура

```
backend/    Express API: app.ts (сборка приложения), server.ts (запуск), auth.ts, db.ts,
            seed.ts, migrations/, routes/, services/, tests/
web/        Nuxt 4 (SSR): nuxt.config.ts, app/{pages,plugins,assets/css/tokens.css}
frontend/   прежний Vue 3 SPA — эталон до паритета, затем удаляется
shared/     Общие типы
docs/       PLAN.md — план разработки и открытые вопросы
            design/mockups/ — 10 макетов интерфейса с описью
```

## Состояние проекта

**Фаза 0 (стабилизация) закрыта:** исправлены критичные баги (потеря владельца графиков при старте сервера, дублирование шаблонов), внедрены миграции и идемпотентный сид, настроены линт и тесты, `typecheck`/`lint`/`test`/`build` проходят, API проверен end-to-end.

**Фаза 0.5 (каркас Nuxt):** пакет `web/` создан и проверен — SSR отдаёт данные из Express, дизайн-токены сняты с макетов и уже в коде, шрифт Onest подключён.

**Фаза 1 (дизайн-система, в работе):** светлая и тёмная тема с переключателем, i18n RU/EN с автопоределением и `hreflang`, шелл приложения (нижняя навигация на мобильном, боковое меню на десктопе), главная «Сегодня» и разделы на живых данных API.

Дальше: перенос авторизации на httpOnly cookies (после него план дня и достижения станут персональными), библиотека компонентов, пресет PrimeVue на токенах. Затем Фаза 3 — челленджи: таблицы дней и задач, сид «Весенней уборки» (7 дней, 35 задач) из макетов.

**Подробности, план по фазам, SEO-стратегия, дизайн-токены и список открытых вопросов — в [docs/PLAN.md](docs/PLAN.md).**

Документация для разработки и агентов — в [CLAUDE.md](CLAUDE.md).
