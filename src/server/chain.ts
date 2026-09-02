import { Connection, PublicKey } from "@solana/web3.js";
import { env } from "@/server/env";
import { statusError } from "@/server/errors";
import { millisolFromLamports } from "@/server/money";

/** Pump create_v2 needs rent for mint, curve, and ATAs. */
export const CREATE_V2_FLOOR_LAMPORTS = BigInt(30_000_000);

/** Collect gas only. Treasury pays its own collect. */
export const COLLECT_GAS_FLOOR_LAMPORTS = BigInt(5_000_000);

export function solanaConnection() {
  if (!env.solanaRpcUrl) throw statusError(503, "SOLANA_RPC_URL is not set");
  return new Connection(env.solanaRpcUrl, "confirmed");
}

function withRpcTimeout<T>(work: Promise<T>, ms: number) {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("rpc_timeout")), ms);
    }),
  ]);
}

export async function onChainBalance(address: string) {
  const connection = solanaConnection();
  const pk = new PublicKey(address);
  const lamports = await withRpcTimeout(connection.getBalance(pk).then((n) => BigInt(n)), 4000);
  return {
    lamports: lamports.toString(),
    millisol: millisolFromLamports(lamports),
  };
}
