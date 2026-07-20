"use client";

import { useState } from "react";

import { LoginModal } from "@/components/login-modal";
import { useAuth } from "@/lib/auth/auth-provider";

const ROLE_LABEL: Record<string, string> = {
  viewer: "viewer",
  operator: "operator",
  admin: "admin",
};

export function UserMenu() {
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
          iniciar sesión
        </button>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-cci border border-cci-line bg-cci-surface px-3 py-1.5 font-mono text-xs">
      <span className="text-cci-text">{user.email}</span>
      <span className="rounded-cci bg-cci-surface-2 px-1.5 py-0.5 text-cci-orange">
        {ROLE_LABEL[user.role] ?? user.role}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-cci-muted transition-colors hover:text-cci-text"
      >
        salir
      </button>
    </div>
  );
}
