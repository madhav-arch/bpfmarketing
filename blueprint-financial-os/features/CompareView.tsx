'use client';

// Scenario comparison — 2 to 4 columns side by side, showing only rows where
// the scenarios meaningfully differ. Rows with a clear better/worse direction
// are coloured; genuinely two-sided rows (purchase price, deposit, loan size)
// are marked as trade-offs, never naively green.

import type { CalculationResult } from '@/lib/scenarios/compute';
import { money, moneyShort, moneyTenKShort, pct, years } from '@/lib/format';

export interface CompareColumn {
  id: string;
  name: string;
  recommended?: boolean;
  result: CalculationResult;
}

interface RowDef {
  label: string;
  get: (r: CalculationResult) => number | null;
  fmt: (v: number) => string;
  goodWhen: 'up' | 'down' | 'neutral';
  threshold: number;
  note?: string;
}

const ROWS: RowDef[] = [
  { label: 'Purchase price', get: (r) => r.fhb?.purchasePrice ?? null, fmt: moneyShort, goodWhen: 'neutral', threshold: 1000, note: 'trade-off' },
  { label: 'Deposit', get: (r) => (r.fhb ? r.fhb.depositPercent : null), fmt: (v) => pct(v, 1), goodWhen: 'neutral', threshold: 0.002, note: 'trade-off' },
  { label: 'Loan', get: (r) => r.fhb?.loan ?? null, fmt: moneyShort, goodWhen: 'neutral', threshold: 1000, note: 'trade-off' },
  { label: 'Effective rate', get: (r) => r.fhb?.effectiveRate ?? null, fmt: (v) => pct(v), goodWhen: 'down', threshold: 0.0004 },
  { label: 'Repayment / fortnight', get: (r) => r.fhb?.repaymentFortnightly ?? null, fmt: (v) => money(v), goodWhen: 'down', threshold: 10 },
  { label: 'Ownership cost / month', get: (r) => r.fhb?.ownershipCosts.totalMonthly ?? null, fmt: (v) => money(v), goodWhen: 'down', threshold: 20 },
  { label: 'Monthly buffer', get: (r) => r.snapshot.monthlySurplus, fmt: (v) => money(v), goodWhen: 'up', threshold: 40 },
  { label: 'Borrowing capacity (model)', get: (r) => r.servicing.maxNewLending, fmt: moneyTenKShort, goodWhen: 'up', threshold: 5000 },
  { label: 'Mortgage-free', get: (r) => (r.amortisation.blueprint.paidOff ? r.amortisation.blueprint.payoffYear : null), fmt: (v) => `${Math.round(v)}`, goodWhen: 'down', threshold: 0.4 },
  { label: 'Years to mortgage-free', get: (r) => (r.amortisation.blueprint.paidOff ? r.amortisation.blueprint.termYears : null), fmt: years, goodWhen: 'down', threshold: 0.3 },
  { label: 'Interest remaining', get: (r) => r.amortisation.blueprint.totalInterest, fmt: moneyShort, goodWhen: 'down', threshold: 2000 },
  { label: 'Usable equity', get: (r) => r.snapshot.usableEquity, fmt: moneyShort, goodWhen: 'up', threshold: 5000 },
  { label: 'Portfolio LVR', get: (r) => (r.equity.totalDebt > 0 ? r.snapshot.portfolioLVR : null), fmt: (v) => pct(v, 0), goodWhen: 'down', threshold: 0.005 },
  { label: 'KiwiSaver at retirement (nominal)', get: (r) => r.snapshot.kiwiSaverProjected, fmt: moneyShort, goodWhen: 'up', threshold: 2000 },
  { label: "Retirement income (today's $)", get: (r) => r.retirement.projectedAnnualIncomeToday, fmt: (v) => `${money(v)}/yr`, goodWhen: 'up', threshold: 400 },
  { label: 'Net worth today', get: (r) => r.snapshot.netWorth, fmt: moneyShort, goodWhen: 'up', threshold: 2000 },
];

export function CompareView({ columns, onClose, onLoad }: { columns: CompareColumn[]; onClose: () => void; onLoad?: (id: string) => void }) {
  const rows = ROWS.filter((row) => {
    const vals = columns.map((c) => row.get(c.result)).filter((v): v is number => v !== null);
    if (vals.length < 2) return false;
    return Math.max(...vals) - Math.min(...vals) > row.threshold;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-6" onClick={onClose}>
      <div className="bp-rise max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-[11px] font-medium uppercase tracking-[0.2em] text-teal-500">Scenario comparison</div>
            <h3 className="font-display mt-1 text-[20px] font-semibold text-ink">Only what actually differs</h3>
          </div>
          <button onClick={onClose} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-slate-500b hover:bg-mist">Close</button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr>
                <th className="w-52 pb-2 text-left text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-500b">Measure</th>
                {columns.map((c) => (
                  <th key={c.id} className="px-2 pb-2 text-left align-bottom">
                    <div className="font-display text-[13.5px] font-semibold leading-snug text-ink">
                      {c.recommended ? <span className="mr-1 text-green-600b">✓</span> : null}
                      {c.name}
                    </div>
                    {onLoad && c.id !== 'baseline' ? (
                      <button onClick={() => onLoad(c.id)} className="mt-0.5 text-[10.5px] font-medium text-teal-500 hover:underline">load into working</button>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vals = columns.map((c) => row.get(c.result));
                const nums = vals.filter((v): v is number => v !== null);
                const best = row.goodWhen === 'up' ? Math.max(...nums) : row.goodWhen === 'down' ? Math.min(...nums) : null;
                const worst = row.goodWhen === 'up' ? Math.min(...nums) : row.goodWhen === 'down' ? Math.max(...nums) : null;
                return (
                  <tr key={row.label} className="border-t border-line/70">
                    <td className="py-2 pr-3 text-[12px] font-medium text-slate-500b">
                      {row.label}
                      {row.note ? <span className="ml-1.5 rounded bg-mist px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-slate-400">{row.note}</span> : null}
                    </td>
                    {vals.map((v, i) => (
                      <td key={columns[i].id} className="num px-2 py-2 font-semibold">
                        {v === null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span
                            className={
                              best !== null && nums.length > 1 && Math.abs(v - best) < row.threshold / 2 && best !== worst
                                ? 'text-green-600b'
                                : worst !== null && nums.length > 1 && Math.abs(v - worst) < row.threshold / 2 && best !== worst
                                  ? 'text-rose-600b'
                                  : 'text-ink'
                            }
                          >
                            {row.fmt(v)}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500b">
          Green marks the clearly better figure on measures with one good direction; rows tagged trade-off carry no colour because a bigger
          purchase or loan is a choice, not a win. Projections use the assumptions active in each scenario and are indicative, not guaranteed.
        </p>
      </div>
    </div>
  );
}
