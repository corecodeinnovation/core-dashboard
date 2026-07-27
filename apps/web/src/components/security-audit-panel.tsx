"use client";

import { useState } from "react";

import { hasRole } from "@core-dashboard/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useAuth } from "@/lib/auth/auth-provider";
import {
  fetchSecurityAudit,
  SECURITY_AUDIT_ACTIONS,
  SecurityAuditApiError,
  type SecurityAuditAction,
} from "@/lib/security-audit/api";

const PAGE_SIZE = 20;

// RF-13: log de seguridad de cci-auth-service (login, 2FA, tokens…). Admin-only,
// mismo mecanismo de roles que RestartButton (hasRole sobre @core-dashboard/shared).
export function SecurityAuditPanel() {
  const t = useTranslations("securityAudit");
  const { user, accessToken } = useAuth();
  const [action, setAction] = useState<SecurityAuditAction | "">("");
  const [userId, setUserId] = useState("");
  const [skip, setSkip] = useState(0);

  const enabled = hasRole(user, "admin") && accessToken !== null;

  const query = useQuery({
    queryKey: ["security-audit", action, userId, skip],
    queryFn: () =>
      fetchSecurityAudit(
        {
          action: action || undefined,
          userId: userId.trim() || undefined,
          skip,
          take: PAGE_SIZE,
        },
        accessToken!,
      ),
    enabled,
  });

  if (!hasRole(user, "admin")) return null;

  const total = query.data?.total ?? 0;
  const events = query.data?.events ?? [];

  return (
    <section className="flex flex-col overflow-hidden rounded-cci border border-cci-line bg-cci-surface shadow-cci">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cci-line px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-cci-text">{t("title")}</h2>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as SecurityAuditAction | "");
              setSkip(0);
            }}
            className="rounded-cci border border-cci-line bg-cci-surface-2 px-2 py-1 text-cci-text"
          >
            <option value="">{t("allActions")}</option>
            {SECURITY_AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setSkip(0);
            }}
            placeholder={t("userIdPlaceholder")}
            className="w-32 rounded-cci border border-cci-line bg-cci-surface-2 px-2 py-1 text-cci-text placeholder:text-cci-muted"
          />
        </div>
      </header>

      <div className="max-h-80 overflow-y-auto px-4 py-2">
        {query.isError ? (
          <p className="font-mono text-xs text-cci-danger">
            {query.error instanceof SecurityAuditApiError ? query.error.message : t("error")}
          </p>
        ) : query.isLoading ? (
          <p className="font-mono text-xs text-cci-muted">{t("loading")}</p>
        ) : events.length === 0 ? (
          <p className="font-mono text-xs text-cci-muted">{t("empty")}</p>
        ) : (
          <ol className="flex flex-col gap-1.5 font-mono text-xs">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-cci-line py-1.5 last:border-0"
              >
                <span className="shrink-0 text-cci-slate-600">
                  {event.createdAt.slice(0, 19).replace("T", " ")}
                </span>
                <span className="shrink-0 text-cci-orange">{event.action}</span>
                {event.userId && <span className="text-cci-muted">user:{event.userId}</span>}
                {event.actorId && <span className="text-cci-muted">by:{event.actorId}</span>}
                {event.ip && <span className="text-cci-muted">{event.ip}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-cci-line px-4 py-2 font-mono text-[11px] text-cci-muted">
        <span>{t("total", { total })}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={skip === 0}
            onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
            className="rounded-cci border border-cci-line px-2 py-1 transition-colors hover:bg-cci-surface-2 hover:text-cci-text disabled:opacity-40"
          >
            {t("prev")}
          </button>
          <button
            type="button"
            disabled={skip + PAGE_SIZE >= total}
            onClick={() => setSkip((s) => s + PAGE_SIZE)}
            className="rounded-cci border border-cci-line px-2 py-1 transition-colors hover:bg-cci-surface-2 hover:text-cci-text disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      </footer>
    </section>
  );
}
