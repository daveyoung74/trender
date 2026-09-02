import { LoginForm } from "@/components/login-form";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16">
      <p className="text-xs tracking-[0.3em] text-hot uppercase">Trender</p>
      <h1 className="mt-3 text-4xl">The door is shut.</h1>
      {env.sitePassword ? (
        <>
          <p className="mt-3 text-sm text-muted">Enter the site password to see the board and mint.</p>
          <LoginForm nextPath={next} />
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Set <span className="text-fg">SITE_PASSWORD</span> in the server environment, then reload.
        </p>
      )}
    </main>
  );
}
