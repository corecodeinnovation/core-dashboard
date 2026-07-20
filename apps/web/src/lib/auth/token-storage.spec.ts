import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from "./token-storage";

// El entorno de test de este workspace es Node puro (sin jsdom): se define
// un `window.localStorage` mínimo global para ejercitar el módulo real. Los
// checks de `typeof window` viven DENTRO de cada función (se evalúan en cada
// llamada), así que alcanza con mutar el global entre tests.
function fakeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe("token-storage", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it("sin window (SSR) ⇒ load devuelve null y save/clear no explotan", () => {
    delete (globalThis as { window?: unknown }).window;

    expect(loadRefreshToken()).toBeNull();
    expect(() => saveRefreshToken("t1")).not.toThrow();
    expect(() => clearRefreshToken()).not.toThrow();
  });

  it("guarda, lee y borra el refresh token en localStorage", () => {
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage() };

    expect(loadRefreshToken()).toBeNull();
    saveRefreshToken("r-abc");
    expect(loadRefreshToken()).toBe("r-abc");
    clearRefreshToken();
    expect(loadRefreshToken()).toBeNull();
  });

  it("localStorage que lanza (modo privado/cuota) no rompe la app", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      },
    };

    expect(loadRefreshToken()).toBeNull();
    expect(() => saveRefreshToken("t1")).not.toThrow();
    expect(() => clearRefreshToken()).not.toThrow();
  });
});
