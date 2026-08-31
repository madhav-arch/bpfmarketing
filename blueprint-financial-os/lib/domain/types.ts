// Core domain types for Blueprint Financial OS.
// Monetary values are NZD. Rates are decimals (0.07 = 7%).

export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'annual';

export type SourceType =
  | 'fact-find'
  | 'client-stated'
  | 'bank-internal-valuation'
  | 'avm'
  | 'registered-valuation'
  | 'adviser-estimate'
  | 'ird-summary'
  | 'statement'
  | 'demo-fixture';

export interface Sourced<T = number> {
  value: T;
  sourceType: SourceType;
  sourceName?: string;
  observedAt?: string;
  confidence?: 'low' | 'medium' | 'high';
  note?: string;
}

/** One line of the working behind a figure — powers "How was this calculated?" */
export interface AuditLine {
  label: string;
  value?: number;
  format?: 'currency' | 'percent' | 'number' | 'text';
  note?: string;
}

export interface Audited<T = number> {
  value: T;
  audit: AuditLine[];
  ruleSetIds: string[];
}

// ---------------------------------------------------------------------------
// People & income

export type ClientType = 'fhb' | 'homeowner' | 'investor';

export type IncomeKind =
  | 'salary'
  | 'overtime-commission'
  | 'self-employed'
  | 'other';

export interface IncomeLine {
  id: string;
  kind: IncomeKind;
  label: string;
  grossAnnual: number;
  kiwiSaverRate: number; // deducted from pay (0 for voluntary contributors)
  studentLoan?: boolean;
  note?: string;
}

export interface Applicant {
  id: string;
  displayName: string;
  age: number;
  employmentType: 'paye' | 'self-employed';
  occupation?: string;
  incomes: IncomeLine[];
}

export interface Household {
  adults: 1 | 2;
  dependants: number;
  vehicles: number;
}

export interface ExpenseProfile {
  /** Client's declared real monthly spending by category (Fact Find style). */
  declaredMonthly: { category: string; amount: number; flag?: string }[];
  /** Fixed commitments the bank picks up from statements (monthly). */
  fixedCommitmentsMonthly: { label: string; amount: number }[];
}

// ---------------------------------------------------------------------------
// Property & debt

export type OwnershipEntity = 'personal' | 'trust' | 'ltc' | 'company';
export type PropertyUse = 'owner-occupied' | 'investment';

export interface PropertyValuation extends Sourced<number> {
  id: string;
}

export interface Property {
  id: string;
  nickname: string; // anonymised, e.g. "Family home — Bay of Plenty"
  use: PropertyUse;
  entity: OwnershipEntity;
  purchasePrice?: number;
  valuations: PropertyValuation[];
  /** id of the valuation currently used for modelling */
  activeValuationId: string;
  rentPerWeek?: Sourced<number>;
  ratesPerYear?: number;
  insurancePerYear?: number;
  propertyMgmtRate?: number; // of rent
  maintenanceRate?: number; // of rent
}

export type LoanType = 'fixed' | 'floating' | 'revolving' | 'offset';

export interface MortgageFacility {
  id: string;
  propertyId: string;
  lender: string;
  entity: OwnershipEntity;
  balance: number;
  rate: number;
  loanType: LoanType;
  interestOnly: boolean;
  fixedExpiry?: string; // ISO date
  termRemainingYears: number;
  repayment: { amount: number; frequency: Frequency };
  offsetBalance?: number;
  limit?: number; // for revolving
}

export type OtherDebtKind = 'credit-card' | 'personal-loan' | 'store-card' | 'other';

export interface OtherDebt {
  id: string;
  kind: OtherDebtKind;
  label: string;
  limit: number;
  balance: number;
  rate: number;
}

// ---------------------------------------------------------------------------
// KiwiSaver, insurance, goals, events

export type FundType = 'defensive' | 'conservative' | 'balanced' | 'growth' | 'aggressive';

export interface KiwiSaverAccount {
  id: string;
  applicantId: string;
  provider: string;
  fundType: FundType;
  balance: Sourced<number>;
  contributionRate: number;
  voluntaryMonthly?: number;
  salaryForContribution: number;
  employerRate: number;
  feesPercent?: number;
  firstHomeIntent?: boolean;
}

export type InsuranceKind = 'life' | 'trauma' | 'income-protection' | 'health' | 'other';

export interface InsurancePolicy {
  id: string;
  applicantId?: string;
  kind: InsuranceKind;
  provider: string;
  cover?: number;
  premiumMonthly: number;
}

export type GoalKind =
  | 'buy-first-home' | 'comfortable-budget' | 'pay-off-faster' | 'improve-cashflow'
  | 'refix' | 'refinance' | 'restructure' | 'consolidate-debt' | 'buy-investment'
  | 'improve-yield' | 'build-equity' | 'mortgage-free-by' | 'family-planning'
  | 'retirement-income' | 'review-kiwisaver' | 'protect-income' | 'help-children' | 'other';

export interface Goal {
  id: string;
  kind: GoalKind;
  label: string;
  detail?: string;
  targetYear?: number;
  targetAmount?: number;
}

export type EventKind =
  | 'parental-leave' | 'child-born' | 'childcare-start' | 'childcare-end'
  | 'salary-change' | 'boarder-start' | 'boarder-end' | 'rent-change'
  | 'rate-expiry' | 'lump-sum' | 'loan-finished' | 'property-sale'
  | 'property-purchase' | 'retirement' | 'kiwisaver-withdrawal' | 'other';

export interface FinancialEvent {
  id: string;
  kind: EventKind;
  label: string;
  startDate: string; // ISO
  endDate?: string;
  /** +/- change to monthly cashflow while active */
  monthlyImpact?: number;
  /** one-off amount (lump sums, sale proceeds) */
  amount?: number;
}

// ---------------------------------------------------------------------------
// FHB specifics

export interface DepositSources {
  kiwiSaver: number;
  savings: number;
  gift: number;
  other: number;
  /** cash the household keeps aside (not into deposit) */
  keepAsBuffer: number;
}

export interface TargetPurchase {
  price: number;
  depositSources: DepositSources;
  intendedBoarderPerWeek?: number;
  boarderCount?: number;
}

// ---------------------------------------------------------------------------
// Client aggregate

export interface Client {
  id: string;
  label: string; // e.g. "Demo — First-home buyers"
  shortLabel: string;
  clientType: ClientType;
  narrative: string; // one-line anonymised context for the adviser
  household: Household;
  applicants: Applicant[];
  boarderIncomePerWeek?: number; // current, actual
  goals: Goal[];
  expenses: ExpenseProfile;
  properties: Property[];
  mortgages: MortgageFacility[];
  otherDebts: OtherDebt[];
  cashSavings: Sourced<number>;
  kiwiSaverAccounts: KiwiSaverAccount[];
  insurancePolicies: InsurancePolicy[];
  financialEvents: FinancialEvent[];
  targetPurchase?: TargetPurchase;
  retirement: {
    targetAge: number;
    desiredAnnualIncome: number;
  };
  /** context for the refinance/refix comparison module, where relevant */
  refinanceContext?: {
    proposedRate: number;
    currentMarketRate: number;
    cashbackClawbackOwed?: number;
    entityChange?: boolean;
    taxSavingAnnual?: number;
    taxSavingNote?: string;
  };
  /** default modelled rate for new lending in this client's scenarios */
  modellingRate: number;
}
