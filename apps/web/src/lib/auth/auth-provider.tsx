"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ANONYMOUS, type AuthUser } from "@core-dashboard/shared";

import * as authApi from "./api";
import { isTwoFactorChallenge, type LoginResponse } from "./api";
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from "./token-storage";

// El access token dura 15 min en cci-auth-service; se renueva antes de que
// venza para que una sesión abierta no se corte a mitad de uso.
const REFRESH_INTERVAL_MS = 12 * 60_000;

interface AuthContextValue {
  user: AuthUser;
  accessToken: string | null;
  ready: boolean; // false mientras se intenta restaurar la sesión al cargar
  login: (email: string, password: string) => Promise<LoginResponse>;
  verifyTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: ANONYMOUS,
  accessToken: null,
  ready: true,
  login: () => Promise.reject(new Error("AuthProvider no montado")),
  verifyTwoFactor: () => Promise.reject(new Error("AuthProvider no montado")),
  logout: () => Promise.resolve(),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(ANONYMOUS);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const refreshTokenRef = useRef<string | null>(null);

  const applySession = useCallback(async (pair: authApi.TokenPair): Promise<void> => {
    refreshTokenRef.current = pair.refreshToken;
    saveRefreshToken(pair.refreshToken);
    setAccessToken(pair.accessToken);
    setUser(await authApi.fetchMe(pair.accessToken));
  }, []);

  const clearSession = useCallback((): void => {
    refreshTokenRef.current = null;
    clearRefreshToken();
    setAccessToken(null);
    setUser(ANONYMOUS);
  }, []);

  // Al montar: si hay refresh token guardado, intenta restaurar la sesión
  // sin pedir credenciales de nuevo.
  useEffect(() => {
    const stored = loadRefreshToken();
    if (!stored) {
      setReady(true);
      return;
    }
    authApi
      .refresh(stored)
      .then(applySession)
      .catch(() => clearSession())
      .finally(() => setReady(true));
  }, [applySession, clearSession]);

  // Renovación proactiva: evita que la sesión expire en silencio a mitad de uso.
  useEffect(() => {
    if (!accessToken) return;
    const timer = setInterval(() => {
      const current = refreshTokenRef.current;
      if (!current) return;
      authApi
        .refresh(current)
        .then(applySession)
        .catch(() => clearSession());
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accessToken, applySession, clearSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResponse> => {
      const result = await authApi.login(email, password);
      if (!isTwoFactorChallenge(result)) await applySession(result);
      return result;
    },
    [applySession],
  );

  const verifyTwoFactor = useCallback(
    async (challengeToken: string, code: string): Promise<void> => {
      const pair = await authApi.verifyTwoFactor(challengeToken, code);
      await applySession(pair);
    },
    [applySession],
  );

  const logout = useCallback(async (): Promise<void> => {
    const current = refreshTokenRef.current;
    clearSession();
    if (current) await authApi.logout(current);
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, accessToken, ready, login, verifyTwoFactor, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
