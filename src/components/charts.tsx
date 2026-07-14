"use client";

import { useEffect, useState } from "react";
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
import { useTheme } from "@/components/providers";

const LIGHT = {
  primary: "#1E40AF",
  secondary: "#3B82F6",
  accent: "#D97706",
  grid: "#E2E8F0",
  text: "#64748B",
  success: "#16A34A",
  danger: "#DC2626",
  warning: "#B45309",
  surface: "#FFFFFF",
};
const DARK = {
  primary: "#60A5FA",
  secondary: "#3B82F6",
  accent: "#F59E0B",
  grid: "#334155",
  text: "#94A3B8",
  success: "#4ADE80",
  danger: "#F87171",
  warning: "#FBBF24",
  surface: "#111827",
};

export function useChartColors() {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function tooltipStyle(c: typeof LIGHT) {
  return {
    contentStyle: {
      background: c.surface,
      border: `1px solid ${c.grid}`,
      borderRadius: 8,
      fontSize: 12,
      color: c.text,
    },
    labelStyle: { color: c.text },
  };
}

export function TrendChart({ data }: { data: { date: string; count: number; resolved: number }[] }) {
  const c = useChartColors();
  const mounted = useMounted();
  if (!mounted) return <div className="h-64" />;
  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.primary} stopOpacity={0.35} />
            <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={24} />
        <YAxis tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip {...tooltipStyle(c)} />
        <Area type="monotone" dataKey="count" name="محادثات" stroke={c.primary} strokeWidth={2} fill="url(#gConv)" />
        <Area type="monotone" dataKey="resolved" name="محلولة" stroke={c.success} strokeWidth={2} fill="transparent" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DeptResponseBar({ data }: { data: { department: string; avg: number }[] }) {
  const c = useChartColors();
  const mounted = useMounted();
  if (!mounted) return <div className="h-64" />;
  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
        <XAxis type="number" tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grid }} />
        <YAxis type="category" dataKey="department" tick={{ fill: c.text, fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
        <Tooltip {...tooltipStyle(c)} formatter={(v: number) => [`${Math.round(v / 60)} د`, "متوسط الرد"]} />
        <Bar dataKey="avg" name="متوسط الرد (ث)" fill={c.primary} radius={[0, 6, 6, 0]} barSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const c = useChartColors();
  const mounted = useMounted();
  if (!mounted) return <div className="h-56" />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={224}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle(c)} formatter={(v: number, n) => [`${v} (${total ? Math.round((v / total) * 100) : 0}%)`, n]} />
      </PieChart>
    </ResponsiveContainer>
  );
}
