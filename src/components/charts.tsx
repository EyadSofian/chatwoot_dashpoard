"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/**
 * One light palette, tuned for white cards.
 * Categorical hues are spaced around the wheel and matched in perceived weight,
 * so no single series shouts louder than the others.
 */
export const CHART = {
  brand: "#0B6BF0",
  cyan: "#06B6D4",
  violet: "#7C5CFC",
  amber: "#F59E0B",
  emerald: "#10B981",
  rose: "#F43F5E",
  grid: "#E3EBF3",
  axis: "#8CA0B8",
  surface: "#FFFFFF",
} as const;

/** Categorical series colours, in the order they should be handed out. */
export const CATEGORICAL = [CHART.brand, CHART.cyan, CHART.violet, CHART.amber, CHART.emerald, CHART.rose];

/** Recharts renders differently on the server — hold the layout until mounted. */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

const TOOLTIP = {
  contentStyle: {
    background: CHART.surface,
    border: "1px solid #E3EBF3",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 12px",
    boxShadow: "0 16px 32px -16px rgb(11 37 69 / 0.22)",
    color: "#0B2545",
  },
  labelStyle: { color: "#6B7C93", fontWeight: 500, marginBottom: 2 },
  cursor: { fill: "rgba(11,107,240,0.05)" },
} as const;

const AXIS = {
  tick: { fill: CHART.axis, fontSize: 11, fontWeight: 500 },
  tickLine: false,
} as const;

export function TrendChart({ data }: { data: { date: string; count: number; resolved: number }[] }) {
  const { tr } = useLocale();
  const mounted = useMounted();
  if (!mounted) return <div className="h-[280px]" />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CHART.brand} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.emerald} stopOpacity={0.18} />
            <stop offset="100%" stopColor={CHART.emerald} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="date" {...AXIS} axisLine={{ stroke: CHART.grid }} minTickGap={28} />
        <YAxis {...AXIS} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip {...TOOLTIP} />
        <Area
          type="monotone"
          dataKey="count"
          name={tr("محادثات", "Conversations")}
          stroke={CHART.brand}
          strokeWidth={2.5}
          fill="url(#gConv)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
        />
        <Area
          type="monotone"
          dataKey="resolved"
          name={tr("محلولة", "Resolved")}
          stroke={CHART.emerald}
          strokeWidth={2.5}
          fill="url(#gResolved)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DeptResponseBar({ data }: { data: { department: string; avg: number }[] }) {
  const { tr } = useLocale();
  const mounted = useMounted();
  if (!mounted) return <div className="h-[280px]" />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" {...AXIS} axisLine={{ stroke: CHART.grid }} />
        <YAxis type="category" dataKey="department" {...AXIS} tick={{ ...AXIS.tick, fontSize: 12 }} axisLine={false} width={78} />
        <Tooltip {...TOOLTIP} formatter={(v: number) => [`${Math.round(v / 60)} ${tr("دقيقة", "min")}`, tr("متوسط الرد", "Avg response")]} />
        <Bar dataKey="avg" name={tr("متوسط الرد", "Avg response")} radius={[0, 8, 8, 0]} barSize={20}>
          {data.map((_, i) => (
            <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const { tr } = useLocale();
  const mounted = useMounted();
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!mounted) return <div className="h-[240px]" />;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={94} paddingAngle={3} stroke="none" cornerRadius={6}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            {...TOOLTIP}
            cursor={false}
            formatter={(v: number, n) => [`${v} (${total ? Math.round((v / total) * 100) : 0}%)`, n]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Total in the hole — the number you actually came for. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tnum text-foreground">{total}</span>
        <span className="text-2xs text-muted-foreground">{tr("الإجمالي", "Total")}</span>
      </div>
    </div>
  );
}

/** Compare labels (or anything named) side by side. Horizontal bars keep long
 *  Arabic names readable instead of rotating them onto their side. */
export function CompareBar({
  data,
  unit = "",
}: {
  data: { name: string; value: number; color?: string }[];
  unit?: string;
}) {
  const mounted = useMounted();
  const height = Math.max(200, data.length * 34 + 40);
  if (!mounted) return <div style={{ height }} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" {...AXIS} axisLine={{ stroke: CHART.grid }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          {...AXIS}
          tick={{ ...AXIS.tick, fontSize: 12 }}
          axisLine={false}
          width={110}
        />
        <Tooltip {...TOOLTIP} formatter={(v: number) => [`${v}${unit}`, ""]} />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={16}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color || CATEGORICAL[i % CATEGORICAL.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Legend rendered as text + swatch, so colour is never the only signal. */
export function ChartLegend({ items }: { items: { name: string; value: number; color: string }[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} aria-hidden />
          <span className="flex-1 truncate text-muted-foreground">{i.name}</span>
          <span className="font-bold tnum text-foreground">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}
