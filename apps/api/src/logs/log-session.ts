import type { LogLine, LogsBatch } from "@core-dashboard/shared";

// Fuente pausable del stream de logs (el stream de dockerode en producción).
export interface LogSource {
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface LogSessionOptions {
  container: string;
  batchSize: number;
  maxQueue: number;
  highWater: number;
  lowWater: number;
  ackTimeoutMs: number;
}

export const DEFAULT_SESSION_OPTIONS = {
  batchSize: 100,
  maxQueue: 2_000,
  highWater: 1_000,
  lowWater: 200,
  ackTimeoutMs: 10_000,
} as const;

// Emite un batch al cliente; resuelve con el ack, rechaza si expira el timeout.
export type BatchEmitter = (batch: LogsBatch, ackTimeoutMs: number) => Promise<void>;

// Backpressure de una sesión de logs (RNF-05):
//  - Flow control por ack: un solo batch en vuelo; sin ack no sale el siguiente.
//  - Watermarks: cola alta ⇒ pause() de la fuente; cola drenada ⇒ resume().
//  - Cola llena ⇒ se descarta lo más viejo y se informa `dropped` al cliente.
//  - Ack vencido ⇒ cliente muerto o demasiado lento: la sesión se corta entera
//    (nunca acumular sin límite ni bloquear el gateway).
export class LogSession {
  private queue: LogLine[] = [];
  private dropped = 0;
  private paused = false;
  private sending = false;
  private closed = false;
  private ending = false;
  private source: LogSource | null = null;

  constructor(
    private readonly options: LogSessionOptions,
    private readonly emit: BatchEmitter,
    private readonly onClose: () => void,
  ) {}

  attachSource(source: LogSource): void {
    if (this.closed) {
      source.destroy();
      return;
    }
    this.source = source;
  }

  push(line: LogLine): void {
    if (this.closed) return;
    if (this.queue.length >= this.options.maxQueue) {
      this.queue.shift();
      this.dropped += 1;
    }
    this.queue.push(line);
    if (!this.paused && this.queue.length >= this.options.highWater) {
      this.paused = true;
      this.source?.pause();
    }
    void this.flush();
  }

  // Fin natural de la fuente (el contenedor dejó de loguear): a diferencia de
  // close(), NO tira la cola pendiente — la termina de drenar y recién ahí
  // cierra. close() es para cancelaciones (unsubscribe/socket caído), donde
  // descartar lo que quede en cola es lo correcto porque el cliente ya no
  // quiere más datos.
  end(): void {
    if (this.closed || this.ending) return;
    this.ending = true;
    this.source = null;
    this.maybeFinishEnding();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue = [];
    this.source?.destroy();
    this.onClose();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  private async flush(): Promise<void> {
    if (this.sending || this.closed) return;
    this.sending = true;
    try {
      while (this.queue.length > 0 && !this.closed) {
        const lines = this.queue.splice(0, this.options.batchSize);
        const batch: LogsBatch = {
          container: this.options.container,
          lines,
          dropped: this.dropped,
        };
        this.dropped = 0;
        if (this.paused && this.queue.length <= this.options.lowWater) {
          this.paused = false;
          this.source?.resume();
        }
        await this.emit(batch, this.options.ackTimeoutMs);
      }
    } catch {
      this.close();
    } finally {
      this.sending = false;
      this.maybeFinishEnding();
    }
  }

  private maybeFinishEnding(): void {
    if (this.ending && !this.sending && this.queue.length === 0 && !this.closed) {
      this.close();
    }
  }
}
