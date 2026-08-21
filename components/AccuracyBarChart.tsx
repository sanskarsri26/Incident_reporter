"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface AccuracyBarDatum {
  metric: string;
  value: number;
}

export function AccuracyBarChart({ data }: { data: AccuracyBarDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="metric" stroke="#94a3b8" tickLine={false} axisLine={{ stroke: "#334155" }} />
        <YAxis
          stroke="#94a3b8"
          tickLine={false}
          axisLine={{ stroke: "#334155" }}
          tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
          domain={[0, 1]}
        />
        <Tooltip
          formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`}
          cursor={{ fill: "#1e293b80" }}
          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }}
        />
        <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
