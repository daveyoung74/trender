import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const launchStatus = [
  "queued",
  "inventing",
  "publishing",
  "sending",
  "live",
  "ready",
  "failed",
] as const;
export type LaunchStatus = (typeof launchStatus)[number];

export const imageKind = ["ai", "pfp", "post"] as const;
export type ImageKind = (typeof imageKind)[number];

export const launches = mysqlTable(
  "launches",
  {
    id: varchar("id", { length: 21 }).primaryKey(),
    status: mysqlEnum("status", launchStatus).notNull().default("queued"),
    prompt: text("prompt"),
    tweetUrl: varchar("tweet_url", { length: 512 }),
    tweetText: text("tweet_text"),
    authorHandle: varchar("author_handle", { length: 32 }),
    authorAvatarUrl: text("author_avatar_url"),
    mediaUrls: json("media_urls").$type<string[] | null>(),
    name: varchar("name", { length: 32 }),
    ticker: varchar("ticker", { length: 10 }),
    description: varchar("description", { length: 280 }),
    imageHint: varchar("image_hint", { length: 16 }),
    imageKind: varchar("image_kind", { length: 16 }),
    imageUrl: text("image_url"),
    imageKey: varchar("image_key", { length: 255 }),
    metadataUri: text("metadata_uri"),
    twitter: varchar("twitter", { length: 128 }),
    website: varchar("website", { length: 512 }),
    mintAddress: varchar("mint_address", { length: 64 }),
    mintSecretSealed: text("mint_secret_sealed"),
    createTx: varchar("create_tx", { length: 128 }),
    dryRun: boolean("dry_run").notNull().default(false),
    error: varchar("error", { length: 280 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("launches_idempotency_uidx").on(t.idempotencyKey),
    uniqueIndex("launches_mint_uidx").on(t.mintAddress),
    index("launches_status_idx").on(t.status),
    index("launches_ticker_idx").on(t.ticker),
    index("launches_created_idx").on(t.createdAt),
  ],
);

export const sweepTrigger = ["schedule", "manual"] as const;
export type SweepTrigger = (typeof sweepTrigger)[number];

export const sweepStatus = ["collected", "skipped", "failed"] as const;
export type SweepStatus = (typeof sweepStatus)[number];

export const sweepRuns = mysqlTable(
  "sweep_runs",
  {
    id: varchar("id", { length: 21 }).primaryKey(),
    status: mysqlEnum("status", sweepStatus).notNull(),
    trigger: mysqlEnum("trigger", sweepTrigger).notNull(),
    vaultLamports: varchar("vault_lamports", { length: 32 }),
    vaultMillisol: int("vault_millisol").notNull().default(0),
    tx: varchar("tx", { length: 128 }),
    note: varchar("note", { length: 280 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sweep_runs_created_idx").on(t.createdAt)],
);

export const rateBuckets = mysqlTable("rate_buckets", {
  key: varchar("key", { length: 128 }).primaryKey(),
  windowStart: timestamp("window_start").notNull(),
  count: int("count").notNull(),
});
