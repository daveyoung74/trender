import type { launches } from "@/db/schema";

export type LaunchRow = typeof launches.$inferSelect;

export function pumpUrl(mintAddress: string | null | undefined) {
  if (!mintAddress) return null;
  return `https://pump.fun/coin/${mintAddress}`;
}

export function boardStatusLabel(status: string) {
  if (status === "ready") return "Proposed";
  if (status === "live") return "Live";
  return "Queued";
}

export function publicLaunchView(row: LaunchRow) {
  return {
    id: row.id,
    status: row.status,
    dry_run: row.dryRun,
    prompt: row.prompt,
    tweet_url: row.tweetUrl,
    tweet_text: row.tweetText,
    author_handle: row.authorHandle,
    name: row.name,
    ticker: row.ticker,
    description: row.description,
    image_prompt: row.imagePrompt,
    image_kind: row.imageKind,
    image_url: row.imageUrl,
    metadata_uri: row.metadataUri,
    twitter: row.twitter,
    website: row.website,
    mint_address: row.mintAddress,
    create_tx: row.createTx,
    buy_tx: row.buyTx,
    buy_millisol: row.buyMillisol,
    pump_url: pumpUrl(row.mintAddress),
    error: row.error,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
