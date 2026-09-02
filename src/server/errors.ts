export function statusError(status: number, message: string) {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

export function errorStatus(err: unknown) {
  return (err as { status?: number }).status;
}

export function jsonError(err: unknown) {
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : "Error";
  const safe = status >= 500 && process.env.NODE_ENV === "production" ? "Server error" : message;
  return { status, body: { error: safe } };
}
