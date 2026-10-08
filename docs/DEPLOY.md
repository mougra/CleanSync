# Развёртывание на VPS

Инструкция для боевого сервера: Docker Compose (Postgres + Express + Nuxt), HTTPS через Caddy, бэкапы.
Локальная разработка описана в [CLAUDE.md](../CLAUDE.md), продуктовые детали — в [PLAN.md](PLAN.md).

## Что где живёт

```
интернет → Caddy (443, HTTPS) ─┬─ /api/* → backend:5000   (Express)
                               └─ всё остальное → web:3000  (Nuxt SSR)
                                                        ↓
                                                   postgres:5432
```

Порт 3000 наружу не публикуется, если перед приложением стоит Caddy: наружу смотрят только 80 и 443.
Публикация 3000 нужна лишь для отладки.

## 1. Подготовка сервера

Минимум: 2 vCPU, 2 ГБ RAM, 20 ГБ диска, Ubuntu 22.04/24.04.

```bash
# Docker и Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # перелогиниться после этого

# Файрвол: только SSH, HTTP и HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable

# Своп пригодится на сборке Nuxt (2 ГБ RAM впритык)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Первый запуск

```bash
git clone https://github.com/mougra/CleanSync.git /srv/cleansync
cd /srv/cleansync

# Секреты: обязательно заменить JWT-ключи и заполнить SMTP и VAPID
cp backend/.env.example backend/.env
nano backend/.env

docker compose up -d --build

# Схема и справочные данные (миграции + сид)
docker compose exec backend npm run db:setup
```

Проверка:

```bash
curl -s localhost:3000/api/health     # {"status":"Backend is running","database":"up"}
curl -sI localhost:3000/ | head -1    # HTTP/1.1 200 OK
```

## 3. HTTPS и домен

1. Направить A-запись домена на IP сервера.
2. В `Caddyfile` заменить `cleansync.example.com` на свой домен.
3. В `docker-compose.yml` раскомментировать сервис `caddy` и тома `caddy_data`/`caddy_config`.
4. Задать публичный адрес и перезапустить:

```bash
echo 'SITE_URL=https://ваш-домен' >> .env
# в backend/.env: APP_BASE_URL=https://ваш-домен, TRUST_PROXY=true
docker compose up -d
```

Caddy сам получит сертификат Let's Encrypt. `TRUST_PROXY=true` обязателен: без него
rate-limit видит все запросы как один IP (адрес прокси).

> **Важно про cookie.** Авторизация — httpOnly-cookie, поэтому приложение и API обязаны
> быть на одном origin. Схема выше это выполняет (и `/`, и `/api` идут через один домен).
> Если разнести их на разные домены, вход перестанет работать — это осознанное ограничение
> дизайна, а не баг.

## 4. Обновление версии

```bash
cd /srv/cleansync
git pull
docker compose up -d --build
docker compose exec backend npm run migrate:up   # если добавились миграции
```

Откат: `git checkout <предыдущий-коммит> && docker compose up -d --build`.
Миграции вниз откатываются командой `npm run migrate:down` (по одной).

## 5. Бэкапы

```bash
chmod +x scripts/backup-db.sh
sudo mkdir -p /var/backups/cleansync

# Ежедневно в 3:00, ротация 7 дней
( crontab -l 2>/dev/null; echo "0 3 * * * /srv/cleansync/scripts/backup-db.sh >> /var/log/cleansync-backup.log 2>&1" ) | crontab -
```

Восстановление:

```bash
gunzip -c /var/backups/cleansync/clean_planner-2026-10-08_03-00.sql.gz \
  | docker exec -i clean_planner_db psql -U postgres -d clean_planner
```

Дампы стоит увозить с сервера (rsync или объектное хранилище): бэкап на том же диске
не спасает от потери диска. Раз в месяц проверяйте, что дамп действительно разворачивается
на тестовой базе.

## 6. Что проверить после запуска

- `https://домен/api/health` — API и база живы.
- Регистрация и вход: cookie `cp_access` и `cp_refresh` ставятся с флагом `Secure`
  (в продакшене — только по HTTPS).
- `https://домен/sitemap_index.xml` и `/robots.txt` содержат домен, а не localhost.
  Для этого задан `NUXT_PUBLIC_SITE_URL` (`SITE_URL` в compose).
- Письма: подтверждение почты и сброс пароля ведут на домен (`APP_BASE_URL` в `backend/.env`).
- Push: в настройках включить уведомления и нажать «Проверить».
- В консоли браузера нет ошибок CSP и смешанного содержимого.

## 7. Юридические требования (152-ФЗ)

Обработка персональных данных (почта, имя) требует до публичного запуска:

1. **Политика конфиденциальности** — отдельная страница с перечнем данных, целями,
   сроками хранения и порядком удаления.
2. **Согласие на обработку** — чекбокс при регистрации со ссылкой на политику.
3. **Cookie-баннер** — уведомление об использовании cookie (у нас технические cookie
   авторизации и CSRF).
4. **Право на удаление** — кнопка «удалить аккаунт» (сейчас есть только очистка данных
   силами администратора).
5. **Уведомление в Роскомнадзор** — подаётся оператором ПД до начала обработки.
6. **Реквизиты оператора** — нужны в политике: статус (самозанятый/ИП/ООО), ИНН, контакт.

Разбор и открытые вопросы — в [PLAN.md](PLAN.md) §12.

## 8. Чего пока нет

- **CI** — сборка и тесты запускаются вручную; GitHub Actions не настроены.
- **Мониторинг** — нет Sentry и аналитики посещаемости, только логи контейнеров
  (`docker compose logs -f web`).
- **Rate-limit на уровне прокси** — сейчас только в приложении (см. `backend/app.ts`).
- **Уведомления о сбоях** — нет алертов, о падении узнаём из недоступности сайта.
