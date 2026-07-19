# Contexto de build: la raíz del monorepo (ver docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# -w packages/shared para instalar también sus devDeps (typescript) y poder compilarlo.
RUN npm ci -w apps/web -w packages/shared
COPY packages/shared ./packages/shared
RUN npm run build -w packages/shared
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
# URL del gateway WS vista desde el browser, horneada en el build de Next.
# Default: demo local (localhost:3004). En el deploy por túnel se pasa vacía
# ⇒ el cliente usa el mismo origen y cloudflared rutea /socket.io/* al api.
ARG NEXT_PUBLIC_API_WS_URL=http://localhost:3004
ENV NEXT_PUBLIC_API_WS_URL=$NEXT_PUBLIC_API_WS_URL
RUN npm run build -w apps/web

# Runtime mínimo con output standalone; en monorepo el server queda en apps/web/server.js.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
