"use client";

import { useTransition } from "react";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

import { setLocale } from "@/i18n/actions";
import { LOCALES, type Locale } from "@/i18n/locale";

// Sin prefijo de ruta: el idioma vive en una cookie (server action) y
// router.refresh() vuelve a renderizar el layout con los mensajes nuevos.
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onSelect = (next: Locale): void => {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <div className="flex gap-1" role="group" aria-label="Idioma / Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          onClick={() => onSelect(l)}
          aria-pressed={l === locale}
          className={`rounded-cci px-2 py-1 font-mono text-[11px] transition-colors disabled:opacity-60 ${
            l === locale
              ? "bg-cci-surface-2 text-cci-text"
              : "text-cci-muted hover:bg-cci-surface-2 hover:text-cci-text"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
