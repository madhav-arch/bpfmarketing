import type {
  CashbackAssumptions,
  CostAssumptions,
  KiwiSaverSettings,
  KiwiSaverWithdrawalWorkflow,
  ModellingAssumptions,
  OwnershipCostAssumptions,
  RetirementSettings,
} from './types';

export const FHB_COSTS: CostAssumptions = {
  id: 'costs-fhb-2026-08',
  label: 'First-home purchase costs (Blueprint defaults)',
  kind: 'modelling-assumption',
  effectiveFrom: '2026-08-01',
  source: 'Strategy-session narrative (lawyer ~$2.5k, valuation ~$1k, building ~$500, ~$4k total)',
  verifiedAt: '2026-08-31',
  items: [
    { key: 'building-report', label: 'Building report', amount: 500, stage: 'due-diligence', required: true, note: 'Paid while the house is under contract, during your checks.' },
    { key: 'valuation', label: 'Registered valuation', amount: 1000, stage: 'due-diligence', required: true, note: 'Ordered once finance condition is being met — the bank requires it at low deposits.' },
    { key: 'lim', label: 'LIM report (if required)', amount: 350, stage: 'due-diligence', required: false, note: 'Council "logbook" for the property — flood zones, consents.' },
    { key: 'lawyer', label: 'Lawyer / conveyancing', amount: 2500, stage: 'settlement', required: true, note: 'Paid at the end, not the start.' },
    { key: 'moving', label: 'Moving costs', amount: 800, stage: 'settlement', required: false, note: 'Truck hire or movers — an editable assumption.' },
    { key: 'buffer', label: 'Cash buffer after settlement', amount: 3000, stage: 'settlement', required: false, note: 'Blueprint recommendation — not a lender requirement.' },
  ],
};

export const OWNERSHIP_COSTS: OwnershipCostAssumptions = {
  id: 'ownership-costs-2026-08',
  label: 'Ongoing ownership cost assumptions',
  kind: 'modelling-assumption',
  effectiveFrom: '2026-08-01',
  source: 'Blueprint defaults — editable per meeting; council rates and insurers vary widely',
  verifiedAt: '2026-08-31',
  requiresConfirmation: true,
  ratesMonthly: 350,
  insuranceMonthly: 150,
  otherMonthly: 0,
};

export const CASHBACK_EXAMPLE: CashbackAssumptions = {
  id: 'cashback-example-2026-08',
  label: 'Lender cashback (configurable example)',
  kind: 'modelling-assumption',
  effectiveFrom: '2026-08-01',
  source: 'Illustrative example only — cashback is lender, application and campaign specific, never an entitlement',
  verifiedAt: '2026-08-31',
  requiresConfirmation: true,
  amount: 5000,
  retentionMonths: 36,
  clawbackMethod: 'pro-rata',
  paymentTiming: 'Paid around settlement or shortly after, according to the lender’s terms',
  eligibilityNote: 'Depends on lender, loan size, campaign and application — confirm at approval, do not assume.',
};

export const KIWISAVER_WITHDRAWAL_WORKFLOW: KiwiSaverWithdrawalWorkflow = {
  id: 'ks-withdrawal-workflow-2026',
  label: 'KiwiSaver first-home withdrawal workflow',
  kind: 'modelling-assumption',
  effectiveFrom: '2026-08-01',
  source: 'Provider guidance as relayed in strategy sessions — processing time varies by provider',
  verifiedAt: '2026-08-31',
  requiresConfirmation: true,
  processingWorkingDays: 9,
  minBalanceRetained: 1000,
  cautionNote: 'Allow sufficient time — actual processing can vary. The clock starts once the lawyer holds the signed sale and purchase agreement and the withdrawal documentation.',
};

export const KIWISAVER_SETTINGS: KiwiSaverSettings = {
  id: 'kiwisaver-settings-2026',
  label: 'KiwiSaver contribution & projection settings',
  kind: 'regulation',
  effectiveFrom: '2025-07-01',
  source: 'IRD KiwiSaver settings; return bands are Blueprint modelling assumptions',
  verifiedAt: '2026-08-31',
  requiresConfirmation: true,
  notes: 'Government contribution settings change; versioned deliberately.',
  governmentContributionAnnual: 260.72,
  governmentContributionMatchRate: 0.25,
  memberContributionCapForGovt: 1042.86,
  esctApproxRate: 0.3,
  returnAssumptions: { low: 0.03, base: 0.05, high: 0.07 },
  defaultFeePercent: 0.008,
  fundTypeReturnHint: {
    defensive: 0.025,
    conservative: 0.035,
    balanced: 0.045,
    growth: 0.055,
    aggressive: 0.065,
  },
};

export const RETIREMENT_SETTINGS: RetirementSettings = {
  id: 'retirement-settings-2026',
  label: 'Retirement planning settings',
  kind: 'modelling-assumption',
  effectiveFrom: '2026-04-01',
  source: 'NZ Super rates (couple, both qualify, after tax M) + Blueprint heuristics',
  verifiedAt: '2026-08-31',
  requiresConfirmation: true,
  nzSuperAnnualCouple: 41781, // ≈ $1,606.96/fortnight × 26 (workbook table)
  nzSuperAnnualSingle: 27124,
  drawdownRate: 0.04,
  growth: { low: 0.04, base: 0.05, high: 0.06 },
  inflation: 0.02,
};

export const MODELLING: ModellingAssumptions = {
  id: 'modelling-2026-08',
  label: 'Blueprint modelling assumptions',
  kind: 'modelling-assumption',
  effectiveFrom: '2026-08-01',
  source: 'Blueprint Strategy Session workbook + meeting practice',
  verifiedAt: '2026-08-31',
  propertyGrowth: { low: 0.02, base: 0.04, high: 0.06 },
  vacancyWeeksPerYear: 2,
  defaultPropertyMgmtRate: 0.08,
  defaultMaintenanceRate: 0.05,
  salaryGrowth: 0.03,
  equityDepositRate: 0.3,
  refinanceLawyerFee: 1200,
  entityChangeLawyerFee: 1800,
  saleAgentFeeRate: 0.03,
  saleLegalFee: 1500,
};
