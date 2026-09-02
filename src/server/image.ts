import { statusError } from "@/server/errors";
import { ingestImage } from "@/server/storage";
import { isPublicHttpsUrl } from "@/server/token-metadata";
import { generateMemeImage } from "@/server/xai";
import type { ImageKind } from "@/db/schema";

const MAX_BYTES = 8 * 1024 * 1024;

export async function fetchImageBytes(url: string): Promise<Buffer> {
  if (!isPublicHttpsUrl(url)) {
    throw statusError(400, "Image URL must be public HTTPS");
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": "Trender/0.1" },
      redirect: "follow",
    });
    if (!res.ok) throw statusError(502, "Could not fetch image");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw statusError(400, "Image is too large");
    return buf;
  } catch (err) {
    if ((err as { status?: number }).status) throw err;
    throw statusError(502, "Could not fetch image");
  } finally {
    clearTimeout(t);
  }
}

export async function resolveLaunchImage(opts: {
  launchId: string;
  kind: ImageKind;
  aiPrompt: string;
  mediaUrls: string[];
  avatarUrl?: string | null;
}): Promise<{ url: string; key: string; kind: ImageKind }> {
  const tryPost = async () => {
    for (const url of opts.mediaUrls) {
      try {
        const bytes = await fetchImageBytes(url);
        const stored = await ingestImage({ bytes, key: `launches/${opts.launchId}/image.jpg` });
        return { ...stored, kind: "post" as const };
      } catch {
        /* next */
      }
    }
    return null;
  };

  const tryPfp = async () => {
    if (!opts.avatarUrl) return null;
    try {
      const bytes = await fetchImageBytes(opts.avatarUrl);
      const stored = await ingestImage({ bytes, key: `launches/${opts.launchId}/image.jpg` });
      return { ...stored, kind: "pfp" as const };
    } catch {
      return null;
    }
  };

  const tryAi = async () => {
    try {
      const bytes = await generateMemeImage(
        opts.aiPrompt ||
          "Square unhinged meme coin artwork. High contrast, chaotic, no parchment portrait.",
      );
      const stored = await ingestImage({ bytes, key: `launches/${opts.launchId}/image.jpg` });
      return { ...stored, kind: "ai" as const };
    } catch {
      return null;
    }
  };

  const resolved =
    opts.kind === "post"
      ? ((await tryPost()) ?? (await tryPfp()) ?? (await tryAi()))
      : opts.kind === "pfp"
        ? ((await tryPfp()) ?? (await tryPost()) ?? (await tryAi()))
        : ((await tryAi()) ?? (await tryPost()) ?? (await tryPfp()));
  if (!resolved) throw statusError(502, "Could not create a token image");
  return resolved;
}
