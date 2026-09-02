import { env } from "@/server/env";
import { statusError } from "@/server/errors";
import { requireSafeText } from "@/server/safety";
import { normalizeDescription, normalizeName, normalizeTicker } from "@/server/token-metadata";

export type ImagePlanKind = "ai" | "pfp" | "post";

export type InventedCoin = {
  name: string;
  ticker: string;
  description: string;
  imagePlan: { kind: ImagePlanKind; prompt: string; reason: string };
  source: "xai" | "fallback";
};

const INVENT_SCHEMA = `{
  "name": "2-32 characters",
  "ticker": "2-10 A-Z0-9, no dollar sign",
  "description": "one punchy line, max 280 characters",
  "image_plan": {
    "kind": "ai" | "pfp" | "post",
    "prompt": "if kind is ai: a visual scene and mascot only — no slogans, captions, or other tickers",
    "reason": "one short sentence why this image"
  }
}`;

/** Image models love graffiti walls. We describe a picture, then pin any letters to this coin. */
export function finalizeMemeImagePrompt(scene: string, name: string, ticker: string): string {
  const visual =
    stripForeignBranding(stripPaintedCopy(scene), name, ticker) ||
    `One centered mascot for ${name}, loud neon colors, chaotic energy, high contrast, paint splatters with no writing on them.`;
  return [
    `Square 1:1 Pump.fun token illustration. Subject: ${visual}`,
    `Typography: almost none. Do not fill the canvas with tiny words, sticker phrases, quotes, labels, or a collage of jokes.`,
    `If any letters appear, they may appear only once, large and readable, and must be exactly "${name}" or "$${ticker}".`,
    `Never render any other token name, ticker, $SYMBOL, whitepaper, chart labels, watermarks, or meme catchphrases.`,
    `Paint splatters and stickers may have icons and faces, not sentences.`,
    `Illustration only — not a poster, not a screenshot, not a tweet, not parchment, not an anime hall portrait.`,
  ].join(" ");
}

