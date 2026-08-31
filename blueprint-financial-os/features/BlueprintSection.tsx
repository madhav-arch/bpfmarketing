'use client';

// 08 — Recommended Blueprint: the culmination of the meeting.
// WHERE ARE YOU NOW → WHAT COULD CHANGE → WHAT DOES THAT ACHIEVE, laid out
// per client type, with a TODAY vs YOUR BLUEPRINT snapshot (explicit
// timeframes), clickable opportunity cards, deterministic benefits/risks/
// considerations, and the post-meeting summary generated from engine output.

import { useMemo, useState } from 'react';
import { Card, SectionHeading, Pill } from '@/components/ui';
import { money, moneyShort, pct, years } from '@/lib/format';
import type { SectionProps } from './types';
import type { ScenarioChange } from '@/lib/scenarios/changes';
import { describeChange } from '@/lib/scenarios/changes';
import { explainChange } from '@/lib/scenarios/diff';
import { buildMeetingSummary } from '@/lib/summary/meetingSummary';
import { buildRationale } from '@/lib/summary/rationale';
import { generateInsights, type Insight } from '@/lib/insights/engine';
import type { CalculationResult } from '@/lib/scenarios/compute';
import { todaysDollars } from '@/lib/calculators/finance';

interface BlueprintProps extends SectionProps {
  scenarioName: string;
  scenarioChanges: ScenarioChange[];
  isRecommended: boolean;
  onSetRecommended: () => void;
  recommendedResult?: CalculationResult;
  recommendedName?: string;
}

/** Map an opportunity insight to the change that models it (deterministic). */
function opportunityAction(ins: Insight, result: CalculationResult): ScenarioChange[] | null {
  if (ins.id === 'cards-drag') return [{ kind: 'closeCreditCards' }];
  if (ins.id === 'repayment-opportunity') return [{ kind: 'adjustRepayment', delta: 500, frequency: 'fortnightly' }];
  if (ins.id === 'deposit-tier-unlock' && result.fhb) {
    const next = result.fhb.tiers.find((t) => !t.achievable);
    if (next) return [{ kind: 'setDepositSource', source: 'gift', value: Math.ceil(next.additionalRequired / 100) * 100 }];
  }
  return null;
}

