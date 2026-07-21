"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { LoginModal } from "@/components/login-modal";
import { useAuth } from "@/lib/auth/auth-provider";

// Los nombres de rol (viewer/operator/admin) son términos técnicos de RBAC,
// no se traducen — coherente con roleFromClaims/hasRole del paquete shared.
export function UserMenu() {
  const t = useTranslations("userMenu");
  const { user, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  if (user.sub === null) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowLogin(true)}
          className="rounded-cci border border-cci-line bg-cci-surface px-3 py-1.5 font-mono text-xs text-cci-muted transition-colors hover:bg-cci-surface-2 hover:text-cci-text"
        >
          {t("login")}
        </button>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-cci border border-cci-line bg-cci-surface px-3 py-1.5 font-mono text-xs">
      <span className="text-cci-text">{user.email}</span>
      <span className="rounded-cci bg-cci-surface-2 px-1.5 py-0.5 text-cci-orange">
        {user.role}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-cci-muted transition-colors hover:text-cci-text"
      >
        {t("logout")}
      </button>
    </div>
  );
}
