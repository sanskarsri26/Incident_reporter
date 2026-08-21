"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS: Record<string, string> = {
  sev1: "#f87171",
  sev2: "#fb923c",
  sev3: "#fbbf24",
  sev4: "#94a3b8",
};

export interface SeverityChartDatum {
  severity: string;
  count: number;
}

export function SeverityChart({ data }: { data: SeverityChartDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="severity" stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#334155" }} />
        <YAxis stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#334155" }} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "#1e293b80" }}
          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.severity} fill={COLORS[entry.severity] ?? "#94a3b8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
