// Excel-compatible financial primitives (sign conventions match PMT/PV/FV).

/** Payment per period for a loan of `pv` (positive), returned positive. */
export function pmt(ratePerPeriod: number, periods: number, presentValue: number): number {
  if (periods <= 0) return 0;
  if (ratePerPeriod === 0) return presentValue / periods;
  const r = ratePerPeriod;
  return (presentValue * r) / (1 - Math.pow(1 + r, -periods));
}

/** Present value of an annuity paying `payment` per period, returned positive. */
export function pv(ratePerPeriod: number, periods: number, payment: number): number {
  if (periods <= 0 || payment <= 0) return 0;
  if (ratePerPeriod === 0) return payment * periods;
  const r = ratePerPeriod;
  return (payment * (1 - Math.pow(1 + r, -periods))) / r;
}

export function futureValue(presentValue: number, annualRate: number, years: number): number {
  return presentValue * Math.pow(1 + annualRate, years);
}

/** FV of a series of level contributions made each period. */
export function futureValueOfSeries(
  paymentPerPeriod: number,
  ratePerPeriod: number,
  periods: number,
): number {
  if (ratePerPeriod === 0) return paymentPerPeriod * periods;
  return (paymentPerPeriod * (Math.pow(1 + ratePerPeriod, periods) - 1)) / ratePerPeriod;
}

/**
 * Deflate a nominal future amount into today's purchasing power.
 * `$1,420,000 in 30 years at 2.2% inflation ≈ $740k in today's dollars.`
 */
export function todaysDollars(nominal: number, inflation: number, years: number): number {
  if (years <= 0) return nominal;
  return nominal / Math.pow(1 + inflation, years);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round0(n: number): number {
  return Math.round(n);
}
