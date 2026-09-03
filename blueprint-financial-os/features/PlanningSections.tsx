'use client';

import { useMemo, useState } from 'react';
import { Card, SectionHeading, Stat, Pill, AnimatedNumber, EditableValue, Segmented } from '@/components/ui';
import { KiwiSaverChart, NetWorthChart } from '@/components/charts';
import { money, moneyShort, pct } from '@/lib/format';
import { todaysDollars } from '@/lib/calculators/finance';
import { projectKiwiSaver } from '@/lib/calculators/kiwisaver';
import { manualAssumptionProvider, morningstarProvider, PAST_PERFORMANCE_DISCLAIMER } from '@/lib/kiwisaver/benchmarkProvider';
import { ratioBenchmarkProvider, datasetBenchmarkProvider, cohortOf } from '@/lib/insurance/benchmarkProvider';
import type { SectionProps } from './types';

type DollarMode = 'nominal' | 'today';

/** Statutory KiwiSaver employee contribution rates (dropdown, not free text). */
const KS_RATE_OPTIONS = [0.03, 0.035, 0.04, 0.06, 0.08, 0.1];

// ---------------------------------------------------------------------------
// 06 — KiwiSaver & retirement trajectory

export function FutureSection(props: SectionProps) {
  const { client, result, openAudit, presentation, ctx, addChanges } = props;
  const ret = result.retirement;
  const [mode, setMode] = useState<DollarMode>('nominal');
  const horizonYears = ret.yearsToRetirement;
  const show = (nominal: number, yrs = horizonYears) => (mode === 'nominal' ? nominal : todaysDollars(nominal, result.inflation, yrs));
  const modeLabel = mode === 'nominal' ? 'nominal' : "today's dollars";

  return (
    <section>
      <SectionHeading
        index="06 · Your future trajectory"
        title="KiwiSaver, retirement & the long game"
        lede="Projections under stated assumptions — planning ranges, never promises. Every long-term figure can be read in nominal or today's dollars."
        right={
          <div className="flex flex-col items-end gap-1">
            <Segmented
              options={[
                { value: 'nominal' as const, label: 'Nominal $' },
                { value: 'today' as const, label: "Today's $" },
              ]}
              value={mode}
              onChange={setMode}
            />
            <span className="text-[10.5px] text-slate-500b">
              inflation{' '}
              {presentation ? (
                <strong className="num">{pct(result.inflation, 1)}</strong>
              ) : (
                <EditableValue value={result.inflation} format="percent" decimals={1} size="sm" onCommit={(v) => addChanges([{ kind: 'setInflation', value: v }])} />
              )}
              /yr
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {client.kiwiSaverAccounts.map((acc, i) => {
          const proj = result.kiwiSaverProjections[i];
          if (!proj) return null;
          const owner = client.applicants.find((a) => a.id === acc.applicantId);
          const w = proj.base.withdrawalEvent;
          return (
            <Card key={acc.id} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-[15px] font-semibold text-ink">
                    {owner?.displayName ?? 'Member'} — KiwiSaver position
                  </h3>
                  <div className="mt-0.5 text-[12px] text-slate-500b">
                    {acc.provider} · {acc.fundType} fund ·{' '}
                    {acc.contributionRate > 0 ? `${pct(acc.contributionRate, 1)} contribution` : `voluntary ${money(acc.voluntaryMonthly ?? 0)}/mo`}
                    {acc.firstHomeIntent ? ' · first-home withdrawal intended' : ''}
                  </div>
                </div>
                <button
                  onClick={() => openAudit({ title: `KiwiSaver projection — ${owner?.displayName}`, lines: proj.base.audit, ruleSetIds: [ctx.kiwiSaver.id, ctx.ksWithdrawal.id] })}
                  className="text-[11.5px] font-medium text-teal-500 hover:underline"
                >
                  Assumptions
                </button>
              </div>
              <div className="mt-3">
                <KiwiSaverChart low={proj.low.balances} base={proj.base.balances} high={proj.high.balances} height={190} />
              </div>
              {w ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">
                  <strong>Year {w.year}: first-home withdrawal of {money(w.amount)}</strong> — the projection continues from {money(w.balanceAfter)}.
                  Today's purchase decision changes the age-{client.retirement.targetAge} balance.
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-3 gap-4">
                <Stat label="Today" value={acc.balance.value} />
                <Stat label={`In 10 years (${modeLabel})`} value={show(proj.base.at10Years, 10)} sub={`${moneyShort(show(proj.low.at10Years, 10))} – ${moneyShort(show(proj.high.at10Years, 10))}`} />
                <Stat label={`At ${client.retirement.targetAge} (${modeLabel})`} value={show(proj.base.atHorizon)} sub={`${moneyShort(show(proj.low.atHorizon))} – ${moneyShort(show(proj.high.atHorizon))}`} />
              </div>
            </Card>
          );
        })}
      </div>

      <KiwiSaverModeller {...props} mode={mode} />

      {result.kiwiSaverNotes.length > 0 && !presentation ? (
        <div className="mt-4 space-y-2">
          {result.kiwiSaverNotes.map((n, i) => (
            <div key={i} className={`rounded-lg border px-4 py-3 text-[13px] leading-relaxed ${n.severity === 'attention' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-line bg-white text-slate-500b'}`}>
              {n.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">Net-worth trajectory</h3>
          <p className="mt-0.5 text-[11.5px] text-slate-500b">Nominal dollars; life events with a cashflow impact bend the line from their effective dates.</p>
          <div className="mt-3">
            <NetWorthChart path={result.netWorthPath} retirementYear={ret.retirementYear} />
          </div>
        </Card>

        {/* Retirement planning card */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-semibold text-ink">
              Retirement at{' '}
              {presentation ? (
                client.retirement.targetAge
              ) : (
                <EditableValue value={client.retirement.targetAge} format="plain" size="md" onCommit={(v) => addChanges([{ kind: 'setRetirementAge', age: Math.round(v) }])} />
              )}
            </h3>
            <button
              onClick={() => openAudit({ title: 'Retirement projection', lines: ret.audit, ruleSetIds: [ctx.retirement.id, ctx.kiwiSaver.id] })}
              className="text-[11.5px] font-medium text-teal-500 hover:underline"
            >
              Working
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <RetRow label="Years until retirement" value={`${ret.yearsToRetirement}`} />
            <RetRow label="Mortgage-free" value={ret.mortgageFreeBeforeRetirement ? `~${ret.mortgageFreeYear} ✓` : `~${ret.mortgageFreeYear} — after retirement`} warn={!ret.mortgageFreeBeforeRetirement && client.mortgages.length > 0} />
            <RetRow label={`KiwiSaver (${modeLabel})`} value={moneyShort(mode === 'nominal' ? ret.projectedKiwiSaver : ret.projectedKiwiSaverToday)} />
            <RetRow label="Property equity (nominal)" value={moneyShort(ret.projectedPropertyValue + ret.projectedInvestmentPropertyValue - ret.projectedDebtAtRetirement)} />
            {ret.projectedDebtAtRetirement > 0 ? <RetRow label="Projected debt then" value={moneyShort(ret.projectedDebtAtRetirement)} warn /> : null}
          </div>
          <div className={`mt-3 rounded-lg px-4 py-3 ${ret.gap >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">
              {ret.gap >= 0 ? 'Projected surplus vs goal' : 'Projected gap vs goal'}
            </div>
            <div className={`font-display mt-0.5 text-[26px] font-semibold ${ret.gap >= 0 ? 'text-green-600b' : 'text-rose-600b'}`}>
              <AnimatedNumber value={Math.abs(ret.gap)} />
              <span className="ml-1 text-[13px] font-normal opacity-70">/yr</span>
            </div>
            <div className="mt-0.5 text-[12px] text-slate-500b">
              Goal {moneyShort(ret.goalAnnualIncome)}/yr · projected {moneyShort(ret.projectedAnnualIncome)}/yr nominal
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-navy-900 px-4 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-teal-300">Projected retirement income, today's dollars</div>
            <div className="mt-1 flex items-baseline gap-4">
              <span className="num font-display text-[22px] font-semibold text-white">{money(ret.projectedAnnualIncomeToday)}<span className="text-[12px] font-normal text-navy-100/60">/yr</span></span>
              <span className="num font-display text-[18px] font-semibold text-teal-300">{money(ret.projectedWeeklyIncomeToday)}<span className="text-[12px] font-normal text-navy-100/60">/week</span></span>
            </div>
          </div>
          <div className="mt-3 divide-y divide-line rounded-lg border border-line text-[12.5px]">
            {ret.incomeStreams.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-3.5 py-2">
                <span className="text-slate-500b">{s.label}</span>
                <span className="num font-semibold">{money(s.annual)}/yr</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500b">
            {pct(ret.drawdownRate, 0)} is a planning heuristic, not a guarantee — adviser-adjustable. NZ Super at current settings; settings change over time.
          </p>
        </Card>
      </div>

      {client.financialEvents.length > 0 || !presentation ? (
        <Card className="mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold text-ink">Life events on the timeline</h3>
            {!presentation ? <AddLifeEvent addChanges={addChanges} /> : null}
          </div>
          <p className="mt-0.5 text-[12.5px] text-slate-500b">Events with a monthly impact change the trajectory from their effective date — they are inputs, not decoration.</p>
          {client.financialEvents.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {[...client.financialEvents]
                .sort((a, b) => a.startDate.localeCompare(b.startDate))
                .map((e) => (
                  <div key={e.id} className="min-w-[180px] flex-1 rounded-lg border border-line bg-mist px-4 py-3">
                    <div className="num text-[11px] font-semibold uppercase tracking-[0.1em] text-teal-500">
                      {e.startDate.slice(0, 7)}
                      {e.endDate ? ` → ${e.endDate.slice(0, 7)}` : ''}
                    </div>
                    <div className="mt-1 text-[13px] font-medium leading-snug text-ink">{e.label}</div>
                    {e.monthlyImpact ? (
                      <div className={`num mt-1 text-[12px] font-semibold ${e.monthlyImpact > 0 ? 'text-green-600b' : 'text-rose-600b'}`}>
                        {money(e.monthlyImpact, { sign: true })}/mo
                      </div>
                    ) : e.amount ? (
                      <div className="num mt-1 text-[12px] font-semibold text-ink">{money(e.amount)}</div>
                    ) : null}
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-3 text-[12.5px] text-slate-500b">
              Nothing on the timeline yet — add what's coming: upgrading the home, caring for parents, parental leave, childcare finishing.
            </p>
          )}
          {!presentation ? (
            <p className="mt-3 text-[11.5px] text-slate-500b">
              You can also add events from the copilot: “Childcare finishes in June 2029”, “Model six months of parental leave”.
            </p>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}

// Manual life-event entry — same deterministic path as the copilot (addEvent).
function AddLifeEvent({ addChanges }: { addChanges: SectionProps['addChanges'] }) {
  const [open, setOpen] = useState(false);
  const [eventLabel, setEventLabel] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [monthlyImpact, setMonthlyImpact] = useState('');
  const currentYear = new Date().getFullYear();

  const commit = () => {
    if (!eventLabel.trim()) return;
    const start = /^\d{4}-\d{2}$/.test(startMonth) ? `${startMonth}-01` : `${currentYear + 1}-01-01`;
    const impact = parseFloat(monthlyImpact.replace(/[^0-9.-]/g, ''));
    addChanges([
      {
        kind: 'addEvent',
        event: {
          id: `evt-${Date.now()}`,
          kind: 'other',
          label: eventLabel.trim(),
          startDate: start,
          monthlyImpact: Number.isFinite(impact) && impact !== 0 ? impact : undefined,
        },
      },
    ]);
    setEventLabel('');
    setStartMonth('');
    setMonthlyImpact('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-teal-500/50 px-3 py-1.5 text-[12px] font-semibold text-teal-500 hover:bg-aqua-100"
      >
        + Add life event
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={eventLabel}
        onChange={(e) => setEventLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder="e.g. Upgrade the home · Care for parents"
        className="w-52 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] focus:border-teal-500 focus:outline-none"
      />
      <input
        value={startMonth}
        onChange={(e) => setStartMonth(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder={`from (${currentYear + 1}-06)`}
        className="w-28 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] focus:border-teal-500 focus:outline-none"
      />
      <input
        value={monthlyImpact}
        onChange={(e) => setMonthlyImpact(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder="$/mo impact (− cost)"
        className="w-36 rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] focus:border-teal-500 focus:outline-none"
      />
      <button onClick={commit} className="rounded-lg bg-teal-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-400">
        Add
      </button>
      <button onClick={() => setOpen(false)} className="text-[12px] text-slate-500b hover:text-ink">
        cancel
      </button>
    </div>
  );
}

function RetRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/50 pb-1">
      <span className="text-slate-500b">{label}</span>
      <span className={`num font-semibold ${warn ? 'text-amber-600b' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive KiwiSaver modeller + fund-type comparison

function KiwiSaverModeller({ client, result, addChanges, presentation, ctx, mode }: SectionProps & { mode: DollarMode }) {
  const acc = client.kiwiSaverAccounts[0];
  const horizonYears = Math.max(5, client.retirement.targetAge - Math.max(...client.applicants.map((a) => a.age)));
  const dataset = manualAssumptionProvider.getDataset();

  const fundComparison = useMemo(() => {
    if (!acc) return [];
    // Simplified per adviser audit (3 Sep 2026): keep growth and balanced as
    // the comparison anchors, plus the client's own fund type when different.
    const keep = new Set(['balanced', 'growth', acc.fundType === 'defensive' ? 'conservative' : acc.fundType]);
    return dataset.categories.filter((cat) => keep.has(cat.fundType)).map((cat) => {
      const total = client.kiwiSaverAccounts.reduce((sum, a) => {
        const p = projectKiwiSaver(a, ctx.kiwiSaver, {
          mode: 'base',
          horizonYears,
          returnOverride: cat.annualReturn - (a.feesPercent ?? ctx.kiwiSaver.defaultFeePercent),
        });
        return sum + p.atHorizon;
      }, 0);
      return { ...cat, atHorizon: total };
    });
  }, [acc, client.kiwiSaverAccounts, ctx.kiwiSaver, horizonYears, dataset]);

  if (!acc) return null;
  const inflation = result.inflation;
  const show = (v: number) => (mode === 'nominal' ? v : todaysDollars(v, inflation, horizonYears));

  return (
    <Card className="mt-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold text-ink">KiwiSaver modeller — change the levers, watch the horizon</h3>
        <span className="text-[11px] text-slate-500b">every control routes through the same deterministic projection engine</span>
      </div>
      {!presentation ? (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-6">
          <ModellerControl label="Contribution rate">
            <select
              value={String(acc.contributionRate)}
              onChange={(e) => addChanges([{ kind: 'setKiwiSaverRate', rate: parseFloat(e.target.value) }])}
              className="num rounded-lg border border-line bg-white px-2 py-1 text-[13px] font-semibold text-ink focus:border-teal-500 focus:outline-none"
            >
              {(KS_RATE_OPTIONS.includes(acc.contributionRate) ? KS_RATE_OPTIONS : [acc.contributionRate, ...KS_RATE_OPTIONS]).map((r) => (
                <option key={r} value={String(r)}>{pct(r, 1)}</option>
              ))}
            </select>
          </ModellerControl>
          <ModellerControl label="Return assumption" note="net of fees when overridden">
            <EditableValue
              value={ctx.kiwiSaver.returnAssumptions.base - (acc.feesPercent ?? ctx.kiwiSaver.defaultFeePercent)}
              format="percent"
              decimals={1}
              onCommit={(v) => addChanges([{ kind: 'setKiwiSaverReturn', value: v }])}
            />
          </ModellerControl>
          <ModellerControl label="Salary growth">
            <EditableValue value={0.03} format="percent" decimals={1} onCommit={(v) => addChanges([{ kind: 'setSalaryGrowth', percent: v }])} />
          </ModellerControl>
          <ModellerControl label="Inflation">
            <EditableValue value={inflation} format="percent" decimals={1} onCommit={(v) => addChanges([{ kind: 'setInflation', value: v }])} />
          </ModellerControl>
          <ModellerControl label="Retirement age">
            <EditableValue value={client.retirement.targetAge} format="plain" onCommit={(v) => addChanges([{ kind: 'setRetirementAge', age: Math.round(v) }])} />
          </ModellerControl>
          <ModellerControl label="Lump sum now" note="from cash savings">
            <button
              onClick={() => addChanges([{ kind: 'kiwiSaverLumpSum', amount: 20_000 }])}
              className="rounded-lg border border-teal-500/50 px-2.5 py-1 text-[12px] font-semibold text-teal-500 hover:bg-aqua-100"
            >
              + $20,000
            </button>
          </ModellerControl>
          {client.clientType === 'fhb' && client.targetPurchase ? (
            <ModellerControl label="First-home withdrawal">
              <button
                onClick={() => addChanges([{ kind: 'setKiwiSaverWithdrawal', on: !result.kiwiSaverProjections.some((p) => p.base.withdrawalEvent) }])}
                className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-slate-500b hover:bg-mist"
              >
                {result.kiwiSaverProjections.some((p) => p.base.withdrawalEvent) ? 'Modelled — turn off' : 'Model it'}
              </button>
            </ModellerControl>
          ) : null}
        </div>
      ) : null}

      {/* Fund-type comparison */}
      <div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[13px] font-semibold text-ink">Fund-type comparison at age {client.retirement.targetAge} ({mode === 'nominal' ? 'nominal' : "today's dollars"})</h4>
          <span className="text-[10.5px] text-slate-500b">{dataset.sourceLabel} · as at {dataset.asAt}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
          {fundComparison.map((f) => {
            const isCurrent = f.fundType === acc.fundType || (f.fundType === 'conservative' && acc.fundType === 'defensive');
            return (
              <div key={f.label} className={`rounded-xl border p-3 text-center ${isCurrent ? 'border-teal-500/60 bg-aqua-100/50' : 'border-line bg-white'}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500b">{f.label}</div>
                <div className="num font-display mt-1 text-[17px] font-semibold text-ink">{moneyShort(show(f.atHorizon))}</div>
                <div className="text-[10px] text-slate-400">{pct(f.annualReturn, 1)}/yr assumption</div>
                {isCurrent ? <div className="mt-1 text-[9.5px] font-semibold uppercase text-teal-500">current fund type</div> : null}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500b">
          These are long-term category assumptions for comparison, not recommendations — a bigger projected number does not make a fund right
          for the timeframe or the stomach. {PAST_PERFORMANCE_DISCLAIMER} {morningstarProvider.unavailableReason}
        </p>
      </div>
    </Card>
  );
}

function ModellerControl({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-500b">{label}</div>
      <div className="mt-1">{children}</div>
      {note ? <div className="mt-0.5 text-[10px] text-slate-400">{note}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 07 — Protection

export function ProtectionSection({ client, result, openAudit, ctx }: SectionProps) {
  const p = result.protection;
  const kinds: { key: keyof typeof p.existingCover; label: string }[] = [
    { key: 'life', label: 'Life cover' },
    { key: 'trauma', label: 'Trauma' },
    { key: 'income-protection', label: 'Income protection' },
    { key: 'health', label: 'Health' },
  ];
  const assessment = ratioBenchmarkProvider.assess(client.insurancePolicies, cohortOf(client, result.snapshot.actualNetIncomeMonthly));

  return (
    <section>
      <SectionHeading
        index="07 · Protection"
        title="If the income stopped tomorrow"
        lede="A needs analysis, not a quote — pricing and product advice sit with a personal-risk specialist."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-semibold text-ink">Indicative life-cover need</h3>
            <button
              onClick={() => openAudit({ title: 'Protection needs analysis', lines: p.audit, ruleSetIds: [ctx.modelling.id] })}
              className="text-[11.5px] font-medium text-teal-500 hover:underline"
            >
              How was this calculated?
            </button>
          </div>
          <div className="mt-4 flex items-end gap-8">
            <Stat label="Indicative need" value={p.lifeCoverNeed} />
            <Stat label="Existing cover" value={p.existingCover.life} />
            <Stat label={p.lifeCoverGap >= 0 ? 'Potential gap' : 'Potential surplus'} value={Math.abs(p.lifeCoverGap)} />
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-mist">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (p.existingCover.life / Math.max(1, p.lifeCoverNeed)) * 100)}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11.5px] text-slate-500b">
            {pct(Math.min(1, p.existingCover.life / Math.max(1, p.lifeCoverNeed)), 0)} of the indicative need is covered. A surplus of cover is
            never declared from these figures alone — cover type, benefits and personal circumstances decide, with a specialist.
          </div>
          <div className="mt-4 space-y-2.5">
            {kinds.map((k) => (
              <div key={k.key} className="flex items-center justify-between rounded-lg border border-line px-4 py-2.5 text-[13px]">
                <span className="font-medium text-ink">{k.label}</span>
                {p.hasCover[k.key] ? (
                  <Pill tone="green">{p.existingCover[k.key] > 0 ? moneyShort(p.existingCover[k.key]) : 'In place'}</Pill>
                ) : (
                  <Pill tone="slate">None recorded</Pill>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Premiums — what protection actually costs</h3>
          <div className="mt-3 divide-y divide-line rounded-lg border border-line text-[13px]">
            {client.insurancePolicies.length === 0 ? (
              <div className="px-3.5 py-3 text-slate-500b">No policies recorded — capture premiums and sums insured in the Fact Find.</div>
            ) : (
              client.insurancePolicies.map((pol) => (
                <div key={pol.id} className="flex items-center justify-between px-3.5 py-2">
                  <span className="text-slate-500b">
                    {pol.kind === 'income-protection' ? 'Income protection' : pol.kind[0].toUpperCase() + pol.kind.slice(1)} · {pol.provider}
                    {pol.cover ? <span className="ml-1.5 text-[11px] text-slate-400">{moneyShort(pol.cover)} cover</span> : null}
                  </span>
                  <span className="num font-semibold">{money(pol.premiumMonthly)}/mo</span>
                </div>
              ))
            )}
            {client.insurancePolicies.length > 0 ? (
              <div className="flex items-center justify-between bg-mist px-3.5 py-2.5 font-semibold">
                <span>Total premiums</span>
                <span className="num">
                  {money(assessment.premiumMonthly)}/mo · {pct(assessment.premiumShareOfNetIncome, 1)} of net income
                </span>
              </div>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {assessment.flags.map((f, i) => (
              <div key={i} className={`rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed ${f.severity === 'attention' ? 'bg-amber-50 text-amber-900' : 'bg-mist text-slate-500b'}`}>
                {f.message}
                {f.adviserPrompt ? <div className="mt-1 text-[11.5px] italic opacity-80">Adviser: {f.adviserPrompt}</div> : null}
              </div>
            ))}
            {p.issues.map((i, idx) => (
              <div key={idx} className={`rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed ${i.severity === 'attention' ? 'bg-amber-50 text-amber-900' : 'bg-mist text-slate-500b'}`}>
                {i.message}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500b">
            Benchmarking: {assessment.sourceLabel} {datasetBenchmarkProvider.unavailableReason}
          </p>
        </Card>
      </div>
    </section>
  );
}
