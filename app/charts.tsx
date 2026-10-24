"use client";
import { useState } from "react";
import type { dailyTotals } from "../lib/dashboard";
const dollars = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export function RevenueChart({
  data,
}: {
  data: ReturnType<typeof dailyTotals>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(
    10,
    Math.ceil(Math.max(...data.flatMap((d) => [d.revenue, d.spending])) / 10) *
      10,
  );
  const x = (i: number) => 52 + i * 79;
  const y = (n: number) => 180 - (n / max) * 150;
  return (
    <>
      <div className="chart-legend">
        <span>
          <i className="revenue-key" />
          Revenue
        </span>
        <span>
          <i className="spending-key" />
          Est. spending
        </span>
        <span className="chart-total">
          {dollars(data.reduce((s, d) => s + d.revenue, 0))}
        </span>
      </div>
      <svg
        className="revenue-chart"
        viewBox="0 0 560 220"
        role="img"
        aria-label="Daily revenue and estimated spending over the last seven days, in US dollars"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="52"
              x2="526"
              y1={y(t * max)}
              y2={y(t * max)}
              className="gridline"
            />
            <text x="40" y={y(t * max) + 4} textAnchor="end">
              {dollars(t * max)}
            </text>
          </g>
        ))}
        <path
          d={data
            .map((d, i) => `${i ? "L" : "M"} ${x(i)} ${y(d.revenue)}`)
            .join(" ")}
          className="revenue-line"
        />
        <path
          d={data
            .map((d, i) => `${i ? "L" : "M"} ${x(i)} ${y(d.spending)}`)
            .join(" ")}
          className="spending-line"
        />
        {data.map((d, i) => (
          <g
            key={d.day}
            tabIndex={0}
            role="img"
            aria-label={`${d.label}: revenue ${dollars(d.revenue)}, estimated spending ${dollars(d.spending)}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            <rect
              x={x(i) - 24}
              y="24"
              width="48"
              height="166"
              fill="transparent"
            />
            {active === i && (
              <line x1={x(i)} x2={x(i)} y1="24" y2="180" className="guide" />
            )}
            <circle
              cx={x(i)}
              cy={y(d.revenue)}
              r={active === i ? 5 : 3}
              className="revenue-dot"
            />
            <text x={x(i)} y="210" textAnchor="middle">
              {d.label}
            </text>
            <title>
              {d.label}: revenue {dollars(d.revenue)}, estimated spending{" "}
              {dollars(d.spending)}
            </title>
          </g>
        ))}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {active === null
          ? "Daily totals · UTC"
          : `${data[active].label} · Revenue ${dollars(data[active].revenue)} · Est. spending ${dollars(data[active].spending)}`}
      </div>
    </>
  );
}
export function PipelineChart({
  stages,
}: {
  stages: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div
      className="pipeline-chart"
      role="img"
      aria-label={`Pipeline totals: ${stages.map((s) => `${s.label} ${s.value}`).join(", ")}`}
    >
      {stages.map((s, i) => (
        <div className="pipeline-row" key={s.label}>
          <span>{s.label}</span>
          <div className="bar-track">
            <div
              className={`bar bar-${i}`}
              style={{ width: `${(s.value / max) * 100}%` }}
            />
          </div>
          <strong>{s.value}</strong>
        </div>
      ))}
    </div>
  );
}
