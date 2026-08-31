'use client';

// Transaction intelligence: AKAHU ACTUAL vs FACT FIND DECLARED vs BANK
// BENCHMARK (three separate concepts, one table), "Items worth checking"
// outliers, income detection, loan reconciliation, valuation entry and the
// "Connect financial data" flow.

import { useEffect, useMemo, useState } from 'react';
import type { Client } from '@/lib/domain/types';
import type { FeedSnapshot } from '@/lib/data-sources/types';
import { qvValuationProvider } from '@/lib/data-sources/types';
import { demoFeedFor } from '@/lib/data-sources/demoFeed';
import {
  analyseFeed,
  repaymentCrossCheck,
  threeWayExpenseTable,
  detectOutliers,
  type FeedAnalysis,
} from '@/lib/calculators/cashflow';
import type { LenderPolicy } from '@/lib/rules/types';
import { Card, Pill } from '@/components/ui';
import { money, moneyShort } from '@/lib/format';
import type { ScenarioChange } from '@/lib/scenarios/changes';

export interface FeedState {
  snapshot: FeedSnapshot;
  analysis: FeedAnalysis;
  isLive: boolean;
}

/** Load a live Akahu snapshot (server route or pre-synced file) or fall back
 *  to the deterministic demo feed. Tokens never reach this code — the route
 *  holds them server-side. */
export function useFeed(client: Client): FeedState {
  const [live, setLive] = useState<FeedSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of ['api/akahu/snapshot', 'feed/live.json']) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const s = await r.json();
          if (!cancelled && s && s.provider === 'akahu') {
            setLive(s as FeedSnapshot);
            return;
          }
        } catch {
          /* next source */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const snapshot = live ?? demoFeedFor(client);
  const analysis = useMemo(() => analyseFeed(snapshot, client), [snapshot, client]);
  return { snapshot, analysis, isLive: !!live };
}

type RowMark = 'one-off' | 'discretionary' | 'excluded' | 'accepted' | undefined;

