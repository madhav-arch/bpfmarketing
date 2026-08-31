import type { Client } from '../domain/types';
import type {
  CashbackAssumptions,
  CostAssumptions,
  KiwiSaverSettings,
  KiwiSaverWithdrawalWorkflow,
  LenderPolicy,
  ModellingAssumptions,
  OwnershipCostAssumptions,
  RetirementSettings,
  TaxTable,
} from '../rules/types';
import { computeServicing, compareLenders, type ServicingResult, type LenderComparison } from '../calculators/servicing';
import { computeEquity, type EquityResult, activeValuation } from '../calculators/equity';
import { computeFhb, type FhbResult } from '../calculators/fhb';
import { combinedTrajectory, type AmortisationPoint } from '../calculators/amortisation';
import { computeInvestment, type InvestmentResult } from '../calculators/investment';
import { projectKiwiSaver, kiwiSaverPosition, type KiwiSaverProjection, type KiwiSaverPositionNote } from '../calculators/kiwisaver';
import { computeRetirement, netWorthTrajectory, type KsProjectionOpts, type RetirementResult } from '../calculators/retirement';
import { computeProtection, type ProtectionResult } from '../calculators/insurance';
import { compareRefinance, fixedExpiryTimeline, type RefinanceComparison, type ExpiryTimelineItem } from '../calculators/refinance';
import { compareRevolvingStrategy, type RevolvingComparisonResult } from '../calculators/revolving';
import { netMonthlyFromSalary } from '../calculators/tax';
import { toMonthly } from '../domain/frequency';
import type { ScenarioState } from './apply';

export interface RuleContext {
  policy: LenderPolicy; // Blueprint modelling policy
  lenders: LenderPolicy[];
  tax: TaxTable;
  fhbCosts: CostAssumptions;
  kiwiSaver: KiwiSaverSettings;
  retirement: RetirementSettings;
  modelling: ModellingAssumptions;
  ownership: OwnershipCostAssumptions;
  cashback: CashbackAssumptions;
  ksWithdrawal: KiwiSaverWithdrawalWorkflow;
}

export interface Snapshot {
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
  actualNetIncomeMonthly: number;
  declaredSpendMonthly: number;
  actualRepaymentsMonthly: number;
  monthlySurplus: number;
  umi: number;
  maxLendingRange: { min: number; max: number };
  mortgageFreeYear: number | null;
  interestRemaining: number;
  kiwiSaverNow: number;
  kiwiSaverProjected: number;
  protectionIssues: number;
  usableEquity: number;
  portfolioLVR: number;
  retirementGap: number;
}

export interface CalculationResult {
  clientId: string;
  snapshot: Snapshot;
  servicing: ServicingResult;
  lenderComparison: LenderComparison;
  equity: EquityResult;
  fhb?: FhbResult;
  amortisation: {
    current: { schedule: AmortisationPoint[]; totalInterest: number; termYears: number; payoffYear: number; paidOff: boolean };
    blueprint: { schedule: AmortisationPoint[]; totalInterest: number; termYears: number; payoffYear: number; paidOff: boolean };
    extraMonthly: number;
  };
  investment?: InvestmentResult;
  kiwiSaverProjections: { low: KiwiSaverProjection; base: KiwiSaverProjection; high: KiwiSaverProjection }[];
  kiwiSaverNotes: KiwiSaverPositionNote[];
  retirement: RetirementResult;
  netWorthPath: { year: number; assets: number; debt: number; netWorth: number }[];
  protection: ProtectionResult;
  refinance?: RefinanceComparison;
  expiryTimeline: ExpiryTimelineItem[];
  revolving?: RevolvingComparisonResult;
  /** inflation assumption in force (scenario override or rule-set default) */
  inflation: number;
  /** the test rate the Blueprint modelling view used this scenario */
  effectiveStressRate: number;
  ruleSetIds: string[];
}

