import { NextResponse } from "next/server";
import { z } from "zod";
import { checkCredentials, createSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "أدخل اسم المستخدم وكلمة المرور" }, { status: 400 });

  const { username, password } = parsed.data;
  if (!checkCredentials(username, password)) {
    return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  const token = await createSessionToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
