import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";
import { env } from "@/server/env";
import { statusError } from "@/server/errors";
import { getAppRedis, redisKey } from "@/server/redis";

const EXTEND_CHUNK = 20;
const ALT_REDIS_KEY = () => redisKey("pump", "alt");

type GlobalAlt = typeof globalThis & { __trenderPumpAlt?: string };

function instructionAddresses(ixs: { programId: PublicKey; keys: { pubkey: PublicKey }[] }[]) {
  const map = new Map<string, PublicKey>();
  for (const ix of ixs) {
    map.set(ix.programId.toBase58(), ix.programId);
    for (const k of ix.keys) map.set(k.pubkey.toBase58(), k.pubkey);
  }
  return map;
}

async function staticCreateBuyAddresses(connection: Connection, user: PublicKey) {
  const online = new OnlinePumpSdk(connection);
  const global = await online.fetchGlobal();
  let feeConfig = null;
  try {
    feeConfig = await online.fetchFeeConfig();
  } catch {
    feeConfig = null;
  }
  const solAmount = new BN(1_000_000);
  const amount = getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: null,
    bondingCurve: null,
    amount: solAmount,
    quoteMint: NATIVE_MINT,
  });
  const sdk = new PumpSdk();
  const compute = ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 });
  async function keysFor(mint: PublicKey) {
    const ixs = await sdk.createV2AndBuyInstructions({
      global,
      mint,
      name: "X",
      symbol: "XX",
      uri: "https://example.com/m.json",
      creator: user,
      user,
      amount,
      solAmount,
      mayhemMode: false,
    });
    return instructionAddresses([compute, ...ixs]);
  }
  const a = await keysFor(Keypair.generate().publicKey);
  const b = await keysFor(Keypair.generate().publicKey);
  const skip = user.toBase58();
  return [...a.values()].filter((k) => b.has(k.toBase58()) && k.toBase58() !== skip);
}

async function loadStoredAddress() {
  const pinned = env.pumpAltAddress;
  if (pinned) return pinned;
  const g = globalThis as GlobalAlt;
  if (g.__trenderPumpAlt) return g.__trenderPumpAlt;
  if (!env.redisUrl) return null;
  return getAppRedis().get(ALT_REDIS_KEY());
}

async function storeAddress(address: string) {
  (globalThis as GlobalAlt).__trenderPumpAlt = address;
  if (!env.redisUrl) return;
  await getAppRedis().set(ALT_REDIS_KEY(), address);
}

async function sendTreasuryIxs(
  connection: Connection,
  treasury: Keypair,
  instructions: TransactionInstruction[],
) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: treasury.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(),
  );
  tx.sign([treasury]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  const confirmation = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw statusError(502, "Pump address lookup table was not confirmed");
  }
}

async function waitUntilActive(connection: Connection, lut: PublicKey) {
  for (let i = 0; i < 20; i += 1) {
    const acc = await connection.getAddressLookupTable(lut);
    const slot = await connection.getSlot("confirmed");
    const last = acc.value?.state.lastExtendedSlot ?? 0;
    if (acc.value && slot > last) return acc.value;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw statusError(503, "Pump address lookup table is not active yet");
}

async function createLookupTable(connection: Connection, treasury: Keypair, addresses: PublicKey[]) {
  const slot = await connection.getSlot("finalized");
  const [createIx, lutAddress] = AddressLookupTableProgram.createLookupTable({
    authority: treasury.publicKey,
    payer: treasury.publicKey,
    recentSlot: slot,
  });
  const first = addresses.slice(0, EXTEND_CHUNK);
  const extendIx = AddressLookupTableProgram.extendLookupTable({
    lookupTable: lutAddress,
    authority: treasury.publicKey,
    payer: treasury.publicKey,
    addresses: first,
  });
  await sendTreasuryIxs(connection, treasury, [createIx, extendIx]);
  for (let i = EXTEND_CHUNK; i < addresses.length; i += EXTEND_CHUNK) {
    const chunk = addresses.slice(i, i + EXTEND_CHUNK);
    const more = AddressLookupTableProgram.extendLookupTable({
      lookupTable: lutAddress,
      authority: treasury.publicKey,
      payer: treasury.publicKey,
      addresses: chunk,
    });
    await sendTreasuryIxs(connection, treasury, [more]);
  }
  console.info("[pump-alt] created", lutAddress.toBase58(), { keys: addresses.length });
  await storeAddress(lutAddress.toBase58());
  return waitUntilActive(connection, lutAddress);
}

async function extendIfMissing(
  connection: Connection,
  treasury: Keypair,
  account: AddressLookupTableAccount,
  needed: PublicKey[],
) {
  const have = new Set(account.state.addresses.map((k) => k.toBase58()));
  const missing = needed.filter((k) => !have.has(k.toBase58()));
  if (missing.length === 0) return account;
  for (let i = 0; i < missing.length; i += EXTEND_CHUNK) {
    const chunk = missing.slice(i, i + EXTEND_CHUNK);
    const ix = AddressLookupTableProgram.extendLookupTable({
      lookupTable: account.key,
      authority: treasury.publicKey,
      payer: treasury.publicKey,
      addresses: chunk,
    });
    await sendTreasuryIxs(connection, treasury, [ix]);
  }
  return waitUntilActive(connection, account.key);
}

export async function ensurePumpLookupTable(connection: Connection, treasury: Keypair) {
  const needed = await staticCreateBuyAddresses(connection, treasury.publicKey);
  if (needed.length === 0) {
    throw statusError(503, "Could not collect Pump lookup-table addresses");
  }
  const stored = await loadStoredAddress();
  if (stored) {
    const acc = await connection.getAddressLookupTable(new PublicKey(stored));
    if (acc.value && acc.value.isActive()) {
      const ready = await extendIfMissing(connection, treasury, acc.value, needed);
      await storeAddress(ready.key.toBase58());
      return ready;
    }
  }
  return createLookupTable(connection, treasury, needed);
}
