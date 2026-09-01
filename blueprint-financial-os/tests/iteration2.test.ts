// Iteration 2 critical scenario tests — the 13 behaviours the brief names,
// each run through the same applyScenario → computeAll path the UI uses.
import { describe, expect, it } from 'vitest';
import { demoFhb, demoHomeowner, demoInvestor } from '../lib/data/demoClients';
import { DEFAULT_RULE_CONTEXT } from '../lib/rules/context';
import { applyScenario } from '../lib/scenarios/apply';
import { computeAll } from '../lib/scenarios/compute';
import type { ScenarioChange } from '../lib/scenarios/changes';
import { localParser } from '../lib/ai/localParser';
import { amortise } from '../lib/calculators/amortisation';
import { todaysDollars, pmt } from '../lib/calculators/finance';
import { projectKiwiSaver } from '../lib/calculators/kiwisaver';
import { lowEquityMarginFor } from '../lib/calculators/fhb';

const ctx = DEFAULT_RULE_CONTEXT;
const run = (client: typeof demoFhb, changes: ScenarioChange[]) => computeAll(applyScenario(client, changes), ctx);

describe('Iteration 2 critical scenarios', () => {
  // 1 — FHB: changing gift increases deposit and decreases loan
  it('FHB: a gift increases the deposit and decreases the loan', () => {
    const base = run(demoFhb, []);
    const withGift = run(demoFhb, [{ kind: 'setDepositSource', source: 'gift', value: 50_000 }]);
    expect(withGift.fhb!.totalDeposit).toBeCloseTo(base.fhb!.totalDeposit + 50_000, 2);
    expect(withGift.fhb!.loan).toBeCloseTo(base.fhb!.loan - 50_000, 2);
    expect(withGift.fhb!.depositPercent).toBeGreaterThan(base.fhb!.depositPercent);
  });

  // 2 — FHB: 10% → 15% deposit changes LVR and applicable low-equity margin
  it('FHB: moving from a 10% to a 15% deposit changes LVR and the low-equity margin', () => {
    const at10 = run(demoFhb, [{ kind: 'setDepositPercent', value: 0.1 }]);
    const at15 = run(demoFhb, [{ kind: 'setDepositPercent', value: 0.15 }]);
    expect(at10.fhb!.lvr).toBeCloseTo(0.9, 2);
    expect(at15.fhb!.lvr).toBeCloseTo(0.85, 2);
    expect(at10.fhb!.lowEquityMargin).toBe(lowEquityMarginFor(0.9, ctx.policy));
    expect(at15.fhb!.lowEquityMargin).toBe(lowEquityMarginFor(0.85, ctx.policy));
    expect(at15.fhb!.lowEquityMargin).toBeLessThan(at10.fhb!.lowEquityMargin);
    expect(at15.fhb!.effectiveRate).toBeLessThan(at10.fhb!.effectiveRate);
  });

  // 3 — FHB: closing credit cards increases capacity (limits are commitments)
  it('FHB: closing the credit cards increases borrowing capacity', () => {
    const base = run(demoFhb, []);
    const closed = run(demoFhb, [{ kind: 'closeCreditCards' }]);
    const limits = demoFhb.otherDebts.reduce((s, d) => s + d.limit, 0);
    expect(limits).toBeGreaterThan(0);
    expect(closed.servicing.maxNewLending).toBeGreaterThan(base.servicing.maxNewLending);
    // the monthly commitment released equals limit × the policy card factor
    const releasedMonthly = limits * ctx.policy.creditCardMonthlyFactor;
    expect(closed.servicing.umi - base.servicing.umi).toBeCloseTo(releasedMonthly, 1);
  });

  // 4 — FHB: boarder income recognised according to policy scaling
  it('FHB: adding a boarder changes recognised income per the policy scaling', () => {
    const withBoarder = run(demoFhb, [{ kind: 'setBoarder', perWeek: 250 }]);
    const line = withBoarder.servicing.incomeLines.find((l) => l.kind === 'boarder')!;
    expect(line.actualMonthly).toBeCloseTo((250 * 52) / 12, 1);
    expect(line.recognisedMonthly).toBeCloseTo(250 * ctx.policy.weeklyToMonthly * ctx.policy.boarderScaling.percent, 1);
    expect(line.scaling).toBe(ctx.policy.boarderScaling.percent);
  });

  // 5 — Mortgage: +$500/fortnight changes amortisation correctly
  it('Mortgage: +$500/fortnight shortens the term and cuts interest', () => {
    const base = run(demoHomeowner, []);
    const faster = run(demoHomeowner, [{ kind: 'adjustRepayment', delta: 500, frequency: 'fortnightly' }]);
    expect(faster.amortisation.extraMonthly).toBeCloseTo((500 * 26) / 12, 2);
    expect(faster.amortisation.blueprint.termYears).toBeLessThan(base.amortisation.blueprint.termYears - 0.5);
    expect(faster.amortisation.blueprint.totalInterest).toBeLessThan(base.amortisation.blueprint.totalInterest - 10_000);
  });

  // 6 — frequency toggle keeps the annual equivalent honest
  it('Frequency: weekly, fortnightly and monthly repayments carry the same annual equivalent (within payment-frequency effects)', () => {
    // extra-repayment conversion is exact:
    const a = applyScenario(demoHomeowner, [{ kind: 'adjustRepayment', delta: 100, frequency: 'weekly' }]);
    const b = applyScenario(demoHomeowner, [{ kind: 'adjustRepayment', delta: (100 * 52) / 26, frequency: 'fortnightly' }]);
    const c = applyScenario(demoHomeowner, [{ kind: 'adjustRepayment', delta: (100 * 52) / 12, frequency: 'monthly' }]);
    expect(a.extraRepaymentMonthly).toBeCloseTo(b.extraRepaymentMonthly, 6);
    expect(a.extraRepaymentMonthly).toBeCloseTo(c.extraRepaymentMonthly, 6);
    // display conversion: pmt at each frequency annualises to within 0.5%
    // (small differences are the true effect of paying more often, not a bug)
    const loan = 800_000;
    const wk = pmt(0.06 / 52, 30 * 52, loan) * 52;
    const fn = pmt(0.06 / 26, 30 * 26, loan) * 26;
    const mo = pmt(0.06 / 12, 30 * 12, loan) * 12;
    expect(Math.abs(wk - mo) / mo).toBeLessThan(0.005);
    expect(Math.abs(fn - mo) / mo).toBeLessThan(0.005);
  });

  // 7 — Investor: selling releases equity after debt repayment + sale costs
  it('Investor: selling a rental releases net proceeds after debt, agent and legal costs', () => {
    const rental = demoInvestor.properties.find((p) => p.use === 'investment')!;
    const value = rental.valuations.find((v) => v.id === rental.activeValuationId)!.value;
    const debt = demoInvestor.mortgages.filter((m) => m.propertyId === rental.id).reduce((s, m) => s + m.balance, 0);
    const state = applyScenario(demoInvestor, [{ kind: 'sellProperty', propertyId: rental.id }]);
    const expectedBeforeLvrSweep = value - value * ctx.modelling.saleAgentFeeRate - ctx.modelling.saleLegalFee - debt;
    // proceeds may be reduced further only if retained securities breach LVR caps
    expect(state.soldPropertyProceeds).toBeLessThanOrEqual(expectedBeforeLvrSweep + 1);
    expect(state.soldPropertyProceeds).toBeGreaterThan(0);
    expect(state.client.properties.find((p) => p.id === rental.id)).toBeUndefined();
    expect(state.client.mortgages.some((m) => m.propertyId === rental.id)).toBe(false);
    // equity view: total debt drops by at least the sold property's debt
    const base = run(demoInvestor, []);
    const sold = computeAll(state, ctx);
    expect(sold.equity.totalDebt).toBeLessThanOrEqual(base.equity.totalDebt - debt + 1);
  });

  // 8 — Investor: new rent flows through lender scaling
  it('Investor: a rent change moves recognised income by the policy rental scaling', () => {
    const rental = demoInvestor.properties.find((p) => p.use === 'investment')!;
    const oldRent = rental.rentPerWeek!.value;
    const base = run(demoInvestor, []);
    const raised = run(demoInvestor, [{ kind: 'setRent', propertyId: rental.id, perWeek: oldRent + 100 }]);
    const delta = raised.servicing.recognisedIncomeMonthly - base.servicing.recognisedIncomeMonthly;
    expect(delta).toBeCloseTo(100 * ctx.policy.weeklyToMonthly * ctx.policy.rentalScaling, 1);
  });

  // 9 — KiwiSaver: first-home withdrawal decreases the projected balance
  it('KiwiSaver: the first-home withdrawal reduces the subsequent projection and is a visible event', () => {
    const acc = demoFhb.kiwiSaverAccounts[0];
    const without = projectKiwiSaver(acc, ctx.kiwiSaver, { mode: 'base', horizonYears: 25 });
    const withW = projectKiwiSaver(acc, ctx.kiwiSaver, {
      mode: 'base',
      horizonYears: 25,
      withdrawal: { year: 1, amount: 18_000, keepMinimum: ctx.ksWithdrawal.minBalanceRetained },
    });
    expect(withW.withdrawalEvent).toBeDefined();
    expect(withW.withdrawalEvent!.amount).toBeCloseTo(18_000, 0);
    expect(withW.atHorizon).toBeLessThan(without.atHorizon - 18_000); // compounding gap grows
    // and through the full engine: the FHB default models the withdrawal
    const full = run(demoFhb, []);
    expect(full.kiwiSaverProjections.some((p) => p.base.withdrawalEvent)).toBe(true);
    const off = run(demoFhb, [{ kind: 'setKiwiSaverWithdrawal', on: false }]);
    expect(off.snapshot.kiwiSaverProjected).toBeGreaterThan(full.snapshot.kiwiSaverProjected);
  });

  // 10 — KiwiSaver: higher contribution increases the projection
  it('KiwiSaver: a higher contribution rate increases the projection', () => {
    const base = run(demoHomeowner, []);
    const more = run(demoHomeowner, [{ kind: 'setKiwiSaverRate', rate: 0.06 }]);
    expect(more.snapshot.kiwiSaverProjected).toBeGreaterThan(base.snapshot.kiwiSaverProjected + 5_000);
  });

  // 11 — Inflation: today's dollars differ correctly from nominal
  it("Inflation: today's-dollar values deflate nominal values by (1+i)^years", () => {
    expect(todaysDollars(1_420_000, 0.022, 30)).toBeCloseTo(1_420_000 / Math.pow(1.022, 30), 4);
    const base = run(demoHomeowner, []);
    const yrs = base.retirement.yearsToRetirement;
    expect(base.retirement.projectedKiwiSaverToday).toBeCloseTo(todaysDollars(base.retirement.projectedKiwiSaver, base.inflation, yrs), 2);
    // editable inflation flows through
    const hot = run(demoHomeowner, [{ kind: 'setInflation', value: 0.04 }]);
    expect(hot.inflation).toBe(0.04);
    expect(hot.retirement.projectedKiwiSaverToday).toBeLessThan(base.retirement.projectedKiwiSaverToday);
    expect(hot.retirement.projectedWeeklyIncomeToday).toBeCloseTo(hot.retirement.projectedAnnualIncomeToday / 52, 4);
  });

  // 12 — Scenario: baseline remains unchanged after creating a scenario
  it('Scenario: the baseline client is never mutated by scenario changes', () => {
    const frozen = JSON.stringify(demoFhb);
    run(demoFhb, [
      { kind: 'setDepositSource', source: 'gift', value: 80_000 },
      { kind: 'setIncome', applicantIndex: 0, grossAnnual: 120_000 },
      { kind: 'closeCreditCards' },
      { kind: 'setBoarder', perWeek: 300 },
      { kind: 'setRetirementAge', age: 70 },
      { kind: 'kiwiSaverLumpSum', amount: 10_000 },
    ]);
    expect(JSON.stringify(demoFhb)).toBe(frozen);
  });

  // 13 — AI structured action ≡ manual field edit
  it('AI: a parsed copilot instruction produces exactly the same result as the manual edit', () => {
    const parsed = localParser.parse('Close the credit cards and add a boarder paying $250 per week', { client: demoFhb });
    expect(parsed.changes.length).toBe(2);
    const viaAi = run(demoFhb, parsed.changes.map((p) => p.change));
    const viaManual = run(demoFhb, [
      { kind: 'closeCreditCards' },
      { kind: 'setBoarder', perWeek: 250, count: 1 },
    ]);
    expect(viaAi.servicing.maxNewLending).toBeCloseTo(viaManual.servicing.maxNewLending, 6);
    expect(viaAi.servicing.umi).toBeCloseTo(viaManual.servicing.umi, 6);
    expect(viaAi.snapshot.monthlySurplus).toBeCloseTo(viaManual.snapshot.monthlySurplus, 6);

    // and for a repayment + KiwiSaver compound instruction
    const parsed2 = localParser.parse('Increase repayments by $500 a fortnight and increase KiwiSaver to 6%', { client: demoHomeowner });
    const kinds = parsed2.changes.map((p) => p.change.kind).sort();
    expect(kinds).toEqual(['adjustRepayment', 'setKiwiSaverRate']);
    const aiR = run(demoHomeowner, parsed2.changes.map((p) => p.change));
    const manR = run(demoHomeowner, [
      { kind: 'adjustRepayment', delta: 500, frequency: 'fortnightly' },
      { kind: 'setKiwiSaverRate', rate: 0.06 },
    ]);
    expect(aiR.amortisation.blueprint.termYears).toBeCloseTo(manR.amortisation.blueprint.termYears, 6);
    expect(aiR.snapshot.kiwiSaverProjected).toBeCloseTo(manR.snapshot.kiwiSaverProjected, 4);
  });
});

