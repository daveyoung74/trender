function optional(name: string): string | undefined {
  const v = process.env[name];
  if (!v || !v.trim()) return undefined;
  return v.trim();
}

function floatEnv(name: string, fallback: number) {
  const raw = optional(name);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function intEnv(name: string, fallback: number) {
  const n = Math.floor(floatEnv(name, fallback));
  return n > 0 ? n : fallback;
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
  launchRateLimit: intEnv("LAUNCH_RATE_LIMIT", 10),
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
