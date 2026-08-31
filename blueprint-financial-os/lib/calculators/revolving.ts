import type { AuditLine } from '../domain/types';
import { amortise } from './amortisation';

export interface RevolvingComparisonInput {
  /** the P&I loan the strategy targets */
  loanBalance: number;
  loanRate: number;
  loanTermYears: number;
  /** Option A: raise scheduled repayments by this much per month */
  extraRepaymentMonthly: number;
  /** Option B: revolving facility */
  facilityLimit: number;
  initialFacilityFunds: number; // cash parked in / against the facility from day 1
  monthlyTransfer: number; // surplus swept into the facility each month
  floatingRate: number;
  /** 0..1 — how reliably the household actually keeps the money there */
  disciplineAssumption: number;
}

export interface RevolvingComparisonResult {
  optionA: { label: string; termYears: number; totalInterest: number };
  optionB: { label: string; termYears: number; totalInterest: number; effectiveMonthlyReduction: number };
  interestDifference: number; // +ve = B saves more
  notes: string[];
  audit: AuditLine[];
}

/**
 * Honest comparison: a revolving facility only "saves" because cash sits
 * against debt and surplus actually stays there. We model Option B as the
 * initial funds acting as an offset plus the disciplined share of the monthly
 * transfer as an extra repayment.
 */
export function compareRevolvingStrategy(input: RevolvingComparisonInput): RevolvingComparisonResult {
  const optionARes = amortise({
    principal: input.loanBalance,
    annualRate: input.loanRate,
    years: input.loanTermYears,
    extraPerPeriod: input.extraRepaymentMonthly,
    frequency: 'monthly',
  });

  const disciplined = Math.max(0, Math.min(1, input.disciplineAssumption));
  const effectiveMonthlyReduction = input.monthlyTransfer * disciplined;
  const optionBRes = amortise({
    principal: input.loanBalance,
    annualRate: input.loanRate,
    years: input.loanTermYears,
    extraPerPeriod: effectiveMonthlyReduction,
    offsetBalance: input.initialFacilityFunds * disciplined,
    frequency: 'monthly',
  });

  const interestDifference = optionARes.totalInterest - optionBRes.totalInterest;

  return {
    optionA: {
      label: `Increase repayments by $${Math.round(input.extraRepaymentMonthly).toLocaleString()}/mo`,
      termYears: optionARes.termYears,
      totalInterest: optionARes.totalInterest,
    },
    optionB: {
      label: `$${Math.round(input.facilityLimit / 1000)}k revolving credit, $${Math.round(input.initialFacilityFunds / 1000)}k parked, $${Math.round(input.monthlyTransfer).toLocaleString()}/mo swept`,
      termYears: optionBRes.termYears,
      totalInterest: optionBRes.totalInterest,
      effectiveMonthlyReduction,
    },
    interestDifference,
    notes: [
      'A revolving facility does not automatically save money — the saving comes from cash balances actually sitting against the loan and surplus staying in the facility.',
      'Upside: funds stay accessible (emergencies, tax, lumpy income) without a scheduled-repayment lock-in.',
      'Downside: if the facility is redrawn for spending, the strategy goes backwards versus simply paying more principal.',
      `Modelled at ${Math.round(disciplined * 100)}% discipline — adviser-adjustable.`,
    ],
    audit: [
      { label: 'Option A — total interest', value: optionARes.totalInterest, format: 'currency' },
      { label: 'Option B — total interest', value: optionBRes.totalInterest, format: 'currency' },
      { label: 'Estimated interest difference (B vs A)', value: interestDifference, format: 'currency' },
      { label: 'Discipline assumption applied', value: disciplined, format: 'percent', note: 'The saving is behavioural, not a product feature.' },
    ],
  };
}
