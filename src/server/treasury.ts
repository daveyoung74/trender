import { Keypair } from "@solana/web3.js";
import { env } from "@/server/env";
import { statusError } from "@/server/errors";

function parseSecret(raw: string): Uint8Array {
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 64) return new Uint8Array(b64);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length === 64 && parsed.every((n) => Number.isInteger(n))) {
      return Uint8Array.from(parsed);
    }
  } catch {
    /* not JSON */
  }
  throw statusError(503, "TREASURY_SECRET is not a 64-byte key");
}

export function treasuryConfigured() {
  return Boolean(env.treasurySecret);
}

export function treasuryKeypair() {
  if (!env.treasurySecret) throw statusError(503, "TREASURY_SECRET is not set");
  return Keypair.fromSecretKey(parseSecret(env.treasurySecret));
}

export function treasuryAddress() {
  return treasuryKeypair().publicKey.toBase58();
}
