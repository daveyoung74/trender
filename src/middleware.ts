import { NextResponse, type NextRequest } from "next/server";
import {
  GATE_COOKIE,
  gateSecret,
  readCookie,
  safeNextPath,
  sitePasswordFromEnv,
  verifyGateToken,
} from "@/server/site-gate";

function isOpenPath(pathname: string) {
  if (pathname === "/login") return true;
  if (pathname === "/api/login" || pathname === "/api/logout") return true;
  if (pathname.startsWith("/api/v1/") || pathname === "/api/v1") return true;
  if (pathname.startsWith("/v1/") || pathname === "/v1") return true;
  if (pathname.startsWith("/api/media/")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isOpenPath(pathname)) {
    if (pathname === "/login") {
      const secret = gateSecret();
      const password = sitePasswordFromEnv();
      const token = readCookie(req.headers.get("cookie"), GATE_COOKIE);
      if (password && secret && token && (await verifyGateToken(secret, token))) {
        return NextResponse.redirect(new URL(safeNextPath(req.nextUrl.searchParams.get("next")), req.url));
      }
    }
    return NextResponse.next();
  }

  const password = sitePasswordFromEnv();
  const secret = gateSecret();
  const token = readCookie(req.headers.get("cookie"), GATE_COOKIE);
  if (password && secret && token && (await verifyGateToken(secret, token))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: password ? "Sign in required" : "SITE_PASSWORD is not set" }, { status: password ? 401 : 503 });
  }

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  const dest = `${pathname}${req.nextUrl.search}`;
  if (dest && dest !== "/") login.searchParams.set("next", dest);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