export function BlueprintSection(props: BlueprintProps) {
  const { client, result, baseline, scenarioName, scenarioChanges, isRecommended, onSetRecommended, presentation, ctx, feed } = props;
  const diffs = useMemo(() => explainChange(baseline, result), [baseline, result]);
  const feedFacts = useMemo(
    () => ({
      actualSpendMonthly: feed.analysis.totalSpendMonthly,
      declaredSpendMonthly: feed.analysis.declaredSpendMonthly,
      outlierCount: 0,
      reviewCategories: [],
    }),
    [feed.analysis],
  );
  const insights = useMemo(() => generateInsights(client, result, ctx, feedFacts), [client, result, ctx, feedFacts]);
  const autoRationale = useMemo(() => buildRationale(baseline, result, scenarioChanges), [baseline, result, scenarioChanges]);
  const [rationaleEdits, setRationaleEdits] = useState<Record<string, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [approved, setApproved] = useState(false);
  const [adviserNotes, setAdviserNotes] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const rationaleText = (key: 'benefits' | 'risks' | 'considerations') =>
    autoRationale[key].map((item, i) => rationaleEdits[`${key}-${i}`] ?? item.text);

  const summary = useMemo(
    () =>
      buildMeetingSummary({
        client,
        scenarioName,
        changes: scenarioChanges,
        baseline,
        selected: result,
        diffs,
        rationale: {
          benefits: rationaleText('benefits'),
          risks: rationaleText('risks'),
          considerations: rationaleText('considerations'),
        },
        adviserNotes,
        outstandingInformation: [
          'IRD income summaries and latest payslips to confirm income figures',
          'Confirmation of KiwiSaver balances from providers',
          'Insurance policy schedules (covers, excesses, benefit periods)',
        ],
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, scenarioName, scenarioChanges, baseline, result, diffs, rationaleEdits, adviserNotes],
  );

  const hasChanges = scenarioChanges.length > 0;
  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section>
      <SectionHeading
        index="08 · Your blueprint"
        title="Where you are, what changes, what it achieves"
        lede="The agreed path, why it's the right one, and the record it leaves behind."
        right={
          !presentation ? (
            <button
              onClick={onSetRecommended}
              disabled={!hasChanges}
              className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
                isRecommended
                  ? 'bg-green-600b text-white'
                  : hasChanges
                    ? 'bg-navy-900 text-white hover:bg-navy-800'
                    : 'cursor-not-allowed bg-mist text-slate-400'
              }`}
            >
              {isRecommended ? '✓ Recommended Blueprint' : 'Set as Recommended Blueprint'}
            </button>
          ) : isRecommended ? (
            <Pill tone="green">Recommended Blueprint</Pill>
          ) : null
        }
      />

      {/* TODAY vs YOUR BLUEPRINT snapshot */}
      <SnapshotTable {...props} />

      {/* Per-client-type blueprint blocks */}
      <div className="mt-4">
        {client.clientType === 'fhb' && result.fhb ? <FhbBlueprint {...props} /> : null}
        {client.clientType === 'homeowner' ? <HomeownerBlueprint {...props} /> : null}
        {client.clientType === 'investor' ? <InvestorBlueprint {...props} /> : null}
      </div>

      {/* Opportunity cards */}
      <OpportunityCards {...props} insights={insights} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Why this strategy</h3>
          <p className="mt-0.5 text-[11.5px] text-slate-500b">
            Generated from engine facts — each line names its supporting calculation. Adviser-editable before anything ships.
          </p>
          <div className="mt-3 space-y-4">
            {(
              [
                ['Benefits', 'benefits', 'green'],
                ['Risks', 'risks', 'rose'],
                ['Considerations', 'considerations', 'slate'],
              ] as const
            ).map(([label, key, tone]) => (
              <div key={key}>
                <Pill tone={tone}>{label}</Pill>
                <div className="mt-2 space-y-2">
                  {autoRationale[key].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-500b">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal-500" />
                      <div className="w-full">
                        {presentation ? (
                          <span>{rationaleEdits[`${key}-${i}`] ?? item.text}</span>
                        ) : (
                          <textarea
                            value={rationaleEdits[`${key}-${i}`] ?? item.text}
                            rows={2}
                            onChange={(e) => setRationaleEdits((r) => ({ ...r, [`${key}-${i}`]: e.target.value }))}
                            className="w-full resize-none bg-transparent leading-relaxed outline-none focus:text-ink"
                          />
                        )}
                        {!presentation ? (
                          <div className="text-[10px] uppercase tracking-wide text-slate-400">supporting: {item.supporting}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Deterministic insights</h3>
          <p className="mt-0.5 text-[12px] text-slate-500b">Rules-based observations from the engine — each one traceable, none invented.</p>
          <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {insights.map((ins) => (
              <div
                key={ins.id}
                className={`rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                  ins.severity === 'attention'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : ins.severity === 'opportunity'
                      ? 'border-teal-300/50 bg-aqua-100 text-navy-800'
                      : 'border-line bg-white text-slate-500b'
                }`}
              >
                <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{ins.category}</span>
                {ins.message}
                {ins.discuss && !presentation ? <div className="mt-1 text-[11.5px] italic opacity-70">Ask: {ins.discuss}</div> : null}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {!presentation ? (
        <Card className="mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">Post-meeting summary</h3>
              <p className="mt-0.5 text-[12.5px] text-slate-500b">
                Built from the baseline, the {isRecommended ? 'recommended' : 'active'} scenario, the deterministic insights and your notes —
                every figure comes from the calculation engine.
              </p>
            </div>
            <button
              onClick={() => setShowSummary((s) => !s)}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-800"
            >
              {showSummary ? 'Hide summary' : 'Generate meeting summary'}
            </button>
          </div>
          {showSummary ? (
            <>
              <div className="mt-4">
                <label className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-slate-500b">Adviser notes from the meeting (one per line)</label>
                <textarea
                  value={adviserNotes}
                  onChange={(e) => setAdviserNotes(e.target.value)}
                  rows={3}
                  placeholder={'e.g. Clients keen to keep repayments under $1,200/fn\nDiscuss trust structure with accountant before settlement'}
                  className="mt-1 w-full rounded-lg border border-line p-3 text-[13px] leading-relaxed outline-none focus:border-teal-500"
                />
              </div>
              <pre className="mt-3 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-mist p-5 font-sans text-[12.5px] leading-relaxed text-ink print:max-h-none print:border-0 print:bg-white">
                {summary}
              </pre>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="mr-2 flex items-center gap-1.5 text-[12.5px] text-slate-500b">
                  <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="accent-[#2ab3b1]" />
                  Adviser reviewed & approved
                </label>
                <button
                  disabled={!approved}
                  onClick={() => copy('email', summary)}
                  className={`rounded-lg px-3.5 py-2 text-[12.5px] font-semibold ${approved ? 'bg-teal-500 text-white hover:bg-teal-400' : 'cursor-not-allowed bg-mist text-slate-400'}`}
                >
                  {copied === 'email' ? '✓ Copied' : 'Copy email summary'}
                </button>
                <button
                  disabled={!approved}
                  onClick={() => window.print()}
                  className={`rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold ${approved ? 'border-line text-ink hover:bg-mist' : 'cursor-not-allowed border-line text-slate-400'}`}
                  title="Use the browser's print dialog — Save as PDF"
                >
                  Export PDF / print view
                </button>
                <button
                  onClick={() => copy('scenario', JSON.stringify({ scenario: scenarioName, changes: scenarioChanges, savedAt: new Date().toISOString() }, null, 2))}
                  className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-mist"
                >
                  {copied === 'scenario' ? '✓ Copied' : 'Copy scenario'}
                </button>
              </div>
            </>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// TODAY vs YOUR BLUEPRINT — explicit timeframes on every row.

function SnapshotTable({ client, result, baseline, scenarioName }: BlueprintProps) {
  const rows: { label: string; timeframe: string; today: string; blueprint: string; better?: boolean }[] = [];
  const push = (label: string, timeframe: string, today: string, blueprint: string, better?: boolean) =>
    rows.push({ label, timeframe, today, blueprint, better });

  push('Net worth', 'today', moneyShort(baseline.snapshot.netWorth), moneyShort(result.snapshot.netWorth), result.snapshot.netWorth > baseline.snapshot.netWorth + 1000);
  if (client.mortgages.length > 0 || result.fhb) {
    push(
      'Mortgage-free',
      'projected',
      baseline.snapshot.mortgageFreeYear ? `${baseline.snapshot.mortgageFreeYear}` : result.fhb ? '—' : 'IO — no path',
      result.snapshot.mortgageFreeYear
        ? `${result.snapshot.mortgageFreeYear}`
        : result.fhb && result.amortisation.blueprint.paidOff
          ? `${result.amortisation.blueprint.payoffYear}`
          : 'IO — no path',
      (result.snapshot.mortgageFreeYear ?? 9999) < (baseline.snapshot.mortgageFreeYear ?? 9999),
    );
  }
  push('Monthly buffer', 'today', money(baseline.snapshot.monthlySurplus), money(result.snapshot.monthlySurplus), result.snapshot.monthlySurplus > baseline.snapshot.monthlySurplus + 40);
  push(
    'Borrowing capacity',
    'today, indicative',
    `${moneyShort(baseline.snapshot.maxLendingRange.min)}–${moneyShort(baseline.snapshot.maxLendingRange.max)}`,
    `${moneyShort(result.snapshot.maxLendingRange.min)}–${moneyShort(result.snapshot.maxLendingRange.max)}`,
    result.snapshot.maxLendingRange.max > baseline.snapshot.maxLendingRange.max + 5000,
  );
  if (baseline.snapshot.usableEquity > 0 || result.snapshot.usableEquity > 0) {
    push('Usable equity', 'today', moneyShort(baseline.snapshot.usableEquity), moneyShort(result.snapshot.usableEquity), result.snapshot.usableEquity > baseline.snapshot.usableEquity + 1000);
  }
  push(
    `KiwiSaver at ${client.retirement.targetAge}`,
    `nominal, ${result.retirement.yearsToRetirement} yrs out`,
    moneyShort(baseline.snapshot.kiwiSaverProjected),
    moneyShort(result.snapshot.kiwiSaverProjected),
    result.snapshot.kiwiSaverProjected > baseline.snapshot.kiwiSaverProjected + 2000,
  );
  push(
    'Retirement income',
    "today's dollars, at retirement",
    `${money(baseline.retirement.projectedAnnualIncomeToday)}/yr`,
    `${money(result.retirement.projectedAnnualIncomeToday)}/yr`,
    result.retirement.projectedAnnualIncomeToday > baseline.retirement.projectedAnnualIncomeToday + 300,
  );
  push('Protection', 'today', baseline.snapshot.protectionIssues > 0 ? `${baseline.snapshot.protectionIssues} to review` : 'Reviewed', result.snapshot.protectionIssues > 0 ? `${result.snapshot.protectionIssues} to review` : 'Reviewed');

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line bg-mist/60 text-left text-[10.5px] uppercase tracking-[0.12em] text-slate-500b">
            <th className="px-4 py-2.5 font-medium">Measure</th>
            <th className="px-3 py-2.5 font-medium">Timeframe</th>
            <th className="px-3 py-2.5 text-right font-medium">Today (baseline)</th>
            <th className="px-3 py-2.5 text-right font-medium">Your Blueprint · {scenarioName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line/60">
              <td className="px-4 py-2 font-medium text-ink">{r.label}</td>
              <td className="px-3 py-2 text-[11px] text-slate-400">{r.timeframe}</td>
              <td className="num px-3 py-2 text-right text-slate-500b">{r.today}</td>
              <td className={`num px-3 py-2 text-right font-semibold ${r.better ? 'text-green-600b' : 'text-ink'}`}>
                {r.blueprint}
                {r.blueprint !== r.today ? <span className="ml-1 text-[10px] text-slate-400">*</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10.5px] text-slate-500b">*projected according to the selected scenario and its stated assumptions — indicative, not guaranteed.</div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// FHB blueprint: CURRENT POSITION → PROPOSED PURCHASE → OPTIMISATION → LONG TERM

function FhbBlueprint({ result, baseline, ctx }: BlueprintProps) {
  const f = result.fhb!;
  const sv = result.servicing;
  const opt = result.amortisation;
  const yearsSaved = opt.extraMonthly > 0 && opt.blueprint.paidOff ? (f.termYears - opt.blueprint.termYears) : 0;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <BlockCard title="Current position" step={1}>
        <BRow label="Recognised income" value={`${money(sv.recognisedIncomeMonthly)}/mo`} />
        <BRow label="Bank living costs" value={`−${money(sv.livingExpenses.totalMonthly)}/mo`} />
        <BRow label="Debt commitments" value={`−${money(sv.debtServicing.totalMonthly)}/mo`} />
        <BRow label="Stress repayment capacity" value={`${money(sv.umi)}/mo`} strong />
        <BRow label="Indicative borrowing" value={moneyShort(sv.maxNewLending)} />
        <BRow label="Deposit ready" value={moneyShort(f.totalDeposit)} />
        <BRow label="KiwiSaver today" value={moneyShort(baseline.snapshot.kiwiSaverNow)} />
      </BlockCard>
      <BlockCard title="Proposed purchase" step={2} accent>
        <BRow label="Purchase price" value={moneyShort(f.purchasePrice)} strong />
        <BRow label="Deposit" value={`${moneyShort(f.totalDeposit)} (${pct(f.depositPercent, 1)})`} />
        <BRow label="Loan" value={moneyShort(f.loan)} />
        <BRow label="Rate" value={`${pct(f.effectiveRate)} (base ${pct(f.baseRate)} + LEM ${pct(f.lowEquityMargin)})`} />
        <BRow label="Repayment" value={`${money(f.repaymentFortnightly)}/fn`} />
        <BRow label="Rates + insurance" value={`${money(f.ownershipCosts.ratesMonthly + f.ownershipCosts.insuranceMonthly)}/mo`} />
        <BRow label="Total ownership cost" value={`${money(f.ownershipCosts.totalMonthly)}/mo`} strong />
        <BRow label="Monthly surplus after" value={money(result.snapshot.monthlySurplus)} />
      </BlockCard>
      <BlockCard title="Optimisation" step={3}>
        <BRow label="Extra repayment" value={opt.extraMonthly > 0 ? `${money(opt.extraMonthly)}/mo` : 'none modelled yet'} strong={opt.extraMonthly > 0} />
        <BRow label="Mortgage-free" value={opt.blueprint.paidOff ? `~${opt.blueprint.payoffYear}` : '—'} />
        <BRow label="Years saved" value={yearsSaved > 0.05 ? years(yearsSaved) : '—'} />
        <BRow
          label="Interest saved"
          value={opt.extraMonthly > 0 ? moneyShort(Math.max(0, opt.current.totalInterest - opt.blueprint.totalInterest)) : '—'}
        />
        <div className="mt-2 text-[11px] leading-snug text-slate-500b">Try +$50/wk or +$500/fn on the first-home screen — the whole column updates.</div>
      </BlockCard>
      <BlockCard title="Long term" step={4}>
        <BRow label={`KiwiSaver at ${result.retirement.retirementYear}`} value={`${moneyShort(result.retirement.projectedKiwiSaver)} nominal`} />
        <BRow label="…in today's dollars" value={moneyShort(result.retirement.projectedKiwiSaverToday)} />
        <BRow label="Net worth at retirement" value={`${moneyShort(result.retirement.projectedNetWorth)} nominal`} />
        <BRow label="Retirement income" value={`${money(result.retirement.projectedAnnualIncomeToday)}/yr today's $`} strong />
        <BRow label="…per week" value={`${money(result.retirement.projectedWeeklyIncomeToday)}/wk`} />
        <div className="mt-2 text-[11px] leading-snug text-slate-500b">
          Includes the modelled first-home withdrawal; {pct(ctx.retirement.drawdownRate, 0)} drawdown is a planning heuristic, not a guarantee.
        </div>
      </BlockCard>
    </div>
  );
}

