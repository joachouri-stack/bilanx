# syntax=docker/dockerfile:1
# Image de production de l'application web BILANX (utilisée par Coolify).
# Les migrations PostgreSQL sont appliquées automatiquement au démarrage.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY packages/auth/package.json packages/auth/
COPY packages/profiles/package.json packages/profiles/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @bilanx/web

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system bilanx && useradd --system --gid bilanx --no-create-home bilanx
# Serveur Next.js autonome (contient seulement les dépendances nécessaires).
COPY --from=build --chown=bilanx:bilanx /app/apps/web/.next/standalone ./
COPY --from=build --chown=bilanx:bilanx /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=bilanx:bilanx /app/apps/web/public ./apps/web/public
# Outil de migration et fichiers SQL.
COPY --from=build --chown=bilanx:bilanx /app/packages/db/src ./packages/db/src
COPY --from=build --chown=bilanx:bilanx /app/db/migrations ./db/migrations
COPY --from=build --chown=bilanx:bilanx /app/node_modules/postgres ./node_modules/postgres
COPY --chown=bilanx:bilanx docker-entrypoint.sh ./docker-entrypoint.sh
USER bilanx
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
