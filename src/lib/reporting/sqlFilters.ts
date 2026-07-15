import { Prisma } from "@prisma/client";
import type { ReportFilters } from "./filters";

interface SqlFilterOptions {
  alias?: string;
  ignoreDate?: boolean;
  ignoreAgent?: boolean;
  ignoreTeam?: boolean;
  dateField?: "createdAtCw" | "resolvedAt";
}

/**
 * SQL equivalent of `conversationWhere` for aggregate reports.
 *
 * Prisma's `findMany` API is excellent for paginated rows, but analytics must
 * aggregate in PostgreSQL. Loading an arbitrary number of conversations into
 * Node and stopping at a magic `take` value made the dashboard both inaccurate
 * and memory-bound. This helper keeps one filter contract for the SQL reports.
 * Identifiers are selected only from the closed set below; user input is always
 * passed as a bound value.
 */
export function conversationSqlConditions(
  f: ReportFilters,
  opts: SqlFilterOptions = {},
): Prisma.Sql[] {
  const alias = opts.alias ?? "c";
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Unsafe SQL alias");

  const col = (name: string) => Prisma.raw(`${alias}."${name}"`);
  const conditions: Prisma.Sql[] = [];

  if (!opts.ignoreDate) {
    const field = opts.dateField ?? "createdAtCw";
    conditions.push(Prisma.sql`${col(field)} >= ${f.from}`);
    conditions.push(Prisma.sql`${col(field)} <= ${f.to}`);
  }

  if (f.department?.length) conditions.push(Prisma.sql`${col("department")} IN (${Prisma.join(f.department)})`);
  if (!opts.ignoreTeam && f.teamId?.length) conditions.push(Prisma.sql`${col("teamCwId")} IN (${Prisma.join(f.teamId)})`);
  if (!opts.ignoreAgent && f.agentId?.length) conditions.push(Prisma.sql`${col("assigneeCwId")} IN (${Prisma.join(f.agentId)})`);
  if (f.inboxId?.length) conditions.push(Prisma.sql`${col("inboxCwId")} IN (${Prisma.join(f.inboxId)})`);
  if (f.status?.length) conditions.push(Prisma.sql`${col("status")} IN (${Prisma.join(f.status)})`);

  if (f.campaignSource?.length) {
    conditions.push(Prisma.sql`${col("isCampaign")} = TRUE`);
    conditions.push(Prisma.sql`${col("campaignSource")} IN (${Prisma.join(f.campaignSource)})`);
  }
  if (f.campaignLabel?.length) conditions.push(Prisma.sql`${col("campaignLabel")} IN (${Prisma.join(f.campaignLabel)})`);
  if (f.label?.length) {
    conditions.push(Prisma.sql`${col("labels")} && ARRAY[${Prisma.join(f.label)}]::text[]`);
  }
  if (f.needsReply) conditions.push(Prisma.sql`${col("needsReply")} = TRUE`);
  if (f.sla?.length) conditions.push(Prisma.sql`${col("slaFirstResponseState")} IN (${Prisma.join(f.sla)})`);

  if (f.search) {
    const contains = `%${f.search}%`;
    const id = Number(f.search);
    const idClause = Number.isFinite(id) ? Prisma.sql` OR ${col("chatwootId")} = ${id}` : Prisma.empty;
    conditions.push(
      Prisma.sql`(${col("contactName")} ILIKE ${contains} OR ${col("contactPhone")} ILIKE ${contains}${idClause})`,
    );
  }

  return conditions;
}

export function andSql(conditions: Prisma.Sql[]): Prisma.Sql {
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

