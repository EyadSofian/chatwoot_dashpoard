import { describe, it, expect } from "vitest";
import { buildResolutionSegments, totalResolvedDurationSeconds } from "@/lib/metrics/resolution";

const d = (iso: string) => new Date(iso);

describe("conversation duration / reopen segments", () => {
  it("computes one segment for a simple open → resolved", () => {
    const segments = buildResolutionSegments(d("2026-07-01T09:00:00Z"), [
      { type: "resolved", at: d("2026-07-01T10:00:00Z") },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.durationSeconds).toBe(3600);
    expect(totalResolvedDurationSeconds(segments)).toBe(3600);
  });

  it("creates a new segment when resolved then reopened then resolved", () => {
    const segments = buildResolutionSegments(d("2026-07-01T09:00:00Z"), [
      { type: "resolved", at: d("2026-07-01T10:00:00Z") },
      { type: "reopened", at: d("2026-07-01T11:00:00Z") },
      { type: "resolved", at: d("2026-07-01T11:30:00Z") },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.durationSeconds).toBe(3600); // 09:00 → 10:00
    expect(segments[1]!.durationSeconds).toBe(1800); // 11:00 → 11:30
    expect(totalResolvedDurationSeconds(segments)).toBe(5400);
  });

  it("leaves the trailing segment open (no duration) when unresolved", () => {
    const segments = buildResolutionSegments(d("2026-07-01T09:00:00Z"), [
      { type: "resolved", at: d("2026-07-01T10:00:00Z") },
      { type: "reopened", at: d("2026-07-01T11:00:00Z") },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[1]!.resolvedAt).toBeNull();
    expect(segments[1]!.durationSeconds).toBeNull();
    expect(totalResolvedDurationSeconds(segments)).toBe(3600); // only the resolved segment counts
  });

  it("returns a single open segment when never resolved", () => {
    const segments = buildResolutionSegments(d("2026-07-01T09:00:00Z"), []);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.resolvedAt).toBeNull();
    expect(totalResolvedDurationSeconds(segments)).toBeNull();
  });
});
