import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyCa } from "@/components/copy-ca";
import { launchByTicker } from "@/server/launch";
import { pumpUrl } from "@/server/views";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const coin = await launchByTicker(ticker).catch(() => null);
  if (!coin) notFound();
  const pump = pumpUrl(coin.mintAddress);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs tracking-[0.3em] text-hot uppercase">
        <Link href="/">Trender</Link>
      </p>
      <div className="mt-8 grid gap-8 sm:grid-cols-[240px_1fr]">
        {coin.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coin.imageUrl} alt={coin.name ?? ticker} className="aspect-square w-full border border-line object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center border border-line text-hot">${coin.ticker}</div>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">
            {coin.status === "ready" ? "Proposed" : coin.status === "live" ? "Live" : coin.status}
          </p>
          <p className="mt-2 text-hot">${coin.ticker}</p>
          <h1 className="mt-2 text-4xl">{coin.name}</h1>
          {coin.description ? <p className="mt-4 text-sm text-muted">{coin.description}</p> : null}
          {coin.status === "ready" ? (
            <p className="mt-4 text-xs text-muted">Invented and pictured. Not minted on Pump yet.</p>
          ) : null}
          <dl className="mt-6 space-y-2 text-xs text-muted">
            {coin.mintAddress ? (
              <div>
                <dt className="uppercase tracking-widest">CA</dt>
                <dd className="mt-1 text-fg">
                  <CopyCa address={coin.mintAddress} />
                </dd>
              </div>
            ) : null}
            {coin.imageKind ? (
              <div>
                <dt className="uppercase tracking-widest">Image</dt>
                <dd className="text-fg">{coin.imageKind}</dd>
              </div>
            ) : null}
            {coin.authorHandle ? (
              <div>
                <dt className="uppercase tracking-widest">Seed</dt>
                <dd className="text-fg">@{coin.authorHandle}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-8 flex flex-wrap gap-4 text-sm">
            {pump ? (
              <a href={pump} className="border border-hot px-4 py-2 text-hot">
                Pump.fun
              </a>
            ) : null}
            {coin.tweetUrl ? (
              <a href={coin.tweetUrl} className="border border-line px-4 py-2">
                Source post
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
