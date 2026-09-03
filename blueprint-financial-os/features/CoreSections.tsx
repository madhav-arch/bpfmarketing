'use client';

import { useState } from 'react';
import { Card, SectionHeading, Stat, InfoTip, Pill, AnimatedNumber, BankMark, EditableValue, FreqToggle, FREQ_PER_YEAR, FREQ_SHORT, type DisplayFrequency } from '@/components/ui';
import { LENDERS_TO_BE_TESTED } from '@/lib/rules/nzBankPolicies';
import { money, moneyShort, moneyTenK, moneyTenKShort, pct } from '@/lib/format';
import { netMonthlyFromSalary, grossFromNetMonthly } from '@/lib/calculators/tax';
import { pmt } from '@/lib/calculators/finance';
import type { SectionProps } from './types';
import type { Client } from '@/lib/domain/types';
import type { ScenarioChange } from '@/lib/scenarios/changes';
import { LiveDataPanel } from './LiveDataPanel';


// ---------------------------------------------------------------------------
// 01 — Goals

export function GoalsSection({ client, presentation, addChanges }: SectionProps) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const commitNewGoal = () => {
    if (newLabel.trim()) addChanges([{ kind: 'addGoal', label: newLabel.trim(), detail: newDetail.trim() || undefined }]);
    setAdding(false);
    setNewLabel('');
    setNewDetail('');
  };
  return (
    <section>
      <SectionHeading
        index="01 · Your goals"
        title="What we're building toward"
        lede="Everything in this session gets measured against these, not against what a bank will lend. Add, edit or remove goals freely — the copilot models against this list."
        right={
          !presentation ? (
            <button
              onClick={() => setAdding(true)}
              className="rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-400"
            >
              + Add goal
            </button>
          ) : null
        }
      />
      <Card className="divide-y divide-line">
        {client.goals.map((g) => (
          <div key={g.id} className="group flex items-start gap-3 px-5 py-4">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
            <div className="min-w-0 flex-1">
              {presentation ? (
                <>
                  <div className="font-display text-[15px] font-semibold text-ink">{g.label}</div>
                  {g.detail ? <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500b">{g.detail}</p> : null}
                </>
              ) : (
                <>
                  <input
                    defaultValue={g.label}
                    onBlur={(e) => e.target.value !== g.label && addChanges([{ kind: 'updateGoal', goalId: g.id, label: e.target.value }])}
                    className="font-display w-full bg-transparent text-[15px] font-semibold text-ink outline-none focus:text-teal-500"
                  />
                  <input
                    defaultValue={g.detail ?? ''}
                    placeholder="add detail…"
                    onBlur={(e) => e.target.value !== (g.detail ?? '') && addChanges([{ kind: 'updateGoal', goalId: g.id, detail: e.target.value }])}
                    className="mt-0.5 w-full bg-transparent text-[13px] leading-relaxed text-slate-500b outline-none focus:text-ink"
                  />
                </>
              )}
            </div>
            {!presentation ? (
              <button
                onClick={() => addChanges([{ kind: 'removeGoal', goalId: g.id }])}
                title="Remove this goal"
                className="mt-1 hidden shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-slate-400 hover:border-rose-200 hover:text-rose-600b group-hover:block"
              >
                remove
              </button>
            ) : null}
          </div>
        ))}
        {client.goals.length === 0 ? (
          <div className="px-5 py-6 text-[13px] text-slate-500b">No goals recorded yet — add the client's objectives and the modelling measures against them.</div>
        ) : null}
        {adding && !presentation ? (
          <div className="flex flex-wrap items-center gap-2 bg-aqua-100/40 px-5 py-4">
            <input
              value={newLabel}
              autoFocus
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitNewGoal()}
              placeholder="Goal, e.g. Mortgage-free before 55"
              className="w-64 rounded-lg border border-teal-500 bg-white px-3 py-2 text-[13px] outline-none"
            />
            <input
              value={newDetail}
              onChange={(e) => setNewDetail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitNewGoal()}
              placeholder="detail (optional)"
              className="w-72 rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-teal-500"
            />
            <button
              onClick={commitNewGoal}
              className="rounded-lg bg-teal-500 px-3.5 py-2 text-[13px] font-semibold text-white"
            >
              Add
            </button>
            <button onClick={() => setAdding(false)} className="text-[12.5px] text-slate-500b hover:underline">cancel</button>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helper: edit household net income by re-solving the lead salary's gross so
// tax stays internally consistent (net edits invert through the PAYE tables).

function householdNetEdit(client: Client, targetNetMonthly: number, tax: SectionProps['ctx']['tax']): ScenarioChange[] {
  const perApplicant = client.applicants.map((a) =>
    a.incomes.reduce((s, i) => s + netMonthlyFromSalary(i.grossAnnual, i.kiwiSaverRate, tax, i.studentLoan).netMonthly, 0),
  );
  const totalNet = perApplicant.reduce((s, x) => s + x, 0);
  const lead = client.applicants[0];
  const leadSalary = lead?.incomes.find((i) => i.kind === 'salary') ?? lead?.incomes[0];
  if (!lead || !leadSalary) return [];
  const othersNet = totalNet - netMonthlyFromSalary(leadSalary.grossAnnual, leadSalary.kiwiSaverRate, tax, leadSalary.studentLoan).netMonthly;
  const wantedLeadNet = Math.max(0, targetNetMonthly - othersNet);
  const newGross = grossFromNetMonthly(wantedLeadNet, leadSalary.kiwiSaverRate, tax, leadSalary.studentLoan);
  return [{ kind: 'setIncome', applicantIndex: 0, incomeId: leadSalary.id, grossAnnual: newGross }];
}

// ---------------------------------------------------------------------------
// 02 — Where you are today: INCOME / CASHFLOW separated from ASSETS / DEPOSIT

export function TodaySection(props: SectionProps) {
  const { client, result, openAudit, presentation, feed, addChanges, ctx } = props;
  const s = result.snapshot;
  const isFhb = client.clientType === 'fhb';
  const isInvestor = client.clientType === 'investor';
  const d = client.targetPurchase?.depositSources;

  return (
    <section>
      <SectionHeading
        index="02 · Where you are today"
        title="Your financial position"
        lede="Actual money, before any bank lens is applied. Everything here is click-to-edit; every edit flows through the whole model."
      />

      {/* ------------------------------------------------ INCOME / CASHFLOW */}
      <Card tone="navy" className="p-6">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300/80">Income / cashflow — per month</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-teal-300/80">
              Net household income
              <InfoTip tip="After tax, ACC, KiwiSaver and student loan. Click the number to edit — the engine re-solves the gross salary so tax stays consistent."> </InfoTip>
            </div>
            <div className="mt-0.5 font-display text-[26px] font-semibold leading-none text-white">
              {presentation ? (
                <AnimatedNumber value={s.actualNetIncomeMonthly} />
              ) : (
                <EditableValue
                  value={s.actualNetIncomeMonthly}
                  size="lg"
                  onCommit={(v) => addChanges(householdNetEdit(client, v, ctx.tax))}
                  className="text-white"
                />
              )}
            </div>
            <div className="mt-1 text-[12px] text-navy-100/70">incl. rent and board received</div>
          </div>
          <Stat tone="navy" label="Actual monthly spending" value={feed.analysis.totalSpendMonthly} sub={`from ${feed.isLive ? 'the Akahu feed' : 'the demo feed'} (${feed.analysis.monthsCovered} months)`} />
          <Stat tone="navy" label="Fixed commitments" value={client.expenses.fixedCommitmentsMonthly.reduce((x, f) => x + f.amount, 0)} sub="insurances, rates, childcare" />
          <Stat
            tone="navy"
            label="Monthly surplus"
            value={s.monthlySurplus}
            sub={client.mortgages.length ? 'after spending and repayments' : 'after declared spending'}
          />
        </div>
      </Card>

      {/* ------------------------------------------------ ASSETS / DEPOSIT */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {isFhb && d && client.targetPurchase ? (
          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500b">Deposit — where it comes from</div>
              <span className="text-[11px] text-slate-500b">every line editable</span>
            </div>
            <div className="mt-3 divide-y divide-line">
              {(
                [
                  ['KiwiSaver (first-home withdrawal)', 'kiwiSaver', d.kiwiSaver],
                  ['Cash savings', 'savings', d.savings],
                  ['Family gift', 'gift', d.gift],
                  ['Other funds', 'other', d.other],
                ] as const
              ).map(([label, key, value]) => (
                <div key={key} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-slate-500b">{label}</span>
                  {presentation ? (
                    <span className="num font-semibold">{money(value)}</span>
                  ) : (
                    <EditableValue value={value} onCommit={(v) => addChanges([{ kind: 'setDepositSource', source: key, value: v }])} />
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between bg-mist px-2 py-2.5 text-[13.5px] font-semibold">
                <span>Total deposit</span>
                <span className="num">
                  <AnimatedNumber value={d.kiwiSaver + d.savings + d.gift + d.other} />
                  <span className="ml-1.5 text-[11px] font-normal text-slate-500b">{pct(result.fhb?.depositPercent ?? 0, 1)} of purchase</span>
                </span>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500b">
              Changing any amount immediately recalculates the deposit percentage, loan required, LVR, low-equity tier, effective rate and
              repayments across every screen. {money(d.keepAsBuffer)} of cash is deliberately kept out as a buffer.
            </p>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500b">Assets</div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
              {client.properties.length > 0 ? (
                <Stat
                  label="Property value"
                  value={result.equity.totalValue}
                  sub={`${client.properties.length} propert${client.properties.length > 1 ? 'ies' : 'y'} · LVR ${pct(s.portfolioLVR, 0)}`}
                  audit={result.equity.properties[0]?.audit}
                  onAudit={() => openAudit({ title: 'Property position', lines: result.equity.properties.flatMap((p) => p.audit), ruleSetIds: [result.servicing.policyId] })}
                />
              ) : null}
              {s.usableEquity > 0 ? (
                <Stat
                  label="Usable equity"
                  value={s.usableEquity}
                  sub="within modelling LVR caps"
                  audit={result.equity.properties[0]?.audit}
                  onAudit={() => openAudit({ title: 'Usable equity', lines: result.equity.properties.flatMap((p) => p.audit), ruleSetIds: [result.servicing.policyId] })}
                />
              ) : null}
              <Stat label="KiwiSaver" value={s.kiwiSaverNow} sub={`projected ${moneyShort(s.kiwiSaverProjected)} at ${client.retirement.targetAge} (nominal)`} />
              <Stat label="Cash savings" value={client.cashSavings.value} sub={client.cashSavings.sourceName} />
              {isInvestor ? (
                <Stat label="Gross rent" value={client.properties.reduce((x, p) => x + (p.rentPerWeek?.value ?? 0), 0)} format="plain" sub="$ per week across the portfolio" />
              ) : null}
            </div>
          </Card>
        )}

        <Card className="p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500b">Net position</div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat label="Net worth" value={s.netWorth} sub={`${moneyShort(s.totalAssets)} assets − ${moneyShort(s.totalDebt)} debt`} />
            {client.mortgages.length > 0 ? (
              <Stat label="Mortgage debt" value={client.mortgages.reduce((x, m) => x + m.balance, 0)} sub={`${client.mortgages.length} loan split${client.mortgages.length > 1 ? 's' : ''}`} />
            ) : null}
            {isFhb ? <Stat label="KiwiSaver" value={s.kiwiSaverNow} sub="available for first-home withdrawal" /> : null}
            {client.otherDebts.length > 0 ? (
              <Stat label="Other debt limits" value={client.otherDebts.reduce((x, dd) => x + Math.max(dd.limit, dd.balance), 0)} sub="cards and personal loans — limits count, not balances" />
            ) : null}
          </div>
        </Card>
      </div>

      <IncomeTable {...props} />

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
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Value</div>
                    <div className="mt-0.5">
                      {presentation ? (
                        <span className="num font-display text-[22px] font-semibold">{moneyShort(p.activeValue)}</span>
                      ) : (
                        <EditableValue
                          value={p.activeValue}
                          size="lg"
                          onCommit={(v) => addChanges([{ kind: 'addValuation', propertyId: p.propertyId, value: v, sourceName: 'Adviser-entered valuation' }])}
                        />
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500b">{p.valuationSource}</div>
                  </div>
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

      <LiveDataPanel client={client} feed={feed} presentation={presentation} addChanges={addChanges} policy={ctx.policy} netIncomeMonthly={s.actualNetIncomeMonthly} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Income breakdown table — gross → PAYE → KiwiSaver → net per applicant, then
// other income with ACTUAL vs BANK RECOGNISED vs SCALING from the active
// policy. Add-income buttons cover boarder / rental / overtime / other.

function IncomeTable({ client, result, presentation, addChanges, ctx }: SectionProps) {
  const sv = result.servicing;
  const [adding, setAdding] = useState<null | 'boarder' | 'rental' | 'overtime' | 'other'>(null);
  const [addAmount, setAddAmount] = useState('');

  const commitAdd = () => {
    const v = parseFloat(addAmount.replace(/[^0-9.]/g, ''));
    if (!isFinite(v) || v <= 0) return setAdding(null);
    if (adding === 'boarder') addChanges([{ kind: 'setBoarder', perWeek: v }]);
    else if (adding === 'rental') addChanges([{ kind: 'setRent', perWeek: v }]);
    else if (adding === 'overtime') addChanges([{ kind: 'addGrossIncome', incomeKind: 'overtime-commission', label: 'Overtime', grossAnnual: v }]);
    else addChanges([{ kind: 'addIncome', label: 'Other income', netAnnual: v }]);
    setAdding(null);
    setAddAmount('');
  };

  return (
    <Card className="mt-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold text-ink">Income breakdown</h3>
        <span className="text-[11.5px] text-slate-500b">
          Scaling comes from the active policy ({sv.lender}) — grey figures are what actually arrives; the recognised column is what a lender counts.
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.1em] text-slate-500b">
              <th className="pb-2 pr-3 font-medium">Income line</th>
              <th className="pb-2 pr-3 text-right font-medium">Gross /yr</th>
              <th className="pb-2 pr-3 text-right font-medium">PAYE +ACC /mo</th>
              <th className="pb-2 pr-3 text-right font-medium">KiwiSaver /mo</th>
              <th className="pb-2 pr-3 text-right font-medium">Actual net /mo</th>
              <th className="pb-2 pr-3 text-right font-medium">Bank recognised /mo</th>
              <th className="pb-2 text-right font-medium">Scaling</th>
            </tr>
          </thead>
          <tbody>
            {client.applicants.flatMap((a, ai) =>
              a.incomes.map((inc) => {
                const net = netMonthlyFromSalary(inc.grossAnnual, inc.kiwiSaverRate, ctx.tax, inc.studentLoan);
                const line = sv.incomeLines.find((l) => l.id === inc.id);
                return (
                  <tr key={inc.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium text-ink">
                      {a.displayName} — {inc.label}
                      {inc.studentLoan ? <span className="ml-1.5 text-[10px] text-slate-400">student loan 12%</span> : null}
                    </td>
                    <td className="num py-2 pr-3 text-right">
                      {presentation ? (
                        money(inc.grossAnnual)
                      ) : (
                        <EditableValue size="sm" value={inc.grossAnnual} onCommit={(v) => addChanges([{ kind: 'setIncome', applicantIndex: ai, incomeId: inc.id, grossAnnual: v }])} />
                      )}
                    </td>
                    <td className="num py-2 pr-3 text-right text-slate-500b">{money(net.payeMonthly + net.accMonthly)}</td>
                    <td className="num py-2 pr-3 text-right text-slate-500b">{money(net.kiwiSaverMonthly)}</td>
                    <td className="num py-2 pr-3 text-right text-slate-400">{money(net.netMonthly)}</td>
                    <td className="num py-2 pr-3 text-right font-semibold">{money(line?.recognisedMonthly ?? net.netMonthly)}</td>
                    <td className="num py-2 text-right">{line && line.scaling < 1 ? <Pill tone="amber">{pct(line.scaling, 0)}</Pill> : '100%'}</td>
                  </tr>
                );
              }),
            )}
            {sv.incomeLines
              .filter((l) => l.kind === 'rental' || l.kind === 'boarder' || l.id.startsWith('extra-'))
              .map((l) => (
                <tr key={l.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-medium text-ink">{l.label}</td>
                  <td className="num py-2 pr-3 text-right text-slate-300">—</td>
                  <td className="num py-2 pr-3 text-right text-slate-300">—</td>
                  <td className="num py-2 pr-3 text-right text-slate-300">—</td>
                  <td className="num py-2 pr-3 text-right text-slate-400">{money(l.actualMonthly)}</td>
                  <td className="num py-2 pr-3 text-right font-semibold">{money(l.recognisedMonthly)}</td>
                  <td className="num py-2 text-right">{l.scaling < 1 ? <Pill tone="amber">{pct(l.scaling, 0)}</Pill> : '100%'}</td>
                </tr>
              ))}
            <tr className="font-semibold">
              <td className="py-2.5 pr-3">Total recognised by the bank</td>
              <td colSpan={4} />
              <td className="num py-2.5 pr-3 text-right">
                <AnimatedNumber value={sv.recognisedIncomeMonthly} />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {!presentation ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {adding ? (
            <span className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-ink">
                {adding === 'boarder' ? 'Boarder $/week:' : adding === 'rental' ? 'Rent $/week:' : adding === 'overtime' ? 'Overtime gross $/year:' : 'Other net $/year:'}
              </span>
              <input
                value={addAmount}
                autoFocus
                onChange={(e) => setAddAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitAdd()}
                inputMode="numeric"
                className="num w-24 rounded-lg border border-teal-500 px-2 py-1 text-[12.5px] outline-none"
              />
              <button onClick={commitAdd} className="rounded-lg bg-teal-500 px-2.5 py-1 text-[12px] font-semibold text-white">Add</button>
              <button onClick={() => setAdding(null)} className="text-[12px] text-slate-500b hover:underline">cancel</button>
            </span>
          ) : (
            <>
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500b">Add income:</span>
              {(['boarder', 'rental', 'overtime', 'other'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setAdding(k)}
                  className="rounded-full border border-teal-500/40 px-3 py-1 text-[12px] font-semibold text-teal-500 hover:bg-aqua-100"
                >
                  + {k === 'boarder' ? 'Boarder income' : k === 'rental' ? 'Rental income' : k === 'overtime' ? 'Overtime' : 'Other income'}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 03 — How the bank sees you: four literal blocks. A net income → B bank
// living costs → C debt commitments → D the surplus that BECOMES the maximum
// stress-tested repayment.

export function BankViewSection(props: SectionProps) {
  const { client, result, openAudit, presentation, ctx, feed, addChanges } = props;
  const sv = result.servicing;
  const testRate = result.effectiveStressRate;
  const termYears = ctx.policy.maxTermYears;
  // gross → PAYE/ACC → KiwiSaver → net decomposition for block A
  const payroll = client.applicants.flatMap((a) => a.incomes).reduce(
    (acc, inc) => {
      const n = netMonthlyFromSalary(inc.grossAnnual, inc.kiwiSaverRate, ctx.tax, inc.studentLoan);
      acc.gross += n.grossMonthly;
      acc.paye += n.payeMonthly + n.accMonthly + n.studentLoanMonthly;
      acc.ks += n.kiwiSaverMonthly;
      acc.net += n.netMonthly;
      return acc;
    },
    { gross: 0, paye: 0, ks: 0, net: 0 },
  );
  const [incomeDrag, setIncomeDrag] = useState<number | null>(null);
  const netNow = result.snapshot.actualNetIncomeMonthly;

  return (
    <section>
      <SectionHeading
        index="03 · How the bank sees you"
        title="The four steps of a lender's maths"
        lede="Lenders scale your income, assume benchmark living costs, stress-test every debt, and whatever is left becomes your maximum test repayment. Four blocks, in order."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* A — NET INCOME */}
        <Card className="p-5">
          <BlockLabel letter="A" title="Net income" note="what the lender counts each month" />
          {/* gross → PAYE → KiwiSaver → net, so the deductions are visible */}
          <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-mist px-3 py-2 text-center text-[11.5px]">
            <div><div className="text-[9.5px] uppercase tracking-wide text-slate-400">Gross pay /mo</div><div className="num font-semibold text-ink">{money(payroll.gross)}</div></div>
            <div><div className="text-[9.5px] uppercase tracking-wide text-slate-400">PAYE + ACC</div><div className="num font-semibold text-rose-600b">−{money(payroll.paye)}</div></div>
            <div><div className="text-[9.5px] uppercase tracking-wide text-slate-400">KiwiSaver</div><div className="num font-semibold text-rose-600b">−{money(payroll.ks)}</div></div>
            <div><div className="text-[9.5px] uppercase tracking-wide text-slate-400">Net pay /mo</div><div className="num font-semibold text-ink">{money(payroll.net)}</div></div>
          </div>
          <div className="mt-2 divide-y divide-line rounded-lg border border-line">
            {sv.incomeLines.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-3.5 py-2 text-[13px]">
                <InfoTip tip={l.why}>{l.label.replace(/ — /, ' · ')}</InfoTip>
                <span className="num font-semibold">
                  {l.scaling < 1 ? <span className="mr-1.5 text-[11px] font-normal text-slate-400">({money(l.actualMonthly)} actual)</span> : null}
                  {money(l.recognisedMonthly)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-navy-900 px-3.5 py-2.5 text-[13.5px] font-semibold text-white">
              <span>Recognised net income</span>
              <span className="num"><AnimatedNumber value={sv.recognisedIncomeMonthly} />/mo</span>
            </div>
          </div>
          {!presentation ? (
            <div className="mt-2.5 flex items-center gap-3">
              <span className="shrink-0 text-[11px] text-slate-500b">Drag to test an income change:</span>
              <input
                type="range"
                min={Math.round(netNow * 0.6)}
                max={Math.round(netNow * 1.5)}
                step={50}
                value={incomeDrag ?? Math.round(netNow)}
                onChange={(e) => setIncomeDrag(Number(e.target.value))}
                onMouseUp={() => { if (incomeDrag) { addChanges(householdNetEdit(client, incomeDrag, ctx.tax)); setIncomeDrag(null); } }}
                onTouchEnd={() => { if (incomeDrag) { addChanges(householdNetEdit(client, incomeDrag, ctx.tax)); setIncomeDrag(null); } }}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[#2ab3b1]"
              />
              <EditableValue size="sm" value={incomeDrag ?? netNow} onCommit={(v) => addChanges(householdNetEdit(client, v, ctx.tax))} suffix="/mo net" />
            </div>
          ) : null}
        </Card>

        {/* B — BANK LIVING COSTS */}
        <Card className="p-5">
          <BlockLabel letter="B" title="Bank living costs" note="benchmark minimums, whatever you declare" />
          <div className="mt-3 divide-y divide-line rounded-lg border border-line">
            {sv.livingExpenses.items.map((i, idx) => {
              const editable = !presentation && client.expenses.fixedCommitmentsMonthly.some((f) => f.label === i.label);
              return (
                <div key={idx} className="flex items-center justify-between px-3.5 py-2 text-[13px]">
                  <InfoTip tip={i.note ?? ''}>{i.label}</InfoTip>
                  {editable ? (
                    <span className="num font-semibold">
                      −<EditableValue size="sm" value={i.amount} onCommit={(v) => addChanges([{ kind: 'setFixedCommitment', label: i.label, monthly: v }])} />
                    </span>
                  ) : (
                    <span className="num font-semibold">−{money(i.amount)}</span>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between bg-mist px-3.5 py-2.5 text-[13.5px] font-semibold">
              <span>Bank living costs</span>
              <span className="num">−<AnimatedNumber value={sv.livingExpenses.totalMonthly} />/mo</span>
            </div>
          </div>
          <p className="mt-2 rounded-lg bg-aqua-100 px-3 py-2 text-[11.5px] leading-relaxed text-navy-800">
            The statements show the household actually spends <strong className="num">{money(feed.analysis.totalSpendMonthly)}/mo</strong> —{' '}
            {feed.analysis.totalSpendMonthly > sv.livingExpenses.totalMonthly
              ? 'above the benchmark, and an assessor uses the higher figure.'
              : 'inside the benchmark, so the benchmark minimum is what the assessor applies.'}
          </p>
        </Card>

        {/* C — DEBT COMMITMENTS */}
        <Card className="p-5">
          <BlockLabel letter="C" title="Debt commitments" note="stress-tested, limits count even at zero balance" />
          <div className="mt-3 divide-y divide-line rounded-lg border border-line">
            {sv.debtServicing.items.length === 0 ? (
              <div className="px-3.5 py-3 text-[13px] text-slate-500b">No existing debt — a clean slate for new lending.</div>
            ) : (
              sv.debtServicing.items.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between px-3.5 py-2 text-[13px]">
                  <InfoTip tip={i.note ?? ''}>{i.label}</InfoTip>
                  <span className="num font-semibold">−{money(i.amount)}</span>
                </div>
              ))
            )}
            {sv.debtServicing.items.length > 0 ? (
              <div className="flex items-center justify-between bg-mist px-3.5 py-2.5 text-[13.5px] font-semibold">
                <span>Debt commitments</span>
                <span className="num">−<AnimatedNumber value={sv.debtServicing.totalMonthly} />/mo</span>
              </div>
            ) : null}
          </div>
          {client.mortgages.length > 0 ? (
            <div className="mt-2 rounded-lg bg-aqua-100 px-3 py-2 text-[11.5px] leading-relaxed text-navy-800">
              Actual loan repayments today: <strong className="num">{money(result.snapshot.actualRepaymentsMonthly)}/mo</strong> — the bank
              ignores that and tests <strong className="num">{money(sv.stressedRepaymentMonthly)}/mo</strong> at the test rate. The gap is the
              safety margin lenders build in.
            </div>
          ) : null}
          {client.otherDebts.some((dd) => dd.kind === 'credit-card' || dd.kind === 'store-card') ? (
            <div className="mt-2 rounded-lg bg-mist px-3 py-2 text-[11.5px] leading-relaxed text-slate-500b">
              {(() => {
                const cards = client.otherDebts.filter((dd) => dd.kind === 'credit-card' || dd.kind === 'store-card');
                const limit = cards.reduce((x, c) => x + c.limit, 0);
                return (
                  <>
                    Credit card limit: <strong className="num text-ink">{money(limit)}</strong> · Bank assessment:{' '}
                    <strong className="num text-ink">{pct(ctx.policy.creditCardMonthlyFactor, 1)}/mo of the limit</strong> (policy-driven — ANZ 4%,
                    ASB 3%, BNZ/Westpac 3.8%, Kiwibank 5%) · Monthly commitment:{' '}
                    <strong className="num text-ink">{money(limit * ctx.policy.creditCardMonthlyFactor)}</strong>
                  </>
                );
              })()}
            </div>
          ) : null}
        </Card>

        {/* D — STRESS-TESTED CAPACITY */}
        <Card tone="navy" className="p-5">
          <BlockLabel letter="D" title="Stress-tested capacity" dark note="the teaching moment" />
          <div className="mt-3 space-y-1.5 text-[13px]">
            <EqRow dark label="Recognised income" value={sv.recognisedIncomeMonthly} />
            <EqRow dark label="Bank living costs" value={-sv.livingExpenses.totalMonthly} />
            <EqRow dark label="Debt commitments" value={-sv.debtServicing.totalMonthly} />
          </div>
          <div className="mt-3 rounded-lg border-2 border-teal-400/60 bg-teal-500/15 px-4 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-teal-300">
              = Available monthly stress repayment
            </div>
            <div className="num font-display mt-0.5 text-[30px] font-semibold text-white">
              <AnimatedNumber value={sv.umi} />
              <span className="ml-1 text-[13px] font-normal text-teal-200/70">/mo</span>
            </div>
            <div className="mt-1 text-[11.5px] leading-snug text-teal-100/80">
              The surplus <em>is</em> the maximum modelled stress-tested mortgage repayment. There is no other number.
            </div>
          </div>
          <div className="mt-3 text-[13px] leading-relaxed text-navy-100/85">
            At a{' '}
            {presentation ? (
              <strong className="num">{pct(testRate)}</strong>
            ) : (
              <EditableValue
                value={testRate}
                format="percent"
                size="sm"
                className="text-white"
                onCommit={(v) => addChanges([{ kind: 'setStressRate', value: v }])}
              />
            )}{' '}
            test rate over {termYears} years, this supports approximately{' '}
            <strong className="num font-display text-[18px] text-teal-300">{moneyTenK(sv.maxNewLending)}</strong> of lending
            {sv.minUMIRequired > 0 ? ` — after keeping the ${money(sv.minUMIRequired)}/mo minimum surplus in reserve` : ''}.
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={() =>
                openAudit({
                  title: 'Servicing calculation',
                  lines: sv.audit,
                  ruleSetIds: [sv.policyId],
                  sourceNote: 'The test rate is a configurable, versioned assumption — each bank profile carries its own extracted rate.',
                })
              }
              className="text-[11.5px] font-medium text-teal-300 hover:underline"
            >
              How was this calculated?
            </button>
            {!presentation ? (
              <span className="text-[10.5px] text-navy-100/50">test rate is editable — click it</span>
            ) : null}
          </div>
        </Card>
      </div>
    </section>
  );
}

function BlockLabel({ letter, title, note, dark }: { letter: string; title: string; note?: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`font-display flex h-7 w-7 items-center justify-center rounded-md text-[14px] font-bold ${dark ? 'bg-teal-500 text-navy-950' : 'bg-navy-900 text-white'}`}>
        {letter}
      </span>
      <span className={`font-display text-[15px] font-semibold ${dark ? 'text-white' : 'text-ink'}`}>{title}</span>
      {note ? <span className={`text-[11px] ${dark ? 'text-navy-100/60' : 'text-slate-500b'}`}>· {note}</span> : null}
    </div>
  );
}

function EqRow({ label, value, dark }: { label: string; value: number; dark?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={dark ? 'text-navy-100/75' : 'text-slate-500b'}>{label}</span>
      <span className={`num font-semibold ${value < 0 ? (dark ? 'text-rose-300' : 'text-rose-600b') : dark ? 'text-white' : 'text-ink'}`}>
        {value < 0 ? '−' : ''}
        {money(Math.abs(value))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 04 — Borrowing power: lender comparison + interactive comfortable-vs-max
// with frequency toggle + live servicing levers with BEFORE → AFTER.

export function CapacitySection(props: SectionProps) {
  const { client, result, openAudit, presentation, addChanges, computePreview, ctx } = props;
  const cmp = result.lenderComparison;
  const rows = cmp.results.map((r) => {
    const policy = ctx.lenders.find((l) => l.id === r.policyId);
    return {
      lender: r.lender,
      capacity: r.maxNewLending,
      isModel: r.policyId === result.servicing.policyId,
      brand: policy?.brand,
      stressRate: r.policyId === result.servicing.policyId ? result.effectiveStressRate : policy?.stressRate,
    };
  });
  const maxCapacity = Math.max(...rows.map((r) => r.capacity), 1);
  const fhb = result.fhb;
  const [freq, setFreq] = useState<DisplayFrequency>('fortnightly');
  const [customLoan, setCustomLoan] = useState<number | null>(null);

  const clientRate = fhb ? fhb.baseRate : client.modellingRate;
  const perPeriod = (loan: number) => pmt(clientRate / FREQ_PER_YEAR[freq], (fhb?.termYears ?? 30) * FREQ_PER_YEAR[freq], loan);
  const deposit = fhb?.totalDeposit ?? 0;

  const optionRows = fhb
    ? [
        { key: 'max', label: 'Bank maximum', loan: fhb.comfortable.bankMaxLoan, tone: 'rose' as const, note: 'not a recommendation' },
        { key: 'comfortable', label: 'Comfortable target', loan: fhb.comfortable.comfortableLoan, tone: 'green' as const, note: 'planned around the life you want' },
        { key: 'selected', label: 'Currently modelling', loan: fhb.comfortable.selectedLoan, tone: 'teal' as const, note: 'the live scenario' },
        { key: 'custom', label: 'Custom amount', loan: customLoan ?? Math.round(fhb.comfortable.selectedLoan * 0.95), tone: 'slate' as const, note: 'editable — type any loan', custom: true },
      ]
    : [];

  return (
    <section>
      <SectionHeading
        index="04 · Borrowing power"
        title="What lenders would put behind you"
        lede="Capacity is a range, not a number. Each lender scales income and benchmarks expenses differently, so the right lender is part of the advice."
      />

      <Card tone="navy" className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-300/80">Indicative lending capacity</div>
            <div className="font-display mt-1 text-[40px] font-semibold leading-none text-white">
              <AnimatedNumber value={cmp.range.min} format="money10k" />
              <span className="mx-2 text-teal-300">—</span>
              <AnimatedNumber value={cmp.range.max} format="money10k" />
            </div>
            <div className="mt-2 text-[12.5px] text-navy-100/70">
              Across {cmp.results.length} lender profiles · rounded to the nearest $10,000 · indicative modelling, not an approval
            </div>
          </div>
          {fhb ? (
            <div className="text-right">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-300/80">+ your deposit</div>
              <div className="font-display mt-1 text-[24px] font-semibold text-teal-300">
                <AnimatedNumber value={fhb.totalDeposit} />
              </div>
              <div className="mt-1 text-[12.5px] text-navy-100/70">≈ purchase range {moneyTenKShort(cmp.range.min + fhb.totalDeposit)} – {moneyTenKShort(cmp.range.max + fhb.totalDeposit)}</div>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Live servicing levers */}
      {!presentation ? <LeversRow {...props} /> : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-[15px] font-semibold text-ink">Lender comparison</h3>
            {!presentation ? (
              <button
                className="text-[11.5px] font-medium text-teal-500 hover:underline"
                onClick={() =>
                  openAudit({
                    title: 'Lender capacity range',
                    lines: cmp.results.map((r) => ({ label: r.lender, value: r.maxNewLending, format: 'currency' as const })),
                    ruleSetIds: cmp.results.map((r) => r.policyId),
                  })
                }
              >
                Explain this difference
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-2.5">
            {rows.map((r) => (
              <div key={r.lender} className="flex items-center gap-3">
                {r.brand ? (
                  <span className="w-20"><BankMark mark={r.brand.mark} color={r.brand.color} textColor={r.brand.textColor} /></span>
                ) : (
                  <span className="w-20 text-[11px] font-semibold text-slate-500b">{r.lender}</span>
                )}
                <div className="h-4 flex-1 overflow-hidden rounded-md bg-mist">
                  <div
                    className="h-full rounded-md transition-all duration-500"
                    style={{ width: `${(r.capacity / maxCapacity) * 100}%`, backgroundColor: r.isModel ? '#14294a' : (r.brand?.color ?? '#2ab3b1'), opacity: r.isModel ? 1 : 0.85 }}
                  />
                </div>
                <div className="w-24 text-right">
                  <span className="num text-[13px] font-semibold text-ink">{moneyTenKShort(r.capacity)}</span>
                  {!presentation && r.stressRate ? (
                    <div className="text-[10px] text-slate-500b">tests @ {pct(r.stressRate)}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500b">To be tested — check with adviser:</span>
            {LENDERS_TO_BE_TESTED.map((l) => (
              <span key={l.lender} className="inline-flex items-center gap-1.5" title={`${l.lender} — servicing calculator not yet loaded; confirm with adviser`}>
                <BankMark mark={l.brand.mark} color={l.brand.color} muted size="sm" />
                <span className="text-[11px] text-slate-500b">{l.lender}</span>
              </span>
            ))}
          </div>
          {!presentation ? (
            <div className="mt-3 space-y-1.5">
              {cmp.differences
                .filter((d) => d.drivers.length > 0)
                .map((d) => (
                  <div key={d.lender} className="rounded-md bg-mist px-3 py-2 text-[12px] text-slate-500b">
                    <span className="font-semibold text-ink">{d.lender}:</span> {d.drivers.join(' · ')}
                  </div>
                ))}
              <p className="pt-1 text-[11px] leading-relaxed text-slate-500b">
                Bank profiles are extracted from each bank's own servicing calculator (versioned, hidden parameter sheets included). Test rates
                and benchmark expenses move with the economy, so every profile carries its release date and requires adviser confirmation.
              </p>
            </div>
          ) : null}
        </Card>

        {fhb ? (
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-[15px] font-semibold text-ink">Comfortable vs maximum</h3>
              <FreqToggle value={freq} onChange={setFreq} />
            </div>
            <p className="mt-1 text-[12.5px] text-slate-500b">
              Repayments shown at the client rate assumption of{' '}
              {presentation ? (
                <strong className="num">{pct(clientRate)}</strong>
              ) : (
                <EditableValue value={clientRate} format="percent" size="sm" onCommit={(v) => addChanges([{ kind: 'setRateAbsolute', value: v }])} />
              )}{' '}
              (editable — what you might actually pay), not the {pct(result.effectiveStressRate)} bank test rate. Both matter; they answer different questions.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[440px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.1em] text-slate-500b">
                    <th className="pb-2 pr-2 font-medium">Option</th>
                    <th className="pb-2 pr-2 text-right font-medium">Purchase</th>
                    <th className="pb-2 pr-2 text-right font-medium">Deposit</th>
                    <th className="pb-2 pr-2 text-right font-medium">Loan</th>
                    <th className="pb-2 pr-2 text-right font-medium">Repayment /{FREQ_SHORT[freq]}</th>
                    <th className="pb-2 text-right font-medium">Buffer /mo</th>
                  </tr>
                </thead>
                <tbody>
                  {optionRows.map((o) => {
                    const repay = perPeriod(o.loan);
                    const repayMonthly = (repay * FREQ_PER_YEAR[freq]) / 12;
                    const buffer = result.snapshot.actualNetIncomeMonthly - result.snapshot.declaredSpendMonthly - repayMonthly;
                    return (
                      <tr key={o.key} className="border-b border-line/60">
                        <td className="py-2 pr-2"><Pill tone={o.tone}>{o.label}</Pill></td>
                        <td className="num py-2 pr-2 text-right font-semibold">{moneyShort(o.loan + deposit)}</td>
                        <td className="num py-2 pr-2 text-right">{moneyShort(deposit)}</td>
                        <td className="num py-2 pr-2 text-right">
                          {o.custom && !presentation ? (
                            <EditableValue size="sm" value={o.loan} onCommit={(v) => setCustomLoan(v)} />
                          ) : (
                            moneyShort(o.loan)
                          )}
                        </td>
                        <td className="num py-2 pr-2 text-right font-semibold">{money(repay)}</td>
                        <td className={`num py-2 text-right ${buffer < 500 ? 'text-rose-600b' : 'text-green-600b'}`}>{money(buffer)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!presentation ? (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => addChanges([{ kind: 'setPurchasePrice', value: Math.round((fhb.comfortable.comfortableLoan + deposit) / 10_000) * 10_000 }])}
                  className="rounded-lg bg-teal-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-400"
                >
                  Model the comfortable target
                </button>
                {customLoan ? (
                  <button
                    onClick={() => addChanges([{ kind: 'setPurchasePrice', value: Math.round(customLoan + deposit) }])}
                    className="rounded-lg border border-teal-500/50 px-3 py-1.5 text-[12px] font-semibold text-teal-500 hover:bg-aqua-100"
                  >
                    Model the custom amount
                  </button>
                ) : null}
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
              <strong>servicing</strong> ({moneyTenKShort(cmp.range.max)} of new debt) — for {client.applicants.map((a) => a.displayName).join(' & ')},{' '}
              {result.equity.maxPurchaseWithEquity > cmp.range.max ? 'servicing is the binding constraint.' : 'equity is the binding constraint.'}
            </p>
          </Card>
        )}
      </div>
    </section>
  );
}

// Live levers: each computes BEFORE → AFTER through the same engine, then one
// click applies it for real.

function LeversRow({ client, result, addChanges, computePreview }: SectionProps) {
  const [boarderWk, setBoarderWk] = useState(250);
  const before = result.servicing.maxNewLending;
  const cards = client.otherDebts.filter((d) => d.kind === 'credit-card' || d.kind === 'store-card');
  const cardLimit = cards.reduce((s, c) => s + c.limit, 0);
  const personalLoan = client.otherDebts.find((d) => d.kind === 'personal-loan');
  const lead = client.applicants[0];
  const leadGross = lead?.incomes[0]?.grossAnnual ?? 0;

  const levers: { key: string; label: string; changes: ScenarioChange[]; detail?: (after: number) => string; editable?: boolean }[] = [
    {
      key: 'boarder',
      label: `Add boarder $${boarderWk}/wk`,
      changes: [{ kind: 'setBoarder', perWeek: boarderWk }],
      detail: () => `actual $${Math.round((boarderWk * 52) / 12).toLocaleString()}/mo — the bank recognises less (policy scaling)`,
      editable: true,
    },
    ...(cardLimit > 0
      ? [
          { key: 'close-cards', label: `Close ${moneyShort(cardLimit)} card limit`, changes: [{ kind: 'closeCreditCards' } as ScenarioChange] },
          { key: 'halve-card', label: `Reduce card limit to ${moneyShort(cardLimit / 2)}`, changes: [{ kind: 'setCreditCardLimit', limit: Math.round(cardLimit / 2) } as ScenarioChange] },
        ]
      : []),
    ...(lead
      ? [{ key: 'income', label: 'Increase income +$10k', changes: [{ kind: 'setIncome', applicantIndex: 0, incomeId: lead.incomes[0]?.id, grossAnnual: leadGross + 10_000 } as ScenarioChange] }]
      : []),
    ...(personalLoan ? [{ key: 'ploan', label: `Remove ${personalLoan.label}`, changes: [{ kind: 'removeDebt', debtId: personalLoan.id } as ScenarioChange] }] : []),
    ...(client.targetPurchase
      ? [{ key: 'gift', label: 'Add $20k gift to deposit', changes: [{ kind: 'setDepositSource', source: 'gift', value: (client.targetPurchase.depositSources.gift ?? 0) + 20_000 } as ScenarioChange] }]
      : []),
  ];

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500b">Live servicing levers</span>
        <span className="text-[11px] text-slate-500b">each shows borrowing capacity before → after; click to apply for real</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {levers.slice(0, 5).map((l) => {
          const after = computePreview(l.changes).servicing.maxNewLending;
          const delta = after - before;
          return (
            <div
              key={l.key}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.group\\/ev, input')) return; // let the amount edit through
                addChanges(l.changes);
              }}
              onKeyDown={(e) => e.key === 'Enter' && addChanges(l.changes)}
              className="group cursor-pointer rounded-xl border border-line bg-white p-3 text-left shadow-sm transition-all hover:border-teal-500/60 hover:shadow-md"
            >
              <div className="text-[12px] font-semibold leading-snug text-ink">
                {l.editable ? (
                  <>
                    Add boarder <EditableValue size="sm" value={boarderWk} onCommit={(v) => setBoarderWk(Math.round(v))} suffix="/wk" title="Custom boarder amount" />
                  </>
                ) : (
                  l.label
                )}
              </div>
              <div className="num mt-1.5 text-[12px] text-slate-500b">
                {moneyTenKShort(before)} <span className="text-slate-300">→</span>{' '}
                <span className={`font-semibold ${delta > 1000 ? 'text-green-600b' : delta < -1000 ? 'text-rose-600b' : 'text-ink'}`}>{moneyTenKShort(after)}</span>
              </div>
              <div className={`num text-[11px] font-semibold ${delta > 1000 ? 'text-green-600b' : delta < -1000 ? 'text-rose-600b' : 'text-slate-400'}`}>
                {delta >= 0 ? '+' : '−'}
                {moneyShort(Math.abs(delta))} capacity
              </div>
              {l.detail ? <div className="mt-1 text-[10px] leading-snug text-slate-400">{l.detail(after)}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
