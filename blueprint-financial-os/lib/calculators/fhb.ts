import type { AuditLine, TargetPurchase } from '../domain/types';
import type { CostAssumptions, LenderPolicy } from '../rules/types';
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
}

export interface FhbResult {
  totalDeposit: number;
  depositBreakdown: { label: string; amount: number }[];
  purchasePrice: number;
  loan: number;
  depositPercent: number;
  lvr: number;
  lowEquityMargin: number;
  baseRate: number;
  effectiveRate: number;
  repaymentMonthly: number;
  repaymentFortnightly: number;
  tiers: DepositTier[];
  maxPurchaseAtDeposit: (pct: number) => number;
  upfrontCosts: {
    items: CostAssumptions['items'];
    total: number;
    byStage: Record<string, number>;
  };
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
  },
): FhbResult {
  const term = opts.termYears ?? policy.maxTermYears;
  const d = target.depositSources;
  const depositBreakdown = [
    { label: 'KiwiSaver (first-home withdrawal)', amount: d.kiwiSaver },
    { label: 'Cash savings', amount: d.savings },
    ...(d.gift > 0 ? [{ label: 'Family gift', amount: d.gift }] : []),
    ...(d.other > 0 ? [{ label: 'Other', amount: d.other }] : []),
  ];
  const totalDeposit = d.kiwiSaver + d.savings + d.gift + d.other;

  const price = target.price;
  const loan = Math.max(0, price - totalDeposit);
  const lvr = price > 0 ? loan / price : 0;
  const lem = lowEquityMarginFor(lvr, policy);
  const effectiveRate = opts.baseRate + lem;
  const repaymentMonthly = pmt(effectiveRate / 12, term * 12, loan);
  const repaymentFortnightly = pmt(effectiveRate / 26, term * 26, loan);

  const tiers: DepositTier[] = [0.05, 0.1, 0.15, 0.2].map((pct) => {
    const tierLoan = price * (1 - pct);
    const tierLem = lowEquityMarginFor(1 - pct, policy);
    const rate = opts.baseRate + tierLem;
    return {
      depositPercent: pct,
      depositRequired: price * pct,
      loan: tierLoan,
      lvr: 1 - pct,
      lowEquityMargin: tierLem,
      effectiveRate: rate,
      repaymentMonthly: pmt(rate / 12, term * 12, tierLoan),
      repaymentFortnightly: pmt(rate / 26, term * 26, tierLoan),
      achievable: totalDeposit >= price * pct,
    };
  });

  const byStage: Record<string, number> = {};
  for (const item of costs.items) byStage[item.stage] = (byStage[item.stage] ?? 0) + item.amount;

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
    baseRate: opts.baseRate,
    effectiveRate,
    repaymentMonthly,
    repaymentFortnightly,
    tiers,
    maxPurchaseAtDeposit: (pct: number) => (pct > 0 ? totalDeposit / pct : 0),
    upfrontCosts: {
      items: costs.items,
      total: costs.items.reduce((s, i) => s + i.amount, 0),
      byStage,
    },
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
        note: lem > 0 ? 'Charged because the deposit is under 20%. Falls away as the LVR drops below each band.' : 'No margin — deposit is 20% or more.',
      },
      { label: `Effective rate (base ${(opts.baseRate * 100).toFixed(2)}% + margin)`, value: effectiveRate, format: 'percent' },
      { label: `Repayment (${term}y P&I, monthly)`, value: repaymentMonthly, format: 'currency' },
    ],
  };
}
