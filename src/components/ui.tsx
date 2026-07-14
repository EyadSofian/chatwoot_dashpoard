import clsx, { type ClassValue } from "clsx";
import { STATUS_LABELS_AR, SLA_LABELS_AR, DEPARTMENT_LABELS_AR, type Department, type SlaState } from "@/lib/constants";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("card p-4", className)}>{children}</div>;
}

export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      {action}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "accent" | "danger" | "success" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "text-primary"
      : tone === "danger"
        ? "text-destructive"
        : tone === "success"
          ? "text-success"
          : tone === "warning"
            ? "text-warning"
            : "text-foreground";
  return (
    <div className="card p-4">
      <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("kpi-value mt-1", toneClass)}>{value}</div>
      {sub !== undefined && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones: Record<string, string> = {
    muted: "bg-surface-2 text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
  };
  return <span className={cn("badge", tones[tone], className)}>{children}</span>;
}

export function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const tone = status === "open" ? "primary" : status === "resolved" ? "success" : status === "pending" ? "warning" : "muted";
  return <Badge tone={tone as "primary"}>{STATUS_LABELS_AR[status] ?? status}</Badge>;
}

export function SlaPill({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-muted-foreground">—</span>;
  const tone = state === "breached" ? "danger" : state === "near_breach" ? "warning" : "success";
  return <Badge tone={tone as "danger"}>{SLA_LABELS_AR[state as SlaState] ?? state}</Badge>;
}

export function DepartmentPill({ department }: { department: string | null | undefined }) {
  if (!department) return <span className="text-muted-foreground">—</span>;
  return <Badge tone="muted">{DEPARTMENT_LABELS_AR[department as Department] ?? department}</Badge>;
}

export function NeedsReplyDot({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
      <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> يحتاج رد
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      role="status"
      aria-label="جارٍ التحميل"
    />
  );
}

export function LoadingBlock({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 p-10 text-center">
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint && <div className="max-w-md text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
      {message}
    </div>
  );
}

/** Section wrapper with heading. */
export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
