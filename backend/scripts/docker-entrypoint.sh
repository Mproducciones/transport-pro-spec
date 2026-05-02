#!/bin/sh
set -e
cd /app
echo "Syncing database schema..."
npx prisma db push --force-reset
echo "Starting API..."
exec node dist/index.js
