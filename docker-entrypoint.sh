#!/bin/sh
set -e
if [ -z "$DATABASE_URL" ]; then echo "DATABASE_URL manquant" >&2; exit 1; fi
if [ -z "$BILANX_SECRET_KEY" ]; then echo "BILANX_SECRET_KEY manquant (openssl rand -base64 32)" >&2; exit 1; fi
echo "Application des migrations…"
node packages/db/src/migrate-cli.ts
echo "Démarrage de BILANX…"
exec node apps/web/server.js
