'use client';

import { Card, SectionHeading, Stat, InfoTip, Pill, AnimatedNumber } from '@/components/ui';
import { BankWaterfall, LenderCapacityChart, RecognitionBars } from '@/components/charts';
import { money, moneyShort, pct } from '@/lib/format';
import type { SectionProps } from './types';
import type { GoalKind } from '@/lib/domain/types';
import { LiveDataPanel } from './LiveDataPanel';

const GOAL_ICONS: Partial<Record<GoalKind, string>> = {
  'buy-first-home': '⌂',
  'comfortable-budget': '◎',
  'pay-off-faster': '↯',
  'improve-cashflow': '≋',
  refix: '⟳',
  refinance: '⇄',
  restructure: '⌗',
  'buy-investment': '⌂+',
  'improve-yield': '%',
  'build-equity': '▲',
  'mortgage-free-by': '✓',
  'family-planning': '☺',
  'retirement-income': '☀',
  'review-kiwisaver': '◔',
  'protect-income': '⛨',
  'help-children': '⌂→',
  other: '·',
};

// ---------------------------------------------------------------------------
// 01 — Goals

export function GoalsSection({ client }: SectionProps) {
  return (
    <section>
      <SectionHeading
        index="01 · Your goals"
        title="What we're building toward"
        lede="Everything in this session gets measured against these — not against what a bank will lend."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {client.goals.map((g, i) => (
          <Card key={g.id} className="bp-rise p-5" tone={i === 0 ? 'navy' : 'default'}>
            <div className="flex items-start gap-4">
              <div
                className={`font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg ${
                  i === 0 ? 'bg-teal-500/20 text-teal-300' : 'bg-aqua-100 text-teal-500'
                }`}
              >
                {GOAL_ICONS[g.kind] ?? '·'}
              </div>
              <div>
                <div className={`font-display text-[16px] font-semibold ${i === 0 ? 'text-white' : 'text-ink'}`}>{g.label}</div>
                {g.detail ? (
                  <p className={`mt-1 text-[13px] leading-relaxed ${i === 0 ? 'text-navy-100/75' : 'text-slate-500b'}`}>{g.detail}</p>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 02 — Where you are today

export function TodaySection({ client, result, openAudit, presentation, feed, addChanges, ctx }: SectionProps) {
  const s = result.snapshot;
  const isFhb = client.clientType === 'fhb';
  const isInvestor = client.clientType === 'investor';

  return (
    <section>
      <SectionHeading
        index="02 · Where you are today"
        title="Your financial position"
        lede="Actual money — what you earn, spend, own and owe today, before any bank lens is applied."
      />
      <Card tone="navy" className="p-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          <Stat tone="navy" label="Net worth" value={s.netWorth} sub={`${moneyShort(s.totalAssets)} assets − ${moneyShort(s.totalDebt)} debt`} />
          <Stat tone="navy" label="Household net income" value={s.actualNetIncomeMonthly} sub="per month, after tax" />
          <Stat tone="navy" label="Monthly spending" value={s.declaredSpendMonthly} sub="as declared in the Fact Find" />
          <Stat
            tone="navy"
            label="Monthly surplus"
            value={s.monthlySurplus}
            sub={client.mortgages.length ? 'after spending + repayments' : 'after spending'}
          />
        </div>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {client.mortgages.length > 0 ? (
          <Card className="p-5">
            <Stat label="Mortgage debt" value={client.mortgages.reduce((x, m) => x + m.balance, 0)} sub={`${client.mortgages.length} loan split${client.mortgages.length > 1 ? 's' : ''}`} />
          </Card>
        ) : null}
        {client.properties.length > 0 ? (
          <Card className="p-5">
            <Stat
              label="Property value"
              value={result.equity.totalValue}
              sub={`${client.properties.length} propert${client.properties.length > 1 ? 'ies' : 'y'} · LVR ${pct(s.portfolioLVR, 0)}`}
              audit={result.equity.properties[0]?.audit}
              onAudit={() => openAudit({ title: 'Property position', lines: result.equity.properties.flatMap((p) => p.audit), ruleSetIds: [result.servicing.policyId] })}
            />
          </Card>
        ) : null}
        {s.usableEquity > 0 ? (
          <Card className="p-5">
            <Stat
              label="Usable equity"
              value={s.usableEquity}
              sub="within modelling LVR caps"
              onAudit={() => openAudit({ title: 'Usable equity', lines: result.equity.properties.flatMap((p) => p.audit), ruleSetIds: [result.servicing.policyId] })}
              audit={result.equity.properties[0]?.audit}
            />
          </Card>
        ) : null}
        <Card className="p-5">
          <Stat label="KiwiSaver" value={s.kiwiSaverNow} sub={isFhb ? 'available for first-home withdrawal' : `projected ${moneyShort(s.kiwiSaverProjected)} at retirement`} />
        </Card>
        <Card className="p-5">
          <Stat label="Cash savings" value={client.cashSavings.value} sub={client.cashSavings.sourceName} />
        </Card>
        {isInvestor ? (
          <Card className="p-5">
            <Stat
              label="Gross rent"
              value={client.properties.reduce((x, p) => x + (p.rentPerWeek?.value ?? 0), 0)}
              format="plain"
              sub="$ per week across the portfolio"
            />
          </Card>
        ) : null}
      </div>

      {client.properties.length > 0 ? (
        <div className="mt-6">
          <h3 className="font-display mb-3 text-[15px] font-semibold text-ink">Properties & valuations</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {result.equity.properties.map((p) => (
              <Card key={p.propertyId} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-display text-[15px] font-semibold text-ink">{p.nickname}</div>
                    <div className="mt-0.5 text-[12px] text-slate-500b">
                      {p.use === 'owner-occupied' ? 'Owner-occupied' : 'Investment'} · held in {p.entity}
                    </div>
                  </div>
                  <Pill tone={p.lvr > 0.65 ? 'amber' : 'green'}>LVR {pct(p.lvr, 0)}</Pill>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <Stat label="Value" value={p.activeValue} sub={p.valuationSource} />
                  <Stat label="Lending" value={p.linkedDebt} />
                  <Stat
                    label="Usable equity"
                    value={p.usableEquity}
                    audit={p.audit}
                    onAudit={() => openAudit({ title: `Usable equity — ${p.nickname}`, lines: p.audit, ruleSetIds: [result.servicing.policyId] })}
                  />
                </div>
                {p.perValuation.length > 1 && !presentation ? (
                  <div className="mt-4 rounded-lg bg-mist p-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500b">Valuation sources change your equity</div>
                    {p.perValuation.map((v) => (
                      <div key={v.id} className="mt-1.5 flex items-center justify-between text-[12.5px]">
                        <span className="text-slate-500b">
                          {v.label}
                          {v.observedAt ? ` · ${v.observedAt}` : ''}
                        </span>
                        <span className="num font-semibold text-ink">
                          {moneyShort(v.value)} → {moneyShort(v.usableEquity)} usable
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <LiveDataPanel client={client} feed={feed} presentation={presentation} addChanges={addChanges} policy={ctx.policy} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 03 — How the bank sees you

export function BankViewSection({ result, openAudit, presentation, ctx, feed }: SectionProps) {
  const sv = result.servicing;
  const scaledLines = sv.incomeLines.filter((l) => l.scaling < 1);

  return (
    <section>
      <SectionHeading
        index="03 · How the bank sees you"
        title="Behind the bank's closed doors"
        lede="Lenders don't use your numbers — they scale your income, apply benchmark living costs, and stress-test every dollar of debt. This is the calculation that decides what they'll lend."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="font-display text-[15px] font-semibold text-ink">Money in → money out → what's left</h3>
            <button
              onClick={() =>
                openAudit({
                  title: 'Servicing calculation',
                  lines: sv.audit,
                  ruleSetIds: [sv.policyId],
                  sourceNote: 'Living-cost benchmarks and scaling rules vary by lender; this is Blueprint’s conservative modelling view.',
                })
              }
              className="text-[12px] font-medium text-teal-500 hover:underline"
            >
              How was this calculated?
            </button>
          </div>
          <BankWaterfall
            income={sv.recognisedIncomeMonthly}
            living={sv.livingExpenses.totalMonthly}
            debt={sv.debtServicing.totalMonthly}
            umi={sv.umi}
          />
          <div className="mt-2 flex items-baseline justify-between rounded-lg bg-navy-900 px-4 py-3">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-teal-300">
              <InfoTip tip="Uncommitted monthly income — what the lender believes is left each month after benchmark living costs and stress-tested debt. This number IS your borrowing capacity.">
                Uncommitted monthly income
              </InfoTip>
            </div>
            <div className="font-display text-[24px] font-semibold text-white">
              <AnimatedNumber value={sv.umi} />
              <span className="ml-1 text-[13px] font-normal text-navy-100/60">/mo</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h3 className="font-display text-[15px] font-semibold text-ink">Actual vs bank-recognised income</h3>
          <p className="mt-0.5 text-[12px] text-slate-500b">Grey = what actually arrives. Teal = what the lender counts.</p>
          <div className="mt-3">
            <RecognitionBars
              lines={sv.incomeLines.map((l) => ({
                label: l.label.replace(/ — /, ' · '),
                actual: l.actualMonthly,
                recognised: l.recognisedMonthly,
              }))}
            />
          </div>
          {scaledLines.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {scaledLines.map((l) => (
                <div key={l.id} className="rounded-md bg-mist px-3 py-2 text-[12px] leading-snug text-slate-500b">
                  <span className="font-semibold text-ink">{l.label}:</span> {l.why}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            The bank's living costs — <span className="text-slate-500b">not yours</span>
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500b">
            Lenders assume a minimum cost of living whatever you declare. Your real lifestyle spending sits on top — that's yours to keep or convert into strategy.
          </p>
          <div className="mt-4 divide-y divide-line rounded-lg border border-line">
            {sv.livingExpenses.items.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                <InfoTip tip={i.note ?? ''}>{i.label}</InfoTip>
                <span className="num font-semibold">{money(i.amount)}/mo</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-mist px-3.5 py-2.5 text-[13px] font-semibold">
              <span>Bank's view of your living costs</span>
              <span className="num">{money(sv.livingExpenses.totalMonthly)}/mo</span>
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-aqua-100 px-3.5 py-2.5 text-[12px] leading-relaxed text-navy-800">
            The statements say the household actually spends{' '}
            <strong className="num">{money(feed.analysis.totalSpendMonthly)}/mo</strong> on lifestyle (
            {feed.isLive ? 'live Akahu feed' : 'demo feed'}, {feed.analysis.monthsCovered} months) —{' '}
            {feed.analysis.totalSpendMonthly > sv.livingExpenses.totalMonthly
              ? 'above the benchmark, so the benchmark won’t be what the assessor uses; statements decide.'
              : 'inside the benchmark, which is what the assessor will apply.'}
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Debt, stress-tested</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500b">
            Every debt is tested at {pct(ctx.policy.stressRate)} — not the rate you actually pay — and card limits count even at zero balance.
          </p>
          <div className="mt-4 divide-y divide-line rounded-lg border border-line">
            {sv.debtServicing.items.length === 0 ? (
              <div className="px-3.5 py-3 text-[13px] text-slate-500b">No existing debt — a clean slate for new lending.</div>
            ) : (
              sv.debtServicing.items.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                  <InfoTip tip={i.note ?? ''}>{i.label}</InfoTip>
                  <span className="num font-semibold">{money(i.amount)}/mo</span>
                </div>
              ))
            )}
            {sv.debtServicing.items.length > 0 ? (
              <div className="flex items-center justify-between bg-mist px-3.5 py-2.5 text-[13px] font-semibold">
                <span>Total stressed commitments</span>
                <span className="num">{money(sv.debtServicing.totalMonthly)}/mo</span>
              </div>
            ) : null}
          </div>
          {!presentation ? (
            <p className="mt-3 text-[11.5px] text-slate-500b">
              Minimum UMI gate: {money(sv.minUMIRequired)}/mo must remain{' '}
              {sv.umi > sv.minUMIRequired ? '· cleared ✓' : '· NOT cleared — capacity is zero until this improves'}
            </p>
          ) : null}
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 04 — Borrowing power

export function CapacitySection({ client, result, openAudit, presentation, addChanges }: SectionProps) {
  const cmp = result.lenderComparison;
  const rows = cmp.results.map((r) => ({
    lender: r.lender,
    capacity: r.maxNewLending,
    isModel: r.policyId === result.servicing.policyId,
  }));
  const fhb = result.fhb;

  return (
    <section>
      <SectionHeading
        index="04 · Borrowing power"
        title="What lenders would put behind you"
        lede="Capacity is a range, not a number — each lender scales income and benchmarks expenses differently. The right lender is part of the advice."
      />

      <Card tone="navy" className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-300/80">Indicative lending capacity</div>
            <div className="font-display mt-1 text-[40px] font-semibold leading-none text-white">
              <AnimatedNumber value={cmp.range.min} />
              <span className="mx-2 text-teal-300">—</span>
              <AnimatedNumber value={cmp.range.max} />
            </div>
            <div className="mt-2 text-[12.5px] text-navy-100/70">
              Across {cmp.results.length} lender profiles · illustrative modelling, not an approval
            </div>
          </div>
          {fhb ? (
            <div className="text-right">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-300/80">+ your deposit</div>
              <div className="font-display mt-1 text-[24px] font-semibold text-teal-300">
                <AnimatedNumber value={fhb.totalDeposit} />
              </div>
              <div className="mt-1 text-[12.5px] text-navy-100/70">≈ purchase range {moneyShort(cmp.range.min + fhb.totalDeposit)} – {moneyShort(cmp.range.max + fhb.totalDeposit)}</div>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Lender comparison</h3>
          <LenderCapacityChart rows={rows} />
          {!presentation ? (
            <div className="mt-2 space-y-1.5">
              {cmp.differences
                .filter((d) => d.drivers.length > 0)
                .map((d) => (
                  <div key={d.lender} className="rounded-md bg-mist px-3 py-2 text-[12px] text-slate-500b">
                    <span className="font-semibold text-ink">{d.lender}:</span> {d.drivers.join(' · ')}
                  </div>
                ))}
              <p className="pt-1 text-[11px] text-slate-500b">
                Demo lender profiles — structurally faithful, not live bank policy. Every figure can be traced via{' '}
                <button
                  className="font-medium text-teal-500 hover:underline"
                  onClick={() =>
                    openAudit({
                      title: 'Lender capacity range',
                      lines: cmp.results.map((r) => ({ label: r.lender, value: r.maxNewLending, format: 'currency' as const })),
                      ruleSetIds: cmp.results.map((r) => r.policyId),
                    })
                  }
                >
                  explain this difference
                </button>
                .
              </p>
            </div>
          ) : null}
        </Card>

        {fhb ? (
          <Card className="p-6">
            <h3 className="font-display text-[15px] font-semibold text-ink">Comfortable vs maximum</h3>
            <p className="mt-1 text-[12.5px] text-slate-500b">The bank's maximum is not a recommendation. We plan around the life you want to afford.</p>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Bank maximum', loan: fhb.comfortable.bankMaxLoan, purchase: fhb.comfortable.bankMaxPurchase, tone: 'rose' as const },
                { label: 'Comfortable target', loan: fhb.comfortable.comfortableLoan, purchase: fhb.comfortable.comfortablePurchase, tone: 'green' as const },
                { label: 'Currently modelling', loan: fhb.comfortable.selectedLoan, purchase: fhb.comfortable.selectedPurchase, tone: 'teal' as const },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Pill tone={r.tone}>{r.label}</Pill>
                  </div>
                  <div className="text-right">
                    <div className="num font-display text-[17px] font-semibold text-ink">{moneyShort(r.purchase)} purchase</div>
                    <div className="text-[11.5px] text-slate-500b">{moneyShort(r.loan)} lending</div>
                  </div>
                </div>
              ))}
            </div>
            {!presentation ? (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => addChanges([{ kind: 'setPurchasePrice', value: Math.round(fhb.comfortable.comfortablePurchase / 10_000) * 10_000 }])}
                  className="rounded-lg bg-teal-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-400"
                >
                  Model the comfortable target
                </button>
              </div>
            ) : null}
          </Card>
        ) : (
          <Card className="p-6">
            <h3 className="font-display text-[15px] font-semibold text-ink">Equity as deposits</h3>
            <p className="mt-1 text-[12.5px] text-slate-500b">
              Usable equity can stand in for cash deposits at ~{pct(result.equity.equityDepositRate, 0)} on investment lending.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Stat label="Usable equity" value={result.equity.totalUsableEquity} />
              <Stat label="Supports purchases up to" value={result.equity.maxPurchaseWithEquity} sub="equity as full deposit, servicing permitting" />
            </div>
            <p className="mt-4 rounded-lg bg-aqua-100 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-navy-800">
              Capacity is the lower of <strong>equity</strong> ({moneyShort(result.equity.maxPurchaseWithEquity)}) and{' '}
              <strong>servicing</strong> ({moneyShort(cmp.range.max)} of new debt) — for {client.applicants.map((a) => a.displayName).join(' & ')},{' '}
              {result.equity.maxPurchaseWithEquity > cmp.range.max ? 'servicing is the binding constraint.' : 'equity is the binding constraint.'}
            </p>
          </Card>
        )}
      </div>
    </section>
  );
}
