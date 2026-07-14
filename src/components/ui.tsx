import clsx, { type ClassValue } from "clsx";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { STATUS_LABELS_AR, SLA_LABELS_AR, DEPARTMENT_LABELS_AR, type Department, type SlaState } from "@/lib/constants";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("card p-5", className)}>{children}</div>;
}

export function CardTitle({
  children,
  action,
  hint,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold tracking-tight text-foreground">{children}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Stat tile ─────────────────────────────────────────────────────────────
   Icon chip + label + big number + optional sub / delta. This is the primary
   KPI surface: four across, breathing room, one glance.                     */

export type Tone = "brand" | "violet" | "success" | "warning" | "danger" | "neutral";

const TONE_CHIP: Record<Tone, string> = {
  brand: "bg-primary/10 text-primary",
  violet: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success-fg",
  warning: "bg-warning/10 text-warning-fg",
  danger: "bg-destructive/10 text-destructive-fg",
  neutral: "bg-muted text-muted-foreground",
};

export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = "brand",
  delta,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  /** Percent change vs the previous period. Positive is not always good — see `deltaGood`. */
  delta?: { value: number; good?: boolean } | null;
}) {
  return (
    <div className="card card-hover p-4 sm:p-5">
      {/*
        On a phone the tile is ~168px wide. Sitting the icon beside the label
        leaves the label ~90px and it wraps into a mess, so on mobile they stack
        (icon, then label, then value) and only widen into a row from `sm` up.
      */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        {icon && (
          <span
            className={cn(
              "order-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:order-2 sm:h-9 sm:w-9",
              TONE_CHIP[tone],
            )}
          >
            {icon}
          </span>
        )}
        <span className="label-muted order-2 leading-snug sm:order-1">{label}</span>
      </div>

      <div className="mt-2.5 flex items-end gap-2 sm:mt-3">
        <span className="text-[22px] font-bold leading-none tracking-tight tnum text-foreground sm:text-[26px]">
          {value}
        </span>
        {delta && <DeltaPill value={delta.value} good={delta.good} />}
      </div>

      {/* The caption is the first thing to go when there is no room for it. */}
      {sub !== undefined && sub !== null && (
        <div className="mt-2 hidden text-xs text-muted-foreground sm:block">{sub}</div>
      )}
    </div>
  );
}

const TONE_TEXT: Record<Tone, string> = {
  brand: "text-primary",
  violet: "text-accent",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-destructive-fg",
  neutral: "text-foreground",
};

/**
 * A row of figures inside a card, separated by hairlines.
 *
 * Replaces the grid of filled sub-boxes this used to be: a card holding four
 * rounded, shaded boxes reads as boxes-inside-boxes, and on a phone that is most
 * of what you see. One outlined strip with dividers gives the same grouping with
 * a quarter of the visual noise.
 */
export function StatStrip({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; tone?: Tone }[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <dl
      className={cn("grid divide-x divide-border overflow-hidden rounded-xl border border-border", className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((i) => (
        <div key={i.label} className="min-w-0 px-1.5 py-2.5 text-center">
          <dd className={cn("truncate text-sm font-bold tnum", TONE_TEXT[i.tone ?? "neutral"])}>{i.value}</dd>
          <dt className="mt-0.5 truncate text-2xs text-muted-foreground">{i.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function DeltaPill({ value, good }: { value: number; good?: boolean }) {
  if (!Number.isFinite(value) || value === 0) return null;
  const up = value > 0;
  // "good" decides the colour, not the direction — a rise in SLA breaches is bad.
  const positive = good ?? up;
  return (
    <span
      className={cn(
        "mb-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-bold tnum",
        positive ? "bg-success/10 text-success-fg" : "bg-destructive/10 text-destructive-fg",
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(Math.round(value))}%
    </span>
  );
}

/**
 * Plain stat card — same shell as StatTile but the value carries the tone.
 * Used by the report pages that don't have a meaningful icon per metric.
 */
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
  const valueTone =
    tone === "accent"
      ? "text-primary"
      : tone === "danger"
        ? "text-destructive-fg"
        : tone === "success"
          ? "text-success-fg"
          : tone === "warning"
            ? "text-warning-fg"
            : "text-foreground";
  return (
    <div className="card card-hover p-5">
      <div className="label-muted">{label}</div>
      <div className={cn("kpi-value mt-3", valueTone)}>{value}</div>
      {sub !== undefined && sub !== null && <div className="mt-2 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * A rate, shown as a bar as well as a number. A percentage on its own tells you
 * the value; the bar tells you where it sits — which is the thing you actually
 * scan a column of campaigns or teams for.
 */
export function Meter({
  value,
  tone = "brand",
  className,
}: {
  /** 0–1. */
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  const fill: Record<Tone, string> = {
    brand: "bg-primary",
    violet: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    neutral: "bg-muted-foreground/50",
  };
  return (
    <span
      className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={`${pct.toFixed(1)}%`}
    >
      <span className={cn("block h-full rounded-full transition-[width] duration-500", fill[tone])} style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Compact stat used inside cards (no chrome). */
export function MiniStat({ label, value, tone = "neutral" }: { label: string; value: React.ReactNode; tone?: Tone }) {
  const color =
    tone === "brand"
      ? "text-primary"
      : tone === "success"
        ? "text-success-fg"
        : tone === "warning"
          ? "text-warning-fg"
          : tone === "danger"
            ? "text-destructive-fg"
            : tone === "violet"
              ? "text-accent"
              : "text-foreground";
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-center">
      <div className={cn("text-lg font-bold tnum", color)}>{value}</div>
      <div className="mt-0.5 text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}

/* ── Badges ──────────────────────────────────────────────────────────────── */

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "success" | "warning" | "danger" | "violet";
  className?: string;
}) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    violet: "bg-accent/10 text-accent",
    success: "bg-success/10 text-success-fg",
    warning: "bg-warning/10 text-warning-fg",
    danger: "bg-destructive/10 text-destructive-fg",
  };
  return <span className={cn("badge", tones[tone], className)}>{children}</span>;
}

/** A dot + label pill — colour is never the only signal, the text carries it too. */
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
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive-fg">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
      </span>
      يحتاج رد
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );
}

/** Round avatar with initials — gives agent tables a face, like the references. */
export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  const label = (name || "؟").trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-bold text-primary",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ── States ──────────────────────────────────────────────────────────────── */

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
    <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
      <Spinner /> {label}
    </div>
  );
}

/** Skeleton grid shown while the first payload is in flight. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card h-[110px] animate-pulse bg-surface-2/60" />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 p-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">{title}</div>
      {hint && <div className="max-w-md text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-destructive/20 bg-destructive/5 p-6 text-center text-sm font-medium text-destructive-fg">
      {message}
    </div>
  );
}

/** Card with a bordered header — for tables. */
export function Section({
  title,
  action,
  hint,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
