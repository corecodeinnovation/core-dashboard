# Contexto de build: la raíz del monorepo (ver docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci -w apps/api
COPY apps/api ./apps/api
RUN npm run build -w apps/api

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci -w apps/api --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
