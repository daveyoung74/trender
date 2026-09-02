import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function hydrateProcessEnvFromFile() {
  try {
    const path = resolve(process.cwd(), ".env");
    if (!existsSync(path)) return;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i <= 0) continue;
      const key = trimmed.slice(0, i).trim();
      let value = trimmed.slice(i + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

hydrateProcessEnvFromFile();

function optional(name: string): string | undefined {
  const v = process.env[name];
  if (!v || !v.trim()) return undefined;
  let t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    t = t.slice(1, -1).trim();
  }
  return t || undefined;
}

function floatEnv(name: string, fallback: number) {
  const raw = optional(name);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function publicAppUrl(): string {
  const raw = optional("APP_URL") ?? optional("NEXT_PUBLIC_APP_URL");
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* fall through */
    }
  }
  const vercel = optional("VERCEL_URL");
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  isDev: (process.env.NODE_ENV ?? "development") === "development",
  databaseUrl: optional("DATABASE_URL"),
  redisUrl: optional("REDIS_URL"),
  redisPrefix: optional("REDIS_PREFIX") ?? "trender",
  sessionSecret: (() => {
    const s = optional("SESSION_SECRET");
    const nodeEnv = process.env.NODE_ENV ?? "development";
    if (s) return s;
    if (nodeEnv !== "development") {
      throw new Error("SESSION_SECRET is required unless NODE_ENV=development");
    }
    return "dev-only-session-secret-do-not-use-prod";
  })(),
  appUrl: publicAppUrl(),
  trenderApiKey: optional("TRENDER_API_KEY"),
  treasurySecret: optional("TREASURY_SECRET"),
  feeSweepMinSol: floatEnv("FEE_SWEEP_MIN_SOL", 0.05),
  solanaRpcUrl: optional("SOLANA_RPC_URL"),
  xaiApiKey: optional("XAI_API_KEY"),
  xaiTextModel: optional("XAI_TEXT_MODEL") ?? "grok-4-1-fast-non-reasoning",
  xaiImageModel: optional("XAI_IMAGE_MODEL") ?? "grok-imagine-image-2.0",
  spacesEndpoint: optional("SPACES_ENDPOINT"),
  spacesRegion: optional("SPACES_REGION") ?? "nyc3",
  spacesBucket: optional("SPACES_BUCKET"),
  spacesKey: optional("SPACES_KEY"),
  spacesSecret: optional("SPACES_SECRET"),
  spacesCdnBase: optional("SPACES_CDN_BASE"),
  xBearerToken: optional("X_BEARER_TOKEN"),
};
