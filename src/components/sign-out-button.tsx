"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      /* still leave */
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={busy} className="uppercase tracking-widest">
      {busy ? "Leaving" : "Sign out"}
    </button>
  );
}
