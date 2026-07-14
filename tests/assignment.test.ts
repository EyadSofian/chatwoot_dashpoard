import { describe, it, expect } from "vitest";
import { buildAssignmentIntervals, firstResponseFromAssignment } from "@/lib/metrics/assignment";

const d = (iso: string) => new Date(iso);

describe("response time from assignment", () => {
  it("measures assignment → first public reply by the same agent", () => {
    const intervals = buildAssignmentIntervals(
      [{ assigneeId: 10, at: d("2026-07-01T10:00:00Z") }],
      [{ senderId: 10, at: d("2026-07-01T10:05:00Z") }],
      d("2026-07-01T12:00:00Z"),
    );
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.responseSeconds).toBe(300);
    expect(intervals[0]!.responded).toBe(true);

    const first = firstResponseFromAssignment(intervals);
    expect(first.responseSeconds).toBe(300);
    expect(first.assigneeId).toBe(10);
  });

  it("does not count a reply from a different agent", () => {
    const intervals = buildAssignmentIntervals(
      [{ assigneeId: 10, at: d("2026-07-01T10:00:00Z") }],
      [{ senderId: 99, at: d("2026-07-01T10:05:00Z") }],
      d("2026-07-01T12:00:00Z"),
    );
    expect(intervals[0]!.responded).toBe(false);
    expect(intervals[0]!.responseSeconds).toBeNull();
  });

  it("opens a new interval on reassignment and measures each independently", () => {
    const intervals = buildAssignmentIntervals(
      [
        { assigneeId: 10, at: d("2026-07-01T10:00:00Z") },
        { assigneeId: 20, at: d("2026-07-01T10:30:00Z") },
      ],
      [{ senderId: 20, at: d("2026-07-01T10:40:00Z") }],
      d("2026-07-01T12:00:00Z"),
    );
    expect(intervals).toHaveLength(2);
    expect(intervals[0]!.responded).toBe(false); // agent 10 never replied
    expect(intervals[1]!.responseSeconds).toBe(600); // agent 20 replied 10 min later

    const first = firstResponseFromAssignment(intervals);
    expect(first.assigneeId).toBe(20);
    expect(first.responseSeconds).toBe(600);
  });

  it("bounds a reply to before the next reassignment", () => {
    const intervals = buildAssignmentIntervals(
      [
        { assigneeId: 10, at: d("2026-07-01T10:00:00Z") },
        { assigneeId: 20, at: d("2026-07-01T10:30:00Z") },
      ],
      [{ senderId: 10, at: d("2026-07-01T10:45:00Z") }], // after the handoff → not attributed to interval 0
      d("2026-07-01T12:00:00Z"),
    );
    expect(intervals[0]!.responded).toBe(false);
  });

  it("returns nulls when assigned but never replied", () => {
    const intervals = buildAssignmentIntervals(
      [{ assigneeId: 10, at: d("2026-07-01T10:00:00Z") }],
      [],
      d("2026-07-01T12:00:00Z"),
    );
    const first = firstResponseFromAssignment(intervals);
    expect(first.assignedAt).not.toBeNull();
    expect(first.responseSeconds).toBeNull();
  });
});
