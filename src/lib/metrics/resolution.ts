import { secondsBetween } from "@/lib/time";

export type StatusEventType = "created" | "open" | "reopened" | "resolved" | "snoozed";

export interface StatusEvent {
  type: StatusEventType;
  at: Date;
}

export interface ResolutionSegment {
  segmentIndex: number;
  openedAt: Date;
  resolvedAt: Date | null;
  durationSeconds: number | null;
}

/**
 * Split a conversation lifecycle into open→resolved segments. A resolve closes
 * the current segment; a reopen (or a fresh "open" after a resolve) starts a
 * new one. An unresolved trailing segment has `resolvedAt: null` and no
 * duration (it is still running).
 */
export function buildResolutionSegments(createdAt: Date, events: StatusEvent[]): ResolutionSegment[] {
  const sorted = [...events]
    .filter((e) => e.type === "resolved" || e.type === "reopened" || e.type === "open")
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const segments: ResolutionSegment[] = [];
  let openAt: Date | null = createdAt;
  let index = 0;

  for (const evt of sorted) {
    if (evt.type === "resolved") {
      if (openAt && evt.at.getTime() >= openAt.getTime()) {
        segments.push({
          segmentIndex: index++,
          openedAt: openAt,
          resolvedAt: evt.at,
          durationSeconds: secondsBetween(openAt, evt.at),
        });
        openAt = null;
      }
    } else {
      // open / reopened
      if (openAt === null) openAt = evt.at;
    }
  }

  if (openAt !== null) {
    segments.push({ segmentIndex: index++, openedAt: openAt, resolvedAt: null, durationSeconds: null });
  }

  return segments;
}

export function totalResolvedDurationSeconds(segments: ResolutionSegment[]): number | null {
  const resolved = segments.filter((s) => s.resolvedAt && s.durationSeconds !== null);
  if (!resolved.length) return null;
  return resolved.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
}
