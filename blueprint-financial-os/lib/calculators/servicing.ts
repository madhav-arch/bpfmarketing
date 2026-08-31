import type { AuditLine, Client } from '../domain/types';
import type { LenderPolicy, TaxTable } from '../rules/types';
import { netMonthlyFromSalary } from './tax';
import { pmt, pv } from './finance';

export interface RecognisedIncomeLine {
  id: string;
  label: string;
  kind: 'salary' | 'overtime-commission' | 'self-employed' | 'other' | 'rental' | 'boarder';
  actualMonthly: number; // net where applicable, gross for rent/board actuals
  recognisedMonthly: number;
  scaling: number; // 1 = unscaled
  why: string;
}

export interface ServicingResult {
  policyId: string;
  lender: string;
  incomeLines: RecognisedIncomeLine[];
  recognisedIncomeMonthly: number;
  livingExpenses: {
    items: { label: string; amount: number; note?: string }[];
    totalMonthly: number;
  };
  debtServicing: {
    items: { label: string; amount: number; note?: string }[];
    totalMonthly: number;
  };
  umi: number;
  minUMIRequired: number;
  maxNewLending: number;
  stressedRepaymentMonthly: number; // on existing mortgage debt
  dti: number;
  dtiCapTotalDebt: number;
  grossAnnualIncomeForDti: number;
  audit: AuditLine[];
}

export interface ServicingOptions {
  /** additional lending being tested (for stressed-repayment displays) */
  proposedLoan?: number;
  /** monthly delta applied to living costs (scenario buffers, childcare, …) */
  livingCostDeltaMonthly?: number;
  /** override boarder income per week (scenario) */
  boarderPerWeekOverride?: number;
  boarderCount?: number;
  /** extra recognised self-employed net annual income (e.g. side business) */
  extraNetAnnualIncome?: { label: string; amount: number }[];
  /** exclude credit cards (modelling "close the cards") */
  excludeCreditCards?: boolean;
  rentPerWeekOverrides?: Record<string, number>;
  salaryMultiplier?: number;
}

