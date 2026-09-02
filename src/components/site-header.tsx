import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

export function SiteHeader({ current }: { current?: "board" | "mint" }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-xs tracking-[0.3em] text-hot uppercase">
        <Link href="/">Trender</Link>
      </p>
      <nav className="flex items-center gap-4 text-[11px] uppercase tracking-widest text-muted">
        <Link href="/" className={current === "board" ? "text-fg" : undefined}>
          Board
        </Link>
        <Link href="/mint" className={current === "mint" ? "text-hot" : undefined}>
          Mint
        </Link>
        <SignOutButton />
      </nav>
    </div>
  );
}
