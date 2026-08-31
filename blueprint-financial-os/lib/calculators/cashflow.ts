// Deterministic analysis of a normalised bank-feed snapshot: income
// detection, actual spending by category, recurring commitments, and
// reconciliation against what the client declared and what the lender
// benchmarks assume. No AI, no guesses — every figure traceable to
// transactions in the snapshot.

import type { FeedSnapshot, FeedTransaction } from '../data-sources/types';
import { categoriseTransaction, NON_SPEND_CATEGORIES, type SpendCategory } from '../data-sources/categorise';
import type { AuditLine, Client } from '../domain/types';
import { toMonthly } from '../domain/frequency';

export interface DetectedIncomeStream {
  label: string;
  monthlyAverage: number;
  occurrences: number;
  cadence: 'weekly' | 'fortnightly' | 'monthly' | 'irregular';
  kind: 'salary-like' | 'rent-like' | 'irregular';
}

export interface CategorySpend {
  category: SpendCategory;
  monthlyAverage: number;
  transactionCount: number;
  declaredMonthly?: number; // matched Fact Find category, if any
  varianceVsDeclared?: number; // actual − declared
  flag?: string;
}

export interface RecurringCommitment {
  merchant: string;
  monthlyAmount: number;
  occurrences: number;
  category: SpendCategory;
}

export interface MortgageReconciliation {
  accountName: string;
  bank: string;
  feedBalance: number;
  recordedBalance?: number;
  difference?: number;
  feedRate?: number;
  recordedRate?: number;
  matchedLoanId?: string;
}

export interface FeedAnalysis {
  provider: string;
  syncedAt: string;
  monthsCovered: number;
  incomeStreams: DetectedIncomeStream[];
  totalIncomeMonthly: number;
  spendByCategory: CategorySpend[];
  totalSpendMonthly: number; // lifestyle spend (excl. transfers/debt)
  debtRepaymentsMonthly: number;
  savingsTransfersMonthly: number;
  surplusMonthly: number;
  recurring: RecurringCommitment[];
  mortgages: MortgageReconciliation[];
  declaredSpendMonthly: number;
  declaredVarianceMonthly: number; // actual − declared
  audit: AuditLine[];
}

// Fact Find category → feed categories that should roll up against it.
const DECLARED_MATCH: [RegExp, SpendCategory[]][] = [
  [/food|grocer/i, ['Food & groceries', 'Eating out & takeaways']],
  [/utilit|phone/i, ['Utilities & phone']],
  [/transport|fuel/i, ['Transport & fuel']],
  [/insurance/i, ['Insurance']],
  [/entertain|holiday/i, ['Entertainment & lifestyle']],
  [/personal|clothing|care/i, ['Health & personal care']],
  [/household|garden/i, ['Household & garden']],
  [/kids|school|education|childcare/i, ['Childcare & education']],
  [/subscription/i, ['Subscriptions']],
];

function cadenceOf(dates: string[]): DetectedIncomeStream['cadence'] {
  if (dates.length < 3) return 'irregular';
  const ds = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  const gaps = ds.slice(1).map((t, i) => (t - ds[i]) / 86_400_000);
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const regular = gaps.every((g) => Math.abs(g - avg) <= 3);
  if (!regular) return 'irregular';
  if (avg <= 9) return 'weekly';
  if (avg <= 18) return 'fortnightly';
  if (avg <= 35) return 'monthly';
  return 'irregular';
}

const normaliseMerchant = (t: FeedTransaction) =>
  (t.merchant ?? t.description).toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);

