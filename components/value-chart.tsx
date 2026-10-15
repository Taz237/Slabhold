"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, signedMoney } from "@/lib/format";
import { mockValueHistory, type ValuePoint } from "@/lib/value-history";

export function ValueChart({
  card,
}: {
  card: { id: string; estimatedSellPrice: number; purchasePrice: number };
}) {
  const points = mockValueHistory(card);
  const current = points[points.length - 1]?.value ?? 0;
  const first = points[0]?.value ?? current;
  const change = current - first;
  const changePct = first ? Math.round((change / first) * 1000) / 10 : 0;
  const up = change >= 0;
  const spanDays =
    points.length > 1
      ? (new Date(points[points.length - 1].date).getTime() - new Date(points[0].date).getTime()) /
        86400000
      : 0;
  const spanLabel = spanDays > 45 ? `${Math.round(spanDays / 30)} mo` : `${Math.round(spanDays)} days`;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Estimated value</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{money(current)}</p>
        </div>
        <p
          className={`text-right text-sm font-semibold tabular-nums ${
            up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {signedMoney(change)}
          <span className="mt-0.5 block text-xs font-medium">
            {up ? "+" : ""}
            {changePct}% · {spanLabel}
          </span>
        </p>
      </div>
      <p className="mt-1 text-xs text-zinc-500">Sample history from recent months</p>
      <div className="mt-3 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`value-fill-${card.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={up ? "#10b981" : "#f43f5e"} stopOpacity={0.28} />
                <stop offset="100%" stopColor={up ? "#10b981" : "#f43f5e"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
            <Tooltip content={<ValueTip />} cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={up ? "#10b981" : "#f43f5e"}
              strokeWidth={2.5}
              fill={`url(#value-fill-${card.id})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: up ? "#10b981" : "#f43f5e" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ValueTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ValuePoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <p className="text-zinc-500">{point.label}</p>
      <p className="font-semibold tabular-nums">{money(point.value)}</p>
    </div>
  );
}
