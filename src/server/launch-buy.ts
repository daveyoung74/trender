import BN from "bn.js";
import {
  ComputeBudgetProgram,
  PublicKey,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  OnlinePumpSdk,
  PumpSdk,
  getBuyTokenAmountFromSolAmount,
} from "@pump-fun/pump-sdk";
import { millisolFromLamports } from "@/server/money";
import { statusError } from "@/server/errors";
import { PUMP_PROGRAM } from "@/server/pump";

const BUY_GAS_LAMPORTS = BigInt(8_000_000);

export function launchBuyReserveLamports(buyLamports: bigint) {
  if (buyLamports <= BigInt(0)) return BigInt(0);
  const slip = buyLamports / BigInt(100);
  return buyLamports + slip + BUY_GAS_LAMPORTS;
}

export async function buildCreateAndBuyInstructions(opts: {
  connection: Connection;
  mint: PublicKey;
  user: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  buyLamports: bigint;
}): Promise<{ instructions: TransactionInstruction[]; millisol: number }> {
  const sdk = new PumpSdk();
  const compute = ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 });

  if (opts.buyLamports <= BigInt(0)) {
    const createIx = await sdk.createV2Instruction({
      mint: opts.mint,
      name: opts.name,
      symbol: opts.symbol,
      uri: opts.uri,
      creator: opts.creator,
      user: opts.user,
      mayhemMode: false,
    });
    if (createIx.programId.toBase58() !== PUMP_PROGRAM) {
      throw statusError(409, "Built create_v2 is not the Pump program. Not sent.");
    }
    return { instructions: [compute, createIx], millisol: 0 };
  }

  const online = new OnlinePumpSdk(opts.connection);
  const global = await online.fetchGlobal();
  let feeConfig = null;
  try {
    feeConfig = await online.fetchFeeConfig();
  } catch {
    feeConfig = null;
  }
  const solAmount = new BN(opts.buyLamports.toString());
  const amount = getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: null,
    bondingCurve: null,
    amount: solAmount,
    quoteMint: NATIVE_MINT,
  });
  if (amount.isZero() || amount.isNeg()) {
    throw statusError(409, "Opening-buy quote returned no tokens. Not sent.");
  }

  const ixs = await sdk.createV2AndBuyInstructions({
    global,
    mint: opts.mint,
    name: opts.name,
    symbol: opts.symbol,
    uri: opts.uri,
    creator: opts.creator,
    user: opts.user,
    amount,
    solAmount,
    mayhemMode: false,
  });
  if (!ixs[0] || ixs[0].programId.toBase58() !== PUMP_PROGRAM) {
    throw statusError(409, "Built create_v2 is not the Pump program. Not sent.");
  }
  const buyIx = ixs.find((ix, i) => i > 0 && ix.programId.toBase58() === PUMP_PROGRAM);
  if (!buyIx) {
    throw statusError(409, "Built opening buy is not the Pump program. Not sent.");
  }

  return {
    instructions: [compute, ...ixs],
    millisol: millisolFromLamports(opts.buyLamports),
  };
}
