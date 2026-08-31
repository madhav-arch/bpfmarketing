'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuditLine } from '@/lib/domain/types';
import { money, pct } from '@/lib/format';

// ---------------------------------------------------------------------------

export function Card({
  children,
  className = '',
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'navy' | 'aqua';
}) {
  const tones = {
    default: 'bg-white border-line',
    navy: 'bg-navy-900 border-navy-800 text-white blueprint-grid',
    aqua: 'bg-aqua-100 border-teal-300/40',
  };
  return (
    <div className={`rounded-xl border shadow-[0_1px_3px_rgba(16,35,61,0.06)] ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeading({
  index,
  title,
  lede,
  right,
}: {
  index: string;
  title: string;
  lede?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <div className="font-display text-[11px] font-medium uppercase tracking-[0.22em] text-teal-500">
          {index}
        </div>
        <h2 className="font-display mt-1 text-[26px] font-semibold leading-tight text-ink">{title}</h2>
        {lede ? <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-slate-500b">{lede}</p> : null}
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Animated number — counts toward its value and flashes on change.

export function AnimatedNumber({
  value,
  format = 'money',
  decimals = 0,
  className = '',
}: {
  value: number;
  format?: 'money' | 'percent' | 'plain' | 'years' | 'year';
  decimals?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (prev.current === value) return;
    const from = prev.current;
    prev.current = value;
    setFlash(true);
    const start = performance.now();
    const dur = 550;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    const timeout = setTimeout(() => setFlash(false), 1100);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      clearTimeout(timeout);
    };
  }, [value]);

  const text =
    format === 'money'
      ? money(display, { decimals })
      : format === 'percent'
        ? pct(display, decimals || 2)
        : format === 'years'
          ? `${display.toFixed(1)} yrs`
          : format === 'year'
            ? `${Math.round(display)}`
            : display.toLocaleString('en-NZ', { maximumFractionDigits: decimals });

  return <span className={`num ${flash ? 'bp-flash' : ''} ${className}`}>{text}</span>;
}

export function Stat({
  label,
  value,
  format = 'money',
  decimals = 0,
  sub,
  tone = 'default',
  audit,
  onAudit,
}: {
  label: string;
  value: number;
  format?: 'money' | 'percent' | 'plain' | 'years' | 'year';
  decimals?: number;
  sub?: ReactNode;
  tone?: 'default' | 'navy';
  audit?: AuditLine[];
  onAudit?: () => void;
}) {
  const dark = tone === 'navy';
  return (
    <div className={`group relative ${dark ? '' : ''}`}>
      <div className={`text-[11px] font-medium uppercase tracking-[0.14em] ${dark ? 'text-teal-300/80' : 'text-slate-500b'}`}>
        {label}
        {audit && onAudit ? (
          <button
            onClick={onAudit}
            title="How was this calculated?"
            className={`ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] opacity-0 transition-opacity group-hover:opacity-100 ${
              dark ? 'border-teal-300/50 text-teal-300' : 'border-slate-300 text-slate-500b hover:border-teal-500 hover:text-teal-500'
            }`}
          >
            ?
          </button>
        ) : null}
      </div>
      <div className={`font-display mt-0.5 text-[26px] font-semibold leading-none ${dark ? 'text-white' : 'text-ink'}`}>
        <AnimatedNumber value={value} format={format} decimals={decimals} />
      </div>
      {sub ? <div className={`mt-1 text-[12px] ${dark ? 'text-navy-100/70' : 'text-slate-500b'}`}>{sub}</div> : null}
    </div>
  );
}

export function Delta({ value, goodWhen = 'up', format = 'money' }: { value: number; goodWhen?: 'up' | 'down' | 'neutral'; format?: 'money' | 'percent' | 'years' | 'months' }) {
  if (Math.abs(value) < 1e-9) return null;
  const positive = value > 0;
  const good = goodWhen === 'neutral' ? null : goodWhen === 'up' ? positive : !positive;
  const color = good === null ? 'text-slate-500b' : good ? 'text-green-600b' : 'text-rose-600b';
  const text =
    format === 'money'
      ? money(value, { sign: true })
      : format === 'percent'
        ? `${positive ? '+' : ''}${(value * 100).toFixed(2)}%`
        : format === 'years'
          ? `${Math.abs(value).toFixed(1)} yrs ${positive ? 'later' : 'earlier'}`
          : `${Math.abs(Math.round(value))} mo ${positive ? 'later' : 'earlier'}`;
  return <span className={`num text-[12px] font-semibold ${color}`}>{text}</span>;
}

// ---------------------------------------------------------------------------

export function InfoTip({ children, tip }: { children: ReactNode; tip: string }) {
  return (
    <span className="group/tip relative inline-block cursor-help border-b border-dotted border-slate-400">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-lg bg-navy-900 p-3 text-[12px] font-normal leading-relaxed text-navy-100 opacity-0 shadow-xl transition-opacity group-hover/tip:opacity-100">
        {tip}
      </span>
    </span>
  );
}

export function Pill({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'amber' | 'rose' | 'slate' | 'green' }) {
  const tones = {
    teal: 'bg-aqua-100 text-teal-500 border-teal-300/50',
    amber: 'bg-amber-50 text-amber-600b border-amber-200',
    rose: 'bg-rose-50 text-rose-600b border-rose-200',
    slate: 'bg-mist text-slate-500b border-line',
    green: 'bg-emerald-50 text-green-600b border-emerald-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Audit drawer — "How was this calculated?"

export interface AuditRequest {
  title: string;
  lines: AuditLine[];
  ruleSetIds?: string[];
  sourceNote?: string;
}

export function AuditDrawer({ request, onClose, ruleLabels }: { request: AuditRequest | null; onClose: () => void; ruleLabels: Record<string, { label: string; kind: string; source: string; effectiveFrom: string; verifiedAt: string; requiresConfirmation?: boolean }> }) {
  if (!request) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/40" onClick={onClose}>
      <div
        className="bp-rise h-full w-[420px] overflow-y-auto border-l border-line bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-500">
              How was this calculated?
            </div>
            <h3 className="font-display mt-1 text-lg font-semibold text-ink">{request.title}</h3>
          </div>
          <button onClick={onClose} className="rounded-md border border-line px-2 py-1 text-xs text-slate-500b hover:bg-mist">
            Close
          </button>
        </div>
        <div className="mt-5 divide-y divide-line rounded-lg border border-line">
          {request.lines.map((l, i) => (
            <div key={i} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <div>
                <div className="text-[13px] text-ink">{l.label}</div>
                {l.note ? <div className="mt-0.5 text-[11.5px] leading-snug text-slate-500b">{l.note}</div> : null}
              </div>
              {l.value !== undefined ? (
                <div className={`num shrink-0 text-[13px] font-semibold ${(l.value ?? 0) < 0 ? 'text-rose-600b' : 'text-ink'}`}>
                  {l.format === 'percent' ? pct(l.value) : l.format === 'number' ? l.value.toFixed(1) : l.format === 'text' ? '' : money(l.value)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {request.ruleSetIds && request.ruleSetIds.length > 0 ? (
          <div className="mt-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Rules applied</div>
            <div className="mt-2 space-y-2">
              {request.ruleSetIds.map((id) => {
                const r = ruleLabels[id];
                if (!r) return null;
                return (
                  <div key={id} className="rounded-lg border border-line bg-mist px-3 py-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">{r.label}</span>
                      <Pill tone={r.kind === 'regulation' ? 'teal' : r.kind === 'lender-policy' ? 'slate' : 'amber'}>
                        {r.kind === 'regulation' ? 'Regulation' : r.kind === 'lender-policy' ? 'Lender policy' : 'Blueprint assumption'}
                      </Pill>
                    </div>
                    <div className="mt-1 text-slate-500b">
                      {r.source} · effective {r.effectiveFrom} · verified {r.verifiedAt}
                      {r.requiresConfirmation ? ' · requires adviser confirmation' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {request.sourceNote ? (
          <p className="mt-4 text-[11.5px] leading-relaxed text-slate-500b">{request.sourceNote}</p>
        ) : null}
      </div>
    </div>
  );
}
