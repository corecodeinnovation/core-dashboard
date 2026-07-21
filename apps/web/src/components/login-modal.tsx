"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { AuthApiError, isTwoFactorChallenge } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/auth-provider";

type Step = "credentials" | "twoFactor";

export function LoginModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("loginModal");
  const { login, verifyTwoFactor } = useAuth();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmitCredentials = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (isTwoFactorChallenge(result)) {
        setChallengeToken(result.challengeToken);
        setStep("twoFactor");
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : t("loginError"));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitTwoFactor = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyTwoFactor(challengeToken, code);
      onClose();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : t("codeError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cci-ink/70 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-cci border border-cci-line bg-cci-surface p-6 shadow-cci"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{t("title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-cci px-2 py-1 font-mono text-xs text-cci-muted hover:bg-cci-surface-2 hover:text-cci-text"
          >
            {t("close")}
          </button>
        </div>

        {step === "credentials" ? (
          <form onSubmit={onSubmitCredentials} className="flex flex-col gap-3">
            <Field label={t("emailLabel")}>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-cci border border-cci-line bg-cci-ink px-3 py-2 text-sm text-cci-text outline-none focus:border-cci-orange"
              />
            </Field>
            <Field label={t("passwordLabel")}>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-cci border border-cci-line bg-cci-ink px-3 py-2 text-sm text-cci-text outline-none focus:border-cci-orange"
              />
            </Field>
            {error && <p className="font-mono text-xs text-cci-danger">{error}</p>}
            <SubmitButton submitting={submitting}>{t("submit")}</SubmitButton>
          </form>
        ) : (
          <form onSubmit={onSubmitTwoFactor} className="flex flex-col gap-3">
            <p className="font-mono text-xs text-cci-muted">{t("twoFactorHint")}</p>
            <Field label={t("codeLabel")}>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-cci border border-cci-line bg-cci-ink px-3 py-2 text-center font-mono text-lg tracking-[0.5em] text-cci-text outline-none focus:border-cci-orange"
              />
            </Field>
            {error && <p className="font-mono text-xs text-cci-danger">{error}</p>}
            <SubmitButton submitting={submitting}>{t("verify")}</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] text-cci-muted">{label}</span>
      {children}
    </label>
  );
}

function SubmitButton({
  submitting,
  children,
}: {
  submitting: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("loginModal");
  return (
    <button
      type="submit"
      disabled={submitting}
      className="mt-1 rounded-cci bg-cci-orange px-3 py-2 font-mono text-sm font-semibold text-cci-ink transition-colors hover:bg-cci-orange-600 disabled:opacity-50"
    >
      {submitting ? t("submitting") : children}
    </button>
  );
}
