"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  queued:       "#9ca3af",
  running:      "#f97316",
  needs_review: "#eab308",
  done:         "#22c55e",
  failed:       "#ef4444",
  rejected:     "#ef4444",
};

interface Props {
  data: { status: string; count: number }[];
}

const TooltipContent = ({ active, payload }: { active?: boolean; payload?: { value: number }[] }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <span style={{ color: "var(--ink)" }}>{payload[0].value} jobs</span>
    </div>
  );
};

export function JobsBarChart({ data }: Props) {
  if (!data.length) {
    return <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>No jobs yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(80, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
      >
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="status"
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          width={96}
          axisLine={false}
          tickLine={false}
          tickFormatter={(s: string) => s.replace(/_/g, " ")}
        />
        <Tooltip content={<TooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#6b7280"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
