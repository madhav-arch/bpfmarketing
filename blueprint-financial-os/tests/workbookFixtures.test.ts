// Regression fixtures reproduced from the source Blueprint Strategy Session
// workbooks. Expected values are the workbook's own computed cells.
//
// Where the engine deliberately diverges from the workbook, the divergence is
// asserted here with the workbook-era rule set and documented — never
// silently "corrected". Known unresolved divergence (see docs §6):
//   * The workbook's living-expense "Applicants" cell is an array formula
//     adding a small income-linked amount (~$24–47/mo) to the $1,850 couple
//     benchmark that could not be fully extracted. Engine uses the flat
//     benchmark, so UMI fixtures allow that tolerance.
import { describe, expect, it } from 'vitest';
import type { Client } from '../lib/domain/types';
import { BLUEPRINT_MODELLING_POLICY } from '../lib/rules/lenderPolicies';
import { TAX_WORKBOOK } from '../lib/rules/taxTables';
import { netMonthlyFromSalary, payeAnnual } from '../lib/calculators/tax';
import { computeServicing } from '../lib/calculators/servicing';
import { amortise } from '../lib/calculators/amortisation';
import { computeInvestment } from '../lib/calculators/investment';
import { MODELLING } from '../lib/rules/assumptions';
import { pmt } from '../lib/calculators/finance';

const baseClient = (over: Partial<Client>): Client => ({
  id: 'fixture',
  label: 'Fixture',
  shortLabel: 'Fixture',
  clientType: 'fhb',
  narrative: '',
  household: { adults: 2, dependants: 0, vehicles: 2 },
  applicants: [],
  goals: [],
  expenses: { declaredMonthly: [], fixedCommitmentsMonthly: [] },
  properties: [],
  mortgages: [],
  otherDebts: [],
  cashSavings: { value: 0, sourceType: 'demo-fixture' },
  kiwiSaverAccounts: [],
  insurancePolicies: [],
  financialEvents: [],
  retirement: { targetAge: 65, desiredAnnualIncome: 0 },
  modellingRate: 0.05,
  ...over,
});

describe('PAYE — workbook tax table', () => {
  it('matches workbook monthly tax for $73,000 (cell D61 = 1,250.83)', () => {
    expect(payeAnnual(73_000, TAX_WORKBOOK) / 12).toBeCloseTo(1250.8333, 2);
  });
  it('matches workbook monthly tax for $100,000 (cell D62 = 1,993.33)', () => {
    expect(payeAnnual(100_000, TAX_WORKBOOK) / 12).toBeCloseTo(1993.3333, 2);
  });
  it('matches workbook net monthly for $73,000 @ 3% KiwiSaver (cell C61 = 4,564.83)', () => {
    const n = netMonthlyFromSalary(73_000, 0.03, TAX_WORKBOOK);
    expect(n.netMonthly).toBeCloseTo(4564.8333, 2);
    expect(n.accMonthly).toBeCloseTo(85.1667, 2); // E61
  });
  it('matches workbook net monthly for $52,419 (Client B, cell C61 = 3,447.24)', () => {
    expect(netMonthlyFromSalary(52_419, 0.03, TAX_WORKBOOK).netMonthly).toBeCloseTo(3447.2387, 2);
  });
  it('matches workbook net monthly for $188,185 (Client B, cell C62 = 10,647.37)', () => {
    // ACC capped at $125k income → $145.83/mo (cell E62)
    const n = netMonthlyFromSalary(188_185, 0.03, TAX_WORKBOOK);
    expect(n.accMonthly).toBeCloseTo(145.8333, 2);
    expect(n.netMonthly).toBeCloseTo(10647.3667, 2);
  });
});

