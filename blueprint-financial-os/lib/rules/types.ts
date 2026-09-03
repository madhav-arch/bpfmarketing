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
  /** true when stressRate is a floor — loans test at max(actual rate, floor) */
  stressRateIsFloor?: boolean;
  maxTermYears: number;
  otScaling: number;
  boarderScaling: { percent: number; maxBoarders: number; maxPerBoarderWeekly?: number };
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
    /** share of gross monthly household income added to the benchmark
     *  (e.g. ASB adds 7% of GMI on top of the base allowances) */
    incomeLinkedRate?: number;
  };
  /** hex colour + short mark for UI identification chips (not logo artwork) */
  brand?: { color: string; textColor?: string; mark: string };
  minUMI: { threshold: number; below: number; above: number };
  /** true → the UMI floor is deducted before sizing capacity (a $500 surplus
   *  must REMAIN at max lending); false/absent → workbook gate semantics. */
  umiFloorIsDeduction?: boolean;
  /** Ratio-based servicing cap: total outgoings (benchmark living + stressed
   *  debt + new-lending repayment) may not exceed `servicingRatioCap` ×
   *  recognised net income. When set, this REPLACES the UMI floor for
   *  capacity sizing (e.g. Kiwibank net servicing ratio ≤ 92%; BNZ servicing
   *  index ≤ 105% — per adviser instruction 3 Sep 2026, verify per release). */
  servicingRatioCap?: number;
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
    required?: boolean; // false = optional/discretionary
    note?: string;
  }[];
}

/** Ongoing ownership costs beyond the mortgage — editable defaults. */
export interface OwnershipCostAssumptions extends RuleSetMeta {
  ratesMonthly: number;
  insuranceMonthly: number; // home + contents
  otherMonthly: number; // body corp, maintenance sinking fund, etc.
}

/** Lender cashback — a configurable offer example, never an entitlement. */
export interface CashbackAssumptions extends RuleSetMeta {
  amount: number;
  retentionMonths: number;
  clawbackMethod: 'pro-rata' | 'full' | 'none';
  paymentTiming: string;
  eligibilityNote: string;
}

/** KiwiSaver first-home withdrawal workflow assumptions. */
export interface KiwiSaverWithdrawalWorkflow extends RuleSetMeta {
  processingWorkingDays: number; // configurable — not a guarantee
  minBalanceRetained: number; // must stay in the account
  cautionNote: string;
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
  saleAgentFeeRate: number; // of sale price
  saleLegalFee: number;
}