// Homeowner blueprint: CURRENT → BLUEPRINT → RESULT

function HomeownerBlueprint({ client, result, baseline, scenarioChanges }: BlueprintProps) {
  const cur = baseline.amortisation.current;
  const bp = result.amortisation.blueprint;
  const scheduled = baseline.snapshot.actualRepaymentsMonthly;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <BlockCard title="Current" step={1}>
        <BRow label="Mortgage structure" value={`${client.mortgages.length} split${client.mortgages.length > 1 ? 's' : ''} · ${moneyShort(client.mortgages.reduce((s, m) => s + m.balance, 0))}`} />
        <BRow label="Remaining term" value={cur.paidOff ? years(cur.termYears) : 'IO — no payoff path'} />
        <BRow label="Current repayment" value={`${money(scheduled)}/mo`} />
        <BRow label="Current equity" value={moneyShort(baseline.snapshot.usableEquity)} />
        <BRow label="Current surplus" value={`${money(baseline.snapshot.monthlySurplus)}/mo`} />
        <BRow label="Mortgage-free" value={cur.paidOff ? `~${cur.payoffYear}` : '—'} strong />
      </BlockCard>
      <BlockCard title="Blueprint" step={2} accent>
        {scenarioChanges.length > 0 ? (
          scenarioChanges.map((c, i) => (
            <div key={i} className="rounded-lg bg-white/70 px-3 py-1.5 text-[12.5px] font-medium text-navy-800">
              {describeChange(c)}
            </div>
          ))
        ) : (
          <p className="text-[12.5px] leading-relaxed text-navy-800/70">
            No changes applied yet — explore the restructure lab or ask the copilot, then lock the winning scenario in here.
          </p>
        )}
      </BlockCard>
      <BlockCard title="Result" step={3}>
        <BRow label="Mortgage-free" value={bp.paidOff ? `~${bp.payoffYear}` : '—'} strong />
        <BRow label="Years saved" value={cur.paidOff && bp.paidOff && cur.termYears - bp.termYears > 0.05 ? years(cur.termYears - bp.termYears) : '—'} />
        <BRow label="Interest difference" value={cur.totalInterest - bp.totalInterest > 100 ? `${moneyShort(cur.totalInterest - bp.totalInterest)} less` : '—'} />
        <BRow label="Cashflow" value={`${money(result.snapshot.monthlySurplus)}/mo`} />
        <BRow label="Usable equity" value={moneyShort(result.snapshot.usableEquity)} />
        <BRow label="Future investment capacity" value={moneyShort(result.servicing.maxNewLending)} />
        <BRow label={`KiwiSaver at ${client.retirement.targetAge}`} value={`${moneyShort(result.snapshot.kiwiSaverProjected)} nominal`} />
      </BlockCard>
    </div>
  );
}

