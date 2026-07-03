#!/usr/bin/env bash
# Nightly Postgres backup for the ICT Forward Lab VPS.
#
# Dumps the ict_forward_lab database from the running postgres container,
# gzips it into $BACKUP_DIR, prunes dumps older than $KEEP_DAYS, and — when
# $BACKUP_REMOTE is set (an scp target like user@host:/path/) — ships the new
# dump off-box. The recorded data (forward_trades, candle_deltas) cannot be
# regenerated, so off-box is the goal; local-only is the fallback.
#
# Install (as root on the VPS):
#   echo '17 2 * * * root /var/www/xtrade-fwd/scripts/backup-db.sh >> /var/log/xtrade-backup.log 2>&1' \
#     > /etc/cron.d/xtrade-backup
set -euo pipefail

CONTAINER="${CONTAINER:-ict-forward-lab-postgres}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-ict_forward_lab}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/xtrade-fwd}"
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"

# A truncated pipe would exit non-zero above, but also sanity-check the gzip.
gunzip -t "$OUT"
echo "$(date -u +%FT%TZ) wrote $OUT ($(du -h "$OUT" | cut -f1))"

find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -mtime "+${KEEP_DAYS}" -delete

if [ -n "$BACKUP_REMOTE" ]; then
  if scp -o BatchMode=yes -o ConnectTimeout=15 "$OUT" "$BACKUP_REMOTE"; then
    echo "$(date -u +%FT%TZ) shipped to $BACKUP_REMOTE"
  else
    echo "$(date -u +%FT%TZ) WARNING: off-box copy to $BACKUP_REMOTE failed" >&2
  fi
fi
