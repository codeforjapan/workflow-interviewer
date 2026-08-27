#!/bin/sh
set -e

echo "==> Installing dependencies..."
# Use --ignore-scripts to skip native build steps; all packages in this project
# (esbuild, sharp) ship prebuilt binaries for common platforms.
pnpm install --ignore-scripts

echo "==> Waiting for database to be ready..."
until pg_isready -h db -p 5432 -U postgres 2>/dev/null; do
  sleep 1
done

echo "==> Applying database migrations..."
pnpm db:migrate

echo "==> Starting development server..."
exec pnpm dev -H 0.0.0.0
