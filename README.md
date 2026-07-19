<div align="center">

# 📊 core-dashboard

**Panel de control del homelab en tiempo real. Showcase de WebSockets.**

![Tier](https://img.shields.io/badge/tier-3_flagship-FF5A1F)
![WebSockets](https://img.shields.io/badge/WebSockets-Socket.IO-22D3EE)
![License](https://img.shields.io/badge/license-MIT-green)

Parte del portfolio técnico de Core Code Innovation.

</div>

---

## Qué es

El proyecto que une el ecosistema CCI: estado en vivo de los contenedores del homelab vía
**WebSocket** (rooms por servicio, heartbeat, reconexión con resync), métricas por contenedor
con histórico (**Prometheus + cAdvisor**), live logs con backpressure, alertas hacia
`ops-notify-bot`, acciones protegidas por **RBAC** (roles emitidos por `cci-auth-service`)
y trabajos pesados delegados a `taskforge`.

**Stack:** monorepo npm workspaces · NestJS + Socket.IO (api) · Next.js App Router (web) ·
TypeScript estricto · PostgreSQL + Prisma · Redis · Prometheus + cAdvisor · Docker.

## Arquitectura

```mermaid
flowchart LR
  B[Browser] -- HTTPS --> W[apps/web · Next.js]
  B -- "WS (Socket.IO)" --> A[apps/api · NestJS<br/>REST + WS gateway]
  A --- P[(PostgreSQL<br/>eventos · audit · rollups)]
  A --- R[(Redis<br/>adapter Socket.IO)]
  A --> PR[Prometheus + cAdvisor]
  A -- "socket ro" --> D[Docker Engine]
  A -- JWT/JWKS --> AUTH[cci-auth-service]
  A -- jobs --> TF[taskforge]
  A -- alertas --> BOT[ops-notify-bot]
```

## Quickstart

Stack completo (6 servicios, con healthchecks):

```bash
cp .env.example .env
docker compose up --build
```

La imagen de la api aplica las migraciones de Prisma al arrancar. Web en
`http://localhost:3002`, api en `http://localhost:3004/health` (los contenedores
escuchan en 3000). Prometheus y cAdvisor viven solo en la red interna del compose.

Desarrollo local (apps fuera de Docker, infra en Docker):

```bash
docker compose up -d db redis
npm install
DATABASE_URL=postgresql://dashboard:dashboard@localhost:5435/dashboard \
  npm run prisma:migrate -w apps/api
npm run dev   # api en :3004, web en :3002
```

## Estructura

```
apps/api    NestJS — REST (histórico, acciones) + WebSocket gateway · Prisma
apps/web    Next.js — UI en vivo, cliente WS con reconexión, gráficas
infra/      Prometheus (retención 30 d, scrape de cAdvisor)
```

## Puertos (host)

| Servicio   | Puerto | Nota                         |
| ---------- | ------ | ---------------------------- |
| web        | 3002   | UI                           |
| api        | 3004   | REST + WS                    |
| PostgreSQL | 5435   | para migraciones/dev         |
| Redis      | 6382   | para dev                     |
| Prometheus | —      | solo red interna del compose |
| cAdvisor   | —      | solo red interna del compose |

## Features

- [x] Monorepo + esqueletos api/web + compose completo
- [x] Schema Prisma (eventos, rollups de métricas, audit log, alertas, jobs)
- [x] Tokens de marca CCI + layout dark-first
- [ ] WS gateway con auth de handshake (JWT vía JWKS)
- [ ] Estado de contenedores en vivo (rooms + heartbeat + resync)
- [ ] Live log viewer con backpressure
- [ ] Métricas por contenedor: vivo + histórico (rollups 5 min)
- [ ] Alertas → ops-notify-bot
- [ ] Acciones (restart) con RBAC y audit log
- [ ] Escalado horizontal del gateway (Redis adapter)

## Licencia

MIT
