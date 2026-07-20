import type { LogLine } from "@core-dashboard/shared";

export type FrameSource = "stdout" | "stderr";

// Parser incremental del stream multiplexado de Docker (contenedores sin TTY):
// cada frame es [tipo, 0, 0, 0, len u32 BE, payload]. Tolera frames partidos
// entre chunks y varios frames por chunk.
export class DockerFrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private readonly onPayload: (source: FrameSource, payload: Buffer) => void) {}

  push(chunk: Buffer): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const size = this.buffer.readUInt32BE(4);
      if (this.buffer.length < 8 + size) return;
      const type = this.buffer[0];
      const payload = this.buffer.subarray(8, 8 + size);
      this.buffer = this.buffer.subarray(8 + size);
      this.onPayload(type === 2 ? "stderr" : "stdout", payload);
    }
  }
}

// Acumula payloads por fuente y emite solo líneas completas (una línea puede
// llegar partida en varios frames, y un frame puede traer varias líneas).
export class LogLineSplitter {
  private partial: Record<FrameSource, string> = { stdout: "", stderr: "" };

  constructor(private readonly onLine: (line: LogLine) => void) {}

  push(source: FrameSource, payload: Buffer): void {
    const text = this.partial[source] + payload.toString("utf8");
    const lines = text.split("\n");
    this.partial[source] = lines.pop() ?? "";
    for (const raw of lines) {
      const clean = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (clean.length > 0) this.onLine(parseDockerLine(source, clean));
    }
  }
}

// Con `timestamps: true` Docker antepone RFC3339Nano + espacio a cada línea.
export function parseDockerLine(source: FrameSource, raw: string): LogLine {
  const idx = raw.indexOf(" ");
  if (idx > 0) {
    const ts = raw.slice(0, idx);
    if (!Number.isNaN(Date.parse(ts))) {
      return { ts, source, text: raw.slice(idx + 1) };
    }
  }
  return { ts: new Date().toISOString(), source, text: raw };
}
