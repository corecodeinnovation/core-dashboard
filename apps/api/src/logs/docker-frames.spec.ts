import type { LogLine } from "@core-dashboard/shared";

import { DockerFrameParser, LogLineSplitter, parseDockerLine } from "./docker-frames";

function frame(type: 1 | 2, payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

describe("DockerFrameParser", () => {
  it("separa stdout y stderr y soporta varios frames por chunk", () => {
    const received: Array<[string, string]> = [];
    const parser = new DockerFrameParser((source, payload) =>
      received.push([source, payload.toString()]),
    );

    parser.push(Buffer.concat([frame(1, "hola\n"), frame(2, "error!\n")]));

    expect(received).toEqual([
      ["stdout", "hola\n"],
      ["stderr", "error!\n"],
    ]);
  });

  it("tolera un frame partido en varios chunks", () => {
    const received: string[] = [];
    const parser = new DockerFrameParser((_source, payload) => received.push(payload.toString()));
    const whole = frame(1, "linea completa\n");

    parser.push(whole.subarray(0, 5));
    expect(received).toEqual([]);
    parser.push(whole.subarray(5, 10));
    expect(received).toEqual([]);
    parser.push(whole.subarray(10));

    expect(received).toEqual(["linea completa\n"]);
  });
});

describe("LogLineSplitter", () => {
  it("emite solo líneas completas y junta fragmentos por fuente", () => {
    const lines: LogLine[] = [];
    const splitter = new LogLineSplitter((line) => lines.push(line));

    splitter.push("stdout", Buffer.from("2026-07-19T12:00:00.000000000Z par"));
    expect(lines).toEqual([]);
    splitter.push("stdout", Buffer.from("cial\n2026-07-19T12:00:01.000000000Z entera\n"));

    expect(lines.map((l) => l.text)).toEqual(["parcial", "entera"]);
    expect(lines[0]?.ts).toBe("2026-07-19T12:00:00.000000000Z");
  });

  it("descarta el \\r final y las líneas vacías", () => {
    const lines: LogLine[] = [];
    const splitter = new LogLineSplitter((line) => lines.push(line));

    splitter.push("stderr", Buffer.from("2026-07-19T12:00:00.000000000Z con retorno\r\n\n"));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ source: "stderr", text: "con retorno" });
  });
});

describe("parseDockerLine", () => {
  it("separa el timestamp RFC3339Nano del texto", () => {
    const line = parseDockerLine("stdout", "2026-07-19T12:00:00.123456789Z GET /health 200");
    expect(line).toEqual({
      ts: "2026-07-19T12:00:00.123456789Z",
      source: "stdout",
      text: "GET /health 200",
    });
  });

  it("línea sin timestamp válido ⇒ usa la hora actual y conserva el texto", () => {
    const line = parseDockerLine("stdout", "sin timestamp");
    expect(line.text).toBe("sin timestamp");
    expect(Number.isNaN(Date.parse(line.ts))).toBe(false);
  });
});
