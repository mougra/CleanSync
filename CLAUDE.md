# Clean Planner - Документация проекта

Полноценное приложение для управления графиками уборки с JWT авторизацией.

## Структура проекта

```
/
├── backend/              # Express API
├── frontend/             # Vue 3 приложение
├── shared/              # Общие типы/утилиты (опционально)
└── CLAUDE.md            # Этот файл
```

## Backend (Node.js + Express + PostgreSQL)

### Установка

```bash
cd backend
npm install
```

### Конфигурация БД

1. **Установите PostgreSQL** локально или используйте Docker:

```bash
# С Docker
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
```

2. **Создайте БД и таблицы:**

```bash
psql -U postgres -c "CREATE DATABASE clean_planner;"
psql -U postgres -d clean_planner -f backend/schema.sql
```

3. **Создайте `.env` файл:**

```bash
cp backend/.env.example backend/.env
```

И отредактируйте параметры подключения если нужно.

### Запуск

```bash
cd backend
npm run dev
```

Сервер будет доступен на `http://localhost:5000`

## API Endpoints

### Auth
- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `POST /api/auth/refresh` - Обновление токена

### Schedules
- `GET /api/schedules` - Получить все графики пользователя
- `GET /api/schedules/:id` - Получить график с задачами
- `POST /api/schedules` - Создать новый график
- `PUT /api/schedules/:id` - Обновить график
- `DELETE /api/schedules/:id` - Удалить график

### Tasks
- `POST /api/tasks` - Создать задачу
- `PUT /api/tasks/:id` - Обновить задачу
- `DELETE /api/tasks/:id` - Удалить задачу

## Frontend (Vue 3 + Vite)

### Установка

```bash
cd frontend
npm install
```

### Запуск

```bash
npm run dev
```

Приложение будет доступно на `http://localhost:5173`

### Build

```bash
npm run build
```

## Структура данных

### User
```json
{
  "id": 1,
  "email": "user@example.com",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Schedule
```json
{
  "id": 1,
  "user_id": 1,
  "title": "Уборка кухни",
  "description": "Еженедельная уборка",
  "created_at": "2024-01-01T00:00:00Z",
  "tasks": [
    {
      "id": 1,
      "title": "Мытье посуды",
      "frequency": "daily",
      "day_of_week": 0,
      "time": "10:00:00",
      "is_completed": false
    }
  ]
}
```

## Переменные окружения

### Backend (.env)
```env
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clean_planner
ACCESS_TOKEN_SECRET=your_secret_key
REFRESH_TOKEN_SECRET=your_secret_key
PORT=5000
NODE_ENV=development
```

## Советы разработке

1. **JWT Tokens:**
   - Access token (15m) - используется для запросов
   - Refresh token (7d) - используется для получения новых access токенов

2. **CORS:**
   - Backend слушает запросы с любых источников (настроено в server.js)
   - Измените если нужна строгая конфигурация

3. **Безопасность:**
   - Измените `ACCESS_TOKEN_SECRET` и `REFRESH_TOKEN_SECRET` на сложные значения
   - Используйте HTTPS в продакшене
   - Храните refresh tokens в httpOnly cookies

## Next Steps

- [ ] Добавить Vue компоненты для регистрации/входа
- [ ] Добавить страницу со списком графиков
- [ ] Добавить форму создания графика
- [ ] Добавить визуализацию (календарь/граики)
- [ ] Добавить юнит тесты
- [ ] Добавить валидацию на фронтенде
