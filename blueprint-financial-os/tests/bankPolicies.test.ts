// Bank servicing profiles extracted from the five uploaded bank calculators.
// The example inputs mirror the FHB scenario found in the workbooks (couple,
// $85k + $65k gross, 4 dependants, 1 vehicle, student loan, ~$649k proposed
// loan) — identities anonymised. Where a workbook's cached outputs were stale
// (saved without recalculation), plausibility bounds are asserted instead of
// exact values, per the adviser's "best judgement on the lending amount
// approved" instruction.
import { describe, expect, it } from 'vitest';
import type { Client } from '../lib/domain/types';
import { computeServicing, compareLenders } from '../lib/calculators/servicing';
import { ANZ_POLICY, ASB_POLICY, BNZ_POLICY, WESTPAC_POLICY, KIWIBANK_POLICY, NZ_BANK_POLICIES } from '../lib/rules/nzBankPolicies';
import { TAX_CURRENT } from '../lib/rules/taxTables';
import { netMonthlyFromSalary } from '../lib/calculators/tax';
import { pmt } from '../lib/calculators/finance';

const fhbExample = (over: Partial<Client> = {}): Client => ({
  id: 'calc-example',
  label: 'Calculator example couple',
  shortLabel: 'Example',
  clientType: 'fhb',
  narrative: '',
  household: { adults: 2, dependants: 4, vehicles: 1 },
  applicants: [
    {
      id: 'p1',
      displayName: 'Applicant 1',
      age: 35,
      employmentType: 'paye',
      incomes: [{ id: 'i1', kind: 'salary', label: 'Salary', grossAnnual: 85_000, kiwiSaverRate: 0.03, studentLoan: true }],
    },
    {
      id: 'p2',
      displayName: 'Applicant 2',
      age: 34,
      employmentType: 'paye',
      incomes: [{ id: 'i2', kind: 'salary', label: 'Salary', grossAnnual: 65_000, kiwiSaverRate: 0.03 }],
    },
  ],
  goals: [],
  expenses: {
    declaredMonthly: [],
    // BNZ example's declared non-benchmarkable items (rates, insurance,
    // childcare) — food/utilities/transport sit inside bank benchmarks.
    fixedCommitmentsMonthly: [
      { label: 'Insurances', amount: 205 },
      { label: 'Rates', amount: 300 },
      { label: 'Childcare & education', amount: 100 },
    ],
  },
  properties: [],
  mortgages: [],
  otherDebts: [],
  cashSavings: { value: 0, sourceType: 'demo-fixture' },
  kiwiSaverAccounts: [],
  insurancePolicies: [],
  financialEvents: [],
  retirement: { targetAge: 65, desiredAnnualIncome: 0 },
  modellingRate: 0.055,
  ...over,
});

describe('tax settings verified against the bank calculators', () => {
  it('ACC levy 1.75% capped at $156,641 (max levy $2,741.22)', () => {
    expect(TAX_CURRENT.accRate).toBe(0.0175);
    const high = netMonthlyFromSalary(200_000, 0, TAX_CURRENT);
    expect(high.accMonthly * 12).toBeCloseTo(2741.22, 1);
  });
  it('reproduces Westpac tax-conversion checkpoints (net of tax+ACC)', () => {
    // Westpac Workings G51/G52: gross 15,600 → net 13,689; 53,500 → 44,293.25
    const n1 = netMonthlyFromSalary(15_600, 0, TAX_CURRENT);
    expect(n1.netMonthly * 12).toBeCloseTo(13_689, 0);
    const n2 = netMonthlyFromSalary(53_500, 0, TAX_CURRENT);
    expect(n2.netMonthly * 12).toBeCloseTo(44_293.25, 0);
  });
});