describe('Servicing Power — Client A (first-home buyers workbook)', () => {
  // Workbook inputs: incomes 73,000 + 100,000 @3% KiwiSaver, no OT lines,
  // 2 applicants, 2 vehicles, 0 dependants, fixed costs 1,310/mo, no debts.
  const clientA = baseClient({
    applicants: [
      { id: 'a1', displayName: 'A1', age: 30, employmentType: 'paye', incomes: [{ id: 'i1', kind: 'salary', label: 'Salary', grossAnnual: 73_000, kiwiSaverRate: 0.03 }] },
      { id: 'a2', displayName: 'A2', age: 30, employmentType: 'paye', incomes: [{ id: 'i2', kind: 'salary', label: 'Salary', grossAnnual: 100_000, kiwiSaverRate: 0.03 }] },
    ],
    expenses: {
      declaredMonthly: [],
      fixedCommitmentsMonthly: [
        { label: 'Insurances', amount: 980 },
        { label: 'Rates', amount: 300 },
        { label: 'Subscriptions', amount: 30 },
      ],
    },
  });

  const result = computeServicing(clientA, BLUEPRINT_MODELLING_POLICY, TAX_WORKBOOK);

  it('recognised income matches workbook C73 = 10,538.17', () => {
    expect(result.recognisedIncomeMonthly).toBeCloseTo(10538.1667, 2);
  });

  it('UMI within array-formula tolerance of workbook C92 = 6,854.66', () => {
    // Workbook living costs C81 = 3,683.51 (couple cell = 1,873.51 via the
    // un-extracted array formula); engine benchmark = 1,850 → 3,660 living.
    expect(result.livingExpenses.totalMonthly).toBe(1850 + 500 + 1310);
    expect(result.umi).toBeGreaterThan(6854.66 - 1); // engine slightly higher
    expect(Math.abs(result.umi - 6854.6616)).toBeLessThan(50);
  });

  it('max new lending within tolerance of workbook C93 = 1,030,307.51', () => {
    // Gate semantics: PV of full UMI at 7% / 30y once the floor is cleared.
    expect(Math.abs(result.maxNewLending - 1_030_307.51)).toBeLessThan(8_000);
  });

  it('exact max lending reproduces when the workbook UMI is fed through PV', () => {
    // Isolates the PV step from the living-cost divergence.
    const p = BLUEPRINT_MODELLING_POLICY;
    const exact = 6854.661583333334;
    const factor = (1 - Math.pow(1 + p.stressRate / 12, -360)) / (p.stressRate / 12);
    expect(exact * factor).toBeCloseTo(1_030_307.5117, 1);
  });

  it('boarder income scales at 75% × 4.33 (workbook), i.e. $250/wk → $812/mo', () => {
    const withBoarder = computeServicing(clientA, BLUEPRINT_MODELLING_POLICY, TAX_WORKBOOK, {
      boarderPerWeekOverride: 250,
      boarderCount: 1,
    });
    const boarderLine = withBoarder.incomeLines.find((l) => l.kind === 'boarder')!;
    // NOTE: the meeting narrative quotes 80% (≈$867) — the workbook computes
    // 75% × 4.33 = $811.88. Divergence documented; workbook value asserted.
    expect(boarderLine.recognisedMonthly).toBeCloseTo(250 * 4.33 * 0.75, 2);
  });
});

