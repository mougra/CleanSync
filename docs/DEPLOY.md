# Развёртывание на VPS

Инструкция для боевого сервера: Docker Compose (Postgres + Express + Nuxt + Caddy), HTTPS, бэкапы.
Локальная разработка описана в [CLAUDE.md](../CLAUDE.md), продуктовые детали — в [PLAN.md](PLAN.md).

## Что где живёт

```
интернет → Caddy (80/443, HTTPS) ─┬─ /api/* → backend:5000   (Express)
                                  └─ всё остальное → web:3000  (Nuxt SSR)
                                                            ↓
                                                      postgres:5432
```

Наружу опубликованы только 80 и 443. Порт 3000 приложения и порт 5432 базы привязаны к loopback
сервера — они нужны для отладки (`curl -I localhost:3000`) и для запуска кода на хосте при разработке.

Домен нигде не зашит в файлы: он приходит переменными (`SITE_DOMAIN` для Caddy, `SITE_URL` для сборки
приложения), поэтому `git pull` на сервере не конфликтует с настройками.

## Два способа получить образы

| Способ | Когда выбирать | Суть |
|---|---|---|
| **А. Сборка на сервере** | 2+ ГБ RAM | `docker compose up -d --build` собирает Nuxt и API прямо на VPS |
| **Б. Образы из GHCR** | 1.5 ГБ RAM и меньше, слабый CPU | образы собирает GitHub Actions, сервер только скачивает их |

Сборка Nuxt на 1.5 ГБ RAM почти всегда заканчивается OOM-killer'ом, поэтому для такого тарифа
выбирайте способ Б (и всё равно добавьте своп — он нужен и в рантайме).

## 1. Подготовка сервера

Минимум: 2 vCPU, 2 ГБ RAM, 20 ГБ диска. Поддерживаются Ubuntu 22.04/24.04 и AlmaLinux/Rocky 8–9:
различается только установка Docker и файрвола, дальше всё одинаково.

Сначала посмотрите, что досталось от тарифа — от объёма RAM зависит выбор способа сборки (А или Б):

```bash
free -h          # меньше 2 ГБ — только способ Б
nproc; df -h /   # ядра и место на диске
getenforce       # в AlmaLinux обычно Enforcing — это нормально, SELinux не отключаем
```

### Ubuntu 22.04/24.04

```bash
# Docker и Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # перелогиниться после этого

# Файрвол: только SSH, HTTP и HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable

# Своп пригодится на сборке Nuxt (2 ГБ RAM впритык) и в рантайме на 1.5 ГБ
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Полезное по мелочи: защита SSH и автообновления безопасности
sudo apt install -y fail2ban unattended-upgrades
```

### AlmaLinux / Rocky 8–9

```bash
sudo dnf install -y git dnf-plugins-core
# Для EL8 нужен репозиторий rhel, а не centos: пакеты для centos/8 не обновляются
# с мая 2024, а rhel/8 — актуальный (Docker сам советует его для RHEL-совместимых).
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo

# $releasever в AlmaLinux/Rocky иногда равен 8.10, а в репозитории Docker есть только
# каталог 8 — тогда установка упрётся в 404. Фиксируем мажорную версию:
sudo sed -i 's|\$releasever|8|' /etc/yum.repos.d/docker-ce.repo

sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # перелогиниться после этого

# Файрвол: firewalld включён по умолчанию, ssh в нём уже разрешён
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
sudo firewall-cmd --list-all

# Своп 4 ГБ. На XFS (файловая система по умолчанию в AlmaLinux) fallocate создаёт
# файл с дырами и swapon его не примет — делаем через dd.
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
sudo chmod 600 /swapfile && sudo mkswap /swapfile
sudo restorecon -v /swapfile      # без этого SELinux может не дать включить своп
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo dnf install -y fail2ban
```

SELinux оставляем включённым: Docker с ним работает, а единственный bind-mount в проекте
(Caddyfile) помечен в `docker-compose.yml` меткой `,z`. Docker публикует порты своими правилами
iptables в обход firewalld, поэтому важно, что наружу уходят только 80/443: порт приложения 3000
и порт базы 5432 привязаны к loopback и снаружи недоступны.