export function LiveDataPanel({
  client,
  feed,
  presentation,
  addChanges,
  policy,
  netIncomeMonthly,
}: {
  client: Client;
  feed: FeedState;
  presentation: boolean;
  addChanges: (changes: ScenarioChange[], name?: string) => void;
  policy: LenderPolicy;
  netIncomeMonthly: number;
}) {
  const a = feed.analysis;
  const cross = repaymentCrossCheck(a, client);
  const [valAmount, setValAmount] = useState('');
  const [valSource, setValSource] = useState('QV E-Valuer');
  const [valProperty, setValProperty] = useState(client.properties[0]?.id ?? '');
  const [rowMarks, setRowMarks] = useState<Record<string, RowMark>>({});
  const [excludedOutliers, setExcludedOutliers] = useState<Record<string, boolean>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const outliers = useMemo(() => detectOutliers(feed.snapshot), [feed.snapshot]);
  // Excluded outliers reduce the AKAHU ACTUAL averages deterministically.
  const excludedMonthlyByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of outliers) {
      if (excludedOutliers[o.id]) map[o.likelyCategory] = (map[o.likelyCategory] ?? 0) + o.amount / Math.max(1, a.monthsCovered);
    }
    return map;
  }, [outliers, excludedOutliers, a.monthsCovered]);

  const table = useMemo(
    () => threeWayExpenseTable(a, client, policy, netIncomeMonthly, { excludedMonthlyByCategory }),
    [a, client, policy, netIncomeMonthly, excludedMonthlyByCategory],
  );

  const markRow = (category: string, mark: RowMark, monthly: number) => {
    setRowMarks((p) => ({ ...p, [category]: mark }));
    setMenuFor(null);
    if (mark === 'excluded') {
      addChanges([{ kind: 'setLivingCostDelta', monthly: -monthly, label: `${category} excluded from forward modelling` }]);
    }
  };

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold text-ink">Spending — actual vs declared vs benchmark</h3>
        <div className="flex items-center gap-2">
          <Pill tone={feed.isLive ? 'green' : 'slate'}>{feed.isLive ? '● Akahu connected' : '○ Demo feed'}</Pill>
          <span className="text-[11px] text-slate-500b">
            {a.provider} · {a.monthsCovered} months · synced {a.syncedAt.slice(0, 10)}
          </span>
        </div>
      </div>

      {/* ------------------------------------------- Three-way expense table */}
      <Card className="mb-4 p-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.1em] text-slate-500b">
                <th className="pb-2 pr-3 font-medium">Category</th>
                <th className="pb-2 pr-3 text-right font-medium">Akahu actual</th>
                <th className="pb-2 pr-3 text-right font-medium">Fact Find</th>
                <th className="pb-2 pr-3 text-right font-medium">Bank benchmark*</th>
                <th className="pb-2 pr-3 text-right font-medium">Difference</th>
                <th className="pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => {
                const mark = rowMarks[r.category];
                const overBench = r.differenceVsBenchmark !== undefined && r.differenceVsBenchmark > 0.3 && (r.akahuActualMonthly ?? 0) - (r.benchmarkMonthly ?? 0) > 150;
                return (
                  <tr key={r.category} className={`border-b border-line/60 align-top ${mark === 'excluded' ? 'opacity-45' : ''}`}>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-ink">
                        {r.category}
                        {mark ? (
                          <span className="ml-1.5 rounded bg-mist px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-slate-500b">
                            {mark === 'one-off' ? 'one-off' : mark === 'discretionary' ? 'discretionary' : mark === 'excluded' ? 'excluded from modelling' : 'accepted ongoing'}
                          </span>
                        ) : null}
                      </div>
                      {r.observation && !presentation ? (
                        <div className={`mt-1 max-w-md rounded px-2 py-1 text-[11px] leading-snug ${r.status === 'review' ? 'bg-amber-50 text-amber-900' : 'bg-mist text-slate-500b'}`}>
                          {r.observation}
                        </div>
                      ) : null}
                    </td>
                    <td className={`num py-2 pr-3 text-right font-semibold ${overBench ? 'text-rose-600b' : 'text-ink'}`}>
                      {r.akahuActualMonthly !== undefined ? `${money(r.akahuActualMonthly)}` : '—'}
                    </td>
                    <td className="num py-2 pr-3 text-right text-slate-500b">{r.factFindMonthly !== undefined ? money(r.factFindMonthly) : '—'}</td>
                    <td className="num py-2 pr-3 text-right text-slate-500b">{r.benchmarkMonthly !== undefined ? money(r.benchmarkMonthly) : '—'}</td>
                    <td className={`num py-2 pr-3 text-right font-semibold ${overBench ? 'text-rose-600b' : (r.differenceVsBenchmark ?? 0) < -0.3 ? 'text-green-600b' : 'text-slate-400'}`}>
                      {r.differenceVsBenchmark !== undefined ? `${r.differenceVsBenchmark >= 0 ? '+' : '−'}${Math.round(Math.abs(r.differenceVsBenchmark) * 100)}% vs benchmark` : '—'}
                    </td>
                    <td className="relative py-2 text-right">
                      {presentation ? (
                        <Pill tone={r.status === 'review' ? 'amber' : 'slate'}>{r.status === 'review' ? 'Review' : 'OK'}</Pill>
                      ) : (
                        <>
                          <button
                            onClick={() => setMenuFor(menuFor === r.category ? null : r.category)}
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${r.status === 'review' ? 'border-amber-200 bg-amber-50 text-amber-600b' : 'border-line bg-white text-slate-500b'} hover:border-teal-500`}
                          >
                            {r.status === 'review' ? 'Review ▾' : 'OK ▾'}
                          </button>
                          {menuFor === r.category ? (
                            <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-line bg-white p-1 text-left shadow-xl">
                              {(
                                [
                                  ['accepted', 'Accept as ongoing'],
                                  ['one-off', 'Mark as one-off'],
                                  ['discretionary', 'Mark as discretionary'],
                                  ['excluded', 'Exclude from forward modelling'],
                                ] as const
                              ).map(([m, label]) => (
                                <button
                                  key={m}
                                  onClick={() => markRow(r.category, m, r.akahuActualMonthly ?? 0)}
                                  className="block w-full rounded px-2.5 py-1.5 text-[12px] text-ink hover:bg-aqua-100"
                                >
                                  {label}
                                </button>
                              ))}
                              <button onClick={() => markRow(r.category, undefined, 0)} className="block w-full rounded px-2.5 py-1.5 text-[12px] text-slate-500b hover:bg-mist">
                                Clear mark
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="py-2.5 pr-3">Total</td>
                <td className="num py-2.5 pr-3 text-right">{money(table.actualTotal)}</td>
                <td className="num py-2.5 pr-3 text-right">{money(table.declaredTotal)}</td>
                <td className="num py-2.5 pr-3 text-right">{money(table.benchmarkTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500b">*{table.note}</p>
      </Card>

      {/* ------------------------------------------- Items worth checking */}
      {outliers.length > 0 ? (
        <Card className="mb-4 p-5">
          <div className="flex items-baseline justify-between">
            <h4 className="text-[13.5px] font-semibold text-ink">Items worth checking</h4>
            <span className="text-[11px] text-slate-500b">one-off transactions are not permanent monthly spending — toggle what counts</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.1em] text-slate-500b">
                  <th className="pb-2 pr-3 font-medium">Merchant / description</th>
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 text-right font-medium">Amount</th>
                  <th className="pb-2 pr-3 font-medium">Likely category</th>
                  <th className="pb-2 pr-3 font-medium">Recurring?</th>
                  <th className="pb-2 text-right font-medium">Include in ongoing?</th>
                </tr>
              </thead>
              <tbody>
                {outliers.map((o) => (
                  <tr key={o.id} className={`border-b border-line/60 ${excludedOutliers[o.id] ? 'opacity-50' : ''}`}>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-ink">{o.merchant}</div>
                      <div className="text-[10.5px] text-slate-400">{o.reason}</div>
                    </td>
                    <td className="num py-2 pr-3 text-slate-500b">{o.date}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">{money(o.amount)}</td>
                    <td className="py-2 pr-3 text-slate-500b">{o.likelyCategory}</td>
                    <td className="py-2 pr-3">
                      <Pill tone={o.recurring === 'yes' ? 'teal' : o.recurring === 'no' ? 'slate' : 'amber'}>{o.recurring}</Pill>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        disabled={presentation}
                        onClick={() => setExcludedOutliers((p) => ({ ...p, [o.id]: !p[o.id] }))}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                          excludedOutliers[o.id] ? 'bg-mist text-slate-500b' : 'bg-teal-500 text-white'
                        }`}
                      >
                        {excludedOutliers[o.id] ? 'Excluded' : 'Included'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500b">
            Excluding an item removes it from the monthly averages in the table above (deterministically — amount ÷ months covered), so
            one-off flights or furniture never masquerade as permanent spending.
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                  <option>CoreLogic estimate</option>
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

          {/* Connect financial data */}
          <Card tone="aqua" className="p-5">
            <h4 className="font-display text-[14.5px] font-semibold text-navy-800">
              {feed.isLive ? '● Financial data connected' : 'Connect financial data'}
            </h4>
            <p className="mt-1 text-[12.5px] leading-relaxed text-navy-800/85">
              Securely connect your bank accounts so we can pre-fill income, expenses and commitments. You remain in control of what is shared.
            </p>
            {!feed.isLive ? (
              <div className="mt-3 flex items-center gap-2">
                <a
                  href="https://my.akahu.nz"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-navy-800"
                >
                  Connect financial data
                </a>
                <span className="text-[11px] text-navy-800/70">via Akahu — a one-off account information share, not a statement upload</span>
              </div>
            ) : null}
            <ol className="mt-3 space-y-1 text-[11.5px] leading-relaxed text-navy-800/80">
              <li>1. Authorise at Akahu and choose which accounts to share (one-off account information flow)</li>
              <li>2. Blueprint retrieves the permitted account and transaction data through a server-side route — tokens and credentials never reach the browser, and bank logins are never stored</li>
              <li>3. The data lands here categorised; you and your adviser confirm the classifications together</li>
            </ol>
            <p className="mt-2 text-[10.5px] leading-relaxed text-navy-800/60">
              Local setup: tokens in .env.local, then `npm run sync:akahu` or run the dev server for the live route. See docs/data-sources.md.
              CSV import and manual entry are available through the same provider seam when a client prefers not to connect.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
