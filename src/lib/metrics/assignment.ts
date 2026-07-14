import { secondsBetween } from "@/lib/time";

export interface AssignEvent {
  assigneeId: number | null;
  at: Date;
}

export interface HumanReplyPoint {
  senderId: number | null;
  at: Date;
}

export interface AssignmentIntervalResult {
  assigneeId: number;
  startedAt: Date;
  endedAt: Date | null;
  firstReplyAt: Date | null;
  responseSeconds: number | null;
  responded: boolean;
}

/**
 * Build one interval per human-agent assignment. A reassignment (the next
 * assignment event) closes the previous interval and opens a new one. The
 * response for an interval is the first public human reply BY THE SAME AGENT
 * after the assignment, bounded by the next assignment (or the conversation end).
 */
export function buildAssignmentIntervals(
  events: AssignEvent[],
  replies: HumanReplyPoint[],
  endBoundary: Date,
): AssignmentIntervalResult[] {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const sortedReplies = [...replies].sort((a, b) => a.at.getTime() - b.at.getTime());
  const intervals: AssignmentIntervalResult[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const evt = sorted[i];
    if (!evt || evt.assigneeId === null) continue; // unassignment / team-only
    const start = evt.at;
    const next = sorted[i + 1]?.at ?? null;
    const end = next ?? endBoundary;

    const firstReply =
      sortedReplies.find(
        (r) =>
          r.senderId === evt.assigneeId &&
          r.at.getTime() >= start.getTime() &&
          r.at.getTime() <= end.getTime(),
      ) ?? null;

    intervals.push({
      assigneeId: evt.assigneeId,
      startedAt: start,
      endedAt: next,
      firstReplyAt: firstReply?.at ?? null,
      responseSeconds: firstReply ? secondsBetween(start, firstReply.at) : null,
      responded: Boolean(firstReply),
    });
  }

  return intervals;
}

/**
 * Conversation-level "response time from assignment": the earliest assignment
 * interval that received a reply defines assignedAt → firstReplyAt. If assigned
 * but never replied, assignedAt is the first assignment and reply is null.
 */
export function firstResponseFromAssignment(intervals: AssignmentIntervalResult[]): {
  assignedAt: Date | null;
  firstReplyAt: Date | null;
  responseSeconds: number | null;
  assigneeId: number | null;
} {
  if (!intervals.length) {
    return { assignedAt: null, firstReplyAt: null, responseSeconds: null, assigneeId: null };
  }
  const responded = intervals.find((i) => i.responded);
  if (responded) {
    return {
      assignedAt: responded.startedAt,
      firstReplyAt: responded.firstReplyAt,
      responseSeconds: responded.responseSeconds,
      assigneeId: responded.assigneeId,
    };
  }
  const first = intervals[0]!;
  return { assignedAt: first.startedAt, firstReplyAt: null, responseSeconds: null, assigneeId: first.assigneeId };
}
