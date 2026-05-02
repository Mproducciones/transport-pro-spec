#!/bin/sh
set -e
cd /app
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Starting API..."
exec node dist/index.js
