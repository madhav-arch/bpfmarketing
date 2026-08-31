import type { Frequency } from './types';

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  annual: 1,
};

export function toAnnual(amount: number, freq: Frequency): number {
  return amount * PERIODS_PER_YEAR[freq];
}

export function toMonthly(amount: number, freq: Frequency): number {
  return toAnnual(amount, freq) / 12;
}

export function fromMonthly(amountMonthly: number, freq: Frequency): number {
  return (amountMonthly * 12) / PERIODS_PER_YEAR[freq];
}

/**
 * The Blueprint workbook converts weekly income to monthly with a flat 4.33
 * multiplier (not 52/12 = 4.3333…). Kept for fixture parity; the engine uses
 * whichever multiplier the active modelling RuleSet specifies.
 */
export const WORKBOOK_WEEKLY_TO_MONTHLY = 4.33;
