"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import {
  LIVE_NAMESPACE,
  serviceKey,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type ServiceState,
} from "@core-dashboard/shared";
import { io, type Socket } from "socket.io-client";

import { useAuth } from "@/lib/auth/auth-provider";

import { applyUpdate, sortServices } from "./state";

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

export type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface LiveContextValue {
  socket: LiveSocket | null;
  services: ServiceState[];
  status: ConnectionStatus;
}

const LiveContext = createContext<LiveContextValue>({
  socket: null,
  services: [],
  status: "connecting",
});

// Resolución de la URL del gateway:
// 1. NEXT_PUBLIC_API_WS_URL si está definida (se inyecta en build).
// 2. Dev: el web corre en 3002 y el gateway en 3004.
// 3. Producción: mismo origen — el túnel rutea dash.../socket.io/* al api,
//    así no hay CORS ni URLs horneadas en la imagen.
function wsBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_WS_URL) return process.env.NEXT_PUBLIC_API_WS_URL;
  return process.env.NODE_ENV === "development" ? "http://localhost:3004" : "";
}

// Un único socket para toda la app (grid + logs): reconexión con backoff
// exponencial (nativa de Socket.IO, 1 s → 30 s con jitter) y resync +
// re-suscripción en cada connect (al reconectar el socket es nuevo y los
// rooms del server se pierden).
export function LiveProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [socket, setSocket] = useState<LiveSocket | null>(null);
  const [services, setServices] = useState<ServiceState[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  // Reconecta (nuevo socket) cuando cambia el token: login/logout/renovación
  // deben quedar reflejados en el handshake, no solo en las llamadas REST.
  useEffect(() => {
    const live: LiveSocket = io(`${wsBaseUrl()}${LIVE_NAMESPACE}`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      auth: accessToken ? { token: accessToken } : {},
    });

    const resync = async (): Promise<void> => {
      const snapshot = await live.emitWithAck("state:resync");
      setServices(sortServices(snapshot.services));
      const keys = snapshot.services.map((s) => serviceKey(s.project, s.service));
      if (keys.length > 0) await live.emitWithAck("rooms:subscribe", keys);
    };

    live.on("connect", () => {
      setStatus("live");
      void resync().catch(() => {
        // Si el resync falla, la reconexión automática vuelve a intentarlo.
      });
    });
    live.on("disconnect", () => setStatus("reconnecting"));
    live.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    live.on("state:update", (update) => {
      setServices((prev) => applyUpdate(prev, update));
    });

    setSocket(live);
    return () => {
      live.disconnect();
    };
  }, [accessToken]);

  return (
    <LiveContext.Provider value={{ socket, services, status }}>{children}</LiveContext.Provider>
  );
}

export function useLive(): LiveContextValue {
  return useContext(LiveContext);
}