// Investor blueprint: CURRENT PORTFOLIO → PROPOSED STRATEGY → RESULT

function InvestorBlueprint({ client, result, baseline, scenarioChanges }: BlueprintProps) {
  const rentWk = (r: CalculationResult, c: typeof client) => c.properties.reduce((s, p) => s + (p.rentPerWeek?.value ?? 0), 0);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <BlockCard title="Current portfolio" step={1}>
        <BRow label="Properties" value={`${baseline.equity.properties.length}`} />
        <BRow label="Values" value={moneyShort(baseline.equity.totalValue)} />
        <BRow label="Debt" value={moneyShort(baseline.equity.totalDebt)} />
        <BRow label="LVR" value={pct(baseline.equity.portfolioLVR, 0)} />
        <BRow label="Usable equity" value={moneyShort(baseline.equity.totalUsableEquity)} />
        <BRow label="Rental income" value={`$${Math.round(rentWk(baseline, client))}/wk gross`} />
        <BRow label="Cashflow" value={`${money(baseline.snapshot.monthlySurplus)}/mo`} />
        <BRow label="Servicing headroom" value={moneyShort(baseline.servicing.maxNewLending)} />
      </BlockCard>
      <BlockCard title="Proposed strategy" step={2} accent>
        {scenarioChanges.length > 0 ? (
          scenarioChanges.map((c, i) => (
            <div key={i} className="rounded-lg bg-white/70 px-3 py-1.5 text-[12.5px] font-medium text-navy-800">
              {describeChange(c)}
            </div>
          ))
        ) : (
          <p className="text-[12.5px] leading-relaxed text-navy-800/70">
            No changes applied yet — run a quick action in the portfolio lab (keep + buy, sell + buy) or ask the copilot.
          </p>
        )}
      </BlockCard>
      <BlockCard title="Result" step={3}>
        <BRow label="Properties" value={`${result.equity.properties.length}`} />
        <BRow label="Debt" value={moneyShort(result.equity.totalDebt)} />
        <BRow label="Equity" value={moneyShort(result.equity.totalValue - result.equity.totalDebt)} />
        <BRow label="LVR" value={pct(result.equity.portfolioLVR, 0)} />
        <BRow label="Cashflow" value={`${money(result.snapshot.monthlySurplus)}/mo`} />
        <BRow label="Servicing headroom" value={moneyShort(result.servicing.maxNewLending)} strong />
        <BRow label="Next purchase capacity" value={moneyShort(result.equity.maxPurchaseWithEquity)} />
        <BRow label="Net worth at retirement" value={`${moneyShort(result.retirement.projectedNetWorth)} nominal`} />
      </BlockCard>
    </div>
  );
}

