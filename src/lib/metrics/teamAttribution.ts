/**
 * Which team does a conversation belong to?
 *
 * An agent can sit in several teams at once, so "count everything this agent
 * touched under every team they belong to" would inflate every team's numbers
 * and make the totals sum to more than reality. Membership is therefore the
 * LAST resort, never the first:
 *
 *   1. the conversation's own team          — what Chatwoot actually says today
 *   2. the team it sat in when assigned     — preserved on the assignment interval,
 *                                             so history survives a later re-team
 *   3. the assignee's single team           — only when they belong to exactly one
 *
 * If the assignee belongs to several teams and nothing else tells us which one,
 * the conversation is left unattributed rather than guessed at. A conversation
 * counted in the wrong team is worse than one counted in none — the first is a
 * silent lie, the second is visible as "غير محدد".
 */

export type TeamAttributionSource = "conversation" | "assignment" | "membership" | "none";

export interface TeamAttributionInput {
  /** Conversation.teamCwId — Chatwoot's current answer. */
  conversationTeamCwId: number | null | undefined;
  /** AssignmentInterval.teamCwId — the team at assignment time. */
  assignmentTeamCwId?: number | null;
  assigneeCwId: number | null | undefined;
  /** agent id → every team they belong to. */
  membershipsByAgent: ReadonlyMap<number, readonly number[]>;
}

export interface TeamAttribution {
  teamCwId: number | null;
  source: TeamAttributionSource;
  /** True when membership was ambiguous (agent in 2+ teams, nothing else to go on). */
  ambiguous: boolean;
}

export function resolveConversationTeam(input: TeamAttributionInput): TeamAttribution {
  const { conversationTeamCwId, assignmentTeamCwId, assigneeCwId, membershipsByAgent } = input;

  if (typeof conversationTeamCwId === "number") {
    return { teamCwId: conversationTeamCwId, source: "conversation", ambiguous: false };
  }

  if (typeof assignmentTeamCwId === "number") {
    return { teamCwId: assignmentTeamCwId, source: "assignment", ambiguous: false };
  }

  if (typeof assigneeCwId === "number") {
    const teams = membershipsByAgent.get(assigneeCwId) ?? [];
    // Exactly one team ⇒ unambiguous. Two or more ⇒ we genuinely do not know.
    if (teams.length === 1) {
      return { teamCwId: teams[0]!, source: "membership", ambiguous: false };
    }
    if (teams.length > 1) {
      return { teamCwId: null, source: "none", ambiguous: true };
    }
  }

  return { teamCwId: null, source: "none", ambiguous: false };
}

/** Rows of (teamCwId, agentCwId) → agent id → team ids. */
export function membershipIndex(
  rows: readonly { teamCwId: number; agentCwId: number }[],
): Map<number, number[]> {
  const byAgent = new Map<number, number[]>();
  for (const r of rows) {
    const list = byAgent.get(r.agentCwId) ?? [];
    if (!list.includes(r.teamCwId)) list.push(r.teamCwId);
    byAgent.set(r.agentCwId, list);
  }
  return byAgent;
}

/** Rows of (teamCwId, agentCwId) → team id → agent ids. */
export function membersByTeam(
  rows: readonly { teamCwId: number; agentCwId: number }[],
): Map<number, number[]> {
  const byTeam = new Map<number, number[]>();
  for (const r of rows) {
    const list = byTeam.get(r.teamCwId) ?? [];
    if (!list.includes(r.agentCwId)) list.push(r.agentCwId);
    byTeam.set(r.teamCwId, list);
  }
  return byTeam;
}
