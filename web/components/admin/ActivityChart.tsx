"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { JobsByDayPoint } from "@/lib/types";

interface Props {
  data: JobsByDayPoint[];
}

const TooltipContent = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.value} {p.name}
        </div>
      ))}
    </div>
  );
};

export function ActivityChart({ data }: Props) {
  if (!data.length) {
    return (
      <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
        No activity in the last 7 days.
      </div>
    );
  }

  // Format day label: "Jun 30"
  const formatted = data.map((d) => ({
    ...d,
    dayLabel: new Date(d.day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={formatted} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
        <defs>
          <linearGradient id="gradDone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="dayLabel"
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<TooltipContent />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: "var(--muted)", paddingTop: 4 }}
        />
        <Area
          type="monotone"
          dataKey="done"
          name="delivered"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#gradDone)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="failed"
          name="failed"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#gradFailed)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
