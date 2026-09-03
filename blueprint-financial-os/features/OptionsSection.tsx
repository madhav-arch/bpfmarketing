'use client';

import { useMemo, useState } from 'react';
import { Card, SectionHeading, Stat, Pill, AnimatedNumber, Delta, EditableValue, FreqToggle, FREQ_PER_YEAR, FREQ_SHORT, type DisplayFrequency } from '@/components/ui';
import { AmortisationChart } from '@/components/charts';
import { money, moneyShort, pct, years } from '@/lib/format';
import type { SectionProps } from './types';
import type { ScenarioChange } from '@/lib/scenarios/changes';
import { applyScenario } from '@/lib/scenarios/apply';
import { computeAll } from '@/lib/scenarios/compute';
import { amortise } from '@/lib/calculators/amortisation';
import { pmt } from '@/lib/calculators/finance';
import { PRESET_SCENARIOS } from '@/lib/data/demoClients';
import { toMonthly } from '@/lib/domain/frequency';

export function OptionsSection(props: SectionProps) {
  const { client } = props;
  return (
    <section>
      <SectionHeading
        index={`05 · ${client.clientType === 'fhb' ? 'Your first home' : client.clientType === 'homeowner' ? 'Restructure lab' : 'Portfolio lab'}`}
        title={
          client.clientType === 'fhb'
            ? 'The purchase, made concrete'
            : client.clientType === 'homeowner'
              ? 'What happens if nothing changes — and what could'
              : 'The portfolio as a set of decisions'
        }
        lede="Change one assumption and watch every downstream number move. Nothing here is destructive — the baseline is always kept."
      />
      {client.clientType === 'fhb' ? <FhbLab {...props} /> : null}
      {client.clientType === 'homeowner' ? <HomeownerLab {...props} /> : null}
      {client.clientType === 'investor' ? <InvestorLab {...props} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared: repayment lab — real amortisation with quick-adds and CUSTOM.

function RepaymentLab({
  title,
  loanLabel,
  principal,
  annualRate,
  termYears,
  scheduleCurrent,
  scheduleBlueprint,
  currentTermYears,
  blueprintTermYears,
  currentInterest,
  blueprintInterest,
  currentPaidOff,
  blueprintPaidOff,
  extraMonthly,
  scheduledMonthly,
  addChanges,
  presentation,
}: {
  title: string;
  loanLabel: string;
  principal: number;
  annualRate: number;
  termYears: number;
  scheduleCurrent: { period: number; yearFraction: number; balance: number; interest: number; principalPaid: number }[];
  scheduleBlueprint: { period: number; yearFraction: number; balance: number; interest: number; principalPaid: number }[];
  currentTermYears: number;
  blueprintTermYears: number;
  currentInterest: number;
  blueprintInterest: number;
  currentPaidOff: boolean;
  blueprintPaidOff: boolean;
  extraMonthly: number;
  scheduledMonthly: number;
  addChanges: SectionProps['addChanges'];
  presentation: boolean;
}) {
  const [customText, setCustomText] = useState('');
  const quickAdds = [
    { label: '+$50/wk', delta: 50, frequency: 'weekly' as const },
    { label: '+$100/wk', delta: 100, frequency: 'weekly' as const },
    { label: '+$250/fn', delta: 250, frequency: 'fortnightly' as const },
    { label: '+$500/fn', delta: 500, frequency: 'fortnightly' as const },
  ];
  const yearNow = new Date().getFullYear();
  const yearsSaved = currentPaidOff && blueprintPaidOff ? currentTermYears - blueprintTermYears : 0;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-500b">
            {loanLabel} · {moneyShort(principal)} at {pct(annualRate)} over {Math.round(termYears)} years. Dashed grey: minimum path. Teal: with the
            scenario's extra {money(extraMonthly)}/mo.
          </p>
        </div>
        {!presentation ? (
          <div className="flex flex-wrap items-center gap-2">
            {quickAdds.map((q) => (
              <button
                key={q.label}
                onClick={() => addChanges([{ kind: 'adjustRepayment', delta: q.delta, frequency: q.frequency }])}
                className="rounded-lg border border-teal-500/40 bg-aqua-100 px-3 py-1.5 text-[12px] font-semibold text-teal-500 transition-colors hover:bg-teal-500 hover:text-white"
              >
                {q.label}
              </button>
            ))}
            <span className="flex items-center gap-1">
              <input
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="custom $/mo"
                inputMode="numeric"
                className="num w-24 rounded-lg border border-line px-2 py-1.5 text-[12px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = parseFloat(customText.replace(/[^0-9.-]/g, ''));
                    if (isFinite(v) && v !== 0) addChanges([{ kind: 'adjustRepayment', delta: v, frequency: 'monthly' }]);
                    setCustomText('');
                  }
                }}
              />
            </span>
            {extraMonthly !== 0 ? (
              <button
                onClick={() => addChanges([{ kind: 'adjustRepayment', delta: -extraMonthly, frequency: 'monthly' }])}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-slate-500b hover:bg-mist"
              >
                clear extra
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4">
        <AmortisationChart current={scheduleCurrent} blueprint={scheduleBlueprint} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.1em] text-slate-500b">
              <th className="pb-2 pr-3 font-medium"></th>
              <th className="pb-2 pr-3 text-right font-medium">Repayment /mo</th>
              <th className="pb-2 pr-3 text-right font-medium">Mortgage-free</th>
              <th className="pb-2 pr-3 text-right font-medium">Term</th>
              <th className="pb-2 text-right font-medium">Total interest</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line/60">
              <td className="py-2 pr-3 font-medium text-slate-500b">Current path (minimum)</td>
              <td className="num py-2 pr-3 text-right">{money(scheduledMonthly)}</td>
              <td className="num py-2 pr-3 text-right">{currentPaidOff ? `~${yearNow + Math.ceil(currentTermYears)}` : 'IO — no payoff path'}</td>
              <td className="num py-2 pr-3 text-right">{currentPaidOff ? years(currentTermYears) : '—'}</td>
              <td className="num py-2 text-right">{moneyShort(currentInterest)}</td>
            </tr>
            <tr className="font-semibold">
              <td className="py-2 pr-3 text-ink">Blueprint path (+{money(extraMonthly)}/mo)</td>
              <td className="num py-2 pr-3 text-right">{money(scheduledMonthly + extraMonthly)}</td>
              <td className="num py-2 pr-3 text-right text-teal-500">{blueprintPaidOff ? `~${yearNow + Math.ceil(blueprintTermYears)}` : 'IO — no payoff path'}</td>
              <td className="num py-2 pr-3 text-right">{blueprintPaidOff ? years(blueprintTermYears) : '—'}</td>
              <td className="num py-2 text-right">{moneyShort(blueprintInterest)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-3 text-[13px]">
        <span className="text-slate-500b">
          Time saved: <strong className="num text-green-600b">{yearsSaved > 0.05 ? years(yearsSaved) : '—'}</strong>
        </span>
        <span className="text-slate-500b">
          Interest difference: <strong className="num text-green-600b">{currentInterest - blueprintInterest > 100 ? money(currentInterest - blueprintInterest) : '—'}</strong>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {[5, 10, 15].map((yr) => {
          const at = (sch: typeof scheduleCurrent) => sch.find((p) => p.period >= yr * 12)?.balance ?? 0;
          const cur = at(scheduleCurrent);
          const bp = at(scheduleBlueprint);
          return (
            <div key={yr} className="rounded-lg bg-mist px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Balance in {yr} years</div>
              <div className="num mt-0.5 text-[13px] font-semibold text-ink">
                <span className="font-normal text-slate-400">{moneyShort(cur)}</span>
                <span className="mx-1 text-slate-300">→</span>
                <span className="text-teal-500">{moneyShort(bp)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// FHB: fully interactive purchase page.

function FhbLab(props: SectionProps) {
  const { client, result, addChanges, presentation, ctx } = props;
  const fhb = result.fhb!;
  const [price, setPrice] = useState(fhb.purchasePrice);
  const [freq, setFreq] = useState<DisplayFrequency>('fortnightly');

  const stageLabel: Record<string, string> = {
    'before-finance': 'Before finance',
    'due-diligence': 'During due diligence',
    settlement: 'At settlement',
  };

  const repayAt = freq === 'weekly' ? fhb.repaymentWeekly : freq === 'fortnightly' ? fhb.repaymentFortnightly : fhb.repaymentMonthly;
  const extraMonthly = result.amortisation.extraMonthly;
  const amortBase = useMemo(
    () => amortise({ principal: fhb.loan, annualRate: fhb.effectiveRate, years: fhb.termYears }),
    [fhb.loan, fhb.effectiveRate, fhb.termYears],
  );
  const amortBlueprint = useMemo(
    () => amortise({ principal: fhb.loan, annualRate: fhb.effectiveRate, years: fhb.termYears, extraPerPeriod: extraMonthly }),
    [fhb.loan, fhb.effectiveRate, fhb.termYears, extraMonthly],
  );

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------- purchase inputs */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">Purchase price</h3>
            <div className="font-display mt-1 text-[34px] font-semibold text-ink">
              {presentation ? (
                <AnimatedNumber value={fhb.purchasePrice} />
              ) : (
                <EditableValue value={fhb.purchasePrice} size="lg" className="text-[34px]" onCommit={(v) => addChanges([{ kind: 'setPurchasePrice', value: v }])} />
              )}
            </div>
          </div>
          {!presentation ? (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={600_000}
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
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4 xl:grid-cols-7">
          <Stat label="Deposit" value={fhb.totalDeposit} sub={`${pct(fhb.depositPercent, 1)} · edit on screen 02`} />
          <Stat label="Loan" value={fhb.loan} sub={`LVR ${pct(fhb.lvr, 1)}`} />
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Base rate</div>
            <div className="mt-0.5">
              {presentation ? (
                <span className="num font-display text-[26px] font-semibold">{pct(fhb.baseRate)}</span>
              ) : (
                <EditableValue value={fhb.baseRate} format="percent" size="lg" onCommit={(v) => addChanges([{ kind: 'setRateAbsolute', value: v }])} />
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-500b">client rate assumption — editable</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Low-equity margin</div>
            <div className="mt-0.5">
              {presentation ? (
                <span className="num font-display text-[26px] font-semibold">+{pct(fhb.lowEquityMargin)}</span>
              ) : (
                <EditableValue value={fhb.lowEquityMargin} format="percent" size="lg" onCommit={(v) => addChanges([{ kind: 'setLowEquityMargin', value: v }])} />
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-500b">
              {fhb.lowEquityMarginIsOverride ? 'adviser override' : fhb.lowEquityMargin > 0 ? 'from LVR band — falls away below 80%' : 'none at 20%+ deposit'}
            </div>
          </div>
          <Stat label="Effective rate" value={fhb.effectiveRate} format="percent" sub="base + margin" />
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Term</div>
            <div className="mt-0.5">
              {presentation ? (
                <span className="num font-display text-[26px] font-semibold">{fhb.termYears}y</span>
              ) : (
                <EditableValue value={fhb.termYears} format="plain" size="lg" suffix="yrs" onCommit={(v) => addChanges([{ kind: 'setLoanTerm', years: Math.round(v) }])} />
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Repayment</div>
            <div className="num font-display mt-0.5 text-[26px] font-semibold text-ink">
              <AnimatedNumber value={repayAt} />
            </div>
            <div className="mt-1"><FreqToggle value={freq} onChange={setFreq} /></div>
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------- tiers + costs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Deposit tiers — levels to unlock</h3>
          <p className="mt-0.5 text-[12px] text-slate-500b">Adding deposit funds on screen 02 unlocks tiers live.</p>
          <div className="mt-4 space-y-2">
            {fhb.tiers.map((t) => (
              <div
                key={t.depositPercent}
                className={`rounded-xl border p-3.5 ${t.achievable ? 'border-teal-500/40 bg-aqua-100/40' : 'border-dashed border-line bg-mist/40'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`font-display text-[16px] font-bold ${t.achievable ? 'text-teal-500' : 'text-slate-400'}`}>{pct(t.depositPercent, 0)}</span>
                    {t.achievable ? (
                      <Pill tone="green">✓ Available</Pill>
                    ) : (
                      <Pill tone="slate">Locked — {money(t.additionalRequired)} more required</Pill>
                    )}
                  </div>
                  {!t.achievable && !presentation ? (
                    <button
                      onClick={() =>
                        addChanges([{ kind: 'setDepositSource', source: 'other', value: (client.targetPurchase?.depositSources.other ?? 0) + Math.ceil(t.additionalRequired / 100) * 100 }])
                      }
                      title="Adds the shortfall to Other funds — where it comes from (savings, gift, sale of shares) is the conversation"
                      className="rounded-lg border border-teal-500/50 px-2.5 py-1 text-[11px] font-semibold text-teal-500 hover:bg-teal-500 hover:text-white"
                    >
                      Unlock with {moneyShort(t.additionalRequired)} more deposit
                    </button>
                  ) : null}
                </div>
                <div className={`mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-[12px] md:grid-cols-6 ${t.achievable ? '' : 'opacity-60'}`}>
                  <TierCell label="Deposit" value={moneyShort(t.depositRequired)} />
                  <TierCell label="Loan" value={moneyShort(t.loan)} />
                  <TierCell label="LVR" value={pct(t.lvr, 0)} />
                  <TierCell label="Margin" value={t.lowEquityMargin > 0 ? `+${pct(t.lowEquityMargin)}` : '—'} />
                  <TierCell label="Rate" value={pct(t.effectiveRate)} />
                  <TierCell label="/fn" value={money(t.repaymentFortnightly)} strong />
                </div>
                {t.achievable ? (
                  <div className="mt-1 text-[11px] text-slate-500b">Cash buffer remaining after this deposit: <span className="num font-semibold text-ink">{money(t.cashBufferRemaining)}</span></div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {/* Ownership costs */}
          <Card className="p-6">
            <h3 className="font-display text-[15px] font-semibold text-ink">Total cost of ownership — per month</h3>
            <div className="mt-3 divide-y divide-line rounded-lg border border-line text-[13px]">
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-slate-500b">Mortgage ({pct(fhb.effectiveRate)}, {fhb.termYears}y P&I)</span>
                <span className="num font-semibold">{money(fhb.ownershipCosts.mortgageMonthly)}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-slate-500b">Rates (assumption)</span>
                {presentation ? <span className="num font-semibold">{money(fhb.ownershipCosts.ratesMonthly)}</span> : (
                  <EditableValue size="sm" value={fhb.ownershipCosts.ratesMonthly} onCommit={(v) => addChanges([{ kind: 'setOwnershipCost', item: 'rates', monthly: v }])} />
                )}
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-slate-500b">Home + contents insurance (assumption)</span>
                {presentation ? <span className="num font-semibold">{money(fhb.ownershipCosts.insuranceMonthly)}</span> : (
                  <EditableValue size="sm" value={fhb.ownershipCosts.insuranceMonthly} onCommit={(v) => addChanges([{ kind: 'setOwnershipCost', item: 'insurance', monthly: v }])} />
                )}
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-slate-500b">Other ownership costs</span>
                {presentation ? <span className="num font-semibold">{money(fhb.ownershipCosts.otherMonthly)}</span> : (
                  <EditableValue size="sm" value={fhb.ownershipCosts.otherMonthly} onCommit={(v) => addChanges([{ kind: 'setOwnershipCost', item: 'other', monthly: v }])} />
                )}
              </div>
              <div className="flex items-center justify-between bg-navy-900 px-3.5 py-3 text-[14px] font-semibold text-white">
                <span>Total cost of ownership</span>
                <span className="num"><AnimatedNumber value={fhb.ownershipCosts.totalMonthly} />/mo</span>
              </div>
            </div>
            <p className="mt-2 text-[11.5px] text-slate-500b">Owning costs more than the repayment — this is the number to budget on. Assumptions are editable, not quotes.</p>
          </Card>

          {/* Upfront costs */}
          <Card className="p-6">
            <h3 className="font-display text-[15px] font-semibold text-ink">Money required before settlement</h3>
            <div className="mt-3 divide-y divide-line rounded-lg border border-line">
              {fhb.upfrontCosts.items.map((i) => (
                <div key={i.key} className="flex items-center justify-between px-3.5 py-2 text-[13px]">
                  <div>
                    <div className="font-medium text-ink">
                      {i.label}
                      <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${i.required === false ? 'bg-mist text-slate-400' : 'bg-aqua-100 text-teal-500'}`}>
                        {i.required === false ? 'optional' : 'required'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500b">
                      {stageLabel[i.stage]}
                      {i.note ? ` — ${i.note}` : ''}
                    </div>
                  </div>
                  {presentation ? (
                    <span className="num font-semibold">{money(i.amount)}</span>
                  ) : (
                    <EditableValue size="sm" value={i.amount} onCommit={(v) => addChanges([{ kind: 'setUpfrontCost', key: i.key, amount: v }])} />
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between bg-mist px-3.5 py-2.5 text-[13px] font-semibold">
                <span>Have set aside & ready</span>
                <span className="num"><AnimatedNumber value={fhb.upfrontCosts.total} /></span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* -------------------------------------------------- cashback */}
      <Card className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-[15px] font-semibold text-ink">Lender cashback — a configurable example, not an entitlement</h3>
          <span className="text-[11px] text-slate-500b">{fhb.cashback.eligibilityNote}</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Cashback amount</div>
            <div className="mt-0.5">
              {presentation ? (
                <span className="num font-display text-[26px] font-semibold">{money(fhb.cashback.amount)}</span>
              ) : (
                <EditableValue value={fhb.cashback.amount} size="lg" onCommit={(v) => addChanges([{ kind: 'setCashback', amount: v, retentionMonths: fhb.cashback.retentionMonths }])} />
              )}
            </div>
            <div className="mt-1 text-[11.5px] text-slate-500b">{fhb.cashback.paymentTiming}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Retention period</div>
            <div className="mt-0.5">
              {presentation ? (
                <span className="num font-display text-[26px] font-semibold">{fhb.cashback.retentionMonths} mo</span>
              ) : (
                <EditableValue value={fhb.cashback.retentionMonths} format="plain" size="lg" suffix="months" onCommit={(v) => addChanges([{ kind: 'setCashback', amount: fhb.cashback.amount, retentionMonths: Math.round(v) }])} />
              )}
            </div>
            <div className="mt-1 text-[11.5px] text-slate-500b">clawback method: {fhb.cashback.clawbackMethod}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">If you repay or refinance early</div>
            <div className="mt-2 space-y-1">
              {fhb.cashback.clawbackTimeline.filter((c) => [12, 24, fhb.cashback.retentionMonths].includes(c.month) || c.month === 6).map((c) => (
                <div key={c.month} className="flex items-center gap-2 text-[12px]">
                  <span className="num w-14 text-slate-500b">mo {c.month}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-mist">
                    <div className="h-full rounded-full bg-rose-400" style={{ width: `${fhb.cashback.amount > 0 ? (c.owed / fhb.cashback.amount) * 100 : 0}%` }} />
                  </div>
                  <span className="num w-20 text-right font-semibold">{c.owed > 0 ? `${money(c.owed)} owed` : 'clear'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------- amortisation */}
      <RepaymentLab
        title="Repayment trajectory — pay the minimum, or get ahead"
        loanLabel="Proposed home loan"
        principal={fhb.loan}
        annualRate={fhb.effectiveRate}
        termYears={fhb.termYears}
        scheduleCurrent={amortBase.points}
        scheduleBlueprint={amortBlueprint.points}
        currentTermYears={amortBase.termYears}
        blueprintTermYears={amortBlueprint.termYears}
        currentInterest={amortBase.totalInterest}
        blueprintInterest={amortBlueprint.totalInterest}
        currentPaidOff={amortBase.paidOff}
        blueprintPaidOff={amortBlueprint.paidOff}
        extraMonthly={extraMonthly}
        scheduledMonthly={amortBase.scheduledPayment}
        addChanges={addChanges}
        presentation={presentation}
      />

      <PurchaseTimeline {...props} />
    </div>
  );
}

function TierCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className={`num ${strong ? 'font-semibold text-ink' : 'text-slate-500b'}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FHB purchase timeline

function PurchaseTimeline({ result, ctx, presentation }: SectionProps) {
  const fhb = result.fhb!;
  const ksHeavy = fhb.kiwiSaverShareOfDeposit > 0.5;
  const wd = ctx.ksWithdrawal;
  const steps = [
    {
      n: 1,
      title: 'Find property',
      body: 'Look with the pre-approval in hand — you know the comfortable number, not just the maximum.',
      links: [
        { label: 'Trade Me Property', href: 'https://www.trademe.co.nz/a/property' },
        { label: 'realestate.co.nz', href: 'https://www.realestate.co.nz' },
      ],
    },
    { n: 2, title: 'Make offer', body: 'Usually by sale and purchase agreement with conditions attached. Your lawyer sees it before you sign anything unconditional.' },
    {
      n: 3,
      title: 'Conditions',
      body: 'The safety net while you check the property. Typical conditions: finance, building report, LIM, and solicitor approval. Only go unconditional once every one is satisfied.',
      links: [{ label: 'Sale & purchase agreement guide (settled.govt.nz)', href: 'https://www.settled.govt.nz/buying-a-home/making-an-offer/understanding-the-sale-and-purchase-agreement/' }],
    },
    {
      n: 4,
      title: 'KiwiSaver / finance',
      body: `The lender confirms the loan and the KiwiSaver first-home withdrawal is lodged. Allow around ${wd.processingWorkingDays} working days once the lawyer holds the signed sale and purchase agreement and the withdrawal documentation. ${wd.cautionNote}`,
      highlight: ksHeavy,
    },
    { n: 5, title: 'Unconditional', body: 'The contract binds both sides. The deposit is usually paid now, and pulling out has real cost.' },
    { n: 6, title: 'Settlement', body: 'Lawyers exchange funds, the loan draws down, and the keys are yours. Cashback (if any) arrives around now, per the lender terms.' },
  ];

  return (
    <Card className="p-6">
      <h3 className="font-display text-[15px] font-semibold text-ink">The purchase, step by step</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className={`rounded-xl border p-4 ${s.highlight ? 'border-amber-300 bg-amber-50' : 'border-line bg-white'}`}>
            <div className="flex items-center gap-2">
              <span className={`font-display flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${s.highlight ? 'bg-amber-400 text-white' : 'bg-navy-900 text-white'}`}>
                {s.n}
              </span>
              <span className="font-display text-[13.5px] font-semibold text-ink">{s.title}</span>
            </div>
            <p className={`mt-2 text-[12px] leading-relaxed ${s.highlight ? 'text-amber-900' : 'text-slate-500b'}`}>{s.body}</p>
            {'links' in s && s.links ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {s.links.map((l) => (
                  <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-teal-500 hover:underline">
                    {l.label} ↗
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {ksHeavy ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
          <strong>Timing dependency:</strong> KiwiSaver makes up {Math.round(fhb.kiwiSaverShareOfDeposit * 100)}% of this deposit, so settlement
          depends on the withdrawal landing in time. Build the processing window into the settlement date rather than hoping it fits.
        </div>
      ) : null}
      {!presentation ? (
        <p className="mt-3 rounded-lg bg-mist px-4 py-2.5 text-[12px] leading-relaxed text-slate-500b">
          A note on lawyers and paperwork: do not send an unsigned or incomplete sale and purchase agreement to the lawyer repeatedly — each
          review can be billed, and the costs add up quietly. Send it once, complete and signed where it should be.
        </p>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Homeowner: nothing-changes vs restructure

function HomeownerLab(props: SectionProps) {
  const { client, result, baseline, addChanges, presentation } = props;
  const am = result.amortisation;
  const baseAm = baseline.amortisation;
  const scheduledMonthly = client.mortgages.reduce((s, m) => s + toMonthly(m.repayment.amount, m.repayment.frequency), 0);
  const totalDebt = client.mortgages.reduce((s, m) => s + m.balance, 0);
  const avgRate = totalDebt > 0 ? client.mortgages.reduce((s, m) => s + m.rate * m.balance, 0) / totalDebt : 0;

  return (
    <div className="space-y-4">
      <RepaymentLab
        title="If nothing changes vs the Blueprint path"
        loanLabel={`${client.mortgages.length} loan split${client.mortgages.length > 1 ? 's' : ''}`}
        principal={totalDebt}
        annualRate={avgRate}
        termYears={Math.max(...client.mortgages.map((m) => m.termRemainingYears))}
        scheduleCurrent={baseAm.current.schedule}
        scheduleBlueprint={am.blueprint.schedule}
        currentTermYears={baseAm.current.termYears}
        blueprintTermYears={am.blueprint.termYears}
        currentInterest={baseAm.current.totalInterest}
        blueprintInterest={am.blueprint.totalInterest}
        currentPaidOff={baseAm.current.paidOff}
        blueprintPaidOff={am.blueprint.paidOff}
        extraMonthly={am.extraMonthly}
        scheduledMonthly={scheduledMonthly}
        addChanges={addChanges}
        presentation={presentation}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-5">
          <Stat label="Monthly buffer" value={result.snapshot.monthlySurplus} sub="after the extra repayment" />
        </Card>
        <Card className="p-5">
          <Stat label="True remaining term" value={baseAm.current.paidOff ? baseAm.current.termYears : 0} format="years" decimals={1} sub={baseAm.current.paidOff ? 'at minimum repayments' : 'interest-only — no payoff path'} />
        </Card>
        <Card className="p-5">
          <Stat label="Usable equity" value={result.equity.totalUsableEquity} sub="within modelling LVR caps" />
        </Card>
        <Card className="p-5">
          <Stat label="Mortgage-free" value={am.blueprint.paidOff ? am.blueprint.payoffYear : 0} format="year" sub={<Delta value={am.blueprint.termYears - baseAm.current.termYears} goodWhen="down" format="years" />} />
        </Card>
      </div>

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
                For a household holding a cash nest egg, a revolving facility keeps surplus money working against the mortgage without locking
                it away. Model it to compare honestly against higher scheduled repayments.
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
              <p className="mt-2 text-[11.5px] text-slate-500b">Strategy: short fixes timed to the household's cash cycle — stay nimble and review at every expiry.</p>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Investor: editable property cards + quick actions + strategy comparison

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
  const investmentValue = result.equity.properties.filter((p) => p.use === 'investment').reduce((s, p) => s + p.activeValue, 0);
  const weightedYield = investmentValue > 0 ? (grossRentWeekly * 52) / investmentValue : 0;
  const ioExposure = client.mortgages.filter((m) => m.interestOnly).reduce((s, m) => s + m.balance, 0);

  const quickActions: { label: string; changes: ScenarioChange[]; title?: string }[] = [
    ...(rentals.length > 0
      ? [
          {
            label: 'Keep everything + buy another ($800k @ $650/wk)',
            changes: [{ kind: 'buyProperty', price: 800_000, rentPerWeek: 650, interestOnly: true, useProceeds: false } as ScenarioChange],
          },
          {
            label: `Sell ${rentals[0].nickname.split('—')[0].trim()} + buy ($800k @ $650/wk)`,
            changes: [
              { kind: 'sellProperty', propertyId: rentals[0].id } as ScenarioChange,
              { kind: 'buyProperty', price: 800_000, rentPerWeek: 650, interestOnly: true, useProceeds: true } as ScenarioChange,
            ],
          },
        ]
      : []),
    { label: 'Rates +0.5% across the book', changes: [{ kind: 'setRateDelta', delta: 0.005 }] },
    { label: 'Rates −0.5%', changes: [{ kind: 'setRateDelta', delta: -0.005 }] },
    { label: 'Everything to P&I', changes: [{ kind: 'setInterestOnly', on: false }] },
  ];

  return (
    <div className="space-y-4">
      <Card tone="navy" className="p-6">
        <h3 className="font-display text-[15px] font-semibold text-white">Portfolio dashboard</h3>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          <Stat tone="navy" label="Portfolio value" value={result.equity.totalValue} sub={`${client.properties.length} properties`} />
          <Stat tone="navy" label="Total debt" value={result.equity.totalDebt} sub={`portfolio LVR ${pct(result.equity.portfolioLVR, 0)}`} />
          <Stat tone="navy" label="Usable equity" value={result.equity.totalUsableEquity} sub={`buys up to ${moneyShort(result.equity.maxPurchaseWithEquity)}`} />
          <Stat tone="navy" label="Gross rent" value={grossRentWeekly} format="plain" sub={`$/week · weighted yield ${pct(weightedYield, 1)}`} />
          <Stat tone="navy" label="Interest-only exposure" value={ioExposure} sub="principal untouched by design" />
          <Stat tone="navy" label="Servicing headroom" value={result.servicing.maxNewLending} sub="new debt supported (Blueprint model)" />
          <Stat tone="navy" label="DTI" value={result.servicing.dti} format="plain" decimals={1} sub={`cap ≈ ${ctx.policy.dtiMultiple}× gross income`} />
          <Stat tone="navy" label="Monthly surplus" value={result.snapshot.monthlySurplus} sub="actual cashflow after everything" />
        </div>
      </Card>

      {/* Quick actions */}
      {!presentation ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500b">Quick actions:</span>
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => addChanges(a.changes)}
              className="rounded-full border border-teal-500/40 bg-white px-3 py-1.5 text-[12px] font-semibold text-teal-500 shadow-sm hover:bg-teal-500 hover:text-white"
            >
              {a.label}
            </button>
          ))}
          <span className="text-[11px] text-slate-500b">or ask the copilot: “Sell the rental for $580k and buy another for $620k at $1,060/week”</span>
        </div>
      ) : null}

      {/* Editable property cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {result.equity.properties.map((p) => {
          const prop = client.properties.find((x) => x.id === p.propertyId);
          if (!prop) return null;
          const rentWk = prop.rentPerWeek?.value ?? 0;
          const rentMo = (rentWk * 52) / 12;
          const costsMo = ((prop.ratesPerYear ?? 0) + (prop.insurancePerYear ?? 0)) / 12 + rentMo * ((prop.propertyMgmtRate ?? 0) + (prop.maintenanceRate ?? 0));
          const loans = client.mortgages.filter((m) => m.propertyId === prop.id);
          const debtMo = loans.reduce((s, m) => s + toMonthly(m.repayment.amount, m.repayment.frequency), 0);
          const cashflowMo = rentMo - costsMo - debtMo;
          const grossYield = p.activeValue > 0 && rentWk > 0 ? (rentWk * 52) / p.activeValue : 0;
          return (
            <Card key={p.propertyId} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display text-[15px] font-semibold text-ink">{p.nickname}</div>
                  <div className="mt-0.5 text-[12px] text-slate-500b">
                    {p.use === 'owner-occupied' ? 'Owner-occupied' : 'Investment'} · {prop.entity} · value source: {p.valuationSource}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Pill tone={p.lvr > 0.65 ? 'amber' : 'green'}>LVR {pct(p.lvr, 0)}</Pill>
                  {!presentation && p.use === 'investment' ? (
                    <button
                      onClick={() => addChanges([{ kind: 'sellProperty', propertyId: p.propertyId }])}
                      title="Model selling this property at its active valuation"
                      className="rounded-full border border-rose-200 px-2 py-0.5 text-[10.5px] font-semibold text-rose-600b hover:bg-rose-50"
                    >
                      Sell
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Value</div>
                  {presentation ? (
                    <div className="num text-[15px] font-semibold">{moneyShort(p.activeValue)}</div>
                  ) : (
                    <EditableValue size="sm" value={p.activeValue} onCommit={(v) => addChanges([{ kind: 'addValuation', propertyId: p.propertyId, value: v, sourceName: 'Adviser-entered valuation' }])} />
                  )}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Debt</div>
                  <div className="num text-[15px] font-semibold">{moneyShort(p.linkedDebt)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Equity (usable)</div>
                  <div className="num text-[15px] font-semibold">{moneyShort(p.usableEquity)}</div>
                </div>
                {p.use === 'investment' ? (
                  <>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Rent /wk</div>
                      {presentation ? (
                        <div className="num text-[15px] font-semibold">{money(rentWk)}</div>
                      ) : (
                        <EditableValue size="sm" value={rentWk} onCommit={(v) => addChanges([{ kind: 'setRent', propertyId: p.propertyId, perWeek: v }])} />
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Gross yield</div>
                      <div className="num text-[15px] font-semibold">{pct(grossYield, 1)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Cashflow /mo</div>
                      <div className={`num text-[15px] font-semibold ${cashflowMo >= 0 ? 'text-green-600b' : 'text-rose-600b'}`}>{money(cashflowMo)}</div>
                    </div>
                  </>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500b">
                <span>Rates {money((prop.ratesPerYear ?? 0) / 12)}/mo</span>
                <span>Insurance {money((prop.insurancePerYear ?? 0) / 12)}/mo</span>
                {prop.propertyMgmtRate ? <span>Mgmt {pct(prop.propertyMgmtRate, 0)} of rent</span> : null}
                {prop.maintenanceRate ? <span>Maintenance {pct(prop.maintenanceRate, 0)}</span> : null}
              </div>
              {loans.length > 0 && !presentation ? (
                <div className="mt-2 space-y-1 border-t border-line pt-2">
                  {loans.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-[11.5px]">
                      <span className="text-slate-500b">
                        {m.lender} · {moneyShort(m.balance)} @ {pct(m.rate)}
                      </span>
                      <button
                        onClick={() => addChanges([{ kind: 'setInterestOnly', loanId: m.id, on: !m.interestOnly }])}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.interestOnly ? 'bg-amber-50 text-amber-600b' : 'bg-emerald-50 text-green-600b'}`}
                        title="Toggle interest-only vs principal and interest"
                      >
                        {m.interestOnly ? 'IO → make P&I' : 'P&I → make IO'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

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
                    const differs = typeof v === 'number' && typeof baseV === 'number' && ci > 0 && Math.abs(v - baseV) > 0.005 * Math.max(1, Math.abs(baseV));
                    return (
                      <td key={c.id} className="num px-2 py-2.5 font-semibold text-ink">
                        {row.fmt(v as number)}
                        {differs ? (
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
          Projections use base growth assumptions ({pct(ctx.retirement.growth.base, 0)}/yr) — indicative, not guaranteed. Arrows compare against baseline; direction is context, not verdict.
        </p>
      </Card>
    </div>
  );
}
