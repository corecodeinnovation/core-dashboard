# Contexto de build: la raíz del monorepo (ver docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# -w packages/shared para instalar también sus devDeps (typescript) y poder compilarlo.
RUN npm ci -w apps/api -w packages/shared
COPY packages/shared ./packages/shared
RUN npm run build -w packages/shared
COPY apps/api ./apps/api
# El postinstall de @prisma/client corrió en el paso anterior sin el schema
# (se copia recién acá), así que el client generado no tiene nuestros modelos.
# Hay que regenerarlo explícitamente antes de compilar: nest build type-checkea
# contra @prisma/client (p. ej. el enum MetricKind).
RUN cd apps/api && npx prisma generate
RUN npm run build -w apps/api

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
# Prisma necesita OpenSSL para sus engines en Alpine.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w apps/api --omit=dev && npm cache clean --force
COPY apps/api/prisma ./apps/api/prisma
# Genera el client aquí (root) para que el runtime como `node` solo necesite lectura.
RUN cd apps/api && npx prisma generate
COPY --from=build --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3000
# Aplica las migraciones pendientes antes de arrancar: la imagen es autosuficiente.
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/main.js"]
