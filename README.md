<div align="center">

# 📊 core-dashboard

**Panel de control del homelab en tiempo real. Showcase de WebSockets.**

![Tier](https://img.shields.io/badge/tier-3-flagship-0B5FFF)
![WebSockets](https://img.shields.io/badge/WebSockets-realtime-22D3EE)
![License](https://img.shields.io/badge/license-MIT-green)

Parte del portfolio técnico de Core Code Innovation.

</div>

---

## Qué es

El proyecto que une el ecosistema: estado en vivo de contenedores y hosts vía
**WebSocket**, métricas (Prometheus), live logs, alertas (dispara ops-notify-bot),
acciones con auth por roles (cci-auth-service) y jobs pesados delegados a taskforge.

## Estructura

```
apps/web   Next.js (UI en tiempo real)
apps/api   NestJS (WebSocket gateway + REST)
```

## Quickstart

```bash
cp .env.example .env
npm install
# apps/api y apps/web en dev
```

## Features

- [ ] WS gateway con auth de handshake
- [ ] Rooms por host + heartbeat + reconexión
- [ ] Live log viewer con backpressure
- [ ] Métricas históricas (Prometheus)
- [ ] Alertas -> ops-notify-bot
- [ ] Acciones (restart) con RBAC

Ver `docs/deep-dives/websockets.md`.
