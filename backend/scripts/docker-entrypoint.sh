#!/bin/sh
set -e
cd /app
echo "Syncing database schema..."
npx prisma db push
echo "Starting API..."
exec node dist/index.js
