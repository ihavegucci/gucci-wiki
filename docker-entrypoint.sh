#!/bin/sh
set -e

echo "Применяем миграции Prisma..."
npx prisma migrate deploy

echo "Засеиваем демо-пространства (идемпотентно)..."
node prisma/seed.mjs || true

exec "$@"
