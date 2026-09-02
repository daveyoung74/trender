import BN from "bn.js";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type Keypair,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  OnlinePumpSdk,
  PumpSdk,
  getBuyTokenAmountFromSolAmount,
} from "@pump-fun/pump-sdk";
import { millisolFromLamports } from "@/server/money";
import { statusError } from "@/server/errors";

const BUY_GAS_LAMPORTS = BigInt(5_000_000);
const SLIPPAGE_PERCENT = 2;

function tokenProgramOf(owner: PublicKey) {
  if (owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw statusError(409, "Mint is not a Token or Token-2022 mint. Launch buy not sent.");
}

export function launchBuyReserveLamports(buyLamports: bigint) {
  if (buyLamports <= BigInt(0)) return BigInt(0);
  return buyLamports + BUY_GAS_LAMPORTS;
}

export async function sendLaunchBuy(opts: {
  connection: Connection;
  treasury: Keypair;
  mint: PublicKey;
  budgetLamports: bigint;
}): Promise<{ tx: string; millisol: number }> {
  if (opts.budgetLamports <= BigInt(0)) {
    throw statusError(409, "Launch buy budget is empty");
  }
  const mintInfo = await opts.connection.getAccountInfo(opts.mint);
  if (!mintInfo) throw statusError(409, "Mint is not on-chain. Launch buy not sent.");
  const tokenProgram = tokenProgramOf(mintInfo.owner);
  const user = opts.treasury.publicKey;
  const solIn = new BN(opts.budgetLamports.toString());

  const online = new OnlinePumpSdk(opts.connection);
  const global = await online.fetchGlobal();
  let feeConfig = null;
  try {
    feeConfig = await online.fetchFeeConfig();
  } catch {
    feeConfig = null;
  }
  const { bondingCurveAccountInfo, bondingCurve, associatedUserAccountInfo } = await online.fetchBuyState(
    opts.mint,
    user,
    tokenProgram,
  );
  if (bondingCurve.complete) {
    throw statusError(409, "Curve is complete. Opening buy stays on the Pump curve.");
  }
  const tokenAmount = getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: bondingCurve.tokenTotalSupply,
    bondingCurve,
    amount: solIn,
    quoteMint: bondingCurve.quoteMint,
  });
  if (tokenAmount.isZero() || tokenAmount.isNeg()) {
    throw statusError(409, "Curve quote returned no tokens. Launch buy not sent.");
  }

  const sdk = new PumpSdk();
  const buyIxs = await sdk.buyInstructions({
    global,
    bondingCurveAccountInfo,
    bondingCurve,
    associatedUserAccountInfo,
    mint: opts.mint,
    user,
    amount: tokenAmount,
    solAmount: solIn,
    slippage: SLIPPAGE_PERCENT,
    tokenProgram,
  });
  const compute = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
  const { blockhash, lastValidBlockHeight } = await opts.connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: user,
    recentBlockhash: blockhash,
    instructions: [compute, ...buyIxs],
  });
  const tx = new VersionedTransaction(message.compileToV0Message());
  tx.sign([opts.treasury]);

  const sim = await opts.connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).slice(-4).join(" ");
    throw statusError(409, `Launch buy simulation failed. ${logs || "Not sent."}`.slice(0, 280));
  }

  const sig = await opts.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const confirmation = await opts.connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw statusError(502, "Launch buy was broadcast but not confirmed");
  }

  return { tx: sig, millisol: millisolFromLamports(opts.budgetLamports) };
}
