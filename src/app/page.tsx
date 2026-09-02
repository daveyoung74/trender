import Link from "next/link";
import { CopyCa } from "@/components/copy-ca";
import { SiteHeader } from "@/components/site-header";
import { listBoardLaunches } from "@/server/launch";
import { boardStatusLabel, pumpUrl } from "@/server/views";

export const dynamic = "force-dynamic";

export default async function Home() {
  let coins: Awaited<ReturnType<typeof listBoardLaunches>> = [];
  try {
    coins = await listBoardLaunches(48);
  } catch {
    coins = [];
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-10 border-b border-line pb-8">
        <SiteHeader current="board" />
        <h1 className="mt-3 text-5xl text-fg">Coins from the timeline.</h1>
        <p className="mt-3 max-w-xl text-sm text-muted">
          GrokBot seeds a prompt or a post. Trender invents the coin, the picture, and the copy, then
          the treasury mints it on Pump.fun. Queued coins are still inventing. Proposed coins are dry
          runs — live ones are on-chain.
        </p>
      </header>
      {coins.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing on the board yet.{" "}
          <Link href="/mint" className="text-hot">
            Mint one
          </Link>{" "}
          or hit POST /v1/launch.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coins.map((coin) => {
            const label = boardStatusLabel(coin.status);
            const href = coin.ticker ? `/c/${coin.ticker}` : pumpUrl(coin.mintAddress);
            const ticker = coin.ticker ? `$${coin.ticker}` : "Queued";
            const title = coin.name ?? coin.prompt ?? "Still inventing";
            const media = coin.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coin.imageUrl} alt={coin.name ?? coin.ticker ?? "queued coin"} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center text-hot">{ticker}</div>
            );
            const body = (
              <div className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-hot">{ticker}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
                </div>
                <p className="mt-1 line-clamp-3 text-lg">{title}</p>
                {coin.description ? (
                  <p className="mt-2 line-clamp-3 text-xs text-muted">{coin.description}</p>
                ) : coin.prompt && coin.name ? (
                  <p className="mt-2 line-clamp-3 text-xs text-muted">{coin.prompt}</p>
                ) : null}
              </div>
            );
            return (
              <li key={coin.id} className="border border-line bg-card">
                {href ? (
                  <Link href={href} className="block">
                    {media}
                    {body}
                  </Link>
                ) : (
                  <div>
                    {media}
                    {body}
                  </div>
                )}
                {coin.mintAddress ? (
                  <div className="border-t border-line px-3 py-2">
                    <CopyCa address={coin.mintAddress} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
