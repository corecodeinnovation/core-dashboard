import { ANONYMOUS, type AuthUser } from "@core-dashboard/shared";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

export type LoginResponse = TokenPair | TwoFactorChallenge;

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function isTwoFactorChallenge(body: LoginResponse): body is TwoFactorChallenge {
  return "twoFactorRequired" in body && body.twoFactorRequired === true;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string })?.message ?? "error de autenticación";
    throw new AuthApiError(Array.isArray(message) ? message.join(", ") : message, response.status);
  }
  return data as T;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return post<LoginResponse>("/auth/login", { email, password });
}

export function verifyTwoFactor(challengeToken: string, code: string): Promise<TokenPair> {
  return post<TokenPair>("/auth/2fa/verify", { challengeToken, code });
}

export function refresh(refreshToken: string): Promise<TokenPair> {
  return post<TokenPair>("/auth/refresh", { refreshToken });
}

export async function logout(refreshToken: string): Promise<void> {
  await post<{ message: string }>("/auth/logout", { refreshToken }).catch(() => {});
}

export async function fetchMe(accessToken: string): Promise<AuthUser> {
  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return ANONYMOUS;
  return (await response.json()) as AuthUser;
}