> Переустанавливать ОС не обязательно: на AlmaLinux развёртывание идентично, отличается только
> установка Docker. Если хочется идти ровно по инструкции для Ubuntu — в панели хостинга
> можно переустановить ОС на Ubuntu 24.04, но выгоды перед AlmaLinux нет.


## 2. Переменные окружения

Два файла с разным назначением:

| Файл | Что в нём | Кто читает |
|---|---|---|
| **Корневой `.env`** (шаблон `.env.example`) | `SITE_URL`, `SITE_DOMAIN`, `DB_USER/DB_PASSWORD/DB_NAME`, `IMAGE_BACKEND/IMAGE_WEB` | сам `docker compose` — подставляет в postgres, backend, web, caddy |
| **`backend/.env`** (шаблон `backend/.env.example`) | JWT-секреты, SMTP, VAPID, Sentry, `APP_BASE_URL`, `TRUST_PROXY` | контейнер backend (`env_file`) |

```bash
cd /srv/cleansync
cp .env.example .env
cp backend/.env.example backend/.env

# Секреты: длинные случайные строки
openssl rand -hex 32   # → ACCESS_TOKEN_SECRET
openssl rand -hex 32   # → REFRESH_TOKEN_SECRET
# VAPID-ключи для push. Node на сервере не нужен — генерируем в контейнере:
docker run --rm node:24-alpine npx --yes web-push generate-vapid-keys
nano .env backend/.env
```

Что обязательно поправить в `backend/.env`:

- `APP_BASE_URL=https://tidyplan.ru` — на этот адрес ведут ссылки в письмах;
- `TRUST_PROXY=true` — без него rate-limit видит все запросы как один IP (адрес прокси);
- `SMTP_*` и `EMAIL_FROM` — иначе письма подтверждения и сброса пароля не уходят,
  а ссылка пишется в лог сервера (`docker compose logs backend`);
- `JWT`-секреты, `VAPID_*`, при желании `SENTRY_DSN` / `NUXT_PUBLIC_SENTRY_DSN`.

Про базу — три правила, на которых спотыкаются чаще всего:

1. **В проде доступ к базе задаётся только в корневом `.env`.** Значения `DB_*` из `backend/.env`
   в подстановку `${...}` не попадают, а сервис backend получает их из блока `environment` в
   `docker-compose.yml` — то есть compose перекрывает `env_file`, а не наоборот. В `backend/.env`
   эти строки нужны только тому, кто запускает код на хосте (`npm run dev`).
2. **Пароль задаётся до первого запуска** и состоит из букв и цифр: он подставляется в `DATABASE_URL`,
   а спецсимволы в пароле потребовали бы URL-кодирования. Смена `POSTGRES_PASSWORD` у уже созданного
   тома пароль внутри базы не меняет (см. «Частые ошибки»).
3. **`DATABASE_URL` в `backend/.env` остаётся с `localhost`** — он нужен запуску кода на хосте.
   В контейнере compose перекрывает его адресом `postgres:5432`, иначе миграции не находят базу.

## 3. Первый запуск

**Способ А — сборка на сервере:**

```bash
cd /srv/cleansync
docker compose up -d --build

# Схема и справочные данные (миграции + сид)
docker compose exec backend npm run db:setup
```

**Способ Б — образы из GHCR** (сборка уже прошла в CI на push в `main`):

```bash
# В корневом .env раскомментировать IMAGE_BACKEND и IMAGE_WEB (ghcr.io/...).
# Пакеты GHCR приватные, поэтому серверу нужен токен с правом read:packages.
# Альтернатива без токена: сделать пакеты публичными в GitHub
# (Package settings → Change visibility) — тогда логин не нужен.
echo "$GHCR_TOKEN" | docker login ghcr.io -u mougra --password-stdin

cd /srv/cleansync
docker compose pull backend web
docker compose up -d --no-build
docker compose exec backend npm run db:setup
```

Проверка:

