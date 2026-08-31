// Versioned RuleSets. Every calculator output records which rule sets produced it.

export type RuleKind = 'regulation' | 'lender-policy' | 'modelling-assumption';

export interface RuleSetMeta {
  id: string;
  label: string;
  kind: RuleKind;
  effectiveFrom: string; // ISO date
  effectiveTo?: string;
  source: string;
  verifiedAt: string;
  requiresConfirmation?: boolean;
  notes?: string;
}

export interface TaxBracket {
  from: number; // annual income threshold (inclusive)
  rate: number;
}

export interface TaxTable extends RuleSetMeta {
  brackets: TaxBracket[];
  accRate: number;
  accMaxIncome: number;
  studentLoanRate: number;
  studentLoanThresholdMonthly: number;
}

export interface LowEquityMarginBand {
  lvrFrom: number; // exclusive
  lvrTo: number; // inclusive
  margin: number;
}

export interface LenderPolicy extends RuleSetMeta {
  lender: string;
  stressRate: number;
  maxTermYears: number;
  otScaling: number;
  boarderScaling: { percent: number; maxBoarders: number };
  rentalScaling: number;
  /** weekly → monthly multiplier used when scaling rent/board */
  weeklyToMonthly: number;
  creditCardMonthlyFactor: number; // of limit
  otherFinance: { rate: number; termYears: number };
  expenseBenchmark: {
    single: number;
    couple: number;
    perDependant: number;
    perVehicle: number;
  };
  minUMI: { threshold: number; below: number; above: number };
  dtiMultiple: number;
  lvrPolicy: { ownerOccupiedMax: number; investmentMax: number };
  lowEquityMargins: LowEquityMarginBand[];
  cashbackRate: number;
  cashbackClawbackMonths: number;
}

export interface CostAssumptions extends RuleSetMeta {
  items: {
    key: string;
    label: string;
    amount: number;
    stage: 'before-finance' | 'due-diligence' | 'settlement';
    note?: string;
  }[];
}

export interface KiwiSaverSettings extends RuleSetMeta {
  governmentContributionAnnual: number;
  governmentContributionMatchRate: number; // per $1 of member contribution
  memberContributionCapForGovt: number;
  esctApproxRate: number; // tax drag applied to employer contributions
  returnAssumptions: { low: number; base: number; high: number };
  defaultFeePercent: number;
  fundTypeReturnHint: Record<string, number>;
}

export interface RetirementSettings extends RuleSetMeta {
  nzSuperAnnualCouple: number;
  nzSuperAnnualSingle: number;
  drawdownRate: number; // "4% planning assumption — not a guarantee"
  growth: { low: number; base: number; high: number };
  inflation: number;
}

export interface ModellingAssumptions extends RuleSetMeta {
  propertyGrowth: { low: number; base: number; high: number };
  vacancyWeeksPerYear: number;
  defaultPropertyMgmtRate: number;
  defaultMaintenanceRate: number;
  salaryGrowth: number;
  equityDepositRate: number; // deposit rate assumed when recycling equity (0.30)
  refinanceLawyerFee: number;
  entityChangeLawyerFee: number;
}