export function computeAll(state: ScenarioState, ctx: RuleContext): CalculationResult {
  const client = state.client;
  // Adviser-configurable test rate: overrides the Blueprint modelling policy
  // for this scenario. Bank profiles keep their own extracted rates.
  const policy: LenderPolicy = state.stressRateOverride !== undefined
    ? { ...ctx.policy, stressRate: state.stressRateOverride }
    : ctx.policy;
  const lenders = state.stressRateOverride !== undefined
    ? ctx.lenders.map((l) => (l.id === ctx.policy.id ? policy : l))
    : ctx.lenders;
  const servicing = computeServicing(client, policy, ctx.tax, state.servicingOpts);
  const lenderComparison = compareLenders(client, lenders, ctx.tax, state.servicingOpts);
  const equity = computeEquity(client, policy, ctx.modelling);

  // --- Amortisation: current path (actual repayments) vs Blueprint path
  const loanInputs = client.mortgages.map((m) => ({
    principal: m.balance,
    annualRate: m.rate,
    years: m.termRemainingYears,
    interestOnly: m.interestOnly,
    offsetBalance: m.offsetBalance ?? (state.revolving && m === client.mortgages[0] ? 0 : undefined),
  }));
  const current = combinedTrajectory(loanInputs, 0);
  const revolvingOffsetExtra = state.revolving ? (state.revolving.funded * (ctx.policy.stressRate * 0)) : 0; // offset handled in revolving module
  const blueprint = combinedTrajectory(loanInputs, state.extraRepaymentMonthly + revolvingOffsetExtra);

  // --- FHB
  let fhb: FhbResult | undefined;
  if (client.targetPurchase) {
    fhb = computeFhb(client.targetPurchase, policy, ctx.fhbCosts, {
      baseRate: state.rateAbsolute ?? client.modellingRate + state.rateDelta,
      bankMaxLoan: servicing.maxNewLending,
      termYears: state.loanTermYearsOverride,
      lemOverride: state.lowEquityMarginOverride,
      ownership: ctx.ownership,
      ownershipOverrides: state.ownershipCosts,
      cashback: ctx.cashback,
      cashbackOverride: state.cashbackOverride,
    });
  }

  // --- Investment (proposed purchase in this scenario)
  let investment: InvestmentResult | undefined;
  if (state.purchasedProperty && !state.purchasedProperty.ownerOccupied) {
    const p = state.purchasedProperty;
    investment = computeInvestment(
      {
        purchasePrice: p.price,
        depositCash: 0,
        depositEquity: Math.min(p.price * ctx.modelling.equityDepositRate, equity.totalUsableEquity),
        rate: state.rateAbsolute ?? client.modellingRate + state.rateDelta,
        termYears: 30,
        interestOnly: p.interestOnly ?? true,
        rentPerWeek: p.rentPerWeek ?? 0,
        ratesPerYear: Math.round(p.price * 0.0035),
        insurancePerYear: 1800,
      },
      policy,
      ctx.modelling,
    );
  }

  // --- KiwiSaver
  const horizonYears = Math.max(
    5,
    client.retirement.targetAge - Math.max(...client.applicants.map((a) => a.age)),
  );
  // First-home withdrawal: modelled by default for FHB accounts flagged with
  // firstHomeIntent when a purchase is on the table; adviser can force on/off.
  const withdrawalOn =
    state.kiwiSaverWithdrawal ??
    (client.clientType === 'fhb' && !!client.targetPurchase && client.targetPurchase.depositSources.kiwiSaver > 0);
  const ksTotalBalance = client.kiwiSaverAccounts.reduce((s, a) => s + a.balance.value, 0);
  const withdrawalFor = (accountId: string) => {
    if (!withdrawalOn || !client.targetPurchase) return undefined;
    const acc = client.kiwiSaverAccounts.find((a) => a.id === accountId);
    if (!acc || (!acc.firstHomeIntent && client.kiwiSaverAccounts.some((a) => a.firstHomeIntent))) return undefined;
    const share = ksTotalBalance > 0 ? acc.balance.value / ksTotalBalance : 0;
    return {
      year: 1,
      amount: client.targetPurchase.depositSources.kiwiSaver * share,
      keepMinimum: ctx.ksWithdrawal.minBalanceRetained,
    };
  };
  const ksOpts: KsProjectionOpts = {
    salaryGrowth: state.salaryGrowthOverride ?? 0,
    returnOverride: state.kiwiSaverReturnOverride,
    withdrawalFor,
  };
  const kiwiSaverProjections = client.kiwiSaverAccounts.map((a) => ({
    low: projectKiwiSaver(a, ctx.kiwiSaver, { mode: 'low', horizonYears, salaryGrowth: ksOpts.salaryGrowth, withdrawal: withdrawalFor(a.id) }),
    base: projectKiwiSaver(a, ctx.kiwiSaver, { mode: 'base', horizonYears, salaryGrowth: ksOpts.salaryGrowth, returnOverride: state.kiwiSaverReturnOverride, withdrawal: withdrawalFor(a.id) }),
    high: projectKiwiSaver(a, ctx.kiwiSaver, { mode: 'high', horizonYears, salaryGrowth: ksOpts.salaryGrowth, withdrawal: withdrawalFor(a.id) }),
  }));
  const kiwiSaverNotes = client.kiwiSaverAccounts.flatMap((a) => {
    const owner = client.applicants.find((ap) => ap.id === a.applicantId);
    return kiwiSaverPosition(a, owner?.age ?? 40, ctx.kiwiSaver);
  });

  // --- Retirement & net worth
  const retirementSettings = state.houseGrowthOverride
    ? { ...ctx.retirement, growth: { low: state.houseGrowthOverride, base: state.houseGrowthOverride, high: state.houseGrowthOverride } }
    : ctx.retirement;
  const retirement = computeRetirement(client, retirementSettings, ctx.kiwiSaver, {
    extraRepaymentMonthly: state.extraRepaymentMonthly,
    inflationOverride: state.inflationOverride,
    ks: ksOpts,
  });
  const netWorthPath = netWorthTrajectory(client, retirementSettings, ctx.kiwiSaver, {
    years: Math.max(horizonYears, 20),
    extraRepaymentMonthly: state.extraRepaymentMonthly,
    ks: ksOpts,
  });

  // --- Protection
  const protection = computeProtection(client, ctx.tax);

  // --- Refinance
  let refinance: RefinanceComparison | undefined;
  if (client.refinanceContext && client.mortgages.length > 0) {
    const rc = client.refinanceContext;
    refinance = compareRefinance(client.mortgages, {
      policy,
      modelling: ctx.modelling,
      proposedRate: rc.proposedRate,
      currentMarketRate: rc.currentMarketRate,
      cashbackClawbackOwed: rc.cashbackClawbackOwed,
      entityChange: rc.entityChange,
      taxSavingAnnual: rc.taxSavingAnnual,
    });
  }
  const expiryTimeline = fixedExpiryTimeline(client.mortgages);

  // --- Revolving credit comparison
  let revolving: RevolvingComparisonResult | undefined;
  if (state.revolving && client.mortgages.length > 0) {
    const main = [...client.mortgages].sort((a, b) => b.balance - a.balance)[0];
    revolving = compareRevolvingStrategy({
      loanBalance: main.balance,
      loanRate: main.rate,
      loanTermYears: main.termRemainingYears,
      extraRepaymentMonthly: state.extraRepaymentMonthly || state.revolving.monthlyTransfer || 1000,
      facilityLimit: state.revolving.limit,
      initialFacilityFunds: state.revolving.funded,
      monthlyTransfer: state.revolving.monthlyTransfer ?? 2000,
      floatingRate: main.rate + 0.015,
      disciplineAssumption: 0.8,
    });
  }

  // --- Snapshot
  const actualNetIncomeMonthly =
    client.applicants.reduce(
      (s, a) => s + a.incomes.reduce((t, i) => t + netMonthlyFromSalary(i.grossAnnual, i.kiwiSaverRate, ctx.tax, i.studentLoan).netMonthly, 0),
      0,
    ) +
    client.properties.reduce((s, p) => s + (p.use === 'investment' && p.rentPerWeek ? (p.rentPerWeek.value * 52) / 12 : 0), 0) +
    ((state.servicingOpts.boarderPerWeekOverride ?? client.boarderIncomePerWeek ?? 0) * 52) / 12;
  const declaredSpendMonthly = client.expenses.declaredMonthly.reduce((s, e) => s + e.amount, 0);
  const actualRepaymentsMonthly = client.mortgages.reduce((s, m) => s + toMonthly(m.repayment.amount, m.repayment.frequency), 0);
  const propertyValue = client.properties.reduce((s, p) => s + activeValuation(p).value, 0);
  const kiwiSaverNow = client.kiwiSaverAccounts.reduce((s, a) => s + a.balance.value, 0);
  const totalDebt = client.mortgages.reduce((s, m) => s + m.balance, 0) + client.otherDebts.reduce((s, d) => s + d.balance, 0);
  const totalAssets = propertyValue + kiwiSaverNow + client.cashSavings.value + state.soldPropertyProceeds;

  const snapshot: Snapshot = {
    netWorth: totalAssets - totalDebt,
    totalAssets,
    totalDebt,
    actualNetIncomeMonthly,
    declaredSpendMonthly,
    actualRepaymentsMonthly,
    monthlySurplus: actualNetIncomeMonthly - declaredSpendMonthly - actualRepaymentsMonthly - state.extraRepaymentMonthly,
    umi: servicing.umi,
    maxLendingRange: lenderComparison.range,
    mortgageFreeYear: client.mortgages.length > 0 && blueprint.paidOff ? blueprint.payoffYear : null,
    interestRemaining: blueprint.totalInterest,
    kiwiSaverNow,
    kiwiSaverProjected: kiwiSaverProjections.reduce((s, p) => s + p.base.atHorizon, 0),
    protectionIssues: protection.issues.filter((i) => i.severity === 'attention').length,
    usableEquity: equity.totalUsableEquity,
    portfolioLVR: equity.portfolioLVR,
    retirementGap: retirement.gap,
  };

  return {
    clientId: client.id,
    snapshot,
    servicing,
    lenderComparison,
    equity,
    fhb,
    amortisation: { current, blueprint, extraMonthly: state.extraRepaymentMonthly },
    investment,
    kiwiSaverProjections,
    kiwiSaverNotes,
    retirement,
    netWorthPath,
    protection,
    refinance,
    expiryTimeline,
    revolving,
    inflation: state.inflationOverride ?? ctx.retirement.inflation,
    effectiveStressRate: policy.stressRate,
    ruleSetIds: [
      ctx.policy.id,
      ...ctx.lenders.map((l) => l.id),
      ctx.tax.id,
      ctx.fhbCosts.id,
      ctx.kiwiSaver.id,
      ctx.retirement.id,
      ctx.modelling.id,
      ctx.ownership.id,
      ctx.cashback.id,
      ctx.ksWithdrawal.id,
    ],
  };
}
