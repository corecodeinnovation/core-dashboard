"use server";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, type Locale } from "./locale";

const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

export async function setLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, { maxAge: ONE_YEAR_SEC, sameSite: "lax" });
}
