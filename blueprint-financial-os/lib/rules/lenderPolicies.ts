import type { LenderPolicy } from './types';

const LOW_EQUITY_MARGINS = [
  { lvrFrom: 0.9, lvrTo: 0.95, margin: 0.012 },
  { lvrFrom: 0.85, lvrTo: 0.9, margin: 0.0075 },
  { lvrFrom: 0.8, lvrTo: 0.85, margin: 0.003 },
];

/**
 * The Blueprint modelling policy — a faithful reproduction of the servicing
 * logic in the source Strategy Session workbook. This is Blueprint's own
 * conservative modelling view, not any specific lender's credit policy.
 */
export const BLUEPRINT_MODELLING_POLICY: LenderPolicy = {
  id: 'policy-blueprint-2026-08',
  label: 'Blueprint modelling policy (workbook parity)',
  kind: 'modelling-assumption',
  lender: 'Blueprint modelling',
  effectiveFrom: '2026-08-01',
  source: 'Blueprint Strategy Session workbook — Lookups + Servicing Power sheets',
  verifiedAt: '2026-08-31',
  notes:
    'Boarder scaling: meetings narrate 80%, workbook computes 75% × 4.33 — the workbook ' +
    'value is used here and flagged for adviser confirmation.',
  requiresConfirmation: true,
  stressRate: 0.07,
  maxTermYears: 30,
  otScaling: 0.8,
  boarderScaling: { percent: 0.75, maxBoarders: 2 },
  rentalScaling: 0.75,
  weeklyToMonthly: 4.33,
  creditCardMonthlyFactor: 0.03,
  otherFinance: { rate: 0.1, termYears: 5 },
  expenseBenchmark: { single: 1250, couple: 1850, perDependant: 400, perVehicle: 250 },
  minUMI: { threshold: 1_000_000, below: 350, above: 900 },
  dtiMultiple: 6,
  lvrPolicy: { ownerOccupiedMax: 0.8, investmentMax: 0.7 },
  lowEquityMargins: LOW_EQUITY_MARGINS,
  cashbackRate: 0.008,
  cashbackClawbackMonths: 28,
};

/**
 * DEMO lender policies. Structurally faithful to how bank credit policies
 * differ (expense benchmarks, stress rates, boarder caps, card treatment)
 * but the figures are illustrative — NOT real, current bank policy.
 */
export const DEMO_LENDER_A: LenderPolicy = {
  ...BLUEPRINT_MODELLING_POLICY,
  id: 'policy-demo-lender-a',
  label: 'Demo Bank A (major bank profile)',
  kind: 'lender-policy',
  lender: 'Bank A',
  source: 'Illustrative demo policy — confirm against lender calculators before advice',
  requiresConfirmation: true,
  stressRate: 0.0705,
  expenseBenchmark: { single: 1550, couple: 2300, perDependant: 430, perVehicle: 250 },
  boarderScaling: { percent: 0.8, maxBoarders: 2 },
  cashbackRate: 0.009,
};

export const DEMO_LENDER_B: LenderPolicy = {
  ...BLUEPRINT_MODELLING_POLICY,
  id: 'policy-demo-lender-b',
  label: 'Demo Bank B (sharp servicing profile)',
  kind: 'lender-policy',
  lender: 'Bank B',
  source: 'Illustrative demo policy — confirm against lender calculators before advice',
  requiresConfirmation: true,
  stressRate: 0.068,
  expenseBenchmark: { single: 1200, couple: 1700, perDependant: 380, perVehicle: 230 },
  rentalScaling: 0.8,
  cashbackRate: 0.008,
};

export const DEMO_LENDER_C: LenderPolicy = {
  ...BLUEPRINT_MODELLING_POLICY,
  id: 'policy-demo-lender-c',
  label: 'Demo Bank C (conservative profile)',
  kind: 'lender-policy',
  lender: 'Bank C',
  source: 'Illustrative demo policy — confirm against lender calculators before advice',
  requiresConfirmation: true,
  stressRate: 0.0735,
  expenseBenchmark: { single: 1650, couple: 2450, perDependant: 450, perVehicle: 270 },
  boarderScaling: { percent: 0.7, maxBoarders: 1 },
  creditCardMonthlyFactor: 0.038,
  cashbackRate: 0.007,
};

export const DEMO_LENDERS = [DEMO_LENDER_A, DEMO_LENDER_B, DEMO_LENDER_C];
