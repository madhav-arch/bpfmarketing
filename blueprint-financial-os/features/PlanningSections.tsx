'use client';

import { Card, SectionHeading, Stat, Pill, AnimatedNumber } from '@/components/ui';
import { KiwiSaverChart, NetWorthChart } from '@/components/charts';
import { money, moneyShort, pct } from '@/lib/format';
import type { SectionProps } from './types';

// ---------------------------------------------------------------------------
// 06 — KiwiSaver & retirement trajectory

export function FutureSection({ client, result, openAudit, presentation, ctx }: SectionProps) {
  const ret = result.retirement;

  return (
    <section>
      <SectionHeading
        index="06 · Your future trajectory"
        title="KiwiSaver, retirement & the long game"
        lede="Projections under low / base / high assumptions — planning ranges, never promises."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {client.kiwiSaverAccounts.map((acc, i) => {
          const proj = result.kiwiSaverProjections[i];
          if (!proj) return null;
          const owner = client.applicants.find((a) => a.id === acc.applicantId);
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
                  onClick={() => openAudit({ title: `KiwiSaver projection — ${owner?.displayName}`, lines: proj.base.audit, ruleSetIds: [ctx.kiwiSaver.id] })}
                  className="text-[11.5px] font-medium text-teal-500 hover:underline"
                >
                  Assumptions
                </button>
              </div>
              <div className="mt-3">
                <KiwiSaverChart low={proj.low.balances} base={proj.base.balances} high={proj.high.balances} height={190} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4">
                <Stat label="Today" value={acc.balance.value} />
                <Stat label="In 10 years" value={proj.base.at10Years} sub={`${moneyShort(proj.low.at10Years)} – ${moneyShort(proj.high.at10Years)}`} />
                <Stat label={`At ${client.retirement.targetAge}`} value={proj.base.atHorizon} sub={`${moneyShort(proj.low.atHorizon)} – ${moneyShort(proj.high.atHorizon)}`} />
              </div>
            </Card>
          );
        })}
      </div>

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
          <div className="mt-3">
            <NetWorthChart path={result.netWorthPath} retirementYear={ret.retirementYear} />
          </div>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-semibold text-ink">Retirement at {client.retirement.targetAge}</h3>
            <button
              onClick={() => openAudit({ title: 'Retirement projection', lines: ret.audit, ruleSetIds: [ctx.retirement.id, ctx.kiwiSaver.id] })}
              className="text-[11.5px] font-medium text-teal-500 hover:underline"
            >
              Working
            </button>
          </div>
          <div className={`mt-4 rounded-lg px-4 py-3.5 ${ret.gap >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">
              {ret.gap >= 0 ? 'Projected surplus vs goal' : 'Projected gap vs goal'}
            </div>
            <div className={`font-display mt-0.5 text-[30px] font-semibold ${ret.gap >= 0 ? 'text-green-600b' : 'text-rose-600b'}`}>
              <AnimatedNumber value={Math.abs(ret.gap)} />
              <span className="ml-1 text-[13px] font-normal opacity-70">/yr</span>
            </div>
            <div className="mt-0.5 text-[12px] text-slate-500b">
              Goal {moneyShort(ret.goalAnnualIncome)}/yr · projected {moneyShort(ret.projectedAnnualIncome)}/yr
            </div>
          </div>
          <div className="mt-3 divide-y divide-line rounded-lg border border-line text-[13px]">
            {ret.incomeStreams.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-slate-500b">{s.label}</span>
                <span className="num font-semibold">{money(s.annual)}/yr</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1.5 text-[12px] text-slate-500b">
            <div className="flex justify-between">
              <span>Mortgage-free before retirement?</span>
              <span className={`font-semibold ${ret.mortgageFreeBeforeRetirement ? 'text-green-600b' : 'text-rose-600b'}`}>
                {ret.mortgageFreeBeforeRetirement ? `Yes — ~${ret.mortgageFreeYear}` : `No — ~${ret.mortgageFreeYear}`}
              </span>
            </div>
            <p className="pt-1 leading-relaxed">
              {pct(ret.drawdownRate, 0)} drawdown is one planning heuristic — not a guarantee, and adviser-adjustable. NZ Super at current settings.
            </p>
          </div>
        </Card>
      </div>

      {client.financialEvents.length > 0 ? (
        <Card className="mt-4 p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Life events on the timeline</h3>
          <p className="mt-0.5 text-[12.5px] text-slate-500b">Financial life doesn't stay static — these are already in the plan.</p>
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
        </Card>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 07 — Protection

export function ProtectionSection({ result, openAudit, ctx }: SectionProps) {
  const p = result.protection;
  const kinds: { key: keyof typeof p.existingCover; label: string }[] = [
    { key: 'life', label: 'Life cover' },
    { key: 'trauma', label: 'Trauma' },
    { key: 'income-protection', label: 'Income protection' },
    { key: 'health', label: 'Health' },
  ];

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
            {pct(Math.min(1, p.existingCover.life / Math.max(1, p.lifeCoverNeed)), 0)} of the indicative need is covered · premiums are{' '}
            {pct(p.premiumBurdenPercent, 1)} of household net income
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Cover status</h3>
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
          <div className="mt-4 space-y-2">
            {p.issues.map((i, idx) => (
              <div key={idx} className={`rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed ${i.severity === 'attention' ? 'bg-amber-50 text-amber-900' : 'bg-mist text-slate-500b'}`}>
                {i.message}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
