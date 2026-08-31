import type { AuditLine, TargetPurchase } from '../domain/types';
import type { CashbackAssumptions, CostAssumptions, LenderPolicy, OwnershipCostAssumptions } from '../rules/types';
import { pmt } from './finance';

export interface DepositTier {
  depositPercent: number;
  depositRequired: number;
  loan: number;
  lvr: number;
  lowEquityMargin: number;
  effectiveRate: number;
  repaymentMonthly: number;
  repaymentFortnightly: number;
  achievable: boolean; // with the client's available deposit
  /** extra cash/gift needed to unlock this tier (0 when achievable) */
  additionalRequired: number;
  /** cash left over after funding this tier's deposit from available funds */
  cashBufferRemaining: number;
}

export interface OwnershipCostBlock {
  mortgageMonthly: number;
  ratesMonthly: number;
  insuranceMonthly: number;
  otherMonthly: number;
  totalMonthly: number;
}

export interface CashbackBlock {
  amount: number;
  retentionMonths: number;
  clawbackMethod: 'pro-rata' | 'full' | 'none';
  paymentTiming: string;
  eligibilityNote: string;
  /** clawback owed if the loan is repaid/refinanced at each milestone */
  clawbackTimeline: { month: number; owed: number }[];
}

export interface FhbResult {
  totalDeposit: number;
  depositBreakdown: { label: string; amount: number }[];
  purchasePrice: number;
  loan: number;
  depositPercent: number;
  lvr: number;
  lowEquityMargin: number;
  lowEquityMarginIsOverride: boolean;
  baseRate: number;
  effectiveRate: number;
  termYears: number;
  repaymentMonthly: number;
  repaymentFortnightly: number;
  repaymentWeekly: number;
  tiers: DepositTier[];
  maxPurchaseAtDeposit: (pct: number) => number;
  upfrontCosts: {
    items: CostAssumptions['items'];
    total: number;
    byStage: Record<string, number>;
  };
  ownershipCosts: OwnershipCostBlock;
  cashback: CashbackBlock;
  /** share of the deposit that depends on the KiwiSaver withdrawal */
  kiwiSaverShareOfDeposit: number;
  comfortable: {
    bankMaxLoan: number;
    bankMaxPurchase: number;
    comfortableLoan: number;
    comfortablePurchase: number;
    selectedLoan: number;
    selectedPurchase: number;
  };
  audit: AuditLine[];
}

export function lowEquityMarginFor(lvr: number, policy: LenderPolicy): number {
  for (const band of policy.lowEquityMargins) {
    if (lvr > band.lvrFrom && lvr <= band.lvrTo) return band.margin;
  }
  return 0;
}

