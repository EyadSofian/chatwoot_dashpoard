import { describe, it, expect } from "vitest";
import {
  buildTeamsReport,
  buildTeamMembers,
  NO_TEAM_ID,
  type Membership,
  type TeamConversation,
  type TeamRecord,
  type AgentRecord,
} from "@/lib/reporting/teams";
import { resolveConversationTeam, membershipIndex, membersByTeam } from "@/lib/metrics/teamAttribution";

/* ─────────────────────────────────────────────────────────────────────────────
   Sales (4) and Operations (3). Mona sits in BOTH — she is the reason team
   attribution can never lean on membership alone.
   ───────────────────────────────────────────────────────────────────────────── */
const TEAMS: TeamRecord[] = [
  { id: 4, name: "Sales", department: "sales" },
  { id: 3, name: "Operations", department: "operations" },
  { id: 9, name: "Complaints", department: "complaints" }, // never touched
];

const MEMBERSHIPS: Membership[] = [
  { teamCwId: 4, agentCwId: 10 }, // Mona — Sales
  { teamCwId: 3, agentCwId: 10 }, // Mona — Operations too
  { teamCwId: 4, agentCwId: 20 }, // Ahmed — Sales only
  { teamCwId: 3, agentCwId: 30 }, // Sara  — Operations only
  { teamCwId: 9, agentCwId: 40 }, // Nour  — Complaints only, no activity
];

const AGENTS: AgentRecord[] = [
  { id: 10, name: "منى", email: "mona@x.com", availability: "online" },
  { id: 20, name: "أحمد", email: "ahmed@x.com", availability: "offline" },
  { id: 30, name: "سارة", email: "sara@x.com", availability: "offline" },
  { id: 40, name: "نورهان", email: "nour@x.com", availability: "offline" },
];

let nextId = 1000;
function conv(over: Partial<TeamConversation> = {}): TeamConversation {
  return {
    chatwootId: nextId++,
    teamCwId: null,
    assigneeCwId: null,
    status: "open",
    needsReply: false,
    handledByHuman: true,
    unreadCount: 0,
    responseSeconds: null,
    conversationDurationSeconds: null,
    slaFirstResponseBreached: false,
    isCampaign: false,
    botInvolved: false,
    lastMessageAt: null,
    ...over,
  };
}

const report = (conversations: TeamConversation[], opts: { activeOnly?: boolean } = {}) =>
  buildTeamsReport({ teams: TEAMS, memberships: MEMBERSHIPS, conversations, ...opts });

describe("team attribution", () => {
  const byAgent = membershipIndex(MEMBERSHIPS);

  it("prefers the conversation's own team over everything else", () => {
    const r = resolveConversationTeam({
      conversationTeamCwId: 4,
      assignmentTeamCwId: 3,
      assigneeCwId: 10,
      membershipsByAgent: byAgent,
    });
    expect(r).toEqual({ teamCwId: 4, source: "conversation", ambiguous: false });
  });

  it("falls back to the assignment-time team when the conversation has none", () => {
    const r = resolveConversationTeam({
      conversationTeamCwId: null,
      assignmentTeamCwId: 3,
      assigneeCwId: 10,
      membershipsByAgent: byAgent,
    });
    expect(r).toEqual({ teamCwId: 3, source: "assignment", ambiguous: false });
  });

  it("uses membership only when the agent belongs to exactly one team", () => {
    const r = resolveConversationTeam({
      conversationTeamCwId: null,
      assigneeCwId: 20, // Ahmed → Sales only
      membershipsByAgent: byAgent,
    });
    expect(r).toEqual({ teamCwId: 4, source: "membership", ambiguous: false });
  });

  it("refuses to guess when the agent sits in several teams", () => {
    const r = resolveConversationTeam({
      conversationTeamCwId: null,
      assigneeCwId: 10, // Mona → Sales AND Operations
      membershipsByAgent: byAgent,
    });
    // Counting her under both would inflate both teams. Better unattributed.
    expect(r.teamCwId).toBeNull();
    expect(r.source).toBe("none");
    expect(r.ambiguous).toBe(true);
  });

  it("leaves an unassigned, un-teamed conversation unattributed", () => {
    const r = resolveConversationTeam({
      conversationTeamCwId: null,
      assigneeCwId: null,
      membershipsByAgent: byAgent,
    });
    expect(r).toEqual({ teamCwId: null, source: "none", ambiguous: false });
  });

  it("indexes memberships both ways", () => {
    expect(membershipIndex(MEMBERSHIPS).get(10)).toEqual([4, 3]);
    expect(membersByTeam(MEMBERSHIPS).get(4)).toEqual([10, 20]);
  });
});

