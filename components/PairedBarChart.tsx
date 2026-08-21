"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface PairedBarDatum {
  metric: string;
  before: number;
  after: number;
}

export function PairedBarChart({
  data,
  beforeLabel,
  afterLabel,
}: {
  data: PairedBarDatum[];
  beforeLabel: string;
  afterLabel: string;
}) {
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
        <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} />
        <Bar dataKey="before" name={beforeLabel} fill="#64748b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="after" name={afterLabel} fill="#38bdf8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