export function computeFhb(
  target: TargetPurchase,
  policy: LenderPolicy,
  costs: CostAssumptions,
  opts: {
    baseRate: number;
    termYears?: number;
    bankMaxLoan: number; // from servicing
    comfortableUmiBuffer?: number;
    /** adviser override for the low-equity margin (undefined = policy bands) */
    lemOverride?: number;
    ownership?: OwnershipCostAssumptions;
    ownershipOverrides?: { ratesMonthly?: number; insuranceMonthly?: number; otherMonthly?: number };
    cashback?: CashbackAssumptions;
    cashbackOverride?: { amount: number; retentionMonths?: number };
  },
): FhbResult {
  const term = opts.termYears ?? policy.maxTermYears;
  const d = target.depositSources;
  const depositBreakdown = [
    { label: 'KiwiSaver (first-home withdrawal)', amount: d.kiwiSaver },
    { label: 'Cash savings', amount: d.savings },
    ...(d.gift > 0 ? [{ label: 'Family gift', amount: d.gift }] : []),
    ...(d.other > 0 ? [{ label: 'Other funds', amount: d.other }] : []),
  ];
  const totalDeposit = d.kiwiSaver + d.savings + d.gift + d.other;

  const price = target.price;
  const loan = Math.max(0, price - totalDeposit);
  const lvr = price > 0 ? loan / price : 0;
  const lem = opts.lemOverride ?? lowEquityMarginFor(lvr, policy);
  const effectiveRate = opts.baseRate + lem;
  const repaymentMonthly = pmt(effectiveRate / 12, term * 12, loan);
  const repaymentFortnightly = pmt(effectiveRate / 26, term * 26, loan);
  const repaymentWeekly = pmt(effectiveRate / 52, term * 52, loan);

  const tiers: DepositTier[] = [0.05, 0.1, 0.15, 0.2].map((pct) => {
    const tierLoan = price * (1 - pct);
    const tierLem = opts.lemOverride ?? lowEquityMarginFor(1 - pct, policy);
    const rate = opts.baseRate + tierLem;
    const required = price * pct;
    return {
      depositPercent: pct,
      depositRequired: required,
      loan: tierLoan,
      lvr: 1 - pct,
      lowEquityMargin: tierLem,
      effectiveRate: rate,
      repaymentMonthly: pmt(rate / 12, term * 12, tierLoan),
      repaymentFortnightly: pmt(rate / 26, term * 26, tierLoan),
      achievable: totalDeposit >= required,
      additionalRequired: Math.max(0, required - totalDeposit),
      cashBufferRemaining: Math.max(0, totalDeposit - required) + d.keepAsBuffer,
    };
  });

  const byStage: Record<string, number> = {};
  for (const item of costs.items) byStage[item.stage] = (byStage[item.stage] ?? 0) + item.amount;

  const ratesMonthly = opts.ownershipOverrides?.ratesMonthly ?? opts.ownership?.ratesMonthly ?? 350;
  const insuranceMonthly = opts.ownershipOverrides?.insuranceMonthly ?? opts.ownership?.insuranceMonthly ?? 150;
  const otherMonthly = opts.ownershipOverrides?.otherMonthly ?? opts.ownership?.otherMonthly ?? 0;
  const ownershipCosts: OwnershipCostBlock = {
    mortgageMonthly: repaymentMonthly,
    ratesMonthly,
    insuranceMonthly,
    otherMonthly,
    totalMonthly: repaymentMonthly + ratesMonthly + insuranceMonthly + otherMonthly,
  };

  const cbAmount = opts.cashbackOverride?.amount ?? opts.cashback?.amount ?? 0;
  const cbRetention = opts.cashbackOverride?.retentionMonths ?? opts.cashback?.retentionMonths ?? 36;
  const cbMethod = opts.cashback?.clawbackMethod ?? 'pro-rata';
  const clawbackTimeline = [6, 12, 18, 24, 30, 36, 48]
    .filter((m) => m <= Math.max(cbRetention, 6))
    .map((month) => ({
      month,
      owed:
        cbMethod === 'none' || month >= cbRetention
          ? 0
          : cbMethod === 'full'
            ? cbAmount
            : Math.round((cbAmount * (cbRetention - month)) / cbRetention),
    }));

  const bankMaxLoan = opts.bankMaxLoan;
  const comfortableLoan = Math.min(bankMaxLoan * 0.9, loan > 0 ? loan : bankMaxLoan * 0.9);

  return {
    totalDeposit,
    depositBreakdown,
    purchasePrice: price,
    loan,
    depositPercent: price > 0 ? totalDeposit / price : 0,
    lvr,
    lowEquityMargin: lem,
    lowEquityMarginIsOverride: opts.lemOverride !== undefined,
    baseRate: opts.baseRate,
    effectiveRate,
    termYears: term,
    repaymentMonthly,
    repaymentFortnightly,
    repaymentWeekly,
    tiers,
    maxPurchaseAtDeposit: (pct: number) => (pct > 0 ? totalDeposit / pct : 0),
    upfrontCosts: {
      items: costs.items,
      total: costs.items.reduce((s, i) => s + i.amount, 0),
      byStage,
    },
    ownershipCosts,
    cashback: {
      amount: cbAmount,
      retentionMonths: cbRetention,
      clawbackMethod: cbMethod,
      paymentTiming: opts.cashback?.paymentTiming ?? 'Paid around settlement, according to lender terms',
      eligibilityNote: opts.cashback?.eligibilityNote ?? 'Lender, application and campaign specific — confirm at approval.',
      clawbackTimeline,
    },
    kiwiSaverShareOfDeposit: totalDeposit > 0 ? d.kiwiSaver / totalDeposit : 0,
    comfortable: {
      bankMaxLoan,
      bankMaxPurchase: bankMaxLoan + totalDeposit,
      comfortableLoan,
      comfortablePurchase: comfortableLoan + totalDeposit,
      selectedLoan: loan,
      selectedPurchase: price,
    },
    audit: [
      { label: 'Purchase price', value: price, format: 'currency' },
      { label: 'Total deposit', value: -totalDeposit, format: 'currency' },
      { label: 'Loan required', value: loan, format: 'currency' },
      { label: 'LVR', value: lvr, format: 'percent' },
      {
        label: 'Low-equity margin',
        value: lem,
        format: 'percent',
        note:
          opts.lemOverride !== undefined
            ? 'Adviser-entered margin override for this scenario.'
            : lem > 0
              ? 'Charged because the deposit is under 20%. Falls away as the LVR drops below each band.'
              : 'No margin — deposit is 20% or more.',
      },
      { label: `Effective rate (base ${(opts.baseRate * 100).toFixed(2)}% + margin)`, value: effectiveRate, format: 'percent' },
      { label: `Repayment (${term}y P&I, monthly)`, value: repaymentMonthly, format: 'currency' },
      { label: 'Rates assumption', value: ratesMonthly, format: 'currency', note: 'per month — editable assumption' },
      { label: 'Home + contents insurance assumption', value: insuranceMonthly, format: 'currency', note: 'per month — editable assumption' },
      { label: 'Total cost of ownership', value: ownershipCosts.totalMonthly, format: 'currency', note: 'per month — mortgage + rates + insurance' },
    ],
  };
}
