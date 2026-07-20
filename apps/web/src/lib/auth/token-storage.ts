// Persistencia del refresh token (opaco, rotable) entre recargas de página.
// El access token NUNCA se persiste: vive solo en memoria (estado de React),
// reduce la superficie si algo lograra leer localStorage.
const STORAGE_KEY = "core-dashboard.refreshToken";

export function loadRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveRefreshToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // localStorage no disponible (modo privado, cuota, etc.): la sesión
    // simplemente no persiste entre recargas.
  }
}

export function clearRefreshToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem
  }
}
