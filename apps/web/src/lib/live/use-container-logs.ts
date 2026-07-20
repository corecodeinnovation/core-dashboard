"use client";

import { useEffect, useState } from "react";

import { appendBatch, EMPTY_LOGS_BUFFER, type LogsBuffer } from "./logs-buffer";
import { useLive } from "./live-provider";

const MAX_LINES = 1_000;

export interface ContainerLogs extends LogsBuffer {
  error: string | null;
}

// Stream de logs del contenedor seleccionado. El ack de cada batch se responde
// recién después de aplicarlo al estado: si este cliente se enlentece, el
// server lo nota y aplica backpressure (o corta la sesión).
export function useContainerLogs(container: string | null): ContainerLogs {
  const { socket, status } = useLive();
  const [buffer, setBuffer] = useState<LogsBuffer>(EMPTY_LOGS_BUFFER);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBuffer(EMPTY_LOGS_BUFFER);
    setError(null);
    // `status` en deps: al reconectar hay que volver a suscribirse.
    if (!socket || !container || status !== "live") return;

    socket
      .emitWithAck("logs:subscribe", { container })
      .then((result) => {
        if (!result.ok) setError(result.error ?? "no se pudo abrir el stream");
      })
      .catch(() => setError("no se pudo abrir el stream"));

    const onBatch = (batch: Parameters<typeof appendBatch>[1], ack: () => void): void => {
      if (batch.container === container) {
        setBuffer((prev) => appendBatch(prev, batch, MAX_LINES));
      }
      ack();
    };
    socket.on("logs:batch", onBatch);

    return () => {
      socket.off("logs:batch", onBatch);
      socket.emit("logs:unsubscribe", { container }, () => {});
    };
  }, [socket, container, status]);

  return { ...buffer, error };
}
