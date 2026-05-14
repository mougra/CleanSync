# Clean Planner

Приложение для управления графиками уборки.

## Стек

- **Backend**: Node.js + Express + PostgreSQL
- **Frontend**: Vue 3 + Vite + Vue Router

## Структура проекта

```
clean-planner/
├── backend/              # Express API
│   ├── server.js        # Main server
│   ├── db.js            # Database connection
│   ├── auth.js          # JWT utilities
│   ├── schema.sql       # Database schema
│   ├── routes/
│   │   ├── auth.js      # Auth endpoints
│   │   ├── schedules.js # Schedules CRUD
│   │   └── tasks.js     # Tasks CRUD
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── frontend/             # Vue 3 приложение
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.js
│   │   ├── pages/       # Page components
│   │   ├── components/  # Reusable components
│   │   ├── router/      # Vue Router config
│   │   └── styles/
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
│
├── shared/              # (опционально) Общие типы/утилиты
├── package.json         # Root package (npm workspaces)
└── .gitignore
```

## Быстрый старт

### Требования

- Node.js (v16+)
- PostgreSQL (локально или Docker)

### 1. Установка и настройка БД

```bash
# Docker (опционально)
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres

# Создание БД
psql -U postgres -c "CREATE DATABASE clean_planner;"
psql -U postgres -d clean_planner -f backend/schema.sql
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Отредактируйте .env если нужно

npm run dev
```

Backend будет доступен на `http://localhost:5000`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend будет доступен на `http://localhost:5173`

## Запуск обоих одновременно (из корня)

```bash
npm install
npm run dev
```

## CI/CD pipeline

Проект теперь содержит GitHub Actions workflow, который использует следующую стратегию:

- `dev` — ветка для разработки и коммитов
- `main` — ветка для слияния через pull request
- `version-x.y.z` — тег для релизной сборки после мерджа в `main`

Workflow выполняет:

- `npm ci` для backend и frontend на `push` в `dev` и на `pull_request` в `main`
- проверку синтаксиса backend (`node --check server.js`)
- сборку frontend (`npm run build`)
- сборку Docker-образов при релизном теге `version-*`
- дополнительную проверку `docker compose build`

Чтобы запустить релизную сборку, создайте тег по формату `version-1.0.1` и запушьте его в репозиторий после слияния в `main`.

Файл workflow: `.github/workflows/docker-ci.yml`

## API Endpoints

### Auth

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `POST /api/auth/refresh` - Обновить токен

### Schedules (требуется авторизация)

- `GET /api/schedules` - Получить все графики
- `GET /api/schedules/:id` - Получить график с задачами
- `POST /api/schedules` - Создать график
- `PUT /api/schedules/:id` - Обновить график
- `DELETE /api/schedules/:id` - Удалить график

### Tasks (требуется авторизация)

- `POST /api/tasks` - Создать задачу
- `PUT /api/tasks/:id` - Обновить задачу
- `DELETE /api/tasks/:id` - Удалить задачу

## Использование

1. **Зарегистрируйтесь** на странице `/register`
2. **Войдите** на странице `/login`
3. **Создайте график** кликнув "+ Новый график"
4. **Просмотрите и отредактируйте** графики

## Безопасность

- Пароли хешируются с bcryptjs
- JWT tokens используются для авторизации
- Refresh tokens хранятся в БД
- Все защищенные endpoints проверяют access token
