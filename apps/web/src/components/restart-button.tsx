"use client";

import { useState } from "react";

import { hasRole } from "@core-dashboard/shared";

import { ActionApiError, restartContainer } from "@/lib/actions/api";
import { useAuth } from "@/lib/auth/auth-provider";

type Status = "idle" | "confirm" | "pending" | "done" | "error";

const CONFIRM_TIMEOUT_MS = 3_000;

// RF-07: acción destructiva, solo operator+. Doble click (pedir → confirmar)
// en vez de un confirm() nativo — no bloquea el hilo ni se ve tosco.
export function RestartButton({ container }: { container: string }) {
  const { user, accessToken } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!hasRole(user, "operator")) return null;

  const onClick = async (): Promise<void> => {
    if (status !== "confirm") {
      setStatus("confirm");
      setTimeout(() => setStatus((s) => (s === "confirm" ? "idle" : s)), CONFIRM_TIMEOUT_MS);
      return;
    }
    if (!accessToken) return;
    setStatus("pending");
    setMessage(null);
    try {
      await restartContainer(container, accessToken);
      setStatus("done");
      setTimeout(() => setStatus("idle"), CONFIRM_TIMEOUT_MS);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof ActionApiError ? err.message : "no se pudo reiniciar");
      setTimeout(() => setStatus("idle"), CONFIRM_TIMEOUT_MS);
    }
  };

  const label = {
    idle: "reiniciar",
    confirm: "¿confirmar?",
    pending: "reiniciando…",
    done: "✓ reiniciado",
    error: "✗ error",
  }[status];
  const tone =
    status === "error"
      ? "border-cci-danger text-cci-danger"
      : status === "done"
        ? "border-cci-success text-cci-success"
        : status === "confirm"
          ? "border-cci-warn text-cci-warn"
          : "border-cci-line text-cci-muted hover:bg-cci-surface-2 hover:text-cci-text";

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={status === "pending"}
        title={message ?? undefined}
        className={`rounded-cci border px-2.5 py-1 font-mono text-[11px] transition-colors disabled:opacity-60 ${tone}`}
      >
        {label}
      </button>
    </span>
  );
}
