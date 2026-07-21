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
TypeScript estricto · PostgreSQL + Prisma · Redis · Prometheus + cAdvisor · Docker · next-intl.

## Capturas

> _Pendiente: capturas del grid en vivo, el panel de métricas y el live log viewer_
> _(dark-first, tokens de marca CCI, es/en)._

<!-- ![Grid en vivo](docs/screenshots/grid.png) -->
<!-- ![Métricas](docs/screenshots/metrics.png) -->

## Arquitectura

```mermaid
flowchart LR
  B[Browser] -- HTTPS --> W[apps/web · Next.js]
  B -- "WS (Socket.IO)" --> A[apps/api · NestJS<br/>REST + WS gateway]
  A --- P[(PostgreSQL<br/>audit · rollups · jobs)]
  A --- R[(Redis<br/>adapter Socket.IO)]
  A --> PR[Prometheus + cAdvisor]
  A -- "socket ro" --> D[Docker Engine]
  A -- JWT/JWKS --> AUTH[cci-auth-service]
  A -- jobs --> TF[taskforge]
  A -- alertas --> BOT[ops-notify-bot]
```

En producción, un túnel de Cloudflare expone `dash.corecodeinnovation.com`: las peticiones
`/socket.io/*` van al gateway (api) y el resto al web, así el WebSocket y la UI comparten
un único origen sin CORS.

## Quickstart

Stack completo (6 servicios, con healthchecks):

```bash
cp .env.example .env
docker compose up --build
```

La imagen de la api aplica las migraciones de Prisma al arrancar. Web en
`http://localhost:3002`, api en `http://localhost:3004/health` (los contenedores
escuchan en 3000). Prometheus y cAdvisor viven solo en la red interna del compose.

Las integraciones con el resto del ecosistema (auth, taskforge, ops-notify-bot) se
resuelven por la red compartida `cci-net` (`docker network create cci-net` una vez).

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
apps/api        NestJS — REST + WebSocket gateway · Prisma
  auth/         validación JWT (JWKS RS256) + guards RBAC + proxy de login (BFF)
  gateway/      Socket.IO: rooms, heartbeat, resync, adapter de Redis
  containers/   inventario y eventos del stack vía dockerode (socket read-only)
  logs/         stream de logs por contenedor con backpressure
  metrics/      proxy Prometheus + rollups de 5 min + purga 30 d
  alerts/       watcher de eventos → ops-notify-bot (Telegram)
  actions/      restart con RBAC, contenedores protegidos y rate limiting
  audit/        consulta del audit log (admin)
  jobs/         delegación de jobs demo a taskforge (client_credentials)
  retention/    purga diaria de audit logs y job runs >30 d
apps/web        Next.js — UI en vivo, cliente WS, gráficas, i18n es/en
packages/shared contratos tipados compartidos (eventos WS, roles)
infra/          Prometheus (retención 30 d, scrape de cAdvisor)
```

## Roles (RBAC)

Los roles se leen del claim `roles` del JWT emitido por `cci-auth-service`
(`USER`/`OPERATOR`/`ADMIN` → `viewer`/`operator`/`admin`). Sin sesión, se navega como `viewer`.

| Rol        | Puede                                                           |
| ---------- | --------------------------------------------------------------- |
| `viewer`   | Ver estado en vivo, logs, métricas e histórico (todo read-only) |
| `operator` | + reiniciar contenedores · disparar jobs demo                   |
| `admin`    | + consultar el audit log · configurar umbrales de alertas       |

## Puertos (host)

| Servicio   | Puerto | Nota                               |
| ---------- | ------ | ---------------------------------- |
| web        | 3002   | UI → `dash.corecodeinnovation.com` |
| api        | 3004   | REST + WS                          |
| PostgreSQL | 5435   | para migraciones/dev               |
| Redis      | 6382   | para dev                           |
| Prometheus | —      | solo red interna del compose       |
| cAdvisor   | —      | solo red interna del compose       |

## Features

- [x] WS gateway con auth de handshake (JWT vía JWKS)
- [x] Estado de contenedores en vivo (rooms + heartbeat + resync + reconexión)
- [x] Live log viewer con backpressure de extremo a extremo
- [x] Métricas por contenedor: vivo (Prometheus) + histórico (rollups 5 min)
- [x] Alertas de caída/reinicio → ops-notify-bot (Telegram)
- [x] Acción restart con RBAC, contenedores protegidos y rate limiting
- [x] Audit log consultable (admin)
- [x] Login web contra cci-auth-service + gates por rol en la UI
- [x] Delegación de jobs pesados a taskforge
- [x] UI bilingüe es/en (next-intl)
- [x] Escalado horizontal del gateway (adapter de Redis)
- [x] Purga automática de datos >30 días

## Escalado del gateway (demo)

En operación normal corre **una** réplica del api. Para demostrar el adapter de Redis
(broadcast entre réplicas) hay un override que no toca el compose base:

```bash
docker compose -f docker-compose.yml -f docker-compose.scale-demo.yml up -d --scale api=2
# volver a una sola réplica:
docker compose up -d --scale api=1
```

## Licencia

MIT
