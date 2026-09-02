"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyButton, useBusyStages } from "@/components/busy-button";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stage = useBusyStages(["Checking the latch."], busy);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next: nextPath }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; next?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not sign in");
        setBusy(false);
        return;
      }
      router.replace(data.next || "/");
      router.refresh();
    } catch {
      setError("Could not sign in");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full border border-line bg-card px-3 py-2 text-fg outline-none focus:border-hot"
          required
        />
      </label>
      {error ? <p className="text-sm text-hot">{error}</p> : null}
      <BusyButton
        type="submit"
        busy={busy}
        stage={stage}
        className="border border-hot px-4 py-2 text-sm text-hot"
      >
        Enter
      </BusyButton>
    </form>
  );
}
