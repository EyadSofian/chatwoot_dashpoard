import { Prisma } from "@prisma/client";
import { env } from "@/env";
import { prisma } from "@/lib/db";
import { requireSession, badRequest } from "@/lib/http";
import { toCsv, csvResponse, streamCsvResponse, type CsvColumn } from "@/lib/csv";
import { parseFilters } from "@/lib/reporting/filters";
import { conversationWhere } from "@/lib/reporting/filters";
import { getAgentLeaderboard } from "@/lib/reporting/agents";
import { getTeams, getTeamMembers, getTeamConversations } from "@/lib/reporting/teams";
import { getLabels } from "@/lib/reporting/labels";
import { getDepartments } from "@/lib/reporting/departments";
import { getCampaigns } from "@/lib/reporting/campaigns";
import { getSla } from "@/lib/reporting/sla";
import { getFahd } from "@/lib/reporting/fahd";
import { DEPARTMENT_LABELS_AR, type Department } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : "");
const depAr = (d: string | null) => (d ? DEPARTMENT_LABELS_AR[d as Department] ?? d : "");

export async function GET(request: Request, ctx: { params: Promise<{ dataset: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const { dataset } = await ctx.params;
  const filters = parseFilters(new URL(request.url).searchParams);
  const base = env.chatwootBaseUrl();
  const account = env.chatwootAccountId();
  const link = (id: number) => (base && account ? `${base}/app/accounts/${account}/conversations/${id}` : "");

  switch (dataset) {
    case "conversations": {
      type Row = Prisma.ConversationGetPayload<object>;
      const columns: CsvColumn<Row>[] = [
        { key: "chatwootId", label: "رقم المحادثة" },
        { key: "contactName", label: "العميل" },
        { key: "contactPhone", label: "الهاتف" },
        { key: "inboxName", label: "القناة" },
        { key: "teamName", label: "الفريق" },
        { key: "department", label: "القسم", format: (r) => depAr(r.department) },
        { key: "assigneeName", label: "الموظف" },
        { key: "status", label: "الحالة" },
        { key: "needsReply", label: "يحتاج رد", format: (r) => (r.needsReply ? "نعم" : "لا") },
        { key: "responseSeconds", label: "زمن الرد (ث)" },
        { key: "conversationDurationSeconds", label: "مدة المحادثة (ث)" },
        { key: "campaignLabel", label: "الكامبين" },
        { key: "botInvolved", label: "تدخل فهد", format: (r) => (r.botInvolved ? "نعم" : "لا") },
        { key: "slaFirstResponseBreached", label: "خرق SLA", format: (r) => (r.slaFirstResponseBreached ? "نعم" : "لا") },
        { key: "assignedAt", label: "وقت الإسناد", format: (r) => iso(r.assignedAt) },
        { key: "firstHumanReplyAt", label: "أول رد بشري", format: (r) => iso(r.firstHumanReplyAt) },
        { key: "resolvedAt", label: "وقت الحل", format: (r) => iso(r.resolvedAt) },
        { key: "createdAtCw", label: "وقت الإنشاء", format: (r) => iso(r.createdAtCw) },
        { key: "link", label: "رابط Chatwoot", format: (r) => link(r.chatwootId) },
      ];
      return streamCsvResponse(iterateConversations(conversationWhere(filters)), columns, "conversations.csv");
    }

    case "agents": {
      // Same roster the screen shows — every agent, zeros included.
      const { rows } = await getAgentLeaderboard(filters);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { key: "name", label: "الموظف" },
        { key: "email", label: "البريد" },
        // Column names state their basis — no bare "Conversations".
        { key: "currentWorkload", label: "الحمل الحالي (الآن)" },
        { key: "currentOpen", label: "مفتوحة الآن" },
        { key: "currentWaiting", label: "منتظرة/مؤجلة الآن" },
        { key: "needsReplyNow", label: "تحتاج رد الآن" },
        { key: "assignedInPeriod", label: "أُسندت في الفترة (فريدة)" },
        { key: "assignmentEvents", label: "أحداث الإسناد في الفترة" },
        { key: "createdInPeriod", label: "أُنشئت في الفترة" },
        { key: "resolvedWhileAssigned", label: "أُغلقت في الفترة" },
        { key: "firstResponsesInPeriod", label: "ردود أولى في الفترة" },
        { key: "avgResponseSeconds", label: "متوسط الرد (ث)" },
        { key: "medianResponseSeconds", label: "وسيط الرد (ث)" },
        { key: "p90ResponseSeconds", label: "p90 (ث)" },
        { key: "maxResponseSeconds", label: "أقصى رد (ث)" },
        { key: "responseCount", label: "عدد الردود" },
        { key: "slaBreaches", label: "خرق SLA" },
      ];
      return csvResponse(toCsv(rows, columns), "agents.csv");
    }

    case "teams": {
      // Every team, zeros included — same roster the screen shows.
      const { rows } = await getTeams(filters);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { key: "name", label: "التيم" },
        { key: "department", label: "القسم", format: (r) => depAr(r.department) },
        { key: "memberCount", label: "عدد الموظفين" },
        { key: "activeMembers", label: "موظفون نشطون" },
        { key: "currentWorkload", label: "الحمل الحالي (الآن)" },
        { key: "conversations", label: "محادثات الفترة" },
        { key: "open", label: "مفتوحة" },
        { key: "pending", label: "منتظرة" },
        { key: "resolved", label: "محلولة" },
        { key: "replied", label: "تم الرد" },
        { key: "needsReply", label: "تحتاج رد" },
        { key: "unread", label: "غير مقروءة" },
        { key: "avgResponseSeconds", label: "متوسط الرد (ث)" },
        { key: "medianResponseSeconds", label: "وسيط الرد (ث)" },
        { key: "maxResponseSeconds", label: "أقصى رد (ث)" },
        { key: "avgResolutionSeconds", label: "متوسط الإغلاق (ث)" },
        { key: "slaBreaches", label: "خرق SLA" },
        { key: "campaignReplies", label: "ردود كامبين" },
        { key: "botHandoffs", label: "تسليمات فهد" },
        { key: "lastActivityAt", label: "آخر نشاط", format: (r) => iso(r.lastActivityAt) },
      ];
      return csvResponse(toCsv(rows, columns), "teams.csv");
    }

    case "team-members": {
      const teamId = Number(new URL(request.url).searchParams.get("teamId"));
      if (!Number.isFinite(teamId)) return badRequest("teamId is required");
      const rows = await getTeamMembers(teamId, filters);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { key: "name", label: "الموظف" },
        { key: "email", label: "البريد" },
        { key: "assigned", label: "مُسند" },
        { key: "replied", label: "تم الرد" },
        { key: "needsReply", label: "تحتاج رد" },
        { key: "open", label: "مفتوحة" },
        { key: "resolved", label: "محلولة" },
        { key: "openLoad", label: "الحمل الحالي" },
        { key: "avgResponseSeconds", label: "متوسط الرد (ث)" },
        { key: "medianResponseSeconds", label: "وسيط الرد (ث)" },
        { key: "maxResponseSeconds", label: "أقصى رد (ث)" },
        { key: "slaBreaches", label: "خرق SLA" },
        { key: "lastActivityAt", label: "آخر نشاط", format: (r) => iso(r.lastActivityAt) },
      ];
      return csvResponse(toCsv(rows, columns), `team-${teamId}-members.csv`);
    }

    case "team-conversations": {
      const params = new URL(request.url).searchParams;
      const teamId = Number(params.get("teamId"));
      if (!Number.isFinite(teamId)) return badRequest("teamId is required");
      const memberIdValue = Number(params.get("memberId"));
      const memberId = Number.isFinite(memberIdValue) && memberIdValue > 0 ? memberIdValue : undefined;
      const first = await getTeamConversations(teamId, filters, 1, 200, memberId);
      const columns: CsvColumn<(typeof first.rows)[number]>[] = [
        { key: "chatwootId", label: "رقم المحادثة" },
        { key: "contactName", label: "العميل" },
        { key: "contactPhone", label: "الهاتف" },
        { key: "assigneeName", label: "الموظف" },
        { key: "inboxName", label: "القناة" },
        { key: "department", label: "القسم", format: (r) => depAr(r.department) },
        { key: "status", label: "الحالة" },
        { key: "needsReply", label: "يحتاج رد", format: (r) => (r.needsReply ? "نعم" : "لا") },
        { key: "responseSeconds", label: "زمن الرد (ث)" },
        { key: "conversationDurationSeconds", label: "مدة المحادثة (ث)" },
        { key: "campaignLabel", label: "الكامبين" },
        { key: "botInvolved", label: "تدخل فهد", format: (r) => (r.botInvolved ? "نعم" : "لا") },
        { key: "slaFirstResponseBreached", label: "خرق SLA", format: (r) => (r.slaFirstResponseBreached ? "نعم" : "لا") },
        { key: "lastMessageAt", label: "آخر رسالة", format: (r) => iso(r.lastMessageAt) },
        { key: "chatwootId", label: "رابط", format: (r) => link(r.chatwootId) },
      ];
      return streamCsvResponse(
        iterateTeamConversations(teamId, filters, first, memberId),
        columns,
        `team-${teamId}-conversations.csv`,
      );
    }

    case "labels": {
      // Every label, zeros included — same roster the screen shows.
      const { rows } = await getLabels(filters);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { key: "title", label: "Label" },
        { key: "conversations", label: "محادثات" },
        { key: "share", label: "النسبة", format: (r) => `${(r.share * 100).toFixed(1)}%` },
        { key: "open", label: "مفتوحة" },
        { key: "pending", label: "منتظرة" },
        { key: "resolved", label: "محلولة" },
        { key: "replied", label: "تم الرد" },
        { key: "needsReply", label: "تحتاج رد" },
        { key: "avgResponseSeconds", label: "متوسط الرد (ث)" },
        { key: "medianResponseSeconds", label: "وسيط الرد (ث)" },
        { key: "avgResolutionSeconds", label: "متوسط الإغلاق (ث)" },
        { key: "slaBreaches", label: "خرق SLA" },
        { key: "lastActivityAt", label: "آخر نشاط", format: (r) => iso(r.lastActivityAt) },
      ];
      return csvResponse(toCsv(rows, columns), "labels.csv");
    }

    case "departments": {
      const { rows } = await getDepartments(filters);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { key: "department", label: "القسم", format: (r) => depAr(r.department) },
        { key: "volume", label: "عدد المحادثات" },
        { key: "avgResponseSeconds", label: "متوسط الرد (ث)" },
        { key: "avgResolutionSeconds", label: "متوسط الحل (ث)" },
        { key: "open", label: "مفتوحة" },
        { key: "unresolved", label: "غير محلولة" },
        { key: "slaBreaches", label: "خرق SLA" },
      ];
      return csvResponse(toCsv(rows, columns), "departments.csv");
    }

    case "campaigns": {
      const { rows } = await getCampaigns(filters);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { key: "label", label: "الكامبين" },
        { key: "template", label: "القالب" },
        { key: "operatorName", label: "منشئ الكامبين" },
        { key: "sourceKey", label: "المصدر" },
        { key: "inboxName", label: "القناة" },
        { key: "status", label: "الحالة" },
        { key: "createdAt", label: "التاريخ", format: (r) => iso(r.createdAt) },
        { key: "total", label: "الإجمالي" },
        { key: "sent", label: "تم الإرسال" },
        { key: "failed", label: "فشل الإرسال" },
        { key: "skipped", label: "متخطى" },
        { key: "deliveryFailures", label: "فشل التسليم" },
        { key: "customerReplies", label: "رد العملاء" },
        { key: "replyRate", label: "نسبة رد العملاء", format: (r) => `${(r.replyRate * 100).toFixed(1)}%` },
        { key: "teamReplied", label: "رد عليهم الفريق" },
        { key: "avgTeamResponseSeconds", label: "متوسط رد الفريق (ث)" },
        { key: "unassigned", label: "غير مسندين" },
        { key: "matchedRecipients", label: "مستلمون مرتبطون برسالة" },
        { key: "unmatched", label: "غير مرتبطين" },
        { key: "dataState", label: "حالة البيانات" },
        { key: "reconciledAt", label: "آخر مطابقة", format: (r) => iso(r.reconciledAt) },
        { key: "agents", label: "الموظفون", format: (r) => r.agents.join(" / ") },
      ];
      return csvResponse(toCsv(rows, columns), "campaigns.csv");
    }

    case "sla": {
      type Row = Prisma.ConversationGetPayload<object>;
      const columns: CsvColumn<Row>[] = [
        { key: "chatwootId", label: "رقم المحادثة" },
        { key: "contactName", label: "العميل" },
        { key: "assigneeName", label: "الموظف" },
        { key: "department", label: "القسم", format: (r) => depAr(r.department) },
        { key: "responseSeconds", label: "زمن الرد (ث)" },
        { key: "status", label: "الحالة" },
        { key: "chatwootId", label: "رابط", format: (r) => link(r.chatwootId) },
      ];
      return streamCsvResponse(
        iterateConversations({ ...conversationWhere(filters), slaFirstResponseState: "breached" }),
        columns,
        "sla-breaches.csv",
      );
    }

    case "fahd": {
      const { noReplyList } = await getFahd(filters);
      const columns: CsvColumn<(typeof noReplyList)[number]>[] = [
        { key: "chatwootId", label: "رقم المحادثة" },
        { key: "contactName", label: "العميل" },
        { key: "department", label: "القسم", format: (r) => depAr(r.department) },
        { key: "handoffAt", label: "وقت التحويل من فهد", format: (r) => iso(r.handoffAt) },
        { key: "status", label: "الحالة" },
        { key: "chatwootId", label: "رابط", format: (r) => link(r.chatwootId) },
      ];
      return csvResponse(toCsv(noReplyList, columns), "fahd-no-reply.csv");
    }

    default:
      return badRequest("Unknown dataset");
  }
}

async function* iterateConversations(where: Prisma.ConversationWhereInput) {
  const batchSize = 1_000;
  let cursor: number | undefined;
  while (true) {
    const rows = await prisma.conversation.findMany({
      where,
      orderBy: { chatwootId: "asc" },
      take: batchSize,
      ...(cursor !== undefined ? { cursor: { chatwootId: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) return;
    for (const row of rows) yield row;
    cursor = rows.at(-1)!.chatwootId;
    if (rows.length < batchSize) return;
  }
}

async function* iterateTeamConversations(
  teamId: number,
  filters: ReturnType<typeof parseFilters>,
  first: Awaited<ReturnType<typeof getTeamConversations>>,
  memberId?: number,
) {
  for (const row of first.rows) yield row;
  for (let page = 2; page <= first.pages; page++) {
    const result = await getTeamConversations(teamId, filters, page, 200, memberId);
    for (const row of result.rows) yield row;
  }
}
