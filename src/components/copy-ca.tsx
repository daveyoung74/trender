"use client";

import { useState } from "react";

export function CopyCa({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    setCopied(true);
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      setCopied(false);
      return;
    }
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy CA"
      className="w-full text-left text-[11px] leading-snug text-muted hover:text-fg"
    >
      <span className="break-all">{address}</span>
      <span className="ml-2 whitespace-nowrap uppercase tracking-widest text-hot">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
