import type { LogLine, LogsBatch } from "@core-dashboard/shared";

import { appendBatch, EMPTY_LOGS_BUFFER } from "./logs-buffer";

function lines(from: number, count: number): LogLine[] {
  return Array.from({ length: count }, (_, i) => ({
    ts: new Date().toISOString(),
    source: "stdout" as const,
    text: `línea ${from + i}`,
  }));
}

function batch(partial: Partial<LogsBatch>): LogsBatch {
  return { container: "api-1", lines: [], dropped: 0, ...partial };
}

describe("appendBatch (ring buffer del terminal)", () => {
  it("acumula líneas y el dropped que informa el server", () => {
    const first = appendBatch(EMPTY_LOGS_BUFFER, batch({ lines: lines(0, 3) }), 10);
    const second = appendBatch(first, batch({ lines: lines(3, 2), dropped: 7 }), 10);

    expect(second.lines.map((l) => l.text)).toEqual([
      "línea 0",
      "línea 1",
      "línea 2",
      "línea 3",
      "línea 4",
    ]);
    expect(second.dropped).toBe(7);
  });

  it("nunca supera el máximo: recorta lo más viejo y lo cuenta como descartado", () => {
    const full = appendBatch(EMPTY_LOGS_BUFFER, batch({ lines: lines(0, 8) }), 10);
    const overflowed = appendBatch(full, batch({ lines: lines(8, 5) }), 10);

    expect(overflowed.lines).toHaveLength(10);
    expect(overflowed.lines[0]?.text).toBe("línea 3");
    expect(overflowed.lines.at(-1)?.text).toBe("línea 12");
    expect(overflowed.dropped).toBe(3);
  });
});
