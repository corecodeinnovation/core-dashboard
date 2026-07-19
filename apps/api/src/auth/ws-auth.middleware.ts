import type { Socket } from "socket.io";

import { TokenService } from "./token.service";

type NamespaceMiddleware = (socket: Socket, next: (err?: Error) => void) => void;

// Auth del handshake WS: el cliente manda el JWT en `auth.token` (o header
// Authorization en clientes no-browser). Sin token o inválido ⇒ viewer: el
// namespace /live es read-only y las acciones con rol se validan por evento.
export function createWsAuthMiddleware(tokens: TokenService): NamespaceMiddleware {
  return (socket, next) => {
    const token = extractToken(socket);
    tokens
      .authenticate(token)
      .then((user) => {
        socket.data.user = user;
        next();
      })
      .catch(() => next(new Error("handshake auth failed")));
  };
}

function extractToken(socket: Socket): string | null {
  const auth = socket.handshake.auth?.token;
  if (typeof auth === "string" && auth.length > 0) return auth;
  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  return null;
}
