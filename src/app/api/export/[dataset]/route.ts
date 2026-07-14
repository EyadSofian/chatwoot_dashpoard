import { env } from "@/env";
import { prisma } from "@/lib/db";
import { requireSession, badRequest } from "@/lib/http";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import { parseFilters } from "@/lib/reporting/filters";
import { conversationWhere } from "@/lib/reporting/filters";
import { getAgentLeaderboard } from "@/lib/reporting/agents";
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
      const rows = await prisma.conversation.findMany({
        where: conversationWhere(filters),
        orderBy: { lastMessageAt: "desc" },
        take: 20000,
      });
      const columns: CsvColumn<(typeof rows)[number]>[] = [
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
      return csvResponse(toCsv(rows, columns), "conversations.csv");
    }

    case "agents": {
      // Same roster the screen shows — every agent, zeros included.
      const { rows } = await getAgentLeaderboard(filters);
      const columns: CsvColumn<(typeof rows)[number]>[] = [
        { key: "name", label: "الموظف" },
        { key: "email", label: "البريد" },
        { key: "assigned", label: "مُسند" },
        { key: "replied", label: "تم الرد" },
        { key: "needsReply", label: "يحتاج رد" },
        { key: "open", label: "مفتوحة" },
        { key: "resolved", label: "محلولة" },
        { key: "pending", label: "منتظرة" },
        { key: "unread", label: "غير مقروءة" },
        { key: "avgResponseSeconds", label: "متوسط الرد (ث)" },
        { key: "medianResponseSeconds", label: "وسيط الرد (ث)" },
        { key: "maxResponseSeconds", label: "أقصى رد (ث)" },
        { key: "slaBreaches", label: "خرق SLA" },
      ];
      return csvResponse(toCsv(rows, columns), "agents.csv");
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
        { key: "operatorName", label: "مين عمل الكامبين" },
        { key: "sourceKey", label: "المصدر" },
        { key: "inboxName", label: "القناة" },
        { key: "status", label: "الحالة" },
        { key: "createdAt", label: "التاريخ", format: (r) => iso(r.createdAt) },
        { key: "total", label: "الإجمالي" },
        { key: "sent", label: "مُرسل" },
        { key: "failed", label: "فشل" },
        { key: "skipped", label: "متخطى" },
        { key: "deliveryFailures", label: "فشل التسليم" },
        { key: "replies", label: "الردود" },
        { key: "replyRate", label: "نسبة الرد", format: (r) => `${(r.replyRate * 100).toFixed(1)}%` },
        { key: "assignedReplies", label: "ردود مُسندة" },
        { key: "unassignedReplies", label: "ردود غير مُسندة" },
        { key: "avgReplyResponseSeconds", label: "متوسط رد الموظف (ث)" },
        { key: "agents", label: "الموظفون", format: (r) => r.agents.join(" / ") },
      ];
      return csvResponse(toCsv(rows, columns), "campaigns.csv");
    }

    case "sla": {
      const { breachedList } = await getSla(filters);
      const columns: CsvColumn<(typeof breachedList)[number]>[] = [
        { key: "chatwootId", label: "رقم المحادثة" },
        { key: "contactName", label: "العميل" },
        { key: "assigneeName", label: "الموظف" },
        { key: "department", label: "القسم", format: (r) => depAr(r.department) },
        { key: "responseSeconds", label: "زمن الرد (ث)" },
        { key: "status", label: "الحالة" },
        { key: "chatwootId", label: "رابط", format: (r) => link(r.chatwootId) },
      ];
      return csvResponse(toCsv(breachedList, columns), "sla-breaches.csv");
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
      return badRequest("مجموعة بيانات غير معروفة");
  }
}
