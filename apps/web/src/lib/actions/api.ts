export class ActionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function restartContainer(container: string, accessToken: string): Promise<void> {
  const response = await fetch(`/api/actions/containers/${encodeURIComponent(container)}/restart`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    const message = (body as { message?: string })?.message ?? `HTTP ${response.status}`;
    throw new ActionApiError(
      Array.isArray(message) ? message.join(", ") : message,
      response.status,
    );
  }
}
