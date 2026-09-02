import { desc } from "drizzle-orm";
import { TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getDb } from "@/db";
import { sweepRuns, type SweepTrigger } from "@/db/schema";
import { COLLECT_GAS_FLOOR_LAMPORTS, onChainBalance, solanaConnection } from "@/server/chain";
import { env } from "@/server/env";
import { statusError } from "@/server/errors";
import { newId } from "@/server/ids";
import { millisol, millisolFromLamports } from "@/server/money";
import { buildCollectInstructions, peekCreatorVault } from "@/server/pump";
import { treasuryAddress, treasuryConfigured, treasuryKeypair } from "@/server/treasury";

function failMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message.slice(0, 280);
  return "Sweep failed";
}

async function record(input: typeof sweepRuns.$inferInsert) {
  await getDb().insert(sweepRuns).values(input);
  return input;
}

export async function listSweepRuns(limit = 12) {
  return getDb().select().from(sweepRuns).orderBy(desc(sweepRuns.createdAt)).limit(limit);
}

export async function sweepMeta() {
  if (!treasuryConfigured()) {
    return {
      treasury: { configured: false as const, address: null },
      vault: { status: "unavailable" as const, millisol: 0, lamports: null },
      fee_sweep_min_sol: env.feeSweepMinSol,
      balance: null,
    };
  }
  const address = treasuryAddress();
  const peek = await peekCreatorVault(address);
  let balance = null;
  try {
    balance = await onChainBalance(address);
  } catch {
    balance = null;
  }
  return {
    treasury: { configured: true as const, address },
    vault: {
      status: peek.status,
      millisol: peek.status === "ok" || peek.status === "empty" ? peek.millisol : 0,
      lamports: peek.status === "ok" || peek.status === "empty" ? peek.lamports : null,
    },
    fee_sweep_min_sol: env.feeSweepMinSol,
    balance,
  };
}

export async function runSweep(trigger: SweepTrigger) {
  const id = newId();
  if (!treasuryConfigured()) {
    return record({
      id,
      status: "skipped",
      trigger,
      vaultLamports: null,
      vaultMillisol: 0,
      tx: null,
      note: "TREASURY_SECRET is not set.",
    });
  }

  const treasury = treasuryKeypair();
  const address = treasury.publicKey.toBase58();
  const peek = await peekCreatorVault(address);
  const minMilli = millisol(env.feeSweepMinSol);

  if (peek.status === "missing_rpc") {
    return record({
      id,
      status: "skipped",
      trigger,
      vaultLamports: null,
      vaultMillisol: 0,
      tx: null,
      note: "SOLANA_RPC_URL is missing. Vault peek skipped.",
    });
  }
  if (peek.status === "unavailable") {
    return record({
      id,
      status: "failed",
      trigger,
      vaultLamports: null,
      vaultMillisol: 0,
      tx: null,
      note: peek.reason,
    });
  }
  if (peek.status === "sharing_config") {
    return record({
      id,
      status: "skipped",
      trigger,
      vaultLamports: null,
      vaultMillisol: 0,
      tx: null,
      note: "Creator vault reports sharing_config. Collect skipped.",
    });
  }
  if (peek.status === "empty" || peek.millisol < minMilli) {
    return record({
      id,
      status: "skipped",
      trigger,
      vaultLamports: peek.lamports,
      vaultMillisol: peek.millisol,
      tx: null,
      note: `Vault ${peek.millisol} millisol is below FEE_SWEEP_MIN_SOL (${minMilli} millisol).`,
    });
  }

  const bal = await onChainBalance(address);
  if (BigInt(bal.lamports) < COLLECT_GAS_FLOOR_LAMPORTS) {
    return record({
      id,
      status: "skipped",
      trigger,
      vaultLamports: peek.lamports,
      vaultMillisol: peek.millisol,
      tx: null,
      note: `Treasury needs ${millisolFromLamports(COLLECT_GAS_FLOOR_LAMPORTS)} millisol for collect gas.`,
    });
  }

  try {
    const ixs = (await buildCollectInstructions(address, address)) ?? [];
    if (ixs.length === 0) throw statusError(502, "Collect instruction could not be built");

    const connection = solanaConnection();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey: treasury.publicKey,
      recentBlockhash: blockhash,
      instructions: ixs,
    });
    const tx = new VersionedTransaction(message.compileToV0Message());
    tx.sign([treasury]);

    const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    if (sim.value.err) {
      const logs = (sim.value.logs ?? []).slice(-4).join(" ");
      throw statusError(409, `Collect simulation failed. ${logs || "Not sent."}`.slice(0, 280));
    }

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    const confirmation = await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    if (confirmation.value.err) {
      return record({
        id,
        status: "failed",
        trigger,
        vaultLamports: peek.lamports,
        vaultMillisol: peek.millisol,
        tx: sig,
        note: "Collect was broadcast but the network rejected it.",
      });
    }

    return record({
      id,
      status: "collected",
      trigger,
      vaultLamports: peek.lamports,
      vaultMillisol: peek.millisol,
      tx: sig,
      note: "Creator fees collected to treasury. No split.",
    });
  } catch (err) {
    return record({
      id,
      status: "failed",
      trigger,
      vaultLamports: peek.lamports,
      vaultMillisol: peek.millisol,
      tx: null,
      note: failMessage(err),
    });
  }
}