function BlockCard({ title, step, accent, children }: { title: string; step: number; accent?: boolean; children: React.ReactNode }) {
  return (
    <Card tone={accent ? 'aqua' : 'default'} className="p-5">
      <div className="flex items-center gap-2">
        <span className={`font-display flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${accent ? 'bg-teal-500 text-white' : 'bg-navy-900 text-white'}`}>
          {step}
        </span>
        <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${accent ? 'text-teal-500' : 'text-slate-500b'}`}>{title}</span>
      </div>
      <div className="mt-3 space-y-1.5">{children}</div>
    </Card>
  );
}

function BRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="text-slate-500b">{label}</span>
      <span className={`num text-right ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opportunity cards — 2–4 highest-value opportunities, clickable and modelable.

function OpportunityCards(props: BlueprintProps & { insights: Insight[] }) {
  const { insights, result, addChanges, presentation } = props;
  const cards = insights.filter((i) => i.severity === 'opportunity').slice(0, 4);
  if (cards.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500b">Highest-value opportunities — click to model</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((ins) => {
          const action = opportunityAction(ins, result);
          return (
            <button
              key={ins.id}
              disabled={presentation || !action}
              onClick={() => action && addChanges(action)}
              className={`rounded-xl border border-teal-300/60 bg-aqua-100/50 p-4 text-left transition-all ${action && !presentation ? 'hover:border-teal-500 hover:shadow-md' : 'cursor-default'}`}
            >
              <div className="text-[12.5px] font-semibold leading-snug text-navy-800">{ins.message.split('.')[0]}.</div>
              <div className="mt-1.5 text-[11px] leading-snug text-navy-800/70">{ins.message.split('.').slice(1).join('.').trim()}</div>
              {action && !presentation ? <div className="mt-2 text-[11px] font-semibold text-teal-500">Model it →</div> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
