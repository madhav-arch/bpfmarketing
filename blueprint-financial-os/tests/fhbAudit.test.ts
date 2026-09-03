// Tests for the FHB audit changes (adviser calibration 3 Sep 2026):
// $10k capacity rounding, the proposed-loan amortisation fix, extra-borrower
// benchmark scaling, the new goal/upfront-cost scenario changes, manual
// intake entry and the simplified email summary.
import { describe, expect, it } from 'vitest';
import { demoFhb } from '../lib/data/demoClients';
import { applyScenario } from '../lib/scenarios/apply';
import { computeAll } from '../lib/scenarios/compute';
import { DEFAULT_RULE_CONTEXT } from '../lib/rules/context';
import { moneyTenK, moneyTenKShort } from '../lib/format';
import { buildShortEmail, buildMeetingSummary } from '../lib/summary/meetingSummary';
import { buildClientFromIntake, type IntakeForm } from '../lib/intake/buildClient';
import { TAX_CURRENT } from '../lib/rules/taxTables';
import type { FeedSnapshot } from '../lib/data-sources/types';
import type { Client } from '../lib/domain/types';

const ctx = DEFAULT_RULE_CONTEXT;

describe('$10k rounding', () => {
  it('moneyTenK rounds to the nearest $10,000', () => {
    expect(moneyTenK(644_990)).toBe('$640,000');
    expect(moneyTenK(645_000)).toBe('$650,000');
    expect(moneyTenK(4_999)).toBe('$0');
    expect(moneyTenKShort(712_400)).toBe('$710k');
  });

  it('FHB bank max loan is a clean $10k figure', () => {
    const res = computeAll(applyScenario(demoFhb, []), ctx);
    expect(res.fhb!.comfortable.bankMaxLoan % 10_000).toBe(0);
    expect(res.fhb!.comfortable.bankMaxLoan).toBeGreaterThan(0);
  });
});

describe('FHB proposed-loan amortisation (mortgage-free ≠ this year)', () => {
  it('amortises the proposed purchase loan, not an empty book', () => {
    const res = computeAll(applyScenario(demoFhb, []), ctx);
    const currentYear = new Date().getFullYear();
    expect(res.amortisation.blueprint.schedule.length).toBeGreaterThan(0);
    expect(res.amortisation.blueprint.payoffYear).toBeGreaterThan(currentYear + 10);
    // the "2026 mortgage-free" bug: the snapshot must never claim payoff this year
    expect(res.snapshot.mortgageFreeYear).toBe(res.amortisation.blueprint.payoffYear);
    expect(res.snapshot.mortgageFreeYear!).toBeGreaterThan(currentYear + 10);
  });
});

describe('additional borrowers scale the living-cost benchmark', () => {
  it('a third borrower adds a single-applicant allowance', () => {
    const two = computeAll(applyScenario(demoFhb, []), ctx);
    const three = computeAll(
      applyScenario({ ...demoFhb, household: { ...demoFhb.household, adults: 3 } } as Client, []),
      ctx,
    );
    expect(three.servicing.livingExpenses.totalMonthly).toBeGreaterThan(two.servicing.livingExpenses.totalMonthly + 500);
    expect(three.servicing.livingExpenses.items[0].label).toContain('3 borrowers');
    // more assumed living cost → less capacity
    expect(three.servicing.maxNewLending).toBeLessThan(two.servicing.maxNewLending);
  });
});

describe('goal and upfront-cost scenario changes', () => {
  it('addGoal / updateGoal / removeGoal round-trip without touching the baseline', () => {
    const before = JSON.stringify(demoFhb);
    let state = applyScenario(demoFhb, [{ kind: 'addGoal', label: 'Keep a $5k buffer' }]);
    const added = state.client.goals.find((g) => g.label === 'Keep a $5k buffer');
    expect(added).toBeTruthy();
    state = applyScenario(demoFhb, [
      { kind: 'addGoal', label: 'Keep a $5k buffer' },
      { kind: 'updateGoal', goalId: added!.id, label: 'Keep a $10k buffer' },
    ]);
    expect(state.client.goals.some((g) => g.label === 'Keep a $10k buffer')).toBe(true);
    state = applyScenario(demoFhb, [
      { kind: 'addGoal', label: 'Keep a $5k buffer' },
      { kind: 'removeGoal', goalId: added!.id },
    ]);
    expect(state.client.goals.length).toBe(demoFhb.goals.length);
    expect(JSON.stringify(demoFhb)).toBe(before);
  });

  it('setUpfrontCost flows into the FHB cost stack', () => {
    const base = computeAll(applyScenario(demoFhb, []), ctx);
    const alt = computeAll(applyScenario(demoFhb, [{ kind: 'setUpfrontCost', key: 'lawyer', amount: 3200 }]), ctx);
    const lawyer = alt.fhb!.upfrontCosts.items.find((i) => i.key === 'lawyer');
    expect(lawyer?.amount).toBe(3200);
    expect(alt.fhb!.upfrontCosts.total).toBeCloseTo(base.fhb!.upfrontCosts.total + 700, 0);
  });
});

describe('manual intake entry', () => {
  const emptyFeed: FeedSnapshot = {
    provider: 'demo',
    providerLabel: 'No connection',
    syncedAt: new Date().toISOString(),
    accounts: [],
    transactions: [],
  } as unknown as FeedSnapshot;

  it('manual gross salaries + KiwiSaver dropdown rate build a servicable client with 3 borrowers', () => {
    const form: IntakeForm = {
      label: 'Manual test',
      clientType: 'fhb',
      applicantNames: ['A', 'B', 'C'],
      dependants: 0,
      vehicles: 1,
      ages: [30, 31, 29],
      creditCardLimits: 0,
      properties: [],
      kiwiSaverTotal: 40_000,
      savingsForDeposit: 30_000,
      targetPrice: 750_000,
      kiwiSaverRate: 0.06,
      manualGrossAnnual: [90_000, 80_000, 70_000],
    };
    const { client } = buildClientFromIntake(form, emptyFeed, TAX_CURRENT);
    expect(client.household.adults).toBe(3);
    expect(client.applicants).toHaveLength(3);
    for (const [i, gross] of [90_000, 80_000, 70_000].entries()) {
      expect(client.applicants[i].incomes[0].grossAnnual).toBe(gross);
      expect(client.applicants[i].incomes[0].kiwiSaverRate).toBe(0.06);
      expect(client.applicants[i].incomes[0].label).toContain('manual');
    }
    const res = computeAll(applyScenario(client, []), ctx);
    expect(res.servicing.maxNewLending).toBeGreaterThan(0);
  });
});

describe('simplified email summary', () => {
  it('is short, carries the $10k-rounded capacity, and stays indicative', () => {
    const result = computeAll(applyScenario(demoFhb, []), ctx);
    const input = {
      client: demoFhb,
      scenarioName: 'Meeting scenario',
      changes: [],
      baseline: result,
      selected: result,
      diffs: [],
      rationale: { benefits: [], risks: [], considerations: [] },
    };
    const short = buildShortEmail(input);
    const full = buildMeetingSummary(input);
    expect(short.length).toBeLessThan(full.length / 2);
    expect(short).toContain('rounded to the nearest $10,000');
    expect(short).toContain('not a loan offer');
    expect(short).toMatch(/\$\d{1,3}(,\d{3})*0,000/); // a $10k-rounded figure appears
  });
});
