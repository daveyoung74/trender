# Trender

Treasury-paid Pump.fun launches from a GrokBot seed. Invents name, ticker, description, and image. No buybacks. No creator-fee split. One wallet pays `create_v2`, is the Pump creator, buys about $10 on the curve, and hourly-collects fees above `FEE_SWEEP_MIN_SOL`.

## Run locally

```bash
docker compose up -d
cp .env.example .env
# fill TREASURY_SECRET, TRENDER_API_KEY, XAI_API_KEY, SOLANA_RPC_URL, Spaces, SESSION_SECRET
npm install
npx drizzle-kit push --force
npm run dev
```

The Next.js process consumes launch jobs and the hourly fee sweep. You do not need a separate DigitalOcean worker. `npm run worker` is optional if you want a second consumer locally.

Compose maps MySQL to `3307` and Redis to `6380` so it does not collide with Champions on `3306` / `6379`.

Fund the treasury address (from `GET /v1/meta`) with mainnet SOL. Pump create needs about 0.03 SOL of rent plus a little gas. After mint, the treasury also buys about `LAUNCH_BUY_USD` (default $10) of the coin on the Pump curve. No buybacks. No creator-fee split.

## GrokBot

`Authorization: Bearer $TRENDER_API_KEY`

```bash
curl -sS -X POST "$APP_URL/v1/launch" \
  -H "Authorization: Bearer $TRENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-per-attempt" \
  -d '{
    "prompt": "this post is the coin",
    "tweet_url": "https://x.com/foo/status/123",
    "tweet_text": "optional body if you already have it",
    "author_handle": "foo",
    "author_avatar_url": "https://pbs.twimg.com/...",
    "media_urls": ["https://pbs.twimg.com/..."],
    "image_prompt": "optional exact scene for AI art",
    "wait": true
  }'
```

Send a `prompt` and/or `tweet_url`. Optional overrides: `name`, `ticker`, `description`, `image_prompt`, and `image_hint` (`ai` | `pfp` | `post` | `auto`). A supplied `image_prompt` forces AI art and is persisted with the launch. `dry_run: true` invents and publishes metadata without sending `create_v2`.

Poll `GET /v1/launches/:id` if `wait` times out (about 90s). `GET /v1/launches` lists live coins. `GET /v1/meta` and `POST /v1/sweep` are authenticated.

If `X_BEARER_TOKEN` is set, a lone `tweet_url` is hydrated. Otherwise pass text, avatar, and media from GrokBot. Images are copied to Spaces — Pump never hotlinks X.
