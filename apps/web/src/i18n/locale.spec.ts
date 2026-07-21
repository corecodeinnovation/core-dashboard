import { DEFAULT_LOCALE, isLocale, resolveLocale } from "./locale";

describe("isLocale", () => {
  it.each(["es", "en"])("%s es un locale válido", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  it.each([undefined, "", "fr", "ES", "es-AR"])("%p no es un locale válido", (value) => {
    expect(isLocale(value)).toBe(false);
  });
});

describe("resolveLocale", () => {
  it("locale válido ⇒ se conserva", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("es")).toBe("es");
  });

  it.each([undefined, "", "fr", "pt-BR"])("valor inválido (%p) ⇒ default", (value) => {
    expect(resolveLocale(value)).toBe(DEFAULT_LOCALE);
  });
});
