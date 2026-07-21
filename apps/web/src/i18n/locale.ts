export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "locale";

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

// Cookie inválida/ausente ⇒ default. Nunca deja pasar un valor arbitrario a
// next-intl (evita cargar un archivo de mensajes que no existe).
export function resolveLocale(raw: string | undefined): Locale {
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}
