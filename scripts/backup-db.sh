#!/usr/bin/env bash
#
# Бэкап базы с ротацией. Запускать по cron на сервере, например раз в сутки:
#   0 3 * * * /srv/cleansync/scripts/backup-db.sh >> /var/log/cleansync-backup.log 2>&1
#
# Дампы снимаются через pg_dump внутри контейнера, поэтому отдельный клиент
# PostgreSQL на хосте не нужен.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/cleansync}"
KEEP_DAYS="${KEEP_DAYS:-7}"
CONTAINER="${PG_CONTAINER:-clean_planner_db}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-clean_planner}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y-%m-%d_%H-%M)"
FILE="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"

echo "[$(date '+%F %T')] Бэкап $DB_NAME → $FILE"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Контейнер $CONTAINER не запущен — бэкап не сделан" >&2
  exit 1
fi

# -T отключает псевдотерминал, иначе gzip получит лишние байты
docker exec -T "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip -9 > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[$(date '+%F %T')] Готово: $SIZE"

# Ротация: старые дампы удаляем, чтобы диск не закончился
find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -type f -mtime "+${KEEP_DAYS}" -print -delete

echo "[$(date '+%F %T')] Осталось дампов: $(find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" | wc -l)"
