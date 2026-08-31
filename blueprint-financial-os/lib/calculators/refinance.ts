import type { AuditLine, MortgageFacility } from '../domain/types';
import type { LenderPolicy, ModellingAssumptions } from '../rules/types';

export interface BreakFeeEstimate {
  loanId: string;
  balance: number;
  contractRate: number;
  marketRate: number;
  daysToExpiry: number;
  estimate: number;
}

/**
 * Rough proxy used in the source workbook:
 * (contract − market) × balance × days/365, floored at 0.
 * Banks actually price break costs off wholesale rates — always confirm.
 */
export function breakFeeEstimate(
  loan: MortgageFacility,
  currentMarketRate: number,
  today: Date,
): BreakFeeEstimate {
  const days =
    loan.loanType === 'fixed' && loan.fixedExpiry
      ? Math.max(0, Math.round((new Date(loan.fixedExpiry).getTime() - today.getTime()) / 86_400_000))
      : 0;
  const diff = Math.max(0, loan.rate - currentMarketRate);
  return {
    loanId: loan.id,
    balance: loan.balance,
    contractRate: loan.rate,
    marketRate: currentMarketRate,
    daysToExpiry: days,
    estimate: diff * loan.balance * (days / 365),
  };
}

export interface RefinanceComparison {
  totalBalance: number;
  breakFees: BreakFeeEstimate[];
  totalBreakFees: number;
  cashback: number;
  cashbackToRepay: number;
  lawyerFee: number;
  annualInterestSaving: number;
  taxSavingAnnual: number;
  netUpfront: number;
  benefit12: number;
  benefit24: number;
  benefit36: number;
  breakEvenMonths: number | null;
  audit: AuditLine[];
}

export function compareRefinance(
  loans: MortgageFacility[],
  opts: {
    policy: LenderPolicy;
    modelling: ModellingAssumptions;
    proposedRate: number;
    currentMarketRate?: number;
    /** cashback that must be repaid to the current lender (pro-rata clawback) */
    cashbackClawbackOwed?: number;
    entityChange?: boolean;
    /** e.g. annual tax saving from an LTC restructure (adviser/accountant supplied) */
    taxSavingAnnual?: number;
    today?: Date;
  },
): RefinanceComparison {
  const today = opts.today ?? new Date();
  const market = opts.currentMarketRate ?? opts.proposedRate;
  const totalBalance = loans.reduce((s, l) => s + l.balance, 0);
  const breakFees = loans.map((l) => breakFeeEstimate(l, market, today));
  const totalBreakFees = breakFees.reduce((s, b) => s + b.estimate, 0);
  const cashback = totalBalance * opts.policy.cashbackRate;
  const cashbackToRepay = opts.cashbackClawbackOwed ?? 0;
  const lawyerFee = opts.entityChange ? opts.modelling.entityChangeLawyerFee : opts.modelling.refinanceLawyerFee;
  const weightedCurrentRate =
    totalBalance > 0 ? loans.reduce((s, l) => s + l.rate * l.balance, 0) / totalBalance : 0;
  const annualInterestSaving = Math.max(0, (weightedCurrentRate - opts.proposedRate) * totalBalance);
  const taxSavingAnnual = opts.taxSavingAnnual ?? 0;
  const netUpfront = cashback - cashbackToRepay - lawyerFee - totalBreakFees;
  const annualOngoing = annualInterestSaving + taxSavingAnnual;
  const benefit12 = netUpfront + annualOngoing;
  const benefit24 = netUpfront + annualOngoing * 2;
  const benefit36 = netUpfront + annualOngoing * 3;
  const breakEvenMonths =
    netUpfront >= 0 ? 0 : annualOngoing > 0 ? Math.ceil((-netUpfront / annualOngoing) * 12) : null;

  return {
    totalBalance,
    breakFees,
    totalBreakFees,
    cashback,
    cashbackToRepay,
    lawyerFee,
    annualInterestSaving,
    taxSavingAnnual,
    netUpfront,
    benefit12,
    benefit24,
    benefit36,
    breakEvenMonths,
    audit: [
      { label: `Cashback (${(opts.policy.cashbackRate * 100).toFixed(1)}% of $${Math.round(totalBalance).toLocaleString()})`, value: cashback, format: 'currency' },
      { label: 'Cashback to repay to current lender', value: -cashbackToRepay, format: 'currency', note: cashbackToRepay > 0 ? 'Pro-rata clawback — can often be avoided by timing settlement past the clawback window.' : undefined },
      { label: opts.entityChange ? 'Lawyer (entity change / sale into LTC)' : 'Lawyer / discharge', value: -lawyerFee, format: 'currency' },
      { label: 'Break fees (estimate — confirm with lender)', value: -totalBreakFees, format: 'currency' },
      { label: 'Net upfront', value: netUpfront, format: 'currency' },
      { label: 'Annual interest difference', value: annualInterestSaving, format: 'currency' },
      ...(taxSavingAnnual > 0
        ? [{ label: 'Annual tax saving (accountant-confirmed structure)', value: taxSavingAnnual, format: 'currency' as const }]
        : []),
      { label: '12-month benefit', value: benefit12, format: 'currency' },
    ],
  };
}

export interface ExpiryTimelineItem {
  loanId: string;
  label: string;
  balance: number;
  rate: number;
  expiry: string | null;
  monthsAway: number | null;
}

export function fixedExpiryTimeline(loans: MortgageFacility[], today = new Date()): ExpiryTimelineItem[] {
  return loans
    .map((l) => {
      const expiry = l.loanType === 'fixed' && l.fixedExpiry ? l.fixedExpiry : null;
      return {
        loanId: l.id,
        label: `${l.lender} — $${Math.round(l.balance).toLocaleString()} @ ${(l.rate * 100).toFixed(2)}%`,
        balance: l.balance,
        rate: l.rate,
        expiry,
        monthsAway: expiry
          ? Math.max(0, Math.round((new Date(expiry).getTime() - today.getTime()) / (30.44 * 86_400_000)))
          : null,
      };
    })
    .sort((a, b) => (a.monthsAway ?? 999) - (b.monthsAway ?? 999));
}
