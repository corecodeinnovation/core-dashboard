import { formatBytes, formatCores, formatRate, formatTick } from "./format";

describe("formatCores", () => {
  it("muestra el uso como % de un core", () => {
    expect(formatCores(0.034)).toBe("3.4%");
    expect(formatCores(0.5)).toBe("50.0%");
    expect(formatCores(1.5)).toBe("150%");
  });
});

describe("formatBytes", () => {
  it("escala a la unidad legible", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2_048)).toBe("2.0 KiB");
    expect(formatBytes(29_360_128)).toBe("28.0 MiB");
    expect(formatBytes(3_221_225_472)).toBe("3.0 GiB");
  });
});

describe("formatRate", () => {
  it("agrega /s a la unidad", () => {
    expect(formatRate(1_048_576)).toBe("1.0 MiB/s");
  });
});

describe("formatTick", () => {
  const t = new Date(2026, 6, 19, 14, 5).getTime();

  it("rangos cortos ⇒ hora:minuto", () => {
    expect(formatTick(t, 24)).toBe("14:05");
  });

  it("rangos largos ⇒ día/mes hora", () => {
    expect(formatTick(t, 168)).toBe("19/7 14h");
  });
});
