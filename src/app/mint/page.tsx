import { MintForm } from "@/components/mint-form";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export default function MintPage() {
  const buy = env.launchBuyUsd;
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-10 border-b border-line pb-8">
        <SiteHeader current="mint" />
        <h1 className="mt-3 text-5xl text-fg">Drive a mint.</h1>
        <p className="mt-3 max-w-xl text-sm text-muted">
          Name it, picture it, then the treasury sends create_v2
          {buy > 0 ? ` and buys about $${buy} on the curve.` : "."} Socials and a source post are optional.
        </p>
      </header>
      <MintForm />
    </main>
  );
}
