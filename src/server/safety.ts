const BLOCK =
  /(csam|child\s*porn|childporn|child\s*sexual|sexual\s*(content\s*)?(involving\s*)?(a\s*)?(minor|child)|preteen|lolita)/i;

export type SafetyResult = { ok: true } | { ok: false; reason: string };

export function assertSafeText(parts: Array<string | null | undefined>): SafetyResult {
  for (const part of parts) {
    if (!part?.trim()) continue;
    if (BLOCK.test(part)) {
      return { ok: false, reason: "Rejected: sexual content involving minors is not allowed" };
    }
  }
  return { ok: true };
}

export function requireSafeText(parts: Array<string | null | undefined>) {
  const r = assertSafeText(parts);
  if (!r.ok) {
    const err = new Error(r.reason);
    (err as Error & { status: number }).status = 400;
    throw err;
  }
}
