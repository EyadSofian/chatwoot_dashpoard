export type CampaignSourceKey = "sales" | "operations";

/** Coarse status bucket, mirrors campaignAnalytics.bucketForStatus. */
export function bucketForStatus(status?: string, active = false): string {
  const value = String(status || "").toLowerCase();
  if (active || value === "running") return "running";
  if (value === "queued") return "pending";
  if (value === "completed" || value === "completed_with_errors") return "completed";
  if (value === "failed") return "failed";
  if (value === "stopped" || value === "interrupted") return "stopped";
  return "other";
}
