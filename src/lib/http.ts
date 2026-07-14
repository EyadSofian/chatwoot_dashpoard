import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { verifySessionToken, type SessionPayload } from "@/lib/auth";
import { env } from "@/env";

/** Reads + verifies the session cookie (server components / route handlers). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** For API routes: returns session or a 401 JSON response to return early. */
export async function requireSession(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "غير مصرح" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}

/** Cron/scheduler auth via `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(request: Request): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

/** Session OR cron-secret — used by sync endpoints that a scheduler may call. */
export async function requireSessionOrCron(
  request: Request,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (isCronAuthorized(request)) return { ok: true };
  const session = await getSession();
  if (session) return { ok: true };
  return { ok: false, response: NextResponse.json({ error: "غير مصرح" }, { status: 401 }) };
}

export function badRequest(message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, details: details ?? null }, { status: 400 });
}

export function serverError(message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, details: details ?? null }, { status: 500 });
}