describe("teams report — every team, always", () => {
  it("includes a team with no conversations, at zero", () => {
    const { rows } = report([conv({ teamCwId: 4, assigneeCwId: 20 })]);

    expect(rows.map((r) => r.teamCwId).sort((a, b) => a - b)).toEqual([3, 4, 9]);

    const idle = rows.find((r) => r.teamCwId === 9)!;
    expect(idle.hasActivity).toBe(false);
    expect(idle.conversations).toBe(0);
    expect(idle.open).toBe(0);
    expect(idle.resolved).toBe(0);
    expect(idle.needsReply).toBe(0);
    expect(idle.slaBreaches).toBe(0);
    expect(idle.avgResponseSeconds).toBeNull();
    expect(idle.medianResponseSeconds).toBeNull();
    expect(idle.maxResponseSeconds).toBeNull();
    // The roster still knows its size even with nothing to show for the period.
    expect(idle.memberCount).toBe(1);
  });

  it("keeps every team when the period is completely empty", () => {
    const { rows, summary } = report([]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.hasActivity && r.conversations === 0)).toBe(true);
    expect(summary.totalTeams).toBe(3);
    expect(summary.activeTeams).toBe(0);
    expect(summary.avgResponseSeconds).toBeNull();
  });

  it("hides idle teams only when activeOnly is on", () => {
    const conversations = [conv({ teamCwId: 4, assigneeCwId: 20 }), conv({ teamCwId: 3, assigneeCwId: 30 })];

    expect(report(conversations).rows).toHaveLength(3);

    const filtered = report(conversations, { activeOnly: true });
    expect(filtered.rows.map((r) => r.teamCwId).sort((a, b) => a - b)).toEqual([3, 4]);
    // The toggle hides rows; it does not rewrite the summary.
    expect(filtered.summary.totalTeams).toBe(3);
    expect(filtered.summary.activeTeams).toBe(2);
  });

  it("does not double count an agent who belongs to two teams", () => {
    // Both of Mona's conversations carry a real team — one each.
    const { rows, summary, attribution } = report([
      conv({ teamCwId: 4, assigneeCwId: 10 }),
      conv({ teamCwId: 3, assigneeCwId: 10 }),
    ]);

    expect(rows.find((r) => r.teamCwId === 4)!.conversations).toBe(1);
    expect(rows.find((r) => r.teamCwId === 3)!.conversations).toBe(1);

    // Team totals must sum to the real conversation count, not double it.
    const total = rows.reduce((sum, r) => sum + r.conversations, 0);
    expect(total).toBe(2);
    expect(summary.conversations).toBe(2);
    expect(attribution.conversation).toBe(2);
    expect(attribution.membership).toBe(0);
  });

  it("parks an ambiguous multi-team conversation in غير محدد rather than guessing", () => {
    const { rows, attribution } = report([conv({ teamCwId: null, assigneeCwId: 10 })]);

    expect(rows.find((r) => r.teamCwId === 4)!.conversations).toBe(0);
    expect(rows.find((r) => r.teamCwId === 3)!.conversations).toBe(0);

    const unattributed = rows.find((r) => r.teamCwId === NO_TEAM_ID)!;
    expect(unattributed.conversations).toBe(1);
    expect(attribution.none).toBe(1);
  });

  it("uses membership fallback ONLY when the conversation has no team", () => {
    const { rows, attribution } = report([
      conv({ teamCwId: null, assigneeCwId: 20 }), // Ahmed, Sales-only → fallback
      conv({ teamCwId: 3, assigneeCwId: 20 }), // has a team → team wins over membership
    ]);

    expect(rows.find((r) => r.teamCwId === 4)!.conversations).toBe(1); // the fallback one
    expect(rows.find((r) => r.teamCwId === 3)!.conversations).toBe(1); // the explicit one
    expect(attribution.membership).toBe(1);
    expect(attribution.conversation).toBe(1);
  });

  it("prefers the assignment-time team over membership", () => {
    const c = conv({ chatwootId: 777, teamCwId: null, assigneeCwId: 20 }); // Ahmed → Sales by membership
    const { rows, attribution } = buildTeamsReport({
      teams: TEAMS,
      memberships: MEMBERSHIPS,
      conversations: [c],
      assignmentTeamByConversation: new Map([[777, 3]]), // but it was assigned inside Operations
    });

    expect(rows.find((r) => r.teamCwId === 3)!.conversations).toBe(1);
    expect(rows.find((r) => r.teamCwId === 4)!.conversations).toBe(0);
    expect(attribution.assignment).toBe(1);
  });

  it("aggregates the full metric set for a team", () => {
    const { rows, summary } = report([
      conv({
        teamCwId: 4,
        assigneeCwId: 20,
        status: "open",
        needsReply: true,
        unreadCount: 2,
        responseSeconds: 100,
        slaFirstResponseBreached: true,
        isCampaign: true,
        botInvolved: true,
        lastMessageAt: new Date("2026-07-10T10:00:00Z"),
      }),
      conv({
        teamCwId: 4,
        assigneeCwId: 10,
        status: "resolved",
        responseSeconds: 300,
        conversationDurationSeconds: 3600,
        lastMessageAt: new Date("2026-07-12T10:00:00Z"),
      }),
      conv({ teamCwId: 4, assigneeCwId: 20, status: "pending", handledByHuman: false, responseSeconds: 500 }),
    ]);

    const sales = rows.find((r) => r.teamCwId === 4)!;
    expect(sales.conversations).toBe(3);
    expect(sales.open).toBe(1);
    expect(sales.pending).toBe(1);
    expect(sales.resolved).toBe(1);
    expect(sales.replied).toBe(2);
    expect(sales.needsReply).toBe(1);
    expect(sales.unread).toBe(1);
    expect(sales.slaBreaches).toBe(1);
    expect(sales.campaignReplies).toBe(1);
    expect(sales.botHandoffs).toBe(1);
    expect(sales.avgResponseSeconds).toBe(300); // (100+300+500)/3
    expect(sales.medianResponseSeconds).toBe(300);
    expect(sales.maxResponseSeconds).toBe(500);
    expect(sales.avgResolutionSeconds).toBe(3600);
    expect(sales.activeMembers).toBe(2); // Ahmed + Mona
    expect(sales.memberCount).toBe(2);
    expect(sales.lastActivityAt).toEqual(new Date("2026-07-12T10:00:00Z"));

    expect(summary.slaBreaches).toBe(1);
    expect(summary.needsReply).toBe(1);
  });

  it("sorts busiest first and drops غير محدد to the bottom", () => {
    const { rows } = report([
      conv({ teamCwId: null, assigneeCwId: 10 }), // ambiguous → غير محدد
      conv({ teamCwId: 3, assigneeCwId: 30 }),
      conv({ teamCwId: 3, assigneeCwId: 30 }),
      conv({ teamCwId: 4, assigneeCwId: 20 }),
    ]);

    expect(rows.map((r) => r.teamCwId)).toEqual([3, 4, 9, NO_TEAM_ID]);
  });
});

