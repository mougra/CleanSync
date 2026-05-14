# Clean Planner Frontend

Vue 3 + Vite приложение для управления графиками уборки.

## Быстрый старт

### 1. Установка зависимостей
```bash
npm install
```

### 2. Запуск
```bash
npm run dev
```

Приложение будет доступно на `http://localhost:5173`

### 3. Build
```bash
npm run build
```

## Страницы

- **Login** (`/login`) - Вход в систему
- **Register** (`/register`) - Регистрация нового пользователя
- **Schedules** (`/schedules`) - Список графиков пользователя (требуется авторизация)

## Структура

```
frontend/src/
├── App.vue              # Root компонент
├── main.js              # Entry point
├── pages/               # Страницы (Page components)
│   ├── LoginPage.vue
│   ├── RegisterPage.vue
│   └── SchedulesPage.vue
├── components/          # Переиспользуемые компоненты
├── router/
│   └── index.js         # Vue Router конфигурация
└── styles/
    └── main.css         # Global styles
```

## Авторизация

Токены хранятся в `localStorage`:
- `accessToken` - Используется для API запросов (15 минут)
- `refreshToken` - Используется для получения нового Access Token (7 дней)

При неавторизированном доступе к защищенным страницам пользователь перенаправляется на `/login`.

## API Integration

Frontend делает запросы на `http://localhost:5000`:

```javascript
// Пример с авторизацией
fetch('http://localhost:5000/api/schedules', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
})
```

## Features

- ✅ Регистрация и вход
- ✅ Управление графиками (создание, просмотр, удаление)
- ✅ JWT авторизация с refresh tokens
- ✅ Защита маршрутов
- ⏳ Управление задачами (в планах)
- ⏳ Визуализация графиков (в планах)
