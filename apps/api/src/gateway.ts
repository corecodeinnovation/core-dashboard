// core-dashboard API — WebSocket gateway (scaffolding).
// Puntos duros a resolver (ver docs/deep-dives/websockets.md):
//  - auth del handshake (JWT de cci-auth-service)
//  - rooms por host, heartbeat/ping-pong, reconexión con backoff
//  - backpressure en streams de logs, escalado con Redis adapter
export {};
