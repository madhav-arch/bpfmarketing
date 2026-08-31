import type { Frequency } from '../domain/types';
import { PERIODS_PER_YEAR } from '../domain/frequency';
import { pmt } from './finance';

export interface AmortisationInput {
  principal: number;
  annualRate: number;
  years: number;
  frequency?: Frequency; // default monthly
  extraPerPeriod?: number;
  interestOnly?: boolean;
  offsetBalance?: number; // interest charged on principal − offset
  /** override the scheduled payment (e.g. client pays more than minimum) */
  scheduledPaymentOverride?: number;
  maxPeriods?: number;
}

export interface AmortisationPoint {
  period: number;
  yearFraction: number;
  balance: number; // end of period
  interest: number;
  principalPaid: number;
}

export interface AmortisationResult {
  scheduledPayment: number;
  totalPayment: number; // scheduled + extra
  periodsPerYear: number;
  points: AmortisationPoint[];
  termPeriods: number;
  termYears: number;
  totalInterest: number;
  totalPaid: number;
  paidOff: boolean;
}

export function amortise(input: AmortisationInput): AmortisationResult {
  const freq: Frequency = input.frequency ?? 'monthly';
  const ppy = PERIODS_PER_YEAR[freq];
  const r = input.annualRate / ppy;
  const nScheduled = Math.round(input.years * ppy);
  const offset = Math.min(input.offsetBalance ?? 0, input.principal);
  const scheduledPayment = input.interestOnly
    ? (input.principal - offset) * r
    : input.scheduledPaymentOverride ?? pmt(r, nScheduled, input.principal);
  const extra = input.extraPerPeriod ?? 0;
  const maxPeriods = input.maxPeriods ?? Math.max(nScheduled, 40 * ppy);

  const points: AmortisationPoint[] = [];
  let balance = input.principal;
  let totalInterest = 0;
  let period = 0;

  while (balance > 0.01 && period < maxPeriods) {
    period++;
    const interest = Math.max(0, balance - offset) * r;
    let payment = input.interestOnly ? interest + extra : scheduledPayment + extra;
    let principalPaid = payment - interest;
    if (principalPaid > balance) {
      principalPaid = balance;
      payment = interest + principalPaid;
    }
    if (principalPaid < 0) principalPaid = 0; // payment doesn't cover interest
    balance -= principalPaid;
    totalInterest += interest;
    points.push({
      period,
      yearFraction: period / ppy,
      balance,
      interest,
      principalPaid,
    });
    if (input.interestOnly && extra === 0 && period >= nScheduled) break;
    if (principalPaid === 0 && extra === 0 && !input.interestOnly && payment <= interest) break; // never repays
  }

  return {
    scheduledPayment,
    totalPayment: scheduledPayment + extra,
    periodsPerYear: ppy,
    points,
    termPeriods: period,
    termYears: period / ppy,
    totalInterest,
    totalPaid: input.principal + totalInterest,
    paidOff: balance <= 0.01,
  };
}

export interface RepaymentComparison {
  base: AmortisationResult;
  alternative: AmortisationResult;
  yearsSaved: number;
  monthsSaved: number;
  interestSaved: number;
}

export function compareRepayment(
  base: AmortisationInput,
  extraPerPeriod: number,
): RepaymentComparison {
  const baseRes = amortise(base);
  const altRes = amortise({ ...base, extraPerPeriod: (base.extraPerPeriod ?? 0) + extraPerPeriod });
  const yearsSaved = baseRes.termYears - altRes.termYears;
  return {
    base: baseRes,
    alternative: altRes,
    yearsSaved,
    monthsSaved: Math.round(yearsSaved * 12),
    interestSaved: baseRes.totalInterest - altRes.totalInterest,
  };
}

/**
 * Combined household mortgage trajectory — joint month-by-month simulation.
 * Extra repayments target the largest-balance amortising loan; when a loan is
 * repaid its scheduled payment cascades onto the remaining loans (snowball) —
 * mirroring Blueprint's "keep paying the same total" practice.
 */
export function combinedTrajectory(
  loans: { principal: number; annualRate: number; years: number; interestOnly?: boolean; extraMonthly?: number; offsetBalance?: number }[],
  extraMonthlyAcrossAll = 0,
): { schedule: AmortisationPoint[]; totalInterest: number; termYears: number; payoffYear: number; paidOff: boolean } {
  const state = loans
    .filter((l) => l.principal > 0)
    .map((l) => ({
      balance: l.principal,
      rate: l.annualRate / 12,
      offset: Math.min(l.offsetBalance ?? 0, l.principal),
      interestOnly: !!l.interestOnly,
      scheduled: l.interestOnly ? 0 : pmt(l.annualRate / 12, Math.round(l.years * 12), l.principal),
      extra: l.extraMonthly ?? 0,
    }));
  const schedule: AmortisationPoint[] = [];
  let totalInterest = 0;
  let cascade = 0; // freed scheduled payments from repaid loans
  const maxPeriods = 40 * 12;
  let period = 0;

  while (state.some((s) => s.balance > 0.01) && period < maxPeriods) {
    period++;
    let monthInterest = 0;
    let monthPrincipal = 0;
    // pool of extra principal this month
    let extraPool = extraMonthlyAcrossAll + cascade + state.reduce((s, l) => s + (l.balance > 0.01 ? l.extra : 0), 0);

    // scheduled payments first
    for (const l of state) {
      if (l.balance <= 0.01) continue;
      const interest = Math.max(0, l.balance - l.offset) * l.rate;
      monthInterest += interest;
      totalInterest += interest;
      if (!l.interestOnly) {
        const principal = Math.min(Math.max(0, l.scheduled - interest), l.balance);
        l.balance -= principal;
        monthPrincipal += principal;
      }
    }
    // extra principal → largest active amortising loan first, then IO loans
    const targets = state
      .filter((l) => l.balance > 0.01)
      .sort((a, b) => Number(a.interestOnly) - Number(b.interestOnly) || b.balance - a.balance);
    for (const t of targets) {
      if (extraPool <= 0) break;
      const pay = Math.min(extraPool, t.balance);
      t.balance -= pay;
      monthPrincipal += pay;
      extraPool -= pay;
    }
    // cascade: freed scheduled payments keep working
    cascade = state.filter((l) => l.balance <= 0.01 && !l.interestOnly).reduce((s, l) => s + l.scheduled, 0);

    schedule.push({
      period,
      yearFraction: period / 12,
      balance: state.reduce((s, l) => s + Math.max(0, l.balance), 0),
      interest: monthInterest,
      principalPaid: monthPrincipal,
    });
    // pure-IO book with no extras never repays — stop at the horizon
    if (state.every((l) => l.interestOnly || l.balance <= 0.01) && extraMonthlyAcrossAll + cascade === 0 && state.every((l) => l.extra === 0)) {
      if (period >= 30 * 12) break;
    }
  }

  const paidOff = state.every((l) => l.balance <= 0.01);
  return {
    schedule,
    totalInterest,
    termYears: period / 12,
    payoffYear: new Date().getFullYear() + Math.ceil(period / 12),
    paidOff,
  };
}
