"use client";

import { useEffect, useState } from "react";

import {
  LIVE_NAMESPACE,
  serviceKey,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type ServiceState,
} from "@core-dashboard/shared";
import { io, type Socket } from "socket.io-client";

import { applyUpdate, sortServices } from "./state";

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function wsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_WS_URL ?? "http://localhost:3004";
}

// Cliente en vivo del gateway: reconexión con backoff exponencial (nativa de
// Socket.IO, 1 s → 30 s con jitter) y resync + re-suscripción en cada connect
// (al reconectar el socket es nuevo y los rooms del server se pierden).
export function useLiveServices(): { services: ServiceState[]; status: ConnectionStatus } {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const socket: LiveSocket = io(`${wsBaseUrl()}${LIVE_NAMESPACE}`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
    });

    const resync = async (): Promise<void> => {
      const snapshot = await socket.emitWithAck("state:resync");
      setServices(sortServices(snapshot.services));
      const keys = snapshot.services.map((s) => serviceKey(s.project, s.service));
      if (keys.length > 0) await socket.emitWithAck("rooms:subscribe", keys);
    };

    socket.on("connect", () => {
      setStatus("live");
      void resync().catch(() => {
        // Si el resync falla, la reconexión automática vuelve a intentarlo.
      });
    });
    socket.on("disconnect", () => setStatus("reconnecting"));
    socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.on("state:update", (update) => {
      setServices((prev) => applyUpdate(prev, update));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { services, status };
}