```bash
docker compose ps                                  # все сервисы healthy/running
curl -s localhost:3000/api/health                  # {"status":"Backend is running","database":"up"}
curl -sI localhost:3000/ | head -1                 # HTTP/1.1 200 OK
docker compose logs -f caddy                       # выпуск сертификата
```

## 4. HTTPS и домен

1. **DNS:** `A @ → IP сервера` и `A www → IP сервера` (или `CNAME www → tidyplan.ru`).
   AAAA-запись не создавайте: контейнеры наружу по IPv6 не слушают, и часть пользователей
   получит таймаут. Проверка: `dig +short tidyplan.ru`.
2. **В корневом `.env`:** `SITE_URL=https://tidyplan.ru` и `SITE_DOMAIN=tidyplan.ru`.
   Caddyfile читает домен как `{$SITE_DOMAIN}` и сам получает сертификат Let's Encrypt.
3. **Пересобрать приложение**, если менялся `SITE_URL`: этот адрес запекается в образ web
   **на сборке** (canonical, `og:url`, hreflang, карта сайта — в рантайме не подменить):

```bash
docker compose up -d --build                                  # способ А
docker compose pull web && docker compose up -d --no-build     # способ Б
```

Порядок важен: сначала DNS, потом запуск с доменом. Если домен ещё не смотрит на сервер или закрыт
порт 80, Caddy не выпустит сертификат и будет повторять попытки — это лечится исправлением DNS,
а не перезапусками (у Let's Encrypt есть лимит на неудачные попытки).

> **Важно про cookie.** Авторизация — httpOnly-cookie, поэтому приложение и API обязаны
> быть на одном origin. Схема выше это выполняет (и `/`, и `/api` идут через один домен).
> Если разнести их на разные домены, вход перестанет работать — это осознанное ограничение
> дизайна, а не баг.

## 5. Обновление версии

```bash
cd /srv/cleansync
git pull

docker compose up -d --build                                          # способ А
docker compose pull backend web && docker compose up -d --no-build    # способ Б

docker compose exec backend npm run migrate:up                        # если добавились миграции
```

Откат:

- способ А — `git checkout <предыдущий-коммит> && docker compose up -d --build`;
- способ Б — в корневом `.env` указать тег с SHA вместо `latest`
  (`IMAGE_WEB=ghcr.io/mougra/cleansync-web:<sha>`), затем `docker compose pull web && docker compose up -d --no-build`.

Миграции вниз откатываются командой `npm run migrate:down` (по одной).

## 6. Бэкапы

```bash
chmod +x scripts/backup-db.sh
sudo mkdir -p /var/backups/cleansync

# Ежедневно в 3:00, ротация 7 дней
( crontab -l 2>/dev/null; echo "0 3 * * * /srv/cleansync/scripts/backup-db.sh >> /var/log/cleansync-backup.log 2>&1" ) | crontab -
```

Сразу проверьте, что бэкап действительно снимается: по cron ошибка («Permission denied»
на неисполняемом скрипте, остановленный контейнер) видна только в логе и всплывёт в самый
неподходящий момент.

```bash
/srv/cleansync/scripts/backup-db.sh   # печатает путь, размер и число оставшихся дампов
ls -lh /var/backups/cleansync
```

Cron считает время в часовом поясе сервера, а не в московском: если сервер живёт в UTC
или в поясе провайдера, «3:00» окажется другим часом. Посмотреть и при желании перевести
на московское время: `timedatectl` и `sudo timedatectl set-timezone Europe/Moscow`.

Восстановление:
```bash
gunzip -c /var/backups/cleansync/clean_planner-2026-10-08_03-00.sql.gz \
  | docker exec -i clean_planner_db psql -U postgres -d clean_planner
```

Дампы стоит увозить с сервера (rsync или объектное хранилище): бэкап на том же диске
не спасает от потери диска. Раз в месяц проверяйте, что дамп действительно разворачивается
на тестовой базе. Снапшот VPS (если он оплачен) дополняет дампы, но не заменяет их.

## 7. Что проверить после запуска

- `https://домен/api/health` — API и база живы.
- Регистрация и вход: cookie `cp_access` и `cp_refresh` ставятся с флагом `Secure`
  (в продакшене — только по HTTPS).
- `https://домен/sitemap_index.xml` и `/robots.txt` содержат домен, а не localhost.
  Для этого задан `NUXT_PUBLIC_SITE_URL` (`SITE_URL` в корневом `.env`).
- **`canonical` и `og:url`** в исходнике любой страницы указывают на домен:
  `curl -s https://домен | grep -o '<link rel="canonical"[^>]*>'`. Это самый чувствительный
  к настройке тег: адрес читается на сборке, и если образ собран с `localhost` (или скачан
  из GHCR, собранный без переменной репозитория `SITE_URL`), nuxt-seo не поставит `canonical` вовсе.
- `https://домен/llms.txt`, `/llms-full.txt` и `/feed.xml` отдают содержимое,
  а ссылки внутри — абсолютные, с доменом.
- В разметке страниц есть ожидаемые узлы: `Article` и `FAQPage` в статьях,
  `HowTo` в челленджах, `ItemList` в списке советов.
- `https://www.домен` перенаправляется на `https://домен` (301).
- Письма: подтверждение почты и сброс пароля ведут на домен (`APP_BASE_URL` в `backend/.env`).
- Push: в настройках включить уведомления и нажать «Проверить».
- В консоли браузера нет ошибок CSP и смешанного содержимого.

## 8. Частые ошибки

| Симптом | Причина и лечение |
|---|---|
| `canonical` отсутствует или ведёт на localhost | Образ web собран без `SITE_URL`. Задать его в корневом `.env` и пересобрать (способ А) либо проверить переменную `SITE_URL` в настройках репозитория (для GHCR) |
| `db:setup` падает с `ECONNREFUSED 127.0.0.1:5432` | Образ backend старше compose-правки: миграции читают только `DATABASE_URL` и должны идти на хост `postgres`. Проверьте, что `docker-compose.yml` перекрывает `DATABASE_URL` в блоке `environment`, и пересоберите/скачайте свежий образ |
| `password authentication failed for user "postgres"` | Пароль в корневом `.env` не совпадает с тем, что в `backend/.env`, либо том создан со старым паролем. Сменить внутри базы: `docker compose exec postgres psql -U postgres -c "ALTER USER postgres PASSWORD 'новый';"`. При пустом томе проще `docker compose down -v` и запуск заново — данные пропадут |
| Caddy не выпускает сертификат | Домен не смотрит на сервер / закрыт порт 80 / не задан `SITE_DOMAIN`. Смотрите `docker compose logs caddy`, сначала почините DNS, потом перезапускайте контейнер (не десятки раз — иначе упрётесь в лимит Let's Encrypt) |
| 502 Bad Gateway | Упал `web` или `backend`: `docker compose ps`, `docker compose logs web backend`. Типичная причина — не заданы секреты в `backend/.env` |
| Rate-limit срабатывает на всех сразу | Поставить `TRUST_PROXY=true` в `backend/.env` и перезапустить backend |
| Вход не работает, cookie не ставится | Приложение и API оказались на разных origin'ах. Оба обязаны быть на одном домене |
| Сервер уходит в OOM на сборке | Собирать образы в CI и запускать через `docker compose pull && docker compose up -d --no-build` (способ Б) |
| Caddy: `permission denied` на `/etc/caddy/Caddyfile` | SELinux в режиме Enforcing не дал контейнеру прочитать смонтированный файл. В compose у монтирования стоит метка `,z`; если её убрали — вернуть, либо разово поправить контекст: `sudo chcon -t container_file_t /srv/cleansync/Caddyfile`. Отключать SELinux (`setenforce 0`) не нужно |
| `dnf install docker-ce`: 404 на репозитории | `$releasever` в AlmaLinux/Rocky равен `8.10`, а в репозитории Docker есть только `8`. Зафиксировать: `sudo sed -i 's|\$releasever|8|' /etc/yum.repos.d/docker-ce.repo && sudo dnf makecache` |
| `swapon: /swapfile: swapon failed: Invalid argument` | Файл создан через `fallocate` на XFS. Пересоздать через `dd` (см. §1) и выполнить `restorecon /swapfile` |
| `db:setup` падает: `sh: 1: node-pg-migrate: not found` | В образе backend нет CLI миграций: он стоял в `devDependencies`, а образ ставит только прод-зависимости (`npm ci --omit=dev`). Обновить образ (`docker compose pull backend`) — начиная с версии, где CLI лежит в `dependencies`, команда работает. Разово, без пересборки: `docker compose run --rm --entrypoint sh backend -c "npm install --no-save node-pg-migrate && npm run db:setup"` |

## 9. Юридические требования (152-ФЗ)

Обработка персональных данных (почта, имя) требует до публичного запуска:

1. **Политика конфиденциальности** — отдельная страница с перечнем данных, целями,
   сроками хранения и порядком удаления.
2. **Согласие на обработку** — чекбокс при регистрации со ссылкой на политику.
3. **Cookie-баннер** — уведомление об использовании cookie (у нас технические cookie
   авторизации и CSRF).
4. **Право на удаление** — кнопка «удалить аккаунт» с подтверждением паролем.
5. **Уведомление в Роскомнадзор** — подаётся оператором ПД до начала обработки.
6. **Реквизиты оператора** — нужны в политике: статус (самозанятый/ИП/ООО), ИНН, контакт.
7. **Хостинг** — данные хранятся на сервере в РФ (дата-центр в Москве).

Разбор и открытые вопросы — в [PLAN.md](PLAN.md) §12.

> **Идентификация домена через Госуслуги — это не уведомление РКН.** Подтверждение владельца через ЕСИА
> у регистратора (для зон `.ru/.рф/.su`, с 1 сентября 2026 без него не продлить домен) закрывает
> требования закона об информации к доменным именам. Обязанность оператора персональных данных
> (ст. 22 152-ФЗ) она не заменяет: сайт с регистрацией, почтой и именем пользователя обрабатывает
> ПД средствами автоматизации, поэтому уведомление подаётся отдельно и **до** начала обработки.
> Исключения ч. 2 ст. 22 (например, обработка без средств автоматизации) такой сайт не покрывают.

## 10. Чего пока нет

- **Поведенческой аналитики** — сколько людей заходит, какие страницы смотрят и откуда пришли,
  показывает сводка из журнала (§11), но воронок, карт кликов и записей сессий нет: для них нужна
  Яндекс.Метрика и правки в уведомлении РКН и в политике.
- **Rate-limit на уровне прокси** — сейчас только в приложении (см. `backend/app.ts`).
- **Уведомления о сбоях** — алертов нет, о падении узнаём из недоступности сайта.
- **Автоматического деплоя** — обновление запускается руками по этой инструкции; CI только собирает
  и публикует образы.

## 11. Сводка посещаемости из журнала

Сколько людей зашло, какие страницы смотрели, откуда пришли и сколько отдали ошибок — считает
`scripts/visit-stats.sh` по журналу Caddy. Стороннего счётчика нет намеренно: Метрика — это cookies,
чужой JavaScript и новые персональные данные, то есть правки в уведомлении РКН и в политике. Журнал
сервера и так ведётся и описан в политике, а скрипт отдаёт **только числа**: IP нужен, чтобы посчитать
уникальных посетителей, и никуда не сохраняется.

```bash
sudo dnf install -y jq                # один раз
./scripts/visit-stats.sh              # сегодня
./scripts/visit-stats.sh --yesterday  # вчера
./scripts/visit-stats.sh 2026-10-15   # конкретный день
```

Чтобы цифры копились и не терялись при ротации журнала (Caddy держит 5 файлов по 10 МиБ):

```bash
( crontab -l 2>/dev/null; echo "30 3 * * * /srv/cleansync/scripts/visit-stats.sh --yesterday >> /var/log/cleansync-visits.log 2>&1" ) | crontab -
```

Накопленное смотреть так: `tail -60 /var/log/cleansync-visits.log`. Если у сервера сменится часовой
пояс, поправь `TZ_OFFSET` в начале скрипта (по умолчанию московское время, UTC+3).