describe('per-bank policy mechanics', () => {
  it('ANZ caps all-inclusive board at $450/wk and shades to 50%', () => {
    const res = computeServicing(fhbExample(), ANZ_POLICY, TAX_CURRENT, {
      boarderPerWeekOverride: 600, // above the cap
      boarderCount: 1,
    });
    const b = res.incomeLines.find((l) => l.kind === 'boarder')!;
    expect(b.recognisedMonthly).toBeCloseTo(450 * (52 / 12) * 0.5, 1);
  });

  it('BNZ caps boarders at $500/wk @80%; ASB/Westpac take 80% uncapped', () => {
    const at650 = (p: typeof BNZ_POLICY) =>
      computeServicing(fhbExample(), p, TAX_CURRENT, { boarderPerWeekOverride: 650, boarderCount: 1 })
        .incomeLines.find((l) => l.kind === 'boarder')!.recognisedMonthly;
    expect(at650(BNZ_POLICY)).toBeCloseTo(500 * (52 / 12) * 0.8, 1);
    expect(at650(WESTPAC_POLICY)).toBeCloseTo(650 * (52 / 12) * 0.8, 1);
  });

  it('credit-card factors: ANZ 4%, ASB 3%, BNZ/Westpac 3.8%, Kiwibank 5%', () => {
    const withCard = fhbExample({
      otherDebts: [{ id: 'cc', kind: 'credit-card', label: 'CC', limit: 10_000, balance: 0, rate: 0.2 }],
    });
    const cardCost = (p: typeof ANZ_POLICY) =>
      computeServicing(withCard, p, TAX_CURRENT).debtServicing.items.find((i) => i.label.includes('Credit card'))!.amount;
    expect(cardCost(ANZ_POLICY)).toBeCloseTo(400, 5);
    expect(cardCost(ASB_POLICY)).toBeCloseTo(300, 5);
    expect(cardCost(BNZ_POLICY)).toBeCloseTo(380, 5);
    expect(cardCost(WESTPAC_POLICY)).toBeCloseTo(380, 5);
    expect(cardCost(KIWIBANK_POLICY)).toBeCloseTo(500, 5);
  });

  it("ASB's benchmark scales with income (7% of GMI)", () => {
    const res = computeServicing(fhbExample(), ASB_POLICY, TAX_CURRENT);
    const base = res.livingExpenses.items[0];
    // couple $1,689 + 7% × ($150,000/12) = 1,689 + 875 = 2,564
    expect(base.amount).toBeCloseTo(1689 + (150_000 / 12) * 0.07, 0);
  });

  it('BNZ stress floor: a 8.5% loan tests at 8.5%, not 7.1%', () => {
    const withLoan = fhbExample({
      properties: [],
      mortgages: [
        {
          id: 'm', propertyId: 'x', lender: 'X', entity: 'personal', balance: 400_000, rate: 0.085,
          loanType: 'floating', interestOnly: false, termRemainingYears: 25,
          repayment: { amount: 0, frequency: 'monthly' },
        },
      ],
    });
    const res = computeServicing(withLoan, BNZ_POLICY, TAX_CURRENT);
    expect(res.stressedRepaymentMonthly).toBeCloseTo(pmt(0.085 / 12, 360, 400_000), 0);
  });

  it('Blueprint $500 surplus floor applied to every bank', () => {
    for (const p of NZ_BANK_POLICIES) {
      expect(p.minUMI.below).toBe(500);
      expect(p.minUMI.above).toBe(500);
      expect(p.requiresConfirmation).toBe(true);
      expect(p.brand?.color).toMatch(/^#/);
    }
  });
});

describe('the FHB calculator example across all five banks', () => {
  const client = fhbExample();
  const cmp = compareLenders(client, NZ_BANK_POLICIES, TAX_CURRENT);

  it('every bank produces a plausible capacity for $150k household, 4 dependants', () => {
    for (const r of cmp.results) {
      expect(r.maxNewLending).toBeGreaterThan(350_000);
      expect(r.maxNewLending).toBeLessThan(1_100_000);
    }
  });

  it('the $648,900 approved loan sits inside the range, with $500 surplus preserved at max', () => {
    // Calibration target ("best judgement based on the lending amount
    // approved"): the ANZ workbook proposes $648,900. With the adviser's
    // $500/mo surplus floor DEDUCTED (must remain at max lending), most banks
    // clear it and the tightest (BNZ: 7.1% floor + biggest GLEE benchmark)
    // sits just under — exactly the "which lender" conversation.
    const clearing = cmp.results.filter((r) => r.maxNewLending >= 648_900);
    expect(clearing.length).toBeGreaterThanOrEqual(3);
    expect(cmp.range.min).toBeGreaterThan(550_000);
    expect(cmp.range.max).toBeLessThan(1_000_000);
    // at max lending the $500 floor remains by construction
    const anz = cmp.results.find((r) => r.lender === 'ANZ')!;
    const repayAtMax = pmt(0.0695 / 12, 360, anz.maxNewLending);
    expect(anz.umi - repayAtMax).toBeCloseTo(500, 0);
  });

  it('BNZ (7.1% floor + big GLEE) sits below ASB (income-linked benchmark) for this family', () => {
    const by = Object.fromEntries(cmp.results.map((r) => [r.lender, r.maxNewLending]));
    expect(by['BNZ']).toBeLessThan(by['ASB']);
  });
});
