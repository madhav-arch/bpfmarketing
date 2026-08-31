import type { TaxTable } from './types';

/**
 * Tax table as embedded in the source Blueprint workbook (pre-2024 thresholds,
 * top rate 33%). Retained ONLY for regression parity with the workbook and
 * flagged for adviser confirmation — do not use for live advice.
 */
export const TAX_WORKBOOK: TaxTable = {
  id: 'tax-workbook-legacy',
  label: 'PAYE table (as per source workbook — legacy thresholds)',
  kind: 'modelling-assumption',
  effectiveFrom: '2010-10-01',
  effectiveTo: '2024-07-30',
  source: 'Blueprint Strategy Session workbook — Lookups sheet',
  verifiedAt: '2026-08-31',
  requiresConfirmation: true,
  notes:
    'Thresholds superseded 31 Jul 2024 and no 39% band. Kept so engine output can be ' +
    'reconciled against the existing spreadsheet, never for client-facing figures.',
  brackets: [
    { from: 0, rate: 0.105 },
    { from: 14000, rate: 0.175 },
    { from: 48000, rate: 0.3 },
    { from: 70000, rate: 0.33 },
  ],
  accRate: 0.014,
  accMaxIncome: 125000,
  studentLoanRate: 0.12,
  studentLoanThresholdMonthly: 1670,
};

/** Current PAYE thresholds (from 31 July 2024), including the 39% band. */
export const TAX_CURRENT: TaxTable = {
  id: 'tax-nz-2024',
  label: 'PAYE table (NZ, from 31 Jul 2024)',
  kind: 'regulation',
  effectiveFrom: '2024-07-31',
  source: 'Inland Revenue — personal income tax thresholds',
  verifiedAt: '2026-08-31',
  brackets: [
    { from: 0, rate: 0.105 },
    { from: 15600, rate: 0.175 },
    { from: 53500, rate: 0.3 },
    { from: 78100, rate: 0.33 },
    { from: 180000, rate: 0.39 },
  ],
  accRate: 0.014,
  accMaxIncome: 142283,
  studentLoanRate: 0.12,
  studentLoanThresholdMonthly: 2073,
};
