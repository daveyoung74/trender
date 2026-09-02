import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-24">
      <p className="text-xs tracking-[0.3em] text-hot uppercase">Trender</p>
      <h1 className="mt-4 text-4xl">Not on the board.</h1>
      <p className="mt-4 text-sm text-muted">That coin is not here.</p>
      <Link href="/" className="mt-8 inline-block border border-line px-4 py-2 text-sm">
        Back
      </Link>
    </main>
  );
}
