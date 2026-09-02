import type { launches } from "@/db/schema";

export type LaunchRow = typeof launches.$inferSelect;

export function pumpUrl(mintAddress: string | null | undefined) {
  if (!mintAddress) return null;
  return `https://pump.fun/coin/${mintAddress}`;
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
    image_kind: row.imageKind,
    image_url: row.imageUrl,
    metadata_uri: row.metadataUri,
    twitter: row.twitter,
    website: row.website,
    mint_address: row.mintAddress,
    create_tx: row.createTx,
    pump_url: pumpUrl(row.mintAddress),
    error: row.error,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
