'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money, moneyShort } from '@/lib/format';
import type { AmortisationPoint } from '@/lib/calculators/amortisation';

const NAVY = '#14294a';
const TEAL = '#2ab3b1';
const TEAL_LIGHT = '#7fdbd8';
const SLATE = '#5a6b82';
const ROSE = '#c85c6c';
const GREEN = '#2f9e6e';
const AMBER = '#d98e2b';

const tooltipStyle = {
  backgroundColor: '#0e1f38',
  border: 'none',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 12,
  color: '#dbe4f0',
};

// ---------------------------------------------------------------------------

export function AmortisationChart({
  current,
  blueprint,
  height = 280,
}: {
  current: AmortisationPoint[];
  blueprint: AmortisationPoint[];
  height?: number;
}) {
  const startYear = new Date().getFullYear();
  const maxLen = Math.max(current.length, blueprint.length);
  const data: { year: number; current?: number; blueprint?: number }[] = [];
  for (let i = 0; i < maxLen; i += 3) {
    data.push({
      year: startYear + (i + 1) / 12,
      current: current[i]?.balance ?? (i < current.length ? undefined : 0),
      blueprint: blueprint[i]?.balance ?? (i < blueprint.length ? undefined : 0),
    });
  }
  data.push({ year: startYear + maxLen / 12, current: current.length ? 0 : undefined, blueprint: blueprint.length ? 0 : undefined });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SLATE} stopOpacity={0.25} />
            <stop offset="100%" stopColor={SLATE} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradBlueprint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e3e8ef" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="year"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(y) => `${Math.round(y)}`}
          tick={{ fontSize: 11, fill: SLATE }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tickFormatter={(v) => moneyShort(v)} tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [money(Number(v ?? 0)), name === 'current' ? 'Current path' : 'Blueprint path']}
          labelFormatter={(y) => `${Math.floor(Number(y))}`}
        />
        <Area type="monotone" dataKey="current" stroke={SLATE} strokeWidth={2} strokeDasharray="5 4" fill="url(#gradCurrent)" isAnimationActive animationDuration={600} name="current" />
        <Area type="monotone" dataKey="blueprint" stroke={TEAL} strokeWidth={2.5} fill="url(#gradBlueprint)" isAnimationActive animationDuration={600} name="blueprint" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Bank-view waterfall: recognised income → living → debt → UMI

export function BankWaterfall({
  income,
  living,
  debt,
  umi,
  height = 260,
}: {
  income: number;
  living: number;
  debt: number;
  umi: number;
  height?: number;
}) {
  const data = [
    { name: 'Recognised income', base: 0, value: income, color: TEAL },
    { name: 'Living costs', base: income - living, value: living, color: SLATE },
    { name: 'Stressed debt', base: income - living - debt, value: debt, color: ROSE },
    { name: 'Left over (UMI)', base: 0, value: Math.max(0, umi), color: NAVY },
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="28%">
        <CartesianGrid stroke="#e3e8ef" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} interval={0} />
        <YAxis tickFormatter={(v) => moneyShort(v)} tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, _n, entry) => [money(Number(v ?? 0)), (entry?.payload as { name?: string })?.name ?? '']}
          labelFormatter={() => ''}
          cursor={{ fill: 'rgba(42,179,177,0.06)' }}
        />
        <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="value" stackId="wf" radius={[5, 5, 0, 0]} isAnimationActive animationDuration={500}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------

export function LenderCapacityChart({
  rows,
  height = 220,
}: {
  rows: { lender: string; capacity: number; isModel?: boolean }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }} barCategoryGap="30%">
        <CartesianGrid stroke="#e3e8ef" strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => moneyShort(v)} tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="lender" tick={{ fontSize: 12, fill: NAVY }} axisLine={false} tickLine={false} width={130} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money(Number(v ?? 0)), 'Indicative capacity']} cursor={{ fill: 'rgba(42,179,177,0.06)' }} />
        <Bar dataKey="capacity" radius={[0, 5, 5, 0]} isAnimationActive animationDuration={500}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.isModel ? NAVY : TEAL} fillOpacity={r.isModel ? 1 : 0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------

export function NetWorthChart({
  path,
  retirementYear,
  height = 280,
}: {
  path: { year: number; assets: number; debt: number; netWorth: number }[];
  retirementYear?: number;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={path} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gradNW" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.3} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e3e8ef" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => moneyShort(v)} tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [money(Number(v ?? 0)), name === 'netWorth' ? 'Net worth' : name === 'assets' ? 'Assets' : 'Debt']}
        />
        {retirementYear ? (
          <ReferenceLine x={retirementYear} stroke={AMBER} strokeDasharray="4 4" label={{ value: 'Retirement', fontSize: 10, fill: AMBER, position: 'top' }} />
        ) : null}
        <Area type="monotone" dataKey="assets" stroke={TEAL_LIGHT} strokeWidth={1.5} fill="none" name="assets" />
        <Area type="monotone" dataKey="debt" stroke={ROSE} strokeWidth={1.5} fill="none" name="debt" />
        <Area type="monotone" dataKey="netWorth" stroke={NAVY} strokeWidth={2.5} fill="url(#gradNW)" name="netWorth" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------

export function KiwiSaverChart({
  low,
  base,
  high,
  height = 240,
}: {
  low: { year: number; balance: number }[];
  base: { year: number; balance: number }[];
  high: { year: number; balance: number }[];
  height?: number;
}) {
  const startYear = new Date().getFullYear();
  const data = base.map((b, i) => ({
    year: startYear + b.year,
    low: low[i]?.balance,
    base: b.balance,
    high: high[i]?.balance,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="#e3e8ef" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => moneyShort(v)} tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} width={52} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [money(Number(v ?? 0)), `${String(name)} assumptions`]} />
        <Line type="monotone" dataKey="low" stroke={SLATE} strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="low" />
        <Line type="monotone" dataKey="base" stroke={TEAL} strokeWidth={2.5} dot={false} name="base" />
        <Line type="monotone" dataKey="high" stroke={GREEN} strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="high" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Income recognition bars: actual vs bank-recognised per line

export function RecognitionBars({
  lines,
  height,
}: {
  lines: { label: string; actual: number; recognised: number }[];
  height?: number;
}) {
  const h = height ?? Math.max(150, lines.length * 56);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={lines} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }} barCategoryGap="24%" barGap={2}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 11.5, fill: NAVY }} axisLine={false} tickLine={false} width={190} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [money(Number(v ?? 0)) + '/mo', name === 'actual' ? 'Actual' : 'Bank-recognised']}
          cursor={{ fill: 'rgba(42,179,177,0.06)' }}
        />
        <Bar dataKey="actual" fill={SLATE} fillOpacity={0.35} radius={[0, 4, 4, 0]} name="actual" barSize={9} />
        <Bar dataKey="recognised" fill={TEAL} radius={[0, 4, 4, 0]} name="recognised" barSize={9} isAnimationActive animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}