export function computeServicing(
  client: Client,
  policy: LenderPolicy,
  tax: TaxTable,
  opts: ServicingOptions = {},
): ServicingResult {
  const lines: RecognisedIncomeLine[] = [];
  const salaryMult = opts.salaryMultiplier ?? 1;

  for (const app of client.applicants) {
    for (const inc of app.incomes) {
      const gross = inc.grossAnnual * salaryMult;
      const net = netMonthlyFromSalary(gross, inc.kiwiSaverRate, tax, inc.studentLoan);
      if (inc.kind === 'overtime-commission') {
        lines.push({
          id: inc.id,
          label: `${app.displayName} — ${inc.label}`,
          kind: inc.kind,
          actualMonthly: net.netMonthly,
          recognisedMonthly: net.netMonthly * policy.otScaling,
          scaling: policy.otScaling,
          why: `Overtime & commission is scaled to ${Math.round(policy.otScaling * 100)}% — lenders want two years of consistency before relying on it.`,
        });
      } else {
        lines.push({
          id: inc.id,
          label: `${app.displayName} — ${inc.label}`,
          kind: inc.kind === 'salary' || inc.kind === 'self-employed' ? inc.kind : 'other',
          actualMonthly: net.netMonthly,
          recognisedMonthly: net.netMonthly,
          scaling: 1,
          why:
            inc.kind === 'self-employed'
              ? 'Self-employed income is taken at the filed taxable figure — a filed loss would be deducted from personal income.'
              : 'Base pay is recognised in full (net of tax, ACC and KiwiSaver).',
        });
      }
    }
  }

  for (const extra of opts.extraNetAnnualIncome ?? []) {
    lines.push({
      id: `extra-${extra.label}`,
      label: extra.label,
      kind: 'self-employed',
      actualMonthly: extra.amount / 12,
      recognisedMonthly: extra.amount / 12,
      scaling: 1,
      why: 'Additional net income line added in this scenario.',
    });
  }

  // Rental income
  for (const p of client.properties) {
    const rentWk =
      opts.rentPerWeekOverrides?.[p.id] ?? (p.use === 'investment' ? p.rentPerWeek?.value : undefined);
    if (rentWk && rentWk > 0) {
      const actualMonthly = (rentWk * 52) / 12;
      const recognised = rentWk * policy.weeklyToMonthly * policy.rentalScaling;
      lines.push({
        id: `rent-${p.id}`,
        label: `Rent — ${p.nickname}`,
        kind: 'rental',
        actualMonthly,
        recognisedMonthly: recognised,
        scaling: policy.rentalScaling,
        why: `Rental income is scaled to ${Math.round(policy.rentalScaling * 100)}% to allow for vacancy, rates, insurance and upkeep.`,
      });
    }
  }

  // Boarder income
  const boarderWk = opts.boarderPerWeekOverride ?? client.boarderIncomePerWeek ?? 0;
  const boarderCount = Math.min(opts.boarderCount ?? (boarderWk > 0 ? 1 : 0), policy.boarderScaling.maxBoarders);
  if (boarderWk > 0 && boarderCount > 0) {
    const cap = policy.boarderScaling.maxPerBoarderWeekly;
    const recognisedPerBoarderWk = cap ? Math.min(boarderWk, cap) : boarderWk;
    const actualMonthly = (boarderWk * boarderCount * 52) / 12;
    const recognised = recognisedPerBoarderWk * boarderCount * policy.weeklyToMonthly * policy.boarderScaling.percent;
    lines.push({
      id: 'boarder',
      label: boarderCount > 1 ? `Boarders × ${boarderCount}` : 'Boarder income',
      kind: 'boarder',
      actualMonthly,
      recognisedMonthly: recognised,
      scaling: policy.boarderScaling.percent,
      why: `Boarder income is scaled to ${Math.round(policy.boarderScaling.percent * 100)}%${cap ? `, capped at $${cap}/wk per boarder` : ''} — the lender allows for the cost of hosting. Max ${policy.boarderScaling.maxBoarders} boarder(s) recognised.`,
    });
  }

  const recognisedIncomeMonthly = lines.reduce((s, l) => s + l.recognisedMonthly, 0);

  // Living expenses
  const bench = policy.expenseBenchmark;
  let base = client.household.adults === 2 ? bench.couple : bench.single;
  const grossMonthlyHousehold =
    client.applicants.reduce((s, a) => s + a.incomes.reduce((t, i) => t + i.grossAnnual * salaryMult, 0), 0) / 12;
  let incomeLinkedNote: string | undefined;
  if (bench.incomeLinkedRate) {
    const uplift = grossMonthlyHousehold * bench.incomeLinkedRate;
    base += uplift;
    incomeLinkedNote = ` incl. ${(bench.incomeLinkedRate * 100).toFixed(0)}% of gross monthly income ($${Math.round(uplift).toLocaleString()}) — this lender's benchmark scales with earnings.`;
  }
  const fixed = client.expenses.fixedCommitmentsMonthly.reduce((s, i) => s + i.amount, 0);
  const livingItems = [
    {
      label: client.household.adults === 2 ? 'Household baseline (couple)' : 'Household baseline (single)',
      amount: base,
      note:
        'What the lender assumes it costs the household to live, breathe and eat at a minimum — no discretionary spending.' +
        (incomeLinkedNote ?? ''),
    },
    {
      label: `Vehicles × ${client.household.vehicles}`,
      amount: bench.perVehicle * client.household.vehicles,
      note: `$${bench.perVehicle}/month per vehicle for WOF, rego, tyres and running costs.`,
    },
  ];
  if (client.household.dependants > 0) {
    livingItems.push({
      label: `Dependants × ${client.household.dependants}`,
      amount: bench.perDependant * client.household.dependants,
      note: `$${bench.perDependant}/month per dependant for essentials.`,
    });
  }
  livingItems.push({
    label: 'Fixed commitments (from statements)',
    amount: fixed,
    note: 'Insurances, rates, childcare, subscriptions — the direct debits the lender finds in your statements.',
  });
  if (opts.livingCostDeltaMonthly) {
    livingItems.push({
      label: 'Scenario adjustment to living costs',
      amount: opts.livingCostDeltaMonthly,
      note: 'Applied by the current scenario.',
    });
  }
  const livingTotal = livingItems.reduce((s, i) => s + i.amount, 0);

  // Debt servicing at stress. Every bank tests at max(actual rate, test
  // rate/floor) — the floor binds at current pricing, but a high-rate loan
  // tests at its own rate.
  const debtItems: { label: string; amount: number; note?: string }[] = [];
  const mortgageDebt = client.mortgages.reduce((s, m) => s + m.balance, 0);
  const stressMonthlyRate = policy.stressRate / 12;
  const stressPeriods = policy.maxTermYears * 12;
  const stressedRepaymentMonthly = client.mortgages.reduce(
    (s, m) => s + pmt(Math.max(policy.stressRate, m.rate) / 12, stressPeriods, m.balance),
    0,
  );
  if (mortgageDebt > 0) {
    debtItems.push({
      label: 'Existing mortgages (stress-tested)',
      amount: stressedRepaymentMonthly,
      note: `Repayment on $${Math.round(mortgageDebt).toLocaleString()} at ${(policy.stressRate * 100).toFixed(2)}%${policy.stressRateIsFloor ? ' (floor — actual rate if higher)' : ''} over ${policy.maxTermYears} years — the rate the lender tests, not the rate you pay.`,
    });
  }
  let cardLimits = 0;
  for (const d of client.otherDebts) {
    if (d.kind === 'credit-card' || d.kind === 'store-card') {
      if (!opts.excludeCreditCards) {
        cardLimits += d.limit;
      }
    } else {
      const p = pmt(policy.otherFinance.rate / 12, policy.otherFinance.termYears * 12, d.balance);
      if (p > 0)
        debtItems.push({
          label: d.label,
          amount: p,
          note: `Tested at ${(policy.otherFinance.rate * 100).toFixed(0)}% over ${policy.otherFinance.termYears} years.`,
        });
    }
  }
  if (cardLimits > 0) {
    debtItems.push({
      label: 'Credit card limits',
      amount: cardLimits * policy.creditCardMonthlyFactor,
      note: `${(policy.creditCardMonthlyFactor * 100).toFixed(0)}% of the combined $${cardLimits.toLocaleString()} limit per month — the lender doesn't care that the balance is low; reduce or close limits to free this up.`,
    });
  }
  const debtTotal = debtItems.reduce((s, i) => s + i.amount, 0);

  const umi = recognisedIncomeMonthly - livingTotal - debtTotal;
  const minUMIRequired = mortgageDebt > policy.minUMI.threshold ? policy.minUMI.above : policy.minUMI.below;
  // Two floor semantics:
  //  - deduction (bank policies, adviser's $500 rule): the floor must REMAIN
  //    at max lending → capacity = PV(UMI − floor)
  //  - gate (Blueprint workbook parity): clear the floor → capacity = PV(UMI)
  const maxNewLending = policy.umiFloorIsDeduction
    ? Math.max(0, pv(stressMonthlyRate, stressPeriods, umi - minUMIRequired))
    : umi > minUMIRequired
      ? pv(stressMonthlyRate, stressPeriods, umi)
      : 0;

  // DTI
  const grossAnnualIncomeForDti =
    client.applicants.reduce((s, a) => s + a.incomes.reduce((t, i) => t + i.grossAnnual * salaryMult, 0), 0) +
    lines.filter((l) => l.kind === 'rental' || l.kind === 'boarder').reduce((s, l) => s + l.recognisedMonthly * 12, 0) +
    (opts.extraNetAnnualIncome ?? []).reduce((s, e) => s + e.amount, 0);
  const totalDebt = mortgageDebt + client.otherDebts.reduce((s, d) => s + d.balance, 0);
  const dti = grossAnnualIncomeForDti > 0 ? totalDebt / grossAnnualIncomeForDti : 0;
  const dtiCapTotalDebt = grossAnnualIncomeForDti * policy.dtiMultiple;

  const audit: AuditLine[] = [
    { label: 'Recognised income / month', value: recognisedIncomeMonthly, format: 'currency' },
    { label: 'Living expenses (benchmark + commitments)', value: -livingTotal, format: 'currency' },
    { label: 'Debt servicing at stress rate', value: -debtTotal, format: 'currency' },
    { label: 'Uncommitted monthly income (UMI)', value: umi, format: 'currency' },
    {
      label: `Minimum UMI gate (must exceed $${minUMIRequired}/mo)`,
      format: 'text',
      note: umi > minUMIRequired ? 'Cleared' : 'NOT cleared — no new lending supported',
    },
    {
      label: `Max new lending = PV(${(policy.stressRate * 100).toFixed(2)}%/12, ${policy.maxTermYears}y, UMI)`,
      value: maxNewLending,
      format: 'currency',
    },
  ];

  return {
    policyId: policy.id,
    lender: policy.lender,
    incomeLines: lines,
    recognisedIncomeMonthly,
    livingExpenses: { items: livingItems, totalMonthly: livingTotal },
    debtServicing: { items: debtItems, totalMonthly: debtTotal },
    umi,
    minUMIRequired,
    maxNewLending,
    stressedRepaymentMonthly,
    dti,
    dtiCapTotalDebt,
    grossAnnualIncomeForDti,
    audit,
  };
}