export function analyseFeed(snapshot: FeedSnapshot, client: Client): FeedAnalysis {
  const months = Math.max(1, snapshot.monthsCovered);

  // --- Income detection: group credits by normalised counterparty ----------
  const creditGroups = new Map<string, FeedTransaction[]>();
  for (const t of snapshot.transactions) {
    if (t.amount <= 0) continue;
    const key = normaliseMerchant(t);
    creditGroups.set(key, [...(creditGroups.get(key) ?? []), t]);
  }
  const incomeStreams: DetectedIncomeStream[] = [];
  for (const [, txs] of creditGroups) {
    const total = txs.reduce((s, t) => s + t.amount, 0);
    const monthlyAverage = total / months;
    if (monthlyAverage < 50) continue; // ignore noise credits
    const cadence = cadenceOf(txs.map((t) => t.date));
    const label = txs[0].merchant ?? txs[0].description;
    const rentLike = /rent|tenancy|property m|bond/i.test(label);
    incomeStreams.push({
      label,
      monthlyAverage,
      occurrences: txs.length,
      cadence,
      kind: rentLike ? 'rent-like' : cadence === 'irregular' ? 'irregular' : 'salary-like',
    });
  }
  incomeStreams.sort((a, b) => b.monthlyAverage - a.monthlyAverage);
  const totalIncomeMonthly = incomeStreams.reduce((s, i) => s + i.monthlyAverage, 0);

  // --- Spending by category ------------------------------------------------
  const byCat = new Map<SpendCategory, { total: number; count: number }>();
  for (const t of snapshot.transactions) {
    if (t.amount >= 0) continue;
    const cat = categoriseTransaction(t);
    const cur = byCat.get(cat) ?? { total: 0, count: 0 };
    cur.total += -t.amount;
    cur.count += 1;
    byCat.set(cat, cur);
  }

  const declaredLookup = client.expenses.declaredMonthly;
  const matchedDeclared = new Set<string>();
  const spendByCategory: CategorySpend[] = [...byCat.entries()]
    .map(([category, { total, count }]) => {
      const monthlyAverage = total / months;
      let declaredMonthly: number | undefined;
      for (const [re, cats] of DECLARED_MATCH) {
        if (cats.includes(category)) {
          const matches = declaredLookup.filter((d) => re.test(d.category));
          if (matches.length) {
            // several feed categories can share one declared line — split it
            // by matching the declared line once and comparing at rollup level
            declaredMonthly = matches.reduce((s, m) => s + m.amount, 0) / cats.length;
            matches.forEach((m) => matchedDeclared.add(m.category));
          }
        }
      }
      const varianceVsDeclared = declaredMonthly !== undefined ? monthlyAverage - declaredMonthly : undefined;
      let flag: string | undefined;
      if (declaredMonthly !== undefined && declaredMonthly > 0 && monthlyAverage > declaredMonthly * 1.5 && monthlyAverage - declaredMonthly > 150) {
        flag = `Actual spend runs well above the declared figure — lenders reconcile statements against the application, so declare what the statements show.`;
      }
      return { category, monthlyAverage, transactionCount: count, declaredMonthly, varianceVsDeclared, flag };
    })
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage);

  const lifestyle = spendByCategory.filter((c) => !NON_SPEND_CATEGORIES.includes(c.category));
  const totalSpendMonthly = lifestyle.reduce((s, c) => s + c.monthlyAverage, 0);
  const debtRepaymentsMonthly = spendByCategory.find((c) => c.category === 'Debt repayments')?.monthlyAverage ?? 0;
  const savingsTransfersMonthly = spendByCategory.find((c) => c.category === 'Transfers & savings')?.monthlyAverage ?? 0;

  // --- Recurring commitments ----------------------------------------------
  const debitGroups = new Map<string, FeedTransaction[]>();
  for (const t of snapshot.transactions) {
    if (t.amount >= 0) continue;
    const key = normaliseMerchant(t);
    debitGroups.set(key, [...(debitGroups.get(key) ?? []), t]);
  }
  const recurring: RecurringCommitment[] = [];
  for (const [, txs] of debitGroups) {
    if (txs.length < Math.max(2, months - 1)) continue;
    const amounts = txs.map((t) => -t.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const steady = amounts.every((a) => Math.abs(a - avg) <= Math.max(2, avg * 0.15));
    if (!steady) continue;
    const cat = categoriseTransaction(txs[0]);
    if (cat === 'Debt repayments' || cat === 'Transfers & savings') continue;
    recurring.push({
      merchant: txs[0].merchant ?? txs[0].description,
      monthlyAmount: (avg * txs.length) / months,
      occurrences: txs.length,
      category: cat,
    });
  }
  recurring.sort((a, b) => b.monthlyAmount - a.monthlyAmount);

  // --- Mortgage reconciliation --------------------------------------------
  const mortgages: MortgageReconciliation[] = snapshot.accounts
    .filter((a) => a.type === 'mortgage' || a.type === 'loan')
    .map((a) => {
      const feedBalance = Math.abs(a.balance);
      // match to the recorded loan with the closest balance
      const candidates = [...client.mortgages].sort(
        (x, y) => Math.abs(x.balance - feedBalance) - Math.abs(y.balance - feedBalance),
      );
      const match = candidates[0];
      const matched = match && Math.abs(match.balance - feedBalance) < Math.max(20_000, match.balance * 0.1);
      return {
        accountName: a.name,
        bank: a.bank,
        feedBalance,
        recordedBalance: matched ? match.balance : undefined,
        difference: matched ? feedBalance - match.balance : undefined,
        feedRate: a.loanDetails?.interestRate,
        recordedRate: matched ? match.rate : undefined,
        matchedLoanId: matched ? match.id : undefined,
      };
    });

  const declaredSpendMonthly = declaredLookup.reduce((s, d) => s + d.amount, 0);
  const surplusMonthly = totalIncomeMonthly - totalSpendMonthly - debtRepaymentsMonthly;

  return {
    provider: snapshot.providerLabel,
    syncedAt: snapshot.syncedAt,
    monthsCovered: snapshot.monthsCovered,
    incomeStreams,
    totalIncomeMonthly,
    spendByCategory,
    totalSpendMonthly,
    debtRepaymentsMonthly,
    savingsTransfersMonthly,
    surplusMonthly,
    recurring,
    mortgages,
    declaredSpendMonthly,
    declaredVarianceMonthly: totalSpendMonthly - declaredSpendMonthly,
    audit: [
      { label: `Transactions analysed (${snapshot.monthsCovered} months)`, value: snapshot.transactions.length, format: 'number' },
      { label: 'Detected income / month', value: totalIncomeMonthly, format: 'currency' },
      { label: 'Actual lifestyle spending / month', value: -totalSpendMonthly, format: 'currency' },
      { label: 'Debt repayments seen / month', value: -debtRepaymentsMonthly, format: 'currency' },
      { label: 'Savings & transfers / month', value: -savingsTransfersMonthly, format: 'currency' },
      { label: 'Observed surplus / month', value: surplusMonthly, format: 'currency' },
      { label: 'Declared spending (Fact Find)', value: -declaredSpendMonthly, format: 'currency', note: 'Compared like-for-like where categories match.' },
    ],
  };
}

/** Actual repayments seen in the feed vs recorded loan repayments. */
export function repaymentCrossCheck(analysis: FeedAnalysis, client: Client): { feedMonthly: number; recordedMonthly: number } {
  return {
    feedMonthly: analysis.debtRepaymentsMonthly,
    recordedMonthly: client.mortgages.reduce((s, m) => s + toMonthly(m.repayment.amount, m.repayment.frequency), 0),
  };
}
