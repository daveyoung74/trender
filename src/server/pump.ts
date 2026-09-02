import { PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk, PumpSdk } from "@pump-fun/pump-sdk";
import { env } from "@/server/env";
import { millisolFromLamports } from "@/server/money";

export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

export async function buildCreateV2Instruction(opts: {
  mint: PublicKey;
  creator: PublicKey;
  user: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}) {
  const sdk = new PumpSdk();
  return sdk.createV2Instruction({
    mint: opts.mint,
    name: opts.name,
    symbol: opts.symbol,
    uri: opts.uri,
    creator: opts.creator,
    user: opts.user,
    mayhemMode: false,
  });
}

export type CollectPeek =
  | { status: "missing_rpc" }
  | { status: "sharing_config" }
  | { status: "empty"; millisol: 0; lamports: string }
  | { status: "ok"; millisol: number; lamports: string; sharing_config: false }
  | { status: "unavailable"; reason: string };

export async function peekCreatorVault(creatorPublicKey: string): Promise<CollectPeek> {
  if (!env.solanaRpcUrl) return { status: "missing_rpc" };
  try {
    const { Connection } = await import("@solana/web3.js");
    const online = new OnlinePumpSdk(new Connection(env.solanaRpcUrl, "confirmed"));
    const bal = await online.getCreatorVaultBalanceBothPrograms(new PublicKey(creatorPublicKey));
    const lamports = bal.toString();
    const milli = millisolFromLamports(lamports);
    if (milli < 1) return { status: "empty", millisol: 0, lamports };
    return { status: "ok", millisol: milli, lamports, sharing_config: false };
  } catch {
    return { status: "unavailable", reason: "Pump vault peek failed" };
  }
}

export async function buildCollectInstructions(creatorPublicKey: string, feePayer?: string) {
  if (!env.solanaRpcUrl) return null;
  const { Connection } = await import("@solana/web3.js");
  const online = new OnlinePumpSdk(new Connection(env.solanaRpcUrl, "confirmed"));
  return online.collectCoinCreatorFeeInstructions(
    new PublicKey(creatorPublicKey),
    feePayer ? new PublicKey(feePayer) : undefined,
  );
}
