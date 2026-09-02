import { env } from "@/server/env";
import { statusError } from "@/server/errors";

const WSOL = "So11111111111111111111111111111111111111112";

async function readUsd(url: string, pick: (json: unknown) => number | null) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
    if (!res.ok) return null;
    return pick(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Spot SOL/USD for sizing the launch buy. Never invents a price. */
export async function solUsdPrice(): Promise<number> {
  const cg = await readUsd(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    (json) => {
      const n = (json as { solana?: { usd?: number } })?.solana?.usd;
      return typeof n === "number" && n > 0 ? n : null;
    },
  );
  if (cg) return cg;

  const jup = await readUsd(`https://api.jup.ag/price/v2?ids=${WSOL}`, (json) => {
    const n = Number((json as { data?: Record<string, { price?: string | number }> })?.data?.[WSOL]?.price);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  if (jup) return jup;

  throw statusError(503, "Could not price SOL in USD for the launch buy");
}

export async function launchBuyLamports(): Promise<bigint> {
  const usd = env.launchBuyUsd;
  if (!(usd > 0)) return BigInt(0);
  const price = await solUsdPrice();
  const sol = usd / price;
  const lamports = BigInt(Math.floor(sol * 1_000_000_000));
  if (lamports < BigInt(1_000_000)) {
    throw statusError(409, "Launch buy is below one millisol at the current SOL price");
  }
  return lamports;
}
