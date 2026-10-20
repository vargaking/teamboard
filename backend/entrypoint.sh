#!/bin/sh
# Container entrypoint: wait for Postgres, apply Aerich migrations, seed (idempotent), start the API.
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "Waiting for database..."
python - <<'PY'
import asyncio, os, sys, time
import asyncpg
# Tortoise accepts postgres:// ; asyncpg wants postgresql://
url = os.environ["DATABASE_URL"].replace("postgres://", "postgresql://", 1)
async def ping():
    conn = await asyncpg.connect(url)
    try:
        await conn.fetchval("SELECT 1")
    finally:
        await conn.close()
deadline = time.time() + 60
while True:
    try:
        asyncio.run(ping())
        break
    except Exception as exc:  # noqa: BLE001
        if time.time() > deadline:
            print(f"database not reachable: {exc}", file=sys.stderr)
            sys.exit(1)
        time.sleep(1)
PY

echo "Applying migrations..."
aerich upgrade

if [ "${SEED_ON_STARTUP:-true}" = "true" ]; then
  echo "Seeding (idempotent)..."
  python -m app.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' "$@"
