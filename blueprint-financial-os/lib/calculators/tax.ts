import type { TaxTable } from '../rules/types';

/** Progressive PAYE on annual gross income. */
export function payeAnnual(gross: number, table: TaxTable): number {
  if (gross <= 0) return 0;
  let tax = 0;
  const b = table.brackets;
  for (let i = 0; i < b.length; i++) {
    const upper = i + 1 < b.length ? b[i + 1].from : Infinity;
    if (gross > b[i].from) {
      tax += (Math.min(gross, upper) - b[i].from) * b[i].rate;
    }
  }
  return tax;
}

export function accLevyAnnual(gross: number, table: TaxTable): number {
  if (gross <= 0) return 0;
  const cap = table.accMaxIncome * table.accRate;
  return gross >= table.accMaxIncome ? cap : gross * table.accRate;
}

export function studentLoanMonthly(grossMonthly: number, table: TaxTable): number {
  return Math.max(0, (grossMonthly - table.studentLoanThresholdMonthly) * table.studentLoanRate);
}

export interface NetMonthlyBreakdown {
  grossMonthly: number;
  kiwiSaverMonthly: number;
  payeMonthly: number;
  accMonthly: number;
  studentLoanMonthly: number;
  netMonthly: number;
}

/**
 * Workbook parity: net = gross/12·(1−ks) − PAYE/12 − ACC/12 − studentLoan.
 * (The workbook deducts KiwiSaver from gross before pay but computes PAYE on
 * full gross — reproduced as-is.)
 */
/**
 * Invert net→gross: find the gross annual salary whose net monthly pay (after
 * PAYE, ACC and KiwiSaver) matches an observed bank credit. Deterministic
 * bisection — used to gross up Akahu-detected income for servicing.
 */
export function grossFromNetMonthly(
  netMonthly: number,
  kiwiSaverRate: number,
  table: TaxTable,
  hasStudentLoan = false,
): number {
  if (netMonthly <= 0) return 0;
  let lo = 0;
  let hi = netMonthly * 12 * 2.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const net = netMonthlyFromSalary(mid, kiwiSaverRate, table, hasStudentLoan).netMonthly;
    if (net < netMonthly) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

export function netMonthlyFromSalary(
  grossAnnual: number,
  kiwiSaverRate: number,
  table: TaxTable,
  hasStudentLoan = false,
): NetMonthlyBreakdown {
  const grossMonthly = grossAnnual / 12;
  const kiwiSaverMonthly = grossMonthly * kiwiSaverRate;
  const payeMonthly = payeAnnual(grossAnnual, table) / 12;
  const accMonthly = accLevyAnnual(grossAnnual, table) / 12;
  const sl = hasStudentLoan && grossAnnual > 0 ? studentLoanMonthly(grossMonthly, table) : 0;
  return {
    grossMonthly,
    kiwiSaverMonthly,
    payeMonthly,
    accMonthly,
    studentLoanMonthly: sl,
    netMonthly: grossMonthly - kiwiSaverMonthly - payeMonthly - accMonthly - sl,
  };
}
