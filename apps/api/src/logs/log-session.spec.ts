import type { LogLine, LogsBatch } from "@core-dashboard/shared";

import { LogSession, type LogSessionOptions, type LogSource } from "./log-session";

function line(n: number): LogLine {
  return { ts: new Date().toISOString(), source: "stdout", text: `línea ${n}` };
}

function options(partial: Partial<LogSessionOptions> = {}): LogSessionOptions {
  return {
    container: "core-dashboard-api-1",
    batchSize: 10,
    maxQueue: 20,
    highWater: 10,
    lowWater: 2,
    ackTimeoutMs: 1_000,
    ...partial,
  };
}

function fakeSource(): LogSource & { paused: number; resumed: number; destroyed: number } {
  return {
    paused: 0,
    resumed: 0,
    destroyed: 0,
    pause() {
      this.paused += 1;
    },
    resume() {
      this.resumed += 1;
    },
    destroy() {
      this.destroyed += 1;
    },
  };
}

describe("LogSession (backpressure)", () => {
  it("flow control por ack: un solo batch en vuelo", async () => {
    const sent: LogsBatch[] = [];
    let releaseAck: (() => void) | null = null;
    const session = new LogSession(
      options(),
      (batch) =>
        new Promise((resolve) => {
          sent.push(batch);
          releaseAck = resolve;
        }),
      () => {},
    );

    // El primer push dispara el envío inmediato (batch de 1); el resto se
    // encola detrás del batch en vuelo.
    for (let i = 0; i < 15; i++) session.push(line(i));
    await Promise.resolve();

    // Sin ack del primero, el segundo no sale por más que haya cola.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.lines).toHaveLength(1);

    releaseAck!();
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(2);
    expect(sent[1]?.lines).toHaveLength(10);

    releaseAck!();
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(3);
    expect(sent[2]?.lines).toHaveLength(4);
  });

  it("cola llena ⇒ descarta lo más viejo e informa dropped en el próximo batch", async () => {
    const sent: LogsBatch[] = [];
    let release: (() => void) | null = null;
    const session = new LogSession(
      options({ maxQueue: 5, highWater: 100 }),
      (batch) =>
        new Promise((resolve) => {
          sent.push(batch);
          release = resolve;
        }),
      () => {},
    );

    // El primer push dispara el primer batch (1 línea) y queda esperando ack;
    // mientras tanto llenamos la cola muy por encima del tope.
    for (let i = 0; i < 30; i++) session.push(line(i));
    await Promise.resolve();
    expect(sent).toHaveLength(1);

    release!();
    await new Promise((r) => setImmediate(r));

    const second = sent[1]!;
    expect(second.dropped).toBeGreaterThan(0);
    expect(second.lines.length).toBeLessThanOrEqual(5);
    // Lo más viejo se descartó: la cola conserva el final del stream.
    expect(second.lines.at(-1)?.text).toBe("línea 29");
  });

  it("watermarks: pausa la fuente con cola alta y la reanuda al drenar", async () => {
    const source = fakeSource();
    let release: (() => void) | null = null;
    const session = new LogSession(
      options({ batchSize: 20, maxQueue: 100, highWater: 10, lowWater: 5 }),
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      () => {},
    );
    session.attachSource(source);

    for (let i = 0; i < 12; i++) session.push(line(i));
    expect(source.paused).toBe(1);

    // Ack del batch en vuelo ⇒ el flush drena la cola y reanuda la fuente.
    release!();
    await new Promise((r) => setImmediate(r));
    expect(source.resumed).toBe(1);
  });

  it("ack vencido ⇒ la sesión se corta y destruye la fuente", async () => {
    const source = fakeSource();
    let closed = false;
    const session = new LogSession(
      options(),
      () => Promise.reject(new Error("ack timeout")),
      () => {
        closed = true;
      },
    );
    session.attachSource(source);

    session.push(line(1));
    await new Promise((r) => setImmediate(r));

    expect(closed).toBe(true);
    expect(session.isClosed).toBe(true);
    expect(source.destroyed).toBe(1);
  });

  it("end() drena la cola pendiente antes de cerrar (no descarta el tail sin avisar)", async () => {
    const sent: LogsBatch[] = [];
    let closed = false;
    const session = new LogSession(
      options({ batchSize: 3 }),
      async (batch) => {
        sent.push(batch);
      },
      () => {
        closed = true;
      },
    );

    for (let i = 0; i < 7; i++) session.push(line(i));
    session.end(); // la fuente terminó, pero todavía hay 7 líneas en cola
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(sent.flatMap((b) => b.lines)).toHaveLength(7);
    expect(closed).toBe(true);
    expect(session.isClosed).toBe(true);
  });

  it("end() con la cola ya vacía cierra de inmediato", async () => {
    let closed = false;
    const session = new LogSession(
      options(),
      async () => {},
      () => {
        closed = true;
      },
    );

    session.end();

    expect(closed).toBe(true);
  });

  it("end() es un no-op si ya estaba cerrada", async () => {
    const session = new LogSession(
      options(),
      async () => {},
      () => {},
    );
    session.close();
    expect(() => session.end()).not.toThrow();
    expect(session.isClosed).toBe(true);
  });

  it("close() es idempotente y no emite nada más", async () => {
    const sent: LogsBatch[] = [];
    const session = new LogSession(
      options(),
      async (batch) => {
        sent.push(batch);
      },
      () => {},
    );
    session.close();
    session.close();
    session.push(line(1));
    await new Promise((r) => setImmediate(r));

    expect(sent).toEqual([]);
  });
});