describe("team members — every member, always", () => {
  const salesMembers = membersByTeam(MEMBERSHIPS).get(4)!; // [10, 20]

  it("includes a member with no conversations, at zero", () => {
    const rows = buildTeamMembers({
      memberIds: salesMembers,
      agents: AGENTS,
      conversations: [conv({ teamCwId: 4, assigneeCwId: 20, responseSeconds: 120 })],
    });

    expect(rows.map((r) => r.agentId).sort((a, b) => a - b)).toEqual([10, 20]);

    const idle = rows.find((r) => r.agentId === 10)!; // Mona did nothing in Sales
    expect(idle.hasActivity).toBe(false);
    expect(idle.assigned).toBe(0);
    expect(idle.replied).toBe(0);
    expect(idle.openLoad).toBe(0);
    expect(idle.avgResponseSeconds).toBeNull();
    expect(idle.lastActivityAt).toBeNull();
  });

  it("scopes a multi-team agent's numbers to THIS team only", () => {
    // Mona worked one conversation in Sales; her Operations work is not passed in.
    const rows = buildTeamMembers({
      memberIds: salesMembers,
      agents: AGENTS,
      conversations: [
        conv({ teamCwId: 4, assigneeCwId: 10, responseSeconds: 60 }),
        conv({ teamCwId: 4, assigneeCwId: 20, responseSeconds: 240 }),
      ],
    });

    const mona = rows.find((r) => r.agentId === 10)!;
    expect(mona.assigned).toBe(1);
    expect(mona.avgResponseSeconds).toBe(60);
  });

  it("still reports someone who worked the team but is no longer a member", () => {
    const rows = buildTeamMembers({
      memberIds: salesMembers,
      agents: AGENTS,
      conversations: [conv({ teamCwId: 4, assigneeCwId: 99 })],
    });

    expect(rows.find((r) => r.agentId === 99)).toBeDefined();
  });

  it("hides idle members only when activeOnly is on", () => {
    const conversations = [conv({ teamCwId: 4, assigneeCwId: 20 })];

    expect(buildTeamMembers({ memberIds: salesMembers, agents: AGENTS, conversations })).toHaveLength(2);
    expect(
      buildTeamMembers({ memberIds: salesMembers, agents: AGENTS, conversations, activeOnly: true }),
    ).toHaveLength(1);
  });

  it("tracks the open load and last activity per member", () => {
    const rows = buildTeamMembers({
      memberIds: salesMembers,
      agents: AGENTS,
      conversations: [
        conv({ teamCwId: 4, assigneeCwId: 20, status: "open", lastMessageAt: new Date("2026-07-01T09:00:00Z") }),
        conv({ teamCwId: 4, assigneeCwId: 20, status: "open", lastMessageAt: new Date("2026-07-05T09:00:00Z") }),
        conv({ teamCwId: 4, assigneeCwId: 20, status: "resolved", slaFirstResponseBreached: true }),
      ],
    });

    const ahmed = rows.find((r) => r.agentId === 20)!;
    expect(ahmed.assigned).toBe(3);
    expect(ahmed.open).toBe(2);
    expect(ahmed.openLoad).toBe(2);
    expect(ahmed.resolved).toBe(1);
    expect(ahmed.slaBreaches).toBe(1);
    expect(ahmed.lastActivityAt).toEqual(new Date("2026-07-05T09:00:00Z"));
  });
});

describe("the date range changes the numbers, never the roster", () => {
  it("shows the same teams and members whether the window is busy or empty", () => {
    // Two windows, same roster: one with traffic, one without.
    const busy = report([conv({ teamCwId: 4, assigneeCwId: 20, responseSeconds: 60 })]);
    const quiet = report([]);

    expect(busy.rows.map((r) => r.teamCwId).sort((a, b) => a - b)).toEqual(
      quiet.rows.map((r) => r.teamCwId).sort((a, b) => a - b),
    );

    const membersBusy = buildTeamMembers({
      memberIds: membersByTeam(MEMBERSHIPS).get(4)!,
      agents: AGENTS,
      conversations: [conv({ teamCwId: 4, assigneeCwId: 20 })],
    });
    const membersQuiet = buildTeamMembers({
      memberIds: membersByTeam(MEMBERSHIPS).get(4)!,
      agents: AGENTS,
      conversations: [],
    });

    expect(membersBusy.map((m) => m.agentId).sort()).toEqual(membersQuiet.map((m) => m.agentId).sort());
    // Only the metrics moved.
    expect(membersQuiet.every((m) => m.assigned === 0 && m.avgResponseSeconds === null)).toBe(true);
  });
});