export interface LenderComparison {
  results: ServicingResult[];
  range: { min: number; max: number };
  differences: { lender: string; drivers: string[] }[];
}

export function compareLenders(
  client: Client,
  policies: LenderPolicy[],
  tax: TaxTable,
  opts: ServicingOptions = {},
): LenderComparison {
  const results = policies.map((p) => computeServicing(client, p, tax, opts));
  const capacities = results.map((r) => r.maxNewLending);
  const base = policies[0];
  const differences = policies.map((p) => {
    const drivers: string[] = [];
    if (p.expenseBenchmark.couple !== base.expenseBenchmark.couple)
      drivers.push(
        `Expense benchmark $${p.expenseBenchmark.couple.toLocaleString()}/mo vs $${base.expenseBenchmark.couple.toLocaleString()}`,
      );
    if (p.stressRate !== base.stressRate)
      drivers.push(`Stress rate ${(p.stressRate * 100).toFixed(2)}% vs ${(base.stressRate * 100).toFixed(2)}%`);
    if (p.boarderScaling.percent !== base.boarderScaling.percent)
      drivers.push(`Boarder income at ${p.boarderScaling.percent * 100}% vs ${base.boarderScaling.percent * 100}%`);
    if (p.rentalScaling !== base.rentalScaling)
      drivers.push(`Rental income at ${p.rentalScaling * 100}% vs ${base.rentalScaling * 100}%`);
    if (p.creditCardMonthlyFactor !== base.creditCardMonthlyFactor)
      drivers.push(
        `Credit-card limits at ${(p.creditCardMonthlyFactor * 100).toFixed(1)}%/mo vs ${(base.creditCardMonthlyFactor * 100).toFixed(1)}%`,
      );
    if (p.expenseBenchmark.incomeLinkedRate)
      drivers.push(`Benchmark scales with income (+${(p.expenseBenchmark.incomeLinkedRate * 100).toFixed(0)}% of gross)`);
    if (p.boarderScaling.maxPerBoarderWeekly)
      drivers.push(`Boarder income capped at $${p.boarderScaling.maxPerBoarderWeekly}/wk`);
    if (p.stressRateIsFloor) drivers.push(`Test rate is a floor — actual rate if higher`);
    return { lender: p.lender, drivers };
  });
  return {
    results,
    range: { min: Math.min(...capacities), max: Math.max(...capacities) },
    differences,
  };
}

/** The workbook's rent-sensitivity grid: extra rent/week → UMI → max lending. */
export function rentSensitivity(
  baseUmi: number,
  policy: LenderPolicy,
  steps = 10,
  stepSize = 150,
): { rentPerWeek: number; umi: number; maxLending: number }[] {
  const out = [] as { rentPerWeek: number; umi: number; maxLending: number }[];
  for (let i = 0; i <= steps; i++) {
    const rent = i * stepSize;
    const umi = baseUmi + rent * policy.weeklyToMonthly * policy.rentalScaling;
    out.push({
      rentPerWeek: rent,
      umi,
      maxLending: umi > policy.minUMI.below ? pv(policy.stressRate / 12, policy.maxTermYears * 12, umi) : 0,
    });
  }
  return out;
}
