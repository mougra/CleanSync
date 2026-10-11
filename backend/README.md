# TidyPlan Backend

Node.js + Express + PostgreSQL API для управления графиками уборки с JWT авторизацией.

## Быстрый старт

### 1. Установка зависимостей
```bash
npm install
```

### 2. Настройка БД

**Option A: Docker (рекомендуется)**
```bash
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
sleep 10
psql -U postgres -h localhost -c "CREATE DATABASE clean_planner;"
psql -U postgres -h localhost -d clean_planner -f schema.sql
```

**Option B: Локальный PostgreSQL**
```bash
createdb clean_planner
psql clean_planner -f schema.sql
```

### 3. Конфигурация
```bash
cp .env.example .env
# Отредактируйте .env если нужны другие параметры подключения
```

### 4. Запуск
```bash
npm run dev
```

Сервер будет доступен на `http://localhost:5000`

## API Endpoints

### Авторизация
- `POST /api/auth/register` - Регистрация
  ```json
  {"email": "user@example.com", "password": "123456"}
  ```

- `POST /api/auth/login` - Вход
  ```json
  {"email": "user@example.com", "password": "123456"}
  ```

- `POST /api/auth/refresh` - Обновить токен
  ```json
  {"refreshToken": "token"}
  ```

### Графики (требуется авторизация)
- `GET /api/schedules` - Получить все графики
- `GET /api/schedules/:id` - Получить график с задачами
- `POST /api/schedules` - Создать график
  ```json
  {"title": "Кухня", "description": "Еженедельная уборка"}
  ```
- `PUT /api/schedules/:id` - Обновить график
- `DELETE /api/schedules/:id` - Удалить график

### Задачи (требуется авторизация)
- `POST /api/tasks` - Создать задачу
  ```json
  {
    "schedule_id": 1,
    "title": "Мытье посуды",
    "frequency": "daily",
    "day_of_week": 0,
    "time": "10:00"
  }
  ```
- `PUT /api/tasks/:id` - Обновить задачу
- `DELETE /api/tasks/:id` - Удалить задачу
- `GET /api/tasks/today` - Задачи на сегодня

Периодичность задаётся парой `frequency` + `interval_count` («раз в N дней /
недель / месяцев», как сегменты и счётчик в макете добавления задачи):
`frequency: "weekly", interval_count: 2` — раз в две недели. Для интервала
больше единицы опорой цикла служит `due_date` (дата первой постановки), для
`interval_count: 1` всё как раньше — `day_of_week` или `day_of_month`.

### Настройка по дому (требуется авторизация)
- `GET|PUT|DELETE /api/home-profile` - Анкета о доме (PUT частичный,
  `complete: true` на последнем шаге отмечает анкету пройденной)
- `POST /api/home-profile/plan` - Собрать планы по ответам: недельный
  «План по дому» (пересобирается целиком) и постоянный набор «Мои задачи»
  (создаётся один раз, повторный вызов только достраивает недостающее)
- `GET /api/home-profile/plan` - Посмотреть план, ничего не перезаписывая

Постоянный набор собирает `services/defaultTasks.ts` из каталога
`services/taskCatalog.ts`: контекстные теги (`pets`, `kids`, `balcony`, `yard`,
`garage`, `office`) включаются только по ответам анкеты, полы и пыль
масштабируются по числу комнат, а дневная нагрузка не превышает 40 минут.

## Использование токенов

Отправляйте Access Token в заголовке:
```
Authorization: Bearer <access_token>
```

## Структура

```
backend/
├── server.js          # Main entry point
├── db.js              # Database connection
├── auth.js            # JWT utilities & middleware
├── schema.sql         # Database schema
├── .env.example       # Environment variables example
└── routes/
    ├── auth.js        # Authentication routes
    ├── schedules.js   # Schedules CRUD
    └── tasks.js       # Tasks CRUD
```
