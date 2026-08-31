import type { CalculationResult } from './compute';

export interface ChangeExplanation {
  label: string;
  before: number;
  after: number;
  delta: number;
  format: 'currency' | 'percent' | 'year' | 'months';
  goodWhen: 'up' | 'down' | 'neutral';
  priority: number; // lower = more important
  why?: string;
}

/** Top deltas between two calculation results — powers "What changed?". */
export function explainChange(base: CalculationResult, next: CalculationResult): ChangeExplanation[] {
  const out: ChangeExplanation[] = [];
  const push = (
    label: string,
    before: number,
    after: number,
    format: ChangeExplanation['format'],
    goodWhen: ChangeExplanation['goodWhen'],
    priority: number,
    threshold: number,
    why?: string,
  ) => {
    const delta = after - before;
    if (Math.abs(delta) >= threshold) out.push({ label, before, after, delta, format, goodWhen, priority, why });
  };

  push(
    'Mortgage-free date',
    base.amortisation.blueprint.termYears,
    next.amortisation.blueprint.termYears,
    'year',
    'down',
    1,
    0.15,
    'Extra principal shortens the loan; every dollar above the minimum goes straight onto the balance.',
  );
  push(
    'Lifetime interest',
    base.amortisation.blueprint.totalInterest,
    next.amortisation.blueprint.totalInterest,
    'currency',
    'down',
    2,
    500,
    'Interest accrues on the outstanding balance — a smaller balance for longer means less interest overall.',
  );
  push(
    'Monthly surplus',
    base.snapshot.monthlySurplus,
    next.snapshot.monthlySurplus,
    'currency',
    'up',
    3,
    50,
    'Actual money left each month after spending and repayments.',
  );
  push(
    'Borrowing capacity (Blueprint model)',
    base.servicing.maxNewLending,
    next.servicing.maxNewLending,
    'currency',
    'up',
    4,
    5000,
    'Driven by uncommitted monthly income under the lender stress test.',
  );
  push(
    'Uncommitted monthly income',
    base.snapshot.umi,
    next.snapshot.umi,
    'currency',
    'up',
    5,
    25,
    'Recognised income minus benchmark living costs and stressed debt servicing.',
  );
  push(
    'Retirement income gap',
    base.retirement.gap,
    next.retirement.gap,
    'currency',
    'up',
    6,
    500,
    'Projected annual retirement income versus the stated goal.',
  );
  push('Net worth (today)', base.snapshot.netWorth, next.snapshot.netWorth, 'currency', 'up', 7, 1000);
  push(
    'Projected KiwiSaver at retirement',
    base.snapshot.kiwiSaverProjected,
    next.snapshot.kiwiSaverProjected,
    'currency',
    'up',
    8,
    1000,
  );
  push('Usable equity', base.snapshot.usableEquity, next.snapshot.usableEquity, 'currency', 'up', 9, 1000);
  if (base.fhb && next.fhb) {
    push(
      'Repayment (selected purchase, monthly)',
      base.fhb.repaymentMonthly,
      next.fhb.repaymentMonthly,
      'currency',
      'down',
      2,
      20,
      'Loan size × effective rate (including any low-equity margin).',
    );
    push(
      'Effective interest rate',
      base.fhb.effectiveRate,
      next.fhb.effectiveRate,
      'percent',
      'down',
      3,
      0.0005,
      'Base rate plus low-equity margin for the LVR band.',
    );
  }

  return out.sort((a, b) => a.priority - b.priority || Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6);
}
