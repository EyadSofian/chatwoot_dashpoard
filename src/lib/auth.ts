import { SignJWT, jwtVerify } from "jose";
import { env } from "@/env";

const ALG = "HS256";
const ISSUER = "engosoft-analytics";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret());
}

export interface SessionPayload {
  sub: string; // username
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER });
    if (!payload.sub) return null;
    return { sub: String(payload.sub) };
  } catch {
    return null;
  }
}

/** Constant-time-ish credential check against APP_USERNAME/APP_PASSWORD. */
export function checkCredentials(username: string, password: string): boolean {
  const expectedUser = env.appUsername();
  const expectedPass = env.appPassword();
  if (!expectedPass) return false; // refuse login when no password configured
  const userOk = safeEqual(username, expectedUser);
  const passOk = safeEqual(password, expectedPass);
  return userOk && passOk;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // still compare to avoid trivial length leak, but result is false
    let acc = 1;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      acc |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
