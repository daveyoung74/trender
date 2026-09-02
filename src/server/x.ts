import { env } from "@/server/env";

export type HydratedTweet = {
  tweetUrl: string;
  tweetText?: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  mediaUrls: string[];
};

function tweetIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return null;
    const m = u.pathname.match(/\/status\/(\d+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function biggerAvatar(url: string) {
  return url.replace(/_normal(\.(jpg|jpeg|png|webp))?$/i, "_400x400$1");
}

export async function hydrateTweet(tweetUrl: string): Promise<HydratedTweet | null> {
  const id = tweetIdFromUrl(tweetUrl);
  if (!id || !env.xBearerToken) return null;

  const params = new URLSearchParams({
    expansions: "attachments.media_keys,author_id",
    "tweet.fields": "text",
    "media.fields": "url,preview_image_url,type",
    "user.fields": "username,profile_image_url",
  });
  const res = await fetch(`https://api.x.com/2/tweets/${id}?${params}`, {
    headers: { Authorization: `Bearer ${env.xBearerToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { text?: string; attachments?: { media_keys?: string[] } };
    includes?: {
      users?: { username?: string; profile_image_url?: string }[];
      media?: { media_key?: string; type?: string; url?: string; preview_image_url?: string }[];
    };
  };

  const author = json.includes?.users?.[0];
  const keys = new Set(json.data?.attachments?.media_keys ?? []);
  const mediaUrls: string[] = [];
  for (const media of json.includes?.media ?? []) {
    if (keys.size && media.media_key && !keys.has(media.media_key)) continue;
    const url = media.url || media.preview_image_url;
    if (url) mediaUrls.push(url);
  }

  return {
    tweetUrl,
    tweetText: json.data?.text,
    authorHandle: author?.username,
    authorAvatarUrl: author?.profile_image_url ? biggerAvatar(author.profile_image_url) : undefined,
    mediaUrls,
  };
}
