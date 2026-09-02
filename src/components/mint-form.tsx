"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyButton, useBusyStages } from "@/components/busy-button";
import { ConfirmModal } from "@/components/confirm-modal";

type ImageDraft = {
  url: string;
  key: string;
  kind: "ai" | "post";
  prompt?: string;
};

type LaunchView = {
  id?: string;
  status?: string;
  ticker?: string | null;
  error?: string | null;
  pump_url?: string | null;
};

export function MintForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [tweetUrl, setTweetUrl] = useState("");
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [image, setImage] = useState<ImageDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState<"upload" | "generate" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const generateStage = useBusyStages(
    ["Asking Grok for a picture.", "Saving the frame."],
    imageBusy === "generate",
  );
  const working = Boolean(imageBusy);

  function setTickerValue(raw: string) {
    setTicker(raw.replace(/^\$/, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10));
  }

  async function uploadFile(file: File) {
    setImageBusy("upload");
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/studio/image", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as ImageDraft & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not upload the image");
        return;
      }
      setImage({ url: data.url, key: data.key, kind: "post" });
    } catch {
      setError("Could not upload the image");
    } finally {
      setImageBusy(null);
    }
  }

  async function generateImage() {
    const prompt = imagePrompt.trim();
    if (!prompt) {
      setError("Describe the picture first");
      return;
    }
    setImageBusy("generate");
    setError(null);
    try {
      const res = await fetch("/api/studio/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, name, ticker }),
      });
      const data = (await res.json().catch(() => ({}))) as ImageDraft & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Image generation failed");
        return;
      }
      setImage({ url: data.url, key: data.key, kind: "ai", prompt });
    } catch {
      setError("Image generation failed");
    } finally {
      setImageBusy(null);
    }
  }

  function validate(): string | null {
    if (name.trim().length < 2) return "Name needs at least 2 characters";
    if (name.trim().length > 32) return "Name must be 32 characters or fewer";
    if (!/^[A-Z0-9]{2,10}$/.test(ticker)) return "Ticker is 2–10 A–Z / 0–9";
    if (!description.trim()) return "Description is required";
    if (description.length > 280) return "Description must be 280 characters or fewer";
    if (!image) return "Upload or generate an image first";
    return null;
  }

  function openConfirm() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  async function mint() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return false;
    }
    setError(null);
    const res = await fetch("/api/studio/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        ticker,
        description: description.trim(),
        tweet_url: tweetUrl.trim() || null,
        twitter: twitter.trim() || null,
        website: website.trim() || null,
        telegram: telegram.trim() || null,
        image_url: image?.url,
        image_key: image?.key,
        image_hint: image?.kind ?? "post",
        image_prompt: image?.kind === "ai" ? image.prompt || imagePrompt.trim() : imagePrompt.trim() || null,
        prompt: description.trim(),
        wait: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as LaunchView & { error?: string };
    if (!res.ok || data.status === "failed") {
      setError(data.error ?? "Mint failed");
      return false;
    }
    if (data.ticker) {
      router.push(`/c/${data.ticker}`);
      router.refresh();
      return true;
    }
    router.push("/");
    router.refresh();
    return true;
  }

  return (
    <>
      <form
        className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]"
        onSubmit={(e) => {
          e.preventDefault();
          openConfirm();
        }}
      >
        <div className="space-y-5">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="mt-2 w-full border border-line bg-card px-3 py-2 text-fg outline-none focus:border-hot"
              required
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Ticker</span>
            <input
              value={ticker}
              onChange={(e) => setTickerValue(e.target.value)}
              maxLength={10}
              className="mt-2 w-full border border-line bg-card px-3 py-2 uppercase text-fg outline-none focus:border-hot"
              placeholder="2–10 A–Z / 0–9"
              required
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">
              Description <span className="normal-case tracking-normal">{description.length}/280</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 280))}
              rows={3}
              className="mt-2 w-full resize-y border border-line bg-card px-3 py-2 text-fg outline-none focus:border-hot"
              required
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Related social post</span>
            <input
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="https://x.com/…/status/…"
              className="mt-2 w-full border border-line bg-card px-3 py-2 text-fg outline-none focus:border-hot"
            />
          </label>
          <fieldset className="space-y-3">
            <legend className="text-[10px] uppercase tracking-widest text-muted">Social links</legend>
            <input
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="X handle or URL"
              className="w-full border border-line bg-card px-3 py-2 text-fg outline-none focus:border-hot"
            />
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="Website https://"
              className="w-full border border-line bg-card px-3 py-2 text-fg outline-none focus:border-hot"
            />
            <input
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="Telegram @handle or t.me"
              className="w-full border border-line bg-card px-3 py-2 text-fg outline-none focus:border-hot"
            />
          </fieldset>
        </div>

        <div className="space-y-4">
          <p className="text-[10px] uppercase tracking-widest text-muted">Image</p>
          <div className="border border-line bg-card">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt="Token preview" className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center px-4 text-center text-xs text-muted">
                Upload a file or generate from a description.
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
              e.target.value = "";
            }}
          />
          <BusyButton
            busy={working}
            stage={imageBusy === "upload" ? (image ? "Replacing the picture." : "Uploading.") : undefined}
            className="w-full border border-line px-4 py-2 text-sm"
            onClick={() => fileRef.current?.click()}
          >
            Upload image
          </BusyButton>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Generate from a description</span>
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={3}
              className="mt-2 w-full resize-y border border-line bg-card px-3 py-2 text-fg outline-none focus:border-hot"
              placeholder="One object, muted light, entire subject in frame."
            />
          </label>
          <BusyButton
            busy={working}
            stage={imageBusy === "generate" ? generateStage : undefined}
            className="w-full border border-line px-4 py-2 text-sm"
            onClick={() => void generateImage()}
          >
            Generate image
          </BusyButton>
          {image ? (
            <button
              type="button"
              className="text-[11px] uppercase tracking-widest text-muted"
              onClick={() => setImage(null)}
            >
              Clear image
            </button>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          {error ? <p className="mb-4 text-sm text-hot">{error}</p> : null}
          <BusyButton
            type="submit"
            className="border border-hot px-5 py-2 text-sm text-hot"
            disabled={working}
          >
            Mint on Pump
          </BusyButton>
        </div>
      </form>

      <ConfirmModal
        open={confirmOpen}
        title={ticker ? `Mint $${ticker}?` : "Mint this coin?"}
        body="The treasury pays Pump create and the opening curve buy. This is live once it lands."
        confirmLabel="Mint"
        stages={["Queuing the mint.", "Publishing metadata.", "Sending create and the opening buy."]}
        onClose={() => setConfirmOpen(false)}
        onConfirm={mint}
      />
    </>
  );
}
