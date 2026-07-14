import { NextResponse } from "next/server";
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness/readiness probe for Railway. Never touches the DB hard-path so it
 *  stays green during brief DB blips; reports config presence for diagnostics. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "engosoft-chatwoot-analytics",
    time: new Date().toISOString(),
    config: {
      chatwoot: Boolean(env.chatwootBaseUrl() && env.chatwootApiToken()),
      database: Boolean(env.databaseUrl()),
      campaignSales: Boolean(env.campaignSalesUrl()),
      campaignOperations: Boolean(env.campaignOperationsUrl()),
      webhookSecret: Boolean(env.webhookSecret()),
    },
  });
}
