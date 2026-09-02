import { env } from "@/server/env";
import { statusError } from "@/server/errors";
import { putPublicJson, spacesReady } from "@/server/storage";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export type PumpMetadataJson = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: true;
  createdOn: "https://pump.fun";
  twitter?: string;
  telegram?: string;
  website?: string;
};

function localHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local")
  );
}

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    if (localHost(u.hostname)) return false;
    return Boolean(u.hostname);
  } catch {
    return false;
  }
}

export function looksLikeImageUrl(value: string): boolean {
  try {
    return IMAGE_EXT.test(new URL(value).pathname);
  } catch {
    return IMAGE_EXT.test(value.split("?")[0] ?? "");
  }
}

export function normalizeDescription(input: string): string {
  const description = input.trim();
  if (!description) throw statusError(400, "Token description is required");
  if (description.length > 280) throw statusError(400, "Token description must be 280 characters or fewer");
  return description;
}

export function normalizeName(input: string): string {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length < 2) throw statusError(400, "Token name must be at least 2 characters");
  if (name.length > 32) throw statusError(400, "Token name must be 32 characters or fewer");
  return name;
}

export function normalizeTicker(input: string): string {
  const ticker = input
    .trim()
    .replace(/^\$/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  if (!/^[A-Z0-9]{2,10}$/.test(ticker)) {
    throw statusError(400, "Ticker is 2–10 A–Z / 0–9");
  }
  return ticker;
}

export function normalizeTwitter(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let handle = raw.replace(/^@/, "");
  if (/^https?:\/\//i.test(raw)) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw statusError(400, "X URL is not valid");
    }
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") {
      throw statusError(400, "X must be an x.com or twitter.com URL, or an @handle");
    }
    handle = u.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  }
  handle = handle.replace(/^@/, "");
  if (!X_HANDLE.test(handle)) throw statusError(400, "X handle is 1–15 letters, numbers, or underscore");
  return `https://x.com/${handle}`;
}

const TG_HANDLE = /^[A-Za-z0-9_]{5,32}$/;

export function normalizeTelegram(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let handle = raw.replace(/^@/, "");
  if (/^https?:\/\//i.test(raw)) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw statusError(400, "Telegram URL is not valid");
    }
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "t.me" && host !== "telegram.me") {
      throw statusError(400, "Telegram must be a t.me URL or @handle");
    }
    handle = u.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  }
  handle = handle.replace(/^@/, "");
  if (!TG_HANDLE.test(handle)) {
    throw statusError(400, "Telegram handle is 5–32 letters, numbers, or underscore");
  }
  return `https://t.me/${handle}`;
}

export function normalizeWebsite(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw statusError(400, "Website URL is not valid");
  }
  if (localHost(u.hostname)) return null;
  if (u.protocol !== "https:") throw statusError(400, "Website must be https");
  return u.toString();
}

export function defaultCoinWebsite(ticker: string): string | null {
  try {
    const u = new URL(env.appUrl);
    if (u.protocol !== "https:" || localHost(u.hostname)) return null;
    return `${u.origin}/c/${ticker}`;
  } catch {
    return null;
  }
}

export async function publishTokenMetadata(input: {
  launchId: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  twitter: string | null;
  telegram?: string | null;
  website: string | null;
}): Promise<{ url: string; json: PumpMetadataJson }> {
  if (!spacesReady()) {
    throw statusError(503, "Token metadata needs Spaces. Local files are not public to Pump.");
  }
  if (!isPublicHttpsUrl(input.imageUrl)) {
    throw statusError(409, "Token image must be a public HTTPS URL");
  }
  const json: PumpMetadataJson = {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.imageUrl,
    showName: true,
    createdOn: "https://pump.fun",
  };
  if (input.twitter) json.twitter = input.twitter;
  if (input.telegram) json.telegram = input.telegram;
  if (input.website) json.website = input.website;
  try {
    const stored = await putPublicJson(`launches/${input.launchId}/metadata.json`, json);
    if (!isPublicHttpsUrl(stored.url) || looksLikeImageUrl(stored.url)) {
      throw statusError(503, "Published metadata URI is not public JSON");
    }
    return { url: stored.url, json };
  } catch (err) {
    if ((err as { status?: number }).status) throw err;
    throw statusError(503, "Token metadata needs Spaces. Local files are not public to Pump.");
  }
}

export async function assertPumpMetadataUri(uri: string): Promise<void> {
  if (!isPublicHttpsUrl(uri)) {
    throw statusError(409, "create_v2 uri must be public HTTPS metadata JSON. Not sent.");
  }
  if (looksLikeImageUrl(uri)) {
    throw statusError(409, "create_v2 uri is an image. Pump needs metadata JSON. Not sent.");
  }
  let parsed: unknown;
  try {
    const res = await fetch(uri, { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed");
    parsed = await res.json();
  } catch {
    throw statusError(409, "create_v2 metadata JSON could not be read. Not sent.");
  }
  const row = parsed as Partial<PumpMetadataJson>;
  if (typeof row.name !== "string" || !row.name.trim()) {
    throw statusError(409, "Metadata JSON is missing name. Not sent.");
  }
  if (typeof row.symbol !== "string" || !row.symbol.trim()) {
    throw statusError(409, "Metadata JSON is missing symbol. Not sent.");
  }
  if (typeof row.description !== "string" || !row.description.trim()) {
    throw statusError(409, "Metadata JSON is missing description. Not sent.");
  }
  if (typeof row.image !== "string" || !isPublicHttpsUrl(row.image)) {
    throw statusError(409, "Metadata JSON image must be a public HTTPS URL. Not sent.");
  }
}
