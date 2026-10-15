#!/usr/bin/env bash
#
# Сводка посещаемости из журнала Caddy.
#
#   ./scripts/visit-stats.sh                 # сегодня
#   ./scripts/visit-stats.sh --yesterday     # вчера (для cron)
#   ./scripts/visit-stats.sh 2026-10-15      # конкретный день
#
# Почему так, а не Яндекс.Метрикой: сторонний счётчик — это cookies, чужой JS и
# новые персональные данные, а значит правки в уведомлении РКН и в политике.
# Журнал сервера и так ведётся (он описан в политике), поэтому считаем агрегаты
# по нему: IP нужен только чтобы посчитать уникальных посетителей и **не
# сохраняется**, на выходе — только числа.
#
# Требуется jq:  sudo dnf install -y jq
set -euo pipefail

CONTAINER="${CADDY_CONTAINER:-clean_planner_caddy}"
# Сдвиг для перевода метки времени в московское время: UTC+3 = 10800 секунд.
TZ_OFFSET="${TZ_OFFSET:-10800}"
# Сколько страниц и источников показывать в топах.
TOP_N="${TOP_N:-10}"

TARGET="$(date +%F)"
case "${1:-}" in
  --yesterday) TARGET="$(date -d 'yesterday' +%F)" ;;
  '') ;;
  -h|--help) sed -n '3,8p' "$0"; exit 0 ;;
  *) TARGET="$1" ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  echo "Нужен jq: sudo dnf install -y jq" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Контейнер $CONTAINER не запущен — журнала нет" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Журнал лежит внутри контейнера caddy (том /data). Читаем и текущий файл, и
# ротированные: иначе данные теряются на границе ротации.
docker exec "$CONTAINER" sh -c 'cat /data/access.log* 2>/dev/null' \
  | jq -rc --argjson off "$TZ_OFFSET" --arg day "$TARGET" '
      select(.ts != null)
      | select(((.ts + $off) | strftime("%Y-%m-%d")) == $day)
      | {
          ip: (.request.remote_ip // "-"),
          path: (.request.uri // "-"),
          status: (.status // 0),
          ref: ((.request.headers.Referer // [])
                | if type == "array" then (.[0] // "") else . end),
          ua: ((.request.headers."User-Agent" // [])
               | if type == "array" then (.[0] // "") else . end)
        }' > "$TMP" 2>/dev/null || true

if [ ! -s "$TMP" ]; then
  echo "За $TARGET записей в журнале нет (журнал ротируется, старые дни уходят)"
  exit 0
fi

jq -rs --arg day "$TARGET" --argjson top "$TOP_N" '
  def is_bot: (.ua | test("[Bb]ot|Yandex|Google|bing|DuckDuck|Ahrefs|Semrush|python|curl|wget|Headless"));
  # Страницы — всё, кроме статики, обращений к API и служебных файлов для роботов.
  def is_page: (.path
                | (test("^/api/")
                   or test("\\.(js|css|png|jpe?g|svg|webp|ico|woff2?|map|xml|txt|json)$"))
                | not);
  def with_n: group_by(.) | map({k: .[0], n: length}) | sort_by(-.n) | .[:$top];
  def show: .[] | "  \(.n)\t\(.k)";

  (map(select(is_bot | not))) as $human
  | "TidyPlan — посещаемость за \($day)",
    "",
    "Запросов всего:              \(length)",
    "Просмотров страниц:          \($human | map(select(is_page)) | length)",
    "Уникальных посетителей:      \($human | map(.ip) | unique | length)",
    "Обращений роботов (по UA):   \(map(select(is_bot)) | length)",
    "",
    "— Топ страниц —",
    ($human | map(select(is_page) | .path) | with_n | show),
    "",
    "— Откуда пришли —",
    ($human
      | map(select(is_page)
            | (.ref
               | if . == "" then "прямой заход (или приложение)"
                 else (sub("^[a-z]+://"; "") | split("/")[0]) end))
      | with_n | show),
    "",
    "— Ошибки —",
    ("  всего: \(map(select(.status >= 400)) | length)",
     (map(select(.status >= 400) | "\(.status) \(.path)") | with_n | show))
' "$TMP"
