import type { LogLine, LogsBatch } from "@core-dashboard/shared";

export interface LogsBuffer {
  lines: LogLine[];
  // Total de líneas descartadas (por el server al no drenar, o aquí por el tope).
  dropped: number;
}

export const EMPTY_LOGS_BUFFER: LogsBuffer = { lines: [], dropped: 0 };

// Ring buffer del terminal: nunca más de `max` líneas en memoria del browser.
export function appendBatch(buffer: LogsBuffer, batch: LogsBatch, max: number): LogsBuffer {
  const all = buffer.lines.concat(batch.lines);
  const overflow = Math.max(0, all.length - max);
  return {
    lines: overflow > 0 ? all.slice(overflow) : all,
    dropped: buffer.dropped + batch.dropped + overflow,
  };
}
