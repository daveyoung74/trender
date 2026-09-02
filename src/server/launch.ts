import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { Keypair, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { z } from "zod";
import { getDb } from "@/db";
import { launches } from "@/db/schema";
import type { LaunchRow } from "@/server/views";
import { publicLaunchView } from "@/server/views";
import { CREATE_V2_FLOOR_LAMPORTS, onChainBalance, solanaConnection } from "@/server/chain";
import { statusError } from "@/server/errors";
import { newId } from "@/server/ids";
import { resolveLaunchImage } from "@/server/image";
import { sealSecret, unsealSecret } from "@/server/keys";
import { formatSol, millisolFromLamports } from "@/server/money";
import { buildCreateV2Instruction, PUMP_PROGRAM } from "@/server/pump";
import { requireSafeText } from "@/server/safety";
import { spacesReady } from "@/server/storage";
import {
  assertPumpMetadataUri,
  defaultCoinWebsite,
  isPublicHttpsUrl,
  normalizeDescription,
  normalizeName,
  normalizeTicker,
  normalizeTwitter,
  normalizeWebsite,
  publishTokenMetadata,
} from "@/server/token-metadata";
import { treasuryKeypair } from "@/server/treasury";
import { hydrateTweet } from "@/server/x";
import { inventCoin } from "@/server/xai";

export { publicLaunchView };

const ACTIVE_TICKER = ["queued", "inventing", "publishing", "sending", "live"] as const;

function withHttps(value: string) {
  const t = value.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export const launchSeedSchema = z
  .object({
    prompt: z.string().max(2000).optional().nullable(),
    tweet_url: z.string().max(512).optional().nullable().transform((v) => (v ? withHttps(v) : v)),
    tweet_text: z.string().max(4000).optional().nullable(),
    author_handle: z.string().max(32).optional().nullable(),
    author_avatar_url: z
      .string()
      .max(1024)
      .optional()
      .nullable()
      .transform((v) => (v ? withHttps(v) : v)),
    media_urls: z.array(z.string().max(1024).transform(withHttps)).max(8).optional(),
    idempotency_key: z.string().min(1).max(128).optional().nullable(),
    dry_run: z.boolean().optional().default(false),
    wait: z.boolean().optional().default(true),
    name: z.string().min(2).max(32).optional().nullable(),
    ticker: z
      .string()
      .regex(/^[A-Z0-9]{2,10}$/i, "Ticker is 2–10 A–Z / 0–9")
      .optional()
      .nullable(),
    description: z.string().min(1).max(280).optional().nullable(),
    image_hint: z.enum(["ai", "pfp", "post", "auto"]).optional().nullable(),
  })
  .refine((v) => Boolean(v.prompt?.trim() || v.tweet_url?.trim()), {
    message: "prompt or tweet_url is required",
  });

export type LaunchSeed = z.infer<typeof launchSeedSchema>;

function failMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message.slice(0, 280);
  return "Launch failed";
}

async function load(id: string) {
  return (await getDb().select().from(launches).where(eq(launches.id, id)).limit(1))[0] ?? null;
}

export async function launchByIdempotency(key: string) {
  return (
    (await getDb().select().from(launches).where(eq(launches.idempotencyKey, key)).limit(1))[0] ?? null
  );
}

export async function getLaunch(id: string) {
  const row = await load(id);
  if (!row) throw statusError(404, "Launch not found");
  return row;
}

export async function listLiveLaunches(limit = 40) {
  return getDb()
    .select()
    .from(launches)
    .where(eq(launches.status, "live"))
    .orderBy(desc(launches.createdAt))
    .limit(limit);
}

export async function listBoardLaunches(limit = 48) {
  return getDb()
    .select()
    .from(launches)
    .where(inArray(launches.status, ["live", "ready"]))
    .orderBy(desc(launches.createdAt))
    .limit(limit);
}

export async function launchByTicker(ticker: string) {
  const rows = await getDb()
    .select()
    .from(launches)
    .where(eq(launches.ticker, ticker.toUpperCase()))
    .orderBy(desc(launches.createdAt));
  return (
    rows.find((r) => r.status === "live") ?? rows.find((r) => r.status === "ready") ?? rows[0] ?? null
  );
}

async function tickerTaken(ticker: string, exceptId: string) {
  const rows = await getDb()
    .select({ id: launches.id, ticker: launches.ticker, status: launches.status })
    .from(launches)
    .where(and(eq(launches.ticker, ticker), ne(launches.id, exceptId), inArray(launches.status, [...ACTIVE_TICKER])));
  return rows.length > 0;
}

async function takenTickers() {
  const rows = await getDb()
    .select({ ticker: launches.ticker })
    .from(launches)
    .where(inArray(launches.status, [...ACTIVE_TICKER]));
  return rows.map((r) => r.ticker).filter((t): t is string => Boolean(t));
}

async function patch(id: string, values: Partial<typeof launches.$inferInsert>) {
  await getDb().update(launches).set(values).where(eq(launches.id, id));
  return (await load(id))!;
}

export async function createLaunchRow(input: LaunchSeed, idempotencyKey: string | null) {
  requireSafeText([
    input.prompt,
    input.tweet_text,
    input.name,
    input.ticker,
    input.description,
  ]);
  const id = newId();
  const ticker = input.ticker ? normalizeTicker(input.ticker) : null;
  if (ticker && (await tickerTaken(ticker, id))) {
    throw statusError(409, `Ticker $${ticker} is already in use`);
  }
  try {
    await getDb().insert(launches).values({
      id,
      status: "queued",
      prompt: input.prompt?.trim() || null,
      tweetUrl: input.tweet_url?.trim() || null,
      tweetText: input.tweet_text?.trim() || null,
      authorHandle: input.author_handle?.replace(/^@/, "").trim() || null,
      authorAvatarUrl: input.author_avatar_url?.trim() || null,
      mediaUrls: input.media_urls?.length ? input.media_urls : null,
      name: input.name ? normalizeName(input.name) : null,
      ticker,
      description: input.description ? normalizeDescription(input.description) : null,
      imageHint: input.image_hint ?? "auto",
      dryRun: Boolean(input.dry_run),
      idempotencyKey,
    });
  } catch (err) {
    if (idempotencyKey) {
      const raced = await launchByIdempotency(idempotencyKey);
      if (raced) return raced;
    }
    throw err;
  }
  return (await load(id))!;
}

export async function runLaunch(launchId: string) {
  const existing = await load(launchId);
  if (!existing) throw statusError(404, "Launch not found");
  if (existing.status === "live" || existing.status === "ready") return existing;
  if (existing.status === "failed") return existing;
  try {
    return await executeLaunch(existing);
  } catch (err) {
    await patch(launchId, { status: "failed", error: failMessage(err) });
    throw err;
  }
}

async function executeLaunch(initial: LaunchRow) {
  let row = initial;

  if (row.tweetUrl && (!row.tweetText || !row.authorHandle || !row.authorAvatarUrl || !(row.mediaUrls?.length))) {
    const hydrated = await hydrateTweet(row.tweetUrl);
    if (hydrated) {
      row = await patch(row.id, {
        tweetText: row.tweetText || hydrated.tweetText || null,
        authorHandle: row.authorHandle || hydrated.authorHandle || null,
        authorAvatarUrl: row.authorAvatarUrl || hydrated.authorAvatarUrl || null,
        mediaUrls: row.mediaUrls?.length ? row.mediaUrls : hydrated.mediaUrls,
      });
    }
  }

  row = await patch(row.id, { status: "inventing", error: null });

  const media = row.mediaUrls ?? [];
  const hint = (row.imageHint as "ai" | "pfp" | "post" | "auto" | null) ?? "auto";
  let name = row.name;
  let ticker = row.ticker;
  let description = row.description;
  let imageKind = row.imageKind as "ai" | "pfp" | "post" | null;
  let imagePrompt = "";

  if (!name || !ticker || !description) {
    const taken = await takenTickers();
    let invented = await inventCoin({
      prompt: row.prompt,
      tweetText: row.tweetText,
      authorHandle: row.authorHandle,
      hasPostImage: media.length > 0,
      hasPfp: Boolean(row.authorAvatarUrl),
      imageHint: hint,
      takenTickers: taken,
    });
    for (let i = 0; i < 5 && (await tickerTaken(invented.ticker, row.id)); i += 1) {
      invented = await inventCoin({
        prompt: row.prompt,
        tweetText: row.tweetText,
        authorHandle: row.authorHandle,
        hasPostImage: media.length > 0,
        hasPfp: Boolean(row.authorAvatarUrl),
        imageHint: hint,
        takenTickers: [...taken, invented.ticker],
      });
    }
    name = name || invented.name;
    ticker = ticker || invented.ticker;
    description = description || invented.description;
    imageKind = imageKind || invented.imagePlan.kind;
    imagePrompt = invented.imagePlan.prompt;
  }

  if (!name || !ticker || !description) {
    throw statusError(502, "Could not invent token copy");
  }
  if (await tickerTaken(ticker, row.id)) {
    throw statusError(409, `Ticker $${ticker} is already in use`);
  }
  requireSafeText([name, ticker, description]);

  const kind = (imageKind ?? (hint !== "auto" ? hint : "ai")) as "ai" | "pfp" | "post";
  row = await patch(row.id, {
    status: "publishing",
    name,
    ticker,
    description,
    imageKind: kind,
  });

  if (!spacesReady()) {
    throw statusError(503, "Token image and metadata need Spaces");
  }

  const image = await resolveLaunchImage({
    launchId: row.id,
    kind,
    aiPrompt: imagePrompt,
    mediaUrls: media,
    avatarUrl: row.authorAvatarUrl,
  });
  if (!isPublicHttpsUrl(image.url)) {
    throw statusError(503, "Token image must be a public HTTPS URL on Spaces");
  }

  const twitter = normalizeTwitter(row.authorHandle);
  const website = normalizeWebsite(row.tweetUrl) ?? defaultCoinWebsite(ticker);
  const published = await publishTokenMetadata({
    launchId: row.id,
    name,
    symbol: ticker,
    description,
    imageUrl: image.url,
    twitter,
    website,
  });

  row = await patch(row.id, {
    imageUrl: image.url,
    imageKey: image.key,
    imageKind: image.kind,
    metadataUri: published.url,
    twitter,
    website,
  });

  if (row.dryRun) {
    return patch(row.id, { status: "ready", error: null });
  }

  return sendCreateV2(row.id);
}

async function sendCreateV2(launchId: string) {
  let row = (await load(launchId))!;
  const name = row.name;
  const ticker = row.ticker;
  const metadataUri = row.metadataUri;
  if (!name || !ticker || !metadataUri || !row.imageUrl) {
    throw statusError(409, "Launch is missing metadata");
  }
  await assertPumpMetadataUri(metadataUri);

  const treasury = treasuryKeypair();
  const payer = treasury.publicKey;
  const connection = solanaConnection();

  if (!row.mintAddress || !row.mintSecretSealed) {
    const mintKp = Keypair.generate();
    row = await patch(row.id, {
      status: "sending",
      mintAddress: mintKp.publicKey.toBase58(),
      mintSecretSealed: sealSecret(mintKp.secretKey),
    });
  } else {
    row = await patch(row.id, { status: "sending" });
  }

  const mintKp = Keypair.fromSecretKey(unsealSecret(row.mintSecretSealed!));
  if (mintKp.publicKey.toBase58() !== row.mintAddress) {
    throw statusError(500, "Reserved mint key does not match");
  }

  const mintInfo = await connection.getAccountInfo(mintKp.publicKey);
  if (mintInfo) {
    return patch(row.id, { status: "live", error: null });
  }

  const balance = await onChainBalance(payer.toBase58());
  if (BigInt(balance.lamports) < CREATE_V2_FLOOR_LAMPORTS) {
    throw statusError(
      409,
      `Treasury needs at least ${formatSol(millisolFromLamports(CREATE_V2_FLOOR_LAMPORTS))} on mainnet to pay Pump.`,
    );
  }

  const ix = await buildCreateV2Instruction({
    mint: mintKp.publicKey,
    creator: payer,
    user: payer,
    name,
    symbol: ticker,
    uri: metadataUri,
  });
  if (ix.programId.toBase58() !== PUMP_PROGRAM) {
    throw statusError(409, "Built create_v2 is not the Pump program. Not sent.");
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [ix],
  });
  const tx = new VersionedTransaction(message.compileToV0Message());
  tx.sign([mintKp, treasury]);

  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).slice(-4).join(" ");
    throw statusError(409, `create_v2 simulation failed. ${logs || "Not sent."}`.slice(0, 280));
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
    throw statusError(502, "create_v2 was broadcast but not confirmed");
  }

  return patch(row.id, {
    status: "live",
    createTx: sig,
    error: null,
  });
}
