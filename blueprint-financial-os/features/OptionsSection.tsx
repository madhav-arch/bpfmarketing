'use client';

import { useMemo, useState } from 'react';
import { Card, SectionHeading, Stat, Pill, AnimatedNumber, Delta } from '@/components/ui';
import { AmortisationChart } from '@/components/charts';
import { money, moneyShort, pct, years } from '@/lib/format';
import type { SectionProps } from './types';
import { applyScenario } from '@/lib/scenarios/apply';
import { computeAll } from '@/lib/scenarios/compute';
import { PRESET_SCENARIOS } from '@/lib/data/demoClients';
import { toMonthly } from '@/lib/domain/frequency';

export function OptionsSection(props: SectionProps) {
  const { client } = props;
  return (
    <section>
      <SectionHeading
        index="05 · Explore your options"
        title="The scenario lab"
        lede="Change one assumption and watch every downstream number move. Nothing here is destructive — the baseline is always kept."
      />
      {client.clientType === 'fhb' ? <FhbLab {...props} /> : null}
      {client.clientType === 'homeowner' ? <HomeownerLab {...props} /> : null}
      {client.clientType === 'investor' ? <InvestorLab {...props} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// FHB: purchase price + deposit tiers + upfront costs

function FhbLab({ client, result, addChanges, presentation }: SectionProps) {
  const fhb = result.fhb!;
  const [price, setPrice] = useState(fhb.purchasePrice);

  const stageLabel: Record<string, string> = {
    'before-finance': 'Before finance',
    'due-diligence': 'During due diligence',
    settlement: 'At settlement',
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">Purchase price</h3>
            <div className="font-display mt-1 text-[34px] font-semibold text-ink">
              <AnimatedNumber value={fhb.purchasePrice} />
            </div>
          </div>
          {!presentation ? (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={800_000}
                max={1_400_000}
                step={10_000}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                onMouseUp={() => addChanges([{ kind: 'setPurchasePrice', value: price }])}
                onTouchEnd={() => addChanges([{ kind: 'setPurchasePrice', value: price }])}
                className="h-1.5 w-64 cursor-pointer appearance-none rounded-full bg-line accent-[#2ab3b1]"
              />
              <span className="num w-24 text-right text-[13px] font-semibold text-slate-500b">{moneyShort(price)}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-6 md:grid-cols-5">
          <Stat label="Deposit" value={fhb.totalDeposit} sub={`${pct(fhb.depositPercent, 1)} of purchase`} />
          <Stat label="Loan" value={fhb.loan} sub={`LVR ${pct(fhb.lvr, 1)}`} />
          <Stat label="Low-equity margin" value={fhb.lowEquityMargin} format="percent" sub={fhb.lowEquityMargin > 0 ? 'until LVR drops below the band' : 'none at ≥20% deposit'} />
          <Stat label="Effective rate" value={fhb.effectiveRate} format="percent" sub={`base ${pct(fhb.baseRate)}`} />
          <Stat label="Repayment" value={fhb.repaymentFortnightly} sub="per fortnight, 30y P&I" />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Deposit tiers — what changes at 5 / 10 / 15 / 20%</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-slate-500b">
                  <th className="pb-2 font-medium">Deposit</th>
                  <th className="pb-2 font-medium">Required</th>
                  <th className="pb-2 font-medium">Margin</th>
                  <th className="pb-2 font-medium">Rate</th>
                  <th className="pb-2 text-right font-medium">Repayment /fn</th>
                </tr>
              </thead>
              <tbody>
                {fhb.tiers.map((t) => (
                  <tr key={t.depositPercent} className={`border-b border-line/60 ${t.achievable ? '' : 'opacity-45'}`}>
                    <td className="py-2.5 font-semibold">
                      {pct(t.depositPercent, 0)}
                      {t.achievable ? '' : <span className="ml-1.5 text-[10px] font-normal text-slate-500b">out of reach today</span>}
                    </td>
                    <td className="num py-2.5">{moneyShort(t.depositRequired)}</td>
                    <td className="num py-2.5">{t.lowEquityMargin > 0 ? `+${pct(t.lowEquityMargin)}` : '—'}</td>
                    <td className="num py-2.5">{pct(t.effectiveRate)}</td>
                    <td className="num py-2.5 text-right font-semibold">{money(t.repaymentFortnightly)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-slate-500b">
            The margin isn't forever: as the property value grows and the loan shrinks, each refix re-tests the LVR and the margin steps down.
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Money required before settlement</h3>
          <div className="mt-4 divide-y divide-line rounded-lg border border-line">
            {fhb.upfrontCosts.items.map((i) => (
              <div key={i.key} className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                <div>
                  <div className="font-medium text-ink">{i.label}</div>
                  <div className="text-[11.5px] text-slate-500b">
                    {stageLabel[i.stage]}
                    {i.note ? ` — ${i.note}` : ''}
                  </div>
                </div>
                <span className="num font-semibold">{money(i.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-mist px-3.5 py-2.5 text-[13px] font-semibold">
              <span>Have set aside & ready</span>
              <span className="num">{money(fhb.upfrontCosts.total)}</span>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-slate-500b">
            Cashback from the lender arrives with the keys — it rebates these costs, but you need them up front. Amounts are configurable assumptions, not quotes.
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Deposit sources</h3>
          <div className="mt-4 space-y-2">
            {fhb.depositBreakdown.map((d) => (
              <div key={d.label} className="flex items-center gap-3">
                <div className="w-44 text-[12.5px] text-slate-500b">{d.label}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-mist">
                  <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${(d.amount / Math.max(1, fhb.totalDeposit)) * 100}%` }} />
                </div>
                <div className="num w-20 text-right text-[13px] font-semibold">{moneyShort(d.amount)}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] text-slate-500b">
            Keeping {moneyShort(client.targetPurchase?.depositSources.keepAsBuffer ?? 0)} of cash out of the deposit as a buffer — deliberately.
          </p>
        </Card>
        <Card tone="aqua" className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-navy-800">Resilience levers</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-navy-800/80">
            The plan shouldn't only work on a perfect month. Each lever below changes serviceability live — try them from the copilot bar.
          </p>
          <ul className="mt-3 space-y-2 text-[13px] text-navy-800">
            <li>· “Add a boarder paying $250 per week”</li>
            <li>· “Add rideshare income of $9,000 a year”</li>
            <li>· “Close the credit cards”</li>
            <li>· “What if interest rates go to 7%?”</li>
            <li>· “Model six months of parental leave”</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Homeowner: repayment lab + revolving + refinance

function HomeownerLab({ client, result, baseline, addChanges, presentation }: SectionProps) {
  const am = result.amortisation;
  const baseAm = baseline.amortisation;
  const quickAdds = [
    { label: '+$100/wk', delta: 100, frequency: 'weekly' as const },
    { label: '+$250/fn', delta: 250, frequency: 'fortnightly' as const },
    { label: '+$500/fn', delta: 500, frequency: 'fortnightly' as const },
    { label: '+$1,000/mo', delta: 1000, frequency: 'monthly' as const },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">Mortgage trajectory — current vs Blueprint</h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500b">
              Dashed grey: minimum path. Teal: with the current scenario's extra {money(am.extraMonthly)}/mo.
            </p>
          </div>
          {!presentation ? (
            <div className="flex flex-wrap gap-2">
              {quickAdds.map((q) => (
                <button
                  key={q.label}
                  onClick={() => addChanges([{ kind: 'adjustRepayment', delta: q.delta, frequency: q.frequency }])}
                  className="rounded-lg border border-teal-500/40 bg-aqua-100 px-3 py-1.5 text-[12px] font-semibold text-teal-500 transition-colors hover:bg-teal-500 hover:text-white"
                >
                  {q.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          <AmortisationChart current={baseAm.current.schedule} blueprint={am.blueprint.schedule} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Mortgage-free" value={am.blueprint.payoffYear} format="year" sub={<Delta value={am.blueprint.termYears - baseAm.current.termYears} goodWhen="down" format="years" />} />
          <Stat label="Interest remaining" value={am.blueprint.totalInterest} sub={<Delta value={am.blueprint.totalInterest - baseAm.current.totalInterest} goodWhen="down" />} />
          <Stat label="Current repayments" value={result.snapshot.actualRepaymentsMonthly + am.extraMonthly} sub="per month, all loans + extra" />
          <Stat label="Monthly buffer" value={result.snapshot.monthlySurplus} sub="after the extra repayment" />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Revolving credit vs simply paying more</h3>
          {result.revolving ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[result.revolving.optionA, result.revolving.optionB].map((o, i) => (
                  <div key={i} className={`rounded-lg border p-4 ${i === 1 ? 'border-teal-500/50 bg-aqua-100' : 'border-line'}`}>
                    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500b">Option {i === 0 ? 'A' : 'B'}</div>
                    <div className="mt-1 text-[13px] font-semibold leading-snug text-ink">{o.label}</div>
                    <div className="mt-3 space-y-1 text-[12.5px]">
                      <div className="flex justify-between"><span className="text-slate-500b">Paid off in</span><span className="num font-semibold">{years(o.termYears)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500b">Total interest</span><span className="num font-semibold">{moneyShort(o.totalInterest)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-navy-900 px-4 py-3 text-[13px] text-navy-100">
                Estimated interest difference:{' '}
                <span className="num font-semibold text-teal-300">{money(Math.abs(result.revolving.interestDifference))}</span>{' '}
                {result.revolving.interestDifference > 0 ? 'in favour of the revolving strategy' : 'in favour of higher repayments'}
              </div>
              <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-slate-500b">
                {result.revolving.notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500b">
                For a “nest egg” household, a revolving facility keeps surplus cash working against the mortgage without locking it away. Model it to compare honestly against higher scheduled repayments.
              </p>
              {!presentation ? (
                <button
                  onClick={() => addChanges([{ kind: 'addRevolvingCredit', limit: 75_000, funded: 50_000, monthlyTransfer: 2_000 }])}
                  className="mt-4 rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-400"
                >
                  Model a $75k facility with $50k parked
                </button>
              ) : null}
            </>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Restructure & refinance economics</h3>
          {result.refinance ? (
            <>
              <div className={`mt-4 rounded-lg px-4 py-3.5 ${result.refinance.benefit12 >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">
                  Net {result.refinance.benefit12 >= 0 ? 'benefit' : 'cost'} of moving — first 12 months
                </div>
                <div className={`font-display mt-0.5 text-[30px] font-semibold ${result.refinance.benefit12 >= 0 ? 'text-green-600b' : 'text-rose-600b'}`}>
                  <AnimatedNumber value={Math.abs(result.refinance.benefit12)} />
                </div>
                {result.refinance.breakEvenMonths !== null && result.refinance.breakEvenMonths > 0 ? (
                  <div className="text-[12px] text-slate-500b">Break-even: {result.refinance.breakEvenMonths} months</div>
                ) : null}
              </div>
              <div className="mt-3 divide-y divide-line rounded-lg border border-line text-[13px]">
                {result.refinance.audit.map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-3.5 py-2">
                    <span className="text-slate-500b">{l.label}</span>
                    <span className={`num font-semibold ${(l.value ?? 0) < 0 ? 'text-rose-600b' : 'text-ink'}`}>{money(l.value ?? 0)}</span>
                  </div>
                ))}
              </div>
              {client.refinanceContext?.taxSavingNote ? (
                <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500b">{client.refinanceContext.taxSavingNote}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-[12.5px] text-slate-500b">No refinance context configured for this client.</p>
          )}
          {result.expiryTimeline.some((e) => e.expiry) ? (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500b">Fixed-rate expiry runway</div>
              <div className="mt-2 space-y-1.5">
                {result.expiryTimeline
                  .filter((e) => e.expiry)
                  .map((e) => (
                    <div key={e.loanId} className="flex items-center gap-3 text-[12.5px]">
                      <div className="num w-16 shrink-0 font-semibold text-ink">{e.monthsAway} mo</div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-mist">
                        <div className="h-full rounded-full bg-navy-700" style={{ width: `${Math.min(100, ((e.monthsAway ?? 0) / 24) * 100)}%` }} />
                      </div>
                      <div className="w-56 shrink-0 truncate text-slate-500b">{e.label}</div>
                    </div>
                  ))}
              </div>
              <p className="mt-2 text-[11.5px] text-slate-500b">Strategy: consistent one-year fixes, timed against the annual royalty payout — stay nimble, refix into the revolving strategy each round.</p>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Investor: portfolio + scenario comparison columns

function InvestorLab(props: SectionProps) {
  const { client, baselineClient, result, ctx, presentation, addChanges } = props;
  const presets = PRESET_SCENARIOS[baselineClient.id] ?? [];

  const comparison = useMemo(() => {
    const baselineResult = computeAll(applyScenario(baselineClient, []), ctx);
    const cols = [
      { id: 'baseline', name: 'Baseline — keep everything', description: 'No changes.', result: baselineResult },
      ...presets.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        result: computeAll(applyScenario(baselineClient, p.changes), ctx),
      })),
    ];
    return cols;
  }, [baselineClient, ctx, presets]);

  const inv = result.investment;
  const rentals = client.properties.filter((p) => p.use === 'investment');
  const grossRentWeekly = rentals.reduce((s, p) => s + (p.rentPerWeek?.value ?? 0), 0);
  const portfolioCashflow = rentals.reduce((s, p) => {
    const rentMo = ((p.rentPerWeek?.value ?? 0) * 52) / 12;
    const costs = ((p.ratesPerYear ?? 0) + (p.insurancePerYear ?? 0)) / 12 + rentMo * (p.propertyMgmtRate ?? 0.08);
    const debt = client.mortgages.filter((m) => m.propertyId === p.id).reduce((x, m) => x + toMonthly(m.repayment.amount, m.repayment.frequency), 0);
    return s + rentMo - costs - debt;
  }, 0);
  const weightedYield =
    result.equity.properties.filter((p) => p.use === 'investment').reduce((s, p) => s + p.activeValue, 0) > 0
      ? (grossRentWeekly * 52) /
        result.equity.properties.filter((p) => p.use === 'investment').reduce((s, p) => s + p.activeValue, 0)
      : 0;
  const ioExposure = client.mortgages.filter((m) => m.interestOnly).reduce((s, m) => s + m.balance, 0);

  return (
    <div className="space-y-4">
      <Card tone="navy" className="p-6">
        <h3 className="font-display text-[15px] font-semibold text-white">Portfolio dashboard</h3>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          <Stat tone="navy" label="Portfolio value" value={result.equity.totalValue} sub={`${client.properties.length} properties`} />
          <Stat tone="navy" label="Total debt" value={result.equity.totalDebt} sub={`portfolio LVR ${pct(result.equity.portfolioLVR, 0)}`} />
          <Stat tone="navy" label="Usable equity" value={result.equity.totalUsableEquity} sub={`buys up to ${moneyShort(result.equity.maxPurchaseWithEquity)}`} />
          <Stat tone="navy" label="Gross rent" value={grossRentWeekly} format="plain" sub={`$/week · weighted yield ${pct(weightedYield, 1)}`} />
          <Stat tone="navy" label="Property cashflow" value={portfolioCashflow} sub="per month after costs & repayments" />
          <Stat tone="navy" label="Interest-only exposure" value={ioExposure} sub="principal untouched by design" />
          <Stat tone="navy" label="Servicing headroom" value={result.servicing.maxNewLending} sub="new debt supported (Blueprint model)" />
          <Stat tone="navy" label="DTI" value={result.servicing.dti} format="plain" decimals={1} sub={`cap ≈ ${ctx.policy.dtiMultiple}× gross income`} />
        </div>
      </Card>

      {inv ? (
        <Card className="border-teal-500/40 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-semibold text-ink">Proposed purchase — this scenario</h3>
            <Pill tone={inv.servicingDragMonthly <= 0 ? 'green' : 'amber'}>
              {inv.servicingDragMonthly <= 0 ? 'Carries itself under stress' : `Servicing drag ${money(inv.servicingDragMonthly)}/mo`}
            </Pill>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-5">
            <Stat label="Gross yield" value={inv.grossYield} format="percent" sub={inv.grossYield > ctx.policy.stressRate ? `beats the ${pct(ctx.policy.stressRate)} stress rate` : `below the ${pct(ctx.policy.stressRate)} stress rate`} />
            <Stat label="Weekly cashflow" value={inv.weeklyCashflow} sub="after all costs & interest" />
            <Stat label="Debt added" value={inv.debtAdded} />
            <Stat label="Recognised rent" value={inv.recognisedRentMonthly} sub="per month, after scaling" />
            <Stat label="Stressed repayment" value={inv.stressedRepaymentMonthly} sub="what the bank tests" />
          </div>
          <p className="mt-4 rounded-lg bg-mist px-4 py-3 text-[12.5px] leading-relaxed text-slate-500b">
            <strong className="text-ink">Servicing drag</strong> is how much personal income the bank requires to stand behind this property under its stress test.
            A high-yield purchase can be self-supporting; a low-yield one quietly consumes your future borrowing power.
          </p>
        </Card>
      ) : null}

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold text-ink">Strategy comparison</h3>
          {!presentation ? <span className="text-[11.5px] text-slate-500b">Click a column header to load that strategy into the live scenario</span> : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr>
                <th className="w-44 pb-3 text-left text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500b"></th>
                {comparison.map((c) => (
                  <th key={c.id} className="px-2 pb-3 text-left align-top">
                    <button
                      disabled={presentation || c.id === 'baseline'}
                      onClick={() => {
                        const preset = presets.find((p) => p.id === c.id);
                        if (preset) addChanges(preset.changes, preset.name);
                      }}
                      className={`font-display w-full rounded-lg border px-3 py-2 text-left text-[13px] font-semibold leading-snug transition-colors ${
                        c.id === 'baseline'
                          ? 'border-line bg-mist text-slate-500b'
                          : 'border-teal-500/40 bg-aqua-100 text-navy-800 hover:bg-teal-500 hover:text-white'
                      }`}
                    >
                      {c.name}
                      <div className="mt-0.5 text-[11px] font-normal opacity-75">{c.description}</div>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  { label: 'Property count', get: (r: typeof comparison[0]['result']) => r.equity.properties.length, fmt: (v: number) => `${v}` },
                  { label: 'Portfolio value', get: (r: typeof comparison[0]['result']) => r.equity.totalValue, fmt: moneyShort },
                  { label: 'Total debt', get: (r: typeof comparison[0]['result']) => r.equity.totalDebt, fmt: moneyShort },
                  { label: 'Portfolio LVR', get: (r: typeof comparison[0]['result']) => r.equity.portfolioLVR, fmt: (v: number) => pct(v, 0) },
                  { label: 'Usable equity', get: (r: typeof comparison[0]['result']) => r.equity.totalUsableEquity, fmt: moneyShort },
                  { label: 'Monthly surplus', get: (r: typeof comparison[0]['result']) => r.snapshot.monthlySurplus, fmt: (v: number) => money(v) },
                  { label: 'Borrowing headroom', get: (r: typeof comparison[0]['result']) => r.servicing.maxNewLending, fmt: moneyShort },
                  { label: 'Net worth today', get: (r: typeof comparison[0]['result']) => r.snapshot.netWorth, fmt: moneyShort },
                  { label: 'Net worth at retirement', get: (r: typeof comparison[0]['result']) => r.retirement.projectedNetWorth, fmt: moneyShort },
                  { label: 'Retirement income gap', get: (r: typeof comparison[0]['result']) => r.retirement.gap, fmt: (v: number) => money(v, { sign: true }) },
                ] as const
              ).map((row) => (
                <tr key={row.label} className="border-t border-line/70">
                  <td className="py-2.5 pr-3 text-[12px] font-medium text-slate-500b">{row.label}</td>
                  {comparison.map((c, ci) => {
                    const v = row.get(c.result);
                    const baseV = row.get(comparison[0].result);
                    const better = typeof v === 'number' && typeof baseV === 'number' && ci > 0 && Math.abs(v - baseV) > 0.005 * Math.max(1, Math.abs(baseV));
                    return (
                      <td key={c.id} className="num px-2 py-2.5 font-semibold text-ink">
                        {row.fmt(v as number)}
                        {better ? (
                          <span className={`ml-1.5 text-[10.5px] ${v > baseV ? 'text-green-600b' : 'text-rose-600b'}`}>{v > baseV ? '▲' : '▼'}</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] text-slate-500b">
          Projections use base growth assumptions ({pct(ctx.retirement.growth.base, 0)}/yr) — illustrative, not guaranteed. Arrows compare against baseline.
        </p>
      </Card>
    </div>
  );
}
