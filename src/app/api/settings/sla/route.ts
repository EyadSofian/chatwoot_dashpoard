import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, badRequest } from "@/lib/http";
import { getSlaSettings, saveSlaSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  firstResponseMinutes: z.number().min(1).max(100000).optional(),
  resolutionHours: z.number().min(0.1).max(100000).optional(),
  nearBreachRatio: z.number().min(0).max(1).optional(),
  businessHours: z
    .object({
      timezone: z.string().min(1).optional(),
      start: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      end: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      days: z.array(z.number().int().min(0).max(6)).optional(),
    })
    .optional(),
});

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getSlaSettings());
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid settings", parsed.error.flatten());
  const saved = await saveSlaSettings(parsed.data);
  return NextResponse.json(saved);
}
