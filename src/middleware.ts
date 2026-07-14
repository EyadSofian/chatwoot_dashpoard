import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * The dashboard is OPEN by default — no login screen.
 *
 * Set AUTH_ENABLED=true to put the gate back (the login page and the session
 * cookie machinery are still here, just bypassed). Do that before exposing this
 * to the public internet: the reports show customer names and phone numbers.
 */
const authEnabled = () => process.env.AUTH_ENABLED === "true";

/** Endpoints that authenticate themselves and must never hit the session gate. */
const PUBLIC_API = ["/api/health", "/api/webhooks/", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Auth off → the login page is dead weight; send anyone who lands there home.
  if (!authEnabled()) {
    if (pathname === "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (pathname === "/login") return NextResponse.next();
    if (pathname.startsWith("/api")) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  // Already signed in → keep the login page out of the way.
  if (pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
