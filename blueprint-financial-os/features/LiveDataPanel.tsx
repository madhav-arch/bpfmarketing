'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Client } from '@/lib/domain/types';
import type { FeedSnapshot } from '@/lib/data-sources/types';
import { qvValuationProvider } from '@/lib/data-sources/types';
import { demoFeedFor } from '@/lib/data-sources/demoFeed';
import { analyseFeed, repaymentCrossCheck, type FeedAnalysis } from '@/lib/calculators/cashflow';
import { Card, Pill } from '@/components/ui';
import { money, moneyShort } from '@/lib/format';
import type { ScenarioChange } from '@/lib/scenarios/changes';

export interface FeedState {
  snapshot: FeedSnapshot;
  analysis: FeedAnalysis;
  isLive: boolean;
}

/** Load a live Akahu snapshot (public/feed/live.json, written by
 *  `npm run sync:akahu`) or fall back to the deterministic demo feed. */
export function useFeed(client: Client): FeedState {
  const [live, setLive] = useState<FeedSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('feed/live.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((s) => {
        if (!cancelled && s && s.provider === 'akahu') setLive(s as FeedSnapshot);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const snapshot = live ?? demoFeedFor(client);
  const analysis = useMemo(() => analyseFeed(snapshot, client), [snapshot, client]);
  return { snapshot, analysis, isLive: !!live };
}

export function LiveDataPanel({
  client,
  feed,
  presentation,
  addChanges,
}: {
  client: Client;
  feed: FeedState;
  presentation: boolean;
  addChanges: (changes: ScenarioChange[], name?: string) => void;
}) {
  const a = feed.analysis;
  const cross = repaymentCrossCheck(a, client);
  const [valAmount, setValAmount] = useState('');
  const [valSource, setValSource] = useState('QV E-Valuer');
  const [valProperty, setValProperty] = useState(client.properties[0]?.id ?? '');

  const spendRows = a.spendByCategory.filter((c) => !['Income', 'Transfers & savings', 'Debt repayments'].includes(c.category)).slice(0, 9);
  const maxSpend = Math.max(...spendRows.map((r) => Math.max(r.monthlyAverage, r.declaredMonthly ?? 0)), 1);

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[15px] font-semibold text-ink">Live data — what the statements actually say</h3>
        <div className="flex items-center gap-2">
          <Pill tone={feed.isLive ? 'green' : 'slate'}>
            {feed.isLive ? '● Akahu connected' : '○ Demo feed'}
          </Pill>
          <span className="text-[11px] text-slate-500b">
            {a.provider} · {a.monthsCovered} months · synced {a.syncedAt.slice(0, 10)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Actual vs declared spending */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between">
            <h4 className="text-[13.5px] font-semibold text-ink">Actual spending vs Fact Find</h4>
            <span className="num text-[12px] text-slate-500b">
              actual {money(a.totalSpendMonthly)}/mo vs declared {money(a.declaredSpendMonthly)}/mo
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {spendRows.map((r) => (
              <div key={r.category} className="text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500b">{r.category}</span>
                  <span className="num font-semibold text-ink">
                    {money(r.monthlyAverage)}/mo
                    {r.declaredMonthly !== undefined ? (
                      <span className={`ml-1.5 text-[10.5px] ${(r.varianceVsDeclared ?? 0) > 100 ? 'text-rose-600b' : 'text-slate-400'}`}>
                        declared {moneyShort(r.declaredMonthly)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-mist">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${(r.monthlyAverage / maxSpend) * 100}%` }} />
                </div>
                {r.flag && !presentation ? (
                  <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">{r.flag}</div>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500b">
            Deterministic categorisation of {a.audit[0]?.value ?? 0} transactions — comparisons shown only where the categories match like-for-like. Lenders reconcile statements against the application; better to declare what the statements show.
          </p>
        </Card>

        <div className="space-y-4">
          {/* Detected income */}
          <Card className="p-5">
            <h4 className="text-[13.5px] font-semibold text-ink">Detected income</h4>
            <div className="mt-2 divide-y divide-line">
              {a.incomeStreams.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-[12.5px]">
                  <span className="text-slate-500b">
                    {s.label}
                    <span className="ml-1.5 text-[10.5px] uppercase tracking-wide text-slate-400">{s.cadence}</span>
                  </span>
                  <span className="num font-semibold text-ink">{money(s.monthlyAverage)}/mo</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-1.5 text-[12.5px] font-semibold">
                <span>Total detected</span>
                <span className="num">{money(a.totalIncomeMonthly)}/mo · surplus {money(a.surplusMonthly)}/mo</span>
              </div>
            </div>
          </Card>

          {/* Mortgage reconciliation */}
          {a.mortgages.length > 0 ? (
            <Card className="p-5">
              <h4 className="text-[13.5px] font-semibold text-ink">Loan accounts in the feed</h4>
              <div className="mt-2 divide-y divide-line">
                {a.mortgages.map((m, i) => (
                  <div key={i} className="py-1.5 text-[12.5px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500b">{m.accountName} · {m.bank}</span>
                      <span className="num font-semibold text-ink">{money(m.feedBalance)}</span>
                    </div>
                    {m.difference !== undefined && Math.abs(m.difference) > 500 && !presentation ? (
                      <div className="mt-0.5 text-[11px] text-amber-600b">
                        Recorded figure is {money(Math.abs(m.difference))} {m.difference < 0 ? 'higher' : 'lower'} than the live balance — update the file before application.
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="flex items-center justify-between py-1.5 text-[11.5px] text-slate-500b">
                  <span>Repayments seen in statements</span>
                  <span className="num">{money(cross.feedMonthly)}/mo (recorded: {money(cross.recordedMonthly)}/mo)</span>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {!presentation ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Valuation entry */}
          {client.properties.length > 0 ? (
            <Card className="p-5">
              <h4 className="text-[13.5px] font-semibold text-ink">Record a valuation</h4>
              <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500b">{qvValuationProvider.unavailableReason}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={valProperty} onChange={(e) => setValProperty(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px]">
                  {client.properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.nickname}</option>
                  ))}
                </select>
                <select value={valSource} onChange={(e) => setValSource(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px]">
                  <option>QV E-Valuer</option>
                  <option>Bank internal valuation</option>
                  <option>Registered valuation</option>
                  <option>Adviser estimate</option>
                </select>
                <input
                  value={valAmount}
                  onChange={(e) => setValAmount(e.target.value)}
                  placeholder="$ value"
                  inputMode="numeric"
                  className="num w-28 rounded-lg border border-line px-2.5 py-1.5 text-[12px]"
                />
                <button
                  onClick={() => {
                    const v = parseFloat(valAmount.replace(/[^0-9.]/g, ''));
                    if (v > 10_000) {
                      addChanges([{ kind: 'addValuation', propertyId: valProperty, value: v, sourceName: valSource }]);
                      setValAmount('');
                    }
                  }}
                  className="rounded-lg bg-teal-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-400"
                >
                  Record & use
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500b">Stored with source, date and confidence — visible in every “How was this calculated?” trail. Or just type: “QV values the house at $1.52m”.</p>
            </Card>
          ) : null}

          {/* Connection help */}
          <Card tone="aqua" className="p-5">
            <h4 className="text-[13.5px] font-semibold text-navy-800">
              {feed.isLive ? 'Akahu feed active' : 'Connect a real bank feed (Akahu)'}
            </h4>
            <ol className="mt-2 space-y-1 text-[12px] leading-relaxed text-navy-800/85">
              <li>1. Connect banks at my.akahu.nz, create a Personal App at developers.akahu.nz</li>
              <li>2. Put the app + user tokens in <code className="rounded bg-white/60 px-1">.env.local</code></li>
              <li>3. Run <code className="rounded bg-white/60 px-1">npm run sync:akahu</code> and restart</li>
            </ol>
            <p className="mt-2 text-[11px] leading-relaxed text-navy-800/70">
              Tokens stay on the adviser's machine; snapshots are PII-redacted and never committed. Production uses Akahu's OAuth flow with per-client consent — see docs/data-sources.md.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
