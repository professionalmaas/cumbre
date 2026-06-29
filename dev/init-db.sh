#!/usr/bin/env bash
# Apply the Cumbre schema to the local Docker Postgres, in order: 001 -> 002 -> 003.
# Pipes each file into `psql` INSIDE the cumbre-dev-db container, so you don't need a
# local psql client — only Docker. Idempotent (every statement is create-if-not-exists /
# add-column-if-not-exists), so re-running is safe.
#
#   bash dev/init-db.sh
#
# Override the container name with CUMBRE_DB_CONTAINER if you changed docker-compose.dev.yml.
set -euo pipefail

CONTAINER="${CUMBRE_DB_CONTAINER:-cumbre-dev-db}"
DB_USER="${CUMBRE_DB_USER:-cumbre}"
DB_NAME="${CUMBRE_DB_NAME:-cumbre}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "error: container '$CONTAINER' is not running." >&2
  echo "       start it with:  docker compose -f docker-compose.dev.yml up -d" >&2
  exit 1
fi

echo "waiting for postgres to be ready..."
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for f in 001_schema.sql 002_subscriptions.sql 003_feedback.sql; do
  echo "applying db/$f ..."
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$ROOT/db/$f"
done

echo "schema applied. DATABASE_URL=postgres://cumbre:cumbre@localhost:55432/cumbre"