function stripPaintedCopy(scene: string) {
  return scene
    .replace(/[“"][^"”]{1,120}[”"]/g, " ")
    .replace(
      /\b(text|words?|caption|slogan|lettering|typography|title|headline|says?|reading|written|graffiti that)\b[^.,;]{0,80}/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function stripForeignBranding(scene: string, _name: string, ticker: string) {
  const ours = ticker.toUpperCase();
  return scene
    .replace(/\$[A-Za-z][A-Za-z0-9]{1,12}/g, (match) =>
      match.slice(1).toUpperCase() === ours ? `$${ours}` : " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) return {};
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function clip(s: string, max: number) {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function asKind(value: unknown, fallback: ImagePlanKind): ImagePlanKind {
  if (value === "ai" || value === "pfp" || value === "post") return value;
  return fallback;
}

export async function inventCoin(input: {
  prompt?: string | null;
  tweetText?: string | null;
  authorHandle?: string | null;
  hasPostImage: boolean;
  hasPfp: boolean;
  imageHint?: "ai" | "pfp" | "post" | "auto" | null;
  takenTickers: string[];
}): Promise<InventedCoin> {
  const hint = input.imageHint && input.imageHint !== "auto" ? input.imageHint : null;
  const available: ImagePlanKind[] = ["ai"];
  if (input.hasPostImage) available.unshift("post");
  if (input.hasPfp) available.push("pfp");

  if (!env.xaiApiKey) {
    return fallbackInvent(input, hint, available);
  }

  const sys = `You invent original meme coins for Pump.fun. Be creative, chaotic, and disruptive.
Never sexualize minors. Never produce CSAM.
Do not write family-friendly hall portraits. Square meme energy, not parchment.
Prefer a stolen post image or the author's PFP when that would be funnier or more viral than generating art.
If image_plan.kind is ai, prompt is a visual scene (mascot, colors, composition). Do not ask the image model to paint slogans, jokes, captions, tiny labels, or any ticker except this coin.
Return JSON only matching ${INVENT_SCHEMA}.
Avoid tickers: ${input.takenTickers.slice(0, 40).join(", ") || "(none)"}.
Available image kinds right now: ${available.join(", ")}.`;

  const user = [
    input.prompt ? `Prompt: ${input.prompt}` : "",
    input.authorHandle ? `Author: @${input.authorHandle}` : "",
    input.tweetText ? `Post: ${input.tweetText}` : "",
    hint ? `Caller wants image kind: ${hint}` : "Pick the image kind yourself.",
    "Invent one coin. JSON only.",
  ]
    .filter(Boolean)
    .join("\n");

  const textRes = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.xaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.xaiTextModel,
      temperature: 1.1,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });

  if (!textRes.ok) {
    return fallbackInvent(input, hint, available);
  }

  const textJson = (await textRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const parsed = parseJsonObject(textJson.choices?.[0]?.message?.content ?? "");
  const planObj =
    parsed.image_plan && typeof parsed.image_plan === "object"
      ? (parsed.image_plan as Record<string, unknown>)
      : {};

  let kind = hint ?? asKind(planObj.kind, available[0] ?? "ai");
  if (!available.includes(kind)) kind = "ai";

  const name = normalizeName(clip(String(parsed.name ?? parsed.token_name ?? "Trendbomb"), 32));
  const ticker = normalizeTicker(String(parsed.ticker ?? parsed.symbol ?? "TREND"));
  const description = normalizeDescription(
    clip(String(parsed.description ?? parsed.bio ?? `${name} is not a safe bet.`), 280),
  );
  requireSafeText([name, ticker, description, String(planObj.prompt ?? "")]);

  const prompt =
    kind === "ai"
      ? clip(
          String(
            planObj.prompt ??
              `One centered mascot for ${name}, loud neon colors, chaotic energy, high contrast, paint splatters with no writing on them.`,
          ),
          500,
        )
      : "";

  return {
    name,
    ticker,
    description,
    imagePlan: {
      kind,
      prompt,
      reason: clip(String(planObj.reason ?? "Picked for maximum disruption."), 200),
    },
    source: "xai",
  };
}

function fallbackInvent(
  input: {
    prompt?: string | null;
    tweetText?: string | null;
    authorHandle?: string | null;
  },
  hint: ImagePlanKind | null,
  available: ImagePlanKind[],
): InventedCoin {
  const seed = (input.tweetText || input.prompt || "trend").replace(/\s+/g, " ").trim();
  const name = normalizeName(clip(seed.replace(/[^\w\s]/g, "") || "Trendbomb", 32));
  const ticker = normalizeTicker(name.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "TREND");
  const description = normalizeDescription(
    clip(input.tweetText || input.prompt || `${name} launched because the timeline asked for it.`, 280),
  );
  requireSafeText([name, ticker, description]);
  const kind = hint && available.includes(hint) ? hint : (available[0] ?? "ai");
  return {
    name,
    ticker,
    description,
    imagePlan: {
      kind,
      prompt:
        kind === "ai"
          ? `One centered mascot for ${name}, loud neon colors, chaotic energy, high contrast, paint splatters with no writing on them.`
          : "",
      reason: "Fallback invent without a model response.",
    },
    source: "fallback",
  };
}

export async function generateMemeImage(prompt: string): Promise<Buffer> {
  if (!env.xaiApiKey) throw statusError(503, "XAI_API_KEY is not set");
  const imgRes = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.xaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.xaiImageModel,
      prompt,
      n: 1,
      aspect_ratio: "1:1",
    }),
  });
  if (!imgRes.ok) {
    throw statusError(502, "Image generation failed");
  }
  const imgJson = (await imgRes.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = imgJson.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first?.url) {
    const fetched = await fetch(first.url);
    if (!fetched.ok) throw statusError(502, "Generated image could not be downloaded");
    return Buffer.from(await fetched.arrayBuffer());
  }
  throw statusError(502, "Image generation returned no image");
}