describe('Iteration 2 supporting mechanics', () => {
  it('deposit tiers report the shortfall to unlock and the buffer remaining', () => {
    const r = run(demoFhb, []);
    const locked = r.fhb!.tiers.find((t) => !t.achievable);
    const open = r.fhb!.tiers.find((t) => t.achievable);
    if (locked) {
      expect(locked.additionalRequired).toBeGreaterThan(0);
      expect(locked.additionalRequired).toBeCloseTo(locked.depositRequired - r.fhb!.totalDeposit, 2);
    }
    if (open) expect(open.cashBufferRemaining).toBeGreaterThanOrEqual(0);
    // adding the shortfall as a gift unlocks the tier live
    if (locked) {
      const unlocked = run(demoFhb, [{ kind: 'setDepositSource', source: 'gift', value: locked.additionalRequired + 10 }]);
      const same = unlocked.fhb!.tiers.find((t) => Math.abs(t.depositPercent - locked.depositPercent) < 1e-9)!;
      expect(same.achievable).toBe(true);
    }
  });

  it('ownership costs include rates + insurance and are editable assumptions', () => {
    const r = run(demoFhb, []);
    expect(r.fhb!.ownershipCosts.ratesMonthly).toBe(ctx.ownership.ratesMonthly);
    expect(r.fhb!.ownershipCosts.insuranceMonthly).toBe(ctx.ownership.insuranceMonthly);
    expect(r.fhb!.ownershipCosts.totalMonthly).toBeCloseTo(
      r.fhb!.repaymentMonthly + ctx.ownership.ratesMonthly + ctx.ownership.insuranceMonthly,
      2,
    );
    const edited = run(demoFhb, [{ kind: 'setOwnershipCost', item: 'rates', monthly: 420 }]);
    expect(edited.fhb!.ownershipCosts.ratesMonthly).toBe(420);
  });

  it('cashback is a configurable example with a pro-rata clawback timeline', () => {
    const r = run(demoFhb, []);
    expect(r.fhb!.cashback.amount).toBe(ctx.cashback.amount);
    const mid = r.fhb!.cashback.clawbackTimeline.find((c) => c.month === 18)!;
    expect(mid.owed).toBeCloseTo((ctx.cashback.amount * (ctx.cashback.retentionMonths - 18)) / ctx.cashback.retentionMonths, 0);
    const after = r.fhb!.cashback.clawbackTimeline.find((c) => c.month === ctx.cashback.retentionMonths);
    if (after) expect(after.owed).toBe(0);
    const custom = run(demoFhb, [{ kind: 'setCashback', amount: 4_000, retentionMonths: 24 }]);
    expect(custom.fhb!.cashback.amount).toBe(4_000);
  });

  it('the stress-test rate is a configurable scenario assumption', () => {
    const base = run(demoFhb, []);
    const hotter = run(demoFhb, [{ kind: 'setStressRate', value: 0.08 }]);
    expect(hotter.effectiveStressRate).toBe(0.08);
    expect(hotter.servicing.maxNewLending).toBeLessThan(base.servicing.maxNewLending);
  });

  it('a low-equity margin override changes the effective rate and repayment', () => {
    const base = run(demoFhb, [{ kind: 'setDepositPercent', value: 0.1 }]);
    const overridden = run(demoFhb, [
      { kind: 'setDepositPercent', value: 0.1 },
      { kind: 'setLowEquityMargin', value: 0.012 },
    ]);
    expect(overridden.fhb!.lowEquityMargin).toBe(0.012);
    expect(overridden.fhb!.lowEquityMarginIsOverride).toBe(true);
    expect(overridden.fhb!.effectiveRate).toBeCloseTo(overridden.fhb!.baseRate + 0.012, 6);
    expect(overridden.fhb!.repaymentFortnightly).not.toBeCloseTo(base.fhb!.repaymentFortnightly, 0);
  });

  it('simple recalculation is fast (<100ms per computeAll)', () => {
    run(demoHomeowner, []); // warm
    const t0 = performance.now();
    const N = 10;
    for (let i = 0; i < N; i++) run(demoHomeowner, [{ kind: 'adjustRepayment', delta: 50 * (i + 1), frequency: 'weekly' }]);
    const per = (performance.now() - t0) / N;
    expect(per).toBeLessThan(100);
  });

  it('fixed commitments are itemised in the bank living costs and editable', () => {
    const base = run(demoFhb, []);
    // each fixed commitment appears as its own line (PDF feedback: break them down)
    for (const f of demoFhb.expenses.fixedCommitmentsMonthly) {
      expect(base.servicing.livingExpenses.items.some((i) => i.label === f.label && Math.abs(i.amount - f.amount) < 0.01)).toBe(true);
    }
    const edited = run(demoFhb, [{ kind: 'setFixedCommitment', label: 'Insurances', monthly: 650 }]);
    const item = edited.servicing.livingExpenses.items.find((i) => i.label === 'Insurances')!;
    expect(item.amount).toBe(650);
    expect(edited.servicing.umi).toBeCloseTo(base.servicing.umi + (980 - 650), 1);
  });

  it('editing a declared expense category flows through the declared totals', () => {
    const edited = applyScenario(demoFhb, [{ kind: 'setExpenseActual', category: 'Food & groceries', monthly: 1400 }]);
    expect(edited.client.expenses.declaredMonthly.find((d) => d.category === 'Food & groceries')!.amount).toBe(1400);
    expect(demoFhb.expenses.declaredMonthly.find((d) => d.category === 'Food & groceries')!.amount).toBe(100); // baseline untouched
  });

  it('amortise matches a closed-form check on a simple loan', () => {
    const res = amortise({ principal: 500_000, annualRate: 0.06, years: 30 });
    expect(res.scheduledPayment).toBeCloseTo(pmt(0.06 / 12, 360, 500_000), 6);
    expect(res.termYears).toBeCloseTo(30, 1);
    expect(res.paidOff).toBe(true);
  });
});
