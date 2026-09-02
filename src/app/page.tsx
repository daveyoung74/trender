import Link from "next/link";
import { listBoardLaunches } from "@/server/launch";
import { pumpUrl } from "@/server/views";

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
        <p className="text-xs tracking-[0.3em] text-hot uppercase">Trender</p>
        <h1 className="mt-3 text-5xl text-fg">Coins from the timeline.</h1>
        <p className="mt-3 max-w-xl text-sm text-muted">
          GrokBot seeds a prompt or a post. Trender invents the coin, the picture, and the copy, then
          the treasury mints it on Pump.fun. Proposed coins are dry runs — live ones are on-chain.
        </p>
      </header>
      {coins.length === 0 ? (
        <p className="text-sm text-muted">Nothing on the board yet. Hit POST /v1/launch.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coins.map((coin) => {
            const proposed = coin.status === "ready";
            const href = coin.ticker ? `/c/${coin.ticker}` : pumpUrl(coin.mintAddress) ?? "#";
            return (
              <li key={coin.id} className="border border-line bg-card">
                <Link href={href} className="block">
                  {coin.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coin.imageUrl} alt={coin.name ?? coin.ticker ?? "coin"} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-hot">${coin.ticker}</div>
                  )}
                  <div className="p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-hot">${coin.ticker}</p>
                      <p className="text-[10px] uppercase tracking-widest text-muted">
                        {proposed ? "Proposed" : "Live"}
                      </p>
                    </div>
                    <p className="mt-1 text-lg">{coin.name}</p>
                    {coin.description ? (
                      <p className="mt-2 line-clamp-3 text-xs text-muted">{coin.description}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
