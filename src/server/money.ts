/** 1 SOL = 1000 millisol. */
export function millisol(sol: number) {
  return Math.round(sol * 1000);
}

/** 1 millisol = 1_000_000 lamports. Dust below 1 millisol stays on-chain. Never rounds up. */
export function millisolFromLamports(lamports: string | bigint | number) {
  const n = BigInt(lamports);
  const million = BigInt(1_000_000);
  if (n < million) return 0;
  const milli = n / million;
  if (milli > BigInt(2_000_000_000)) return 2_000_000_000;
  return Number(milli);
}

export function solFromMilli(n: number) {
  return n / 1000;
}

export function formatSol(amountMillisol: number) {
  return `${solFromMilli(amountMillisol).toFixed(3)} SOL`;
}
