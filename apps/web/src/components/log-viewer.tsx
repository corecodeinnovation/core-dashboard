"use client";

import { useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import { useContainerLogs } from "@/lib/live/use-container-logs";

// Anclado al fondo: si el usuario scrollea hacia arriba, se deja de seguir
// el stream; al volver cerca del fondo, se re-ancla.
const PIN_THRESHOLD_PX = 40;

export function LogViewer({ container }: { container: string }) {
  const t = useTranslations("logViewer");
  const { lines, dropped, error } = useContainerLogs(container);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (pinned && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, pinned]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-2">
        {error ? (
          <p className="font-mono text-xs text-cci-danger">{error}</p>
        ) : lines.length === 0 ? (
          <p className="font-mono text-xs text-cci-muted">{t("waiting")}</p>
        ) : (
          <ol className="font-mono text-xs leading-5">
            {lines.map((line, index) => (
              <li key={`${line.ts}-${index}`} className="flex gap-3 whitespace-pre-wrap break-all">
                <span className="shrink-0 text-cci-slate-600">{line.ts.slice(11, 19)}</span>
                <span className={line.source === "stderr" ? "text-cci-amber" : "text-cci-text"}>
                  {line.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <footer className="flex items-center justify-between border-t border-cci-line px-4 py-1.5 font-mono text-[11px] text-cci-slate">
        <span>
          {t("lineCount", { count: lines.length })}
          {!pinned && <span className="text-cci-warn"> · {t("scrollPaused")}</span>}
        </span>
        {dropped > 0 && <span className="text-cci-warn">{t("dropped", { count: dropped })}</span>}
      </footer>
    </div>
  );
}