describe('Servicing Power — Client B (homeowner workbook)', () => {
  const clientB = baseClient({
    clientType: 'homeowner',
    household: { adults: 2, dependants: 2, vehicles: 2 },
    applicants: [
      { id: 'b1', displayName: 'B1', age: 48, employmentType: 'self-employed', incomes: [{ id: 'i1', kind: 'self-employed', label: 'Business', grossAnnual: 52_419, kiwiSaverRate: 0.03 }] },
      { id: 'b2', displayName: 'B2', age: 48, employmentType: 'self-employed', incomes: [{ id: 'i2', kind: 'self-employed', label: 'Business', grossAnnual: 188_185, kiwiSaverRate: 0.03 }] },
    ],
    expenses: {
      declaredMonthly: [],
      fixedCommitmentsMonthly: [
        { label: 'Insurances', amount: 1_257 },
        { label: 'Rates', amount: 400 },
        { label: 'Childcare & education', amount: 100 },
        { label: 'Subscriptions', amount: 60 },
      ],
    },
    properties: [
      {
        id: 'p1',
        nickname: 'Home',
        use: 'owner-occupied',
        entity: 'trust',
        valuations: [{ id: 'v1', value: 1_470_000, sourceType: 'bank-internal-valuation' }],
        activeValuationId: 'v1',
      },
    ],
    mortgages: [
      {
        id: 'm1', propertyId: 'p1', lender: 'L', entity: 'trust', balance: 976_706, rate: 0.0489,
        loanType: 'fixed', interestOnly: false, termRemainingYears: 26,
        repayment: { amount: 2_848, frequency: 'fortnightly' },
      },
    ],
    otherDebts: [{ id: 'cc', kind: 'credit-card', label: 'CC', limit: 10_000, balance: 1_600, rate: 0.129 }],
  });

  const result = computeServicing(clientB, BLUEPRINT_MODELLING_POLICY, TAX_WORKBOOK);

  it('recognised income matches workbook C73 = 14,094.61', () => {
    expect(result.recognisedIncomeMonthly).toBeCloseTo(14094.6053, 2);
  });

  it('stressed mortgage repayment matches workbook C85 = 6,498.05 (7% / 30y on $976,706)', () => {
    expect(result.stressedRepaymentMonthly).toBeCloseTo(6498.0494, 2);
  });

  it('credit card treated as 3% of limit = $300/mo (workbook C86)', () => {
    const cc = result.debtServicing.items.find((i) => i.label.includes('Credit card'))!;
    expect(cc.amount).toBeCloseTo(300, 5);
  });

  it('living costs within array-formula tolerance of workbook C81 = 5,013.71', () => {
    // engine: 1,850 + 500 + 800 + 1,817 = 4,967 (couple-cell divergence ≤ $50)
    expect(Math.abs(result.livingExpenses.totalMonthly - 5013.7114)).toBeLessThan(50);
  });

  it('UMI within tolerance of workbook C92 = 2,282.84', () => {
    expect(Math.abs(result.umi - 2282.8446)).toBeLessThan(50);
  });

  it('max new lending within tolerance of workbook C93 = 343,128.81', () => {
    expect(Math.abs(result.maxNewLending - 343_128.81)).toBeLessThan(8_000);
  });

  it('DTI cap: workbook C95 = gross incomes × 6 = 1,443,624', () => {
    expect(result.grossAnnualIncomeForDti * 6).toBeCloseTo(1_443_624, 0);
    // NOTE: the workbook's "TDTI Ratio" cell computes debt-servicing/income×10
    // (= 4.82 for Client B) which is not a debt-to-income ratio. The engine
    // implements standard DTI = total debt / gross income:
    expect(result.dti).toBeCloseTo(978_306 / 240_604, 3);
  });
});

describe('Amortisation table — workbook parity', () => {
  it('reproduces the workbook schedule for $1,062,500 @ 5.35% / 30y', () => {
    const res = amortise({ principal: 1_062_500, annualRate: 0.0535, years: 30, frequency: 'monthly' });
    expect(res.scheduledPayment).toBeCloseTo(5933.1455, 2); // F18
    expect(res.points[0].interest).toBeCloseTo(4736.9792, 2); // H18
    expect(res.points[0].balance).toBeCloseTo(1_061_303.8337, 1); // J18
    expect(res.termPeriods).toBe(360);
    expect(res.totalInterest).toBeCloseTo(1_073_432.38, 0); // J11
  });

  it('extra repayments shorten the term and cut interest', () => {
    const base = amortise({ principal: 1_062_500, annualRate: 0.0535, years: 30 });
    const extra = amortise({ principal: 1_062_500, annualRate: 0.0535, years: 30, extraPerPeriod: 1_083 }); // ≈ $500/fn
    expect(extra.termYears).toBeLessThan(base.termYears - 5);
    expect(base.totalInterest - extra.totalInterest).toBeGreaterThan(300_000);
  });
});

describe('Investment Property Calculator — workbook parity', () => {
  it('reproduces the workbook example ($600k, IO 4.99%, $800/wk rent)', () => {
    // Workbook has no vacancy/maintenance lines — zeroed for parity.
    const res = computeInvestment(
      {
        purchasePrice: 600_000,
        depositCash: 0,
        depositEquity: 0,
        rate: 0.0499,
        termYears: 30,
        interestOnly: true,
        rentPerWeek: 800,
        ratesPerYear: 2_500,
        insurancePerYear: 1_200,
        propertyMgmtRate: 0.08,
        maintenanceRate: 0,
        vacancyWeeks: 0,
      },
      BLUEPRINT_MODELLING_POLICY,
      MODELLING,
    );
    expect(res.mortgageWeekly).toBeCloseTo(575.7692, 2); // C12
    expect(res.grossYield).toBeCloseTo(0.069333, 4); // C28
    expect(res.weeklyCashflow).toBeCloseTo(89.0769, 2); // C30
    expect(res.annualCashflow).toBeCloseTo(4_632, 0); // C33
  });

  it('P&I weekly repayment matches Excel PMT', () => {
    expect(pmt(0.0499 / 52, 30 * 52, 600_000)).toBeCloseTo(741.91, 1);
  });
});
