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

// ---------------------------------------------------------------------------
// Benchmark vs actual: roll actual spending up into the lender's servicing
// buckets and flag abnormalities. This is the heart of the live-data story —
// the bank benchmarks a minimum; the statements say what really happens.

import type { LenderPolicy } from '../rules/types';

export interface BenchmarkRow {
  bucket: string;
  benchmarkMonthly: number;
  actualMonthly: number;
  delta: number; // actual − benchmark
  categories: SpendCategory[];
  flag?: { severity: 'info' | 'attention'; message: string };
}

export interface BenchmarkComparison {
  rows: BenchmarkRow[];
  benchmarkTotal: number;
  actualTotal: number;
  assessorView: string;
}

const BASELINE_CATEGORIES: SpendCategory[] = [
  'Food & groceries',
  'Eating out & takeaways',
  'Utilities & phone',
  'Health & personal care',
  'Entertainment & lifestyle',
  'Household & garden',
  'Subscriptions',
  'Other',
];
const VEHICLE_CATEGORIES: SpendCategory[] = ['Transport & fuel'];
const COMMITMENT_CATEGORIES: SpendCategory[] = ['Insurance', 'Rates', 'Childcare & education'];

export function benchmarkComparison(
  analysis: FeedAnalysis,
  client: Client,
  policy: LenderPolicy,
): BenchmarkComparison {
  const spend = (cats: SpendCategory[]) =>
    analysis.spendByCategory.filter((c) => cats.includes(c.category)).reduce((s, c) => s + c.monthlyAverage, 0);

  const bench = policy.expenseBenchmark;
  const baselineBenchmark = client.household.adults === 2 ? bench.couple : bench.single;
  const dependantsBenchmark = bench.perDependant * client.household.dependants;
  const vehiclesBenchmark = bench.perVehicle * client.household.vehicles;
  // dependant costs are spread through groceries etc. in real statements, so
  // baseline + dependants are compared as one bucket
  const baselineActual = spend(BASELINE_CATEGORIES);
  const vehiclesActual = spend(VEHICLE_CATEGORIES);
  const commitmentsActual = spend(COMMITMENT_CATEGORIES);
  const declaredCommitments = client.expenses.fixedCommitmentsMonthly.reduce((s, i) => s + i.amount, 0);

  const rows: BenchmarkRow[] = [
    {
      bucket: `Household living (baseline${client.household.dependants ? ' + dependants' : ''})`,
      benchmarkMonthly: baselineBenchmark + dependantsBenchmark,
      actualMonthly: baselineActual,
      delta: baselineActual - (baselineBenchmark + dependantsBenchmark),
      categories: BASELINE_CATEGORIES,
    },
    {
      bucket: `Vehicles × ${client.household.vehicles}`,
      benchmarkMonthly: vehiclesBenchmark,
      actualMonthly: vehiclesActual,
      delta: vehiclesActual - vehiclesBenchmark,
      categories: VEHICLE_CATEGORIES,
    },
    {
      bucket: 'Fixed commitments (insurance, rates, childcare)',
      benchmarkMonthly: declaredCommitments || commitmentsActual,
      actualMonthly: commitmentsActual,
      delta: commitmentsActual - (declaredCommitments || commitmentsActual),
      categories: COMMITMENT_CATEGORIES,
    },
  ];

  for (const row of rows) {
    if (row.benchmarkMonthly <= 0) continue;
    const ratio = row.actualMonthly / row.benchmarkMonthly;
    if (ratio > 1.3 && row.delta > 250) {
      row.flag = {
        severity: 'attention',
        message: `Actual runs ${Math.round((ratio - 1) * 100)}% (+$${Math.round(row.delta).toLocaleString()}/mo) above the benchmark — an assessor will use the statements, not the benchmark. Worth a conversation before any application.`,
      };
    } else if (ratio < 0.6 && row.benchmarkMonthly - row.actualMonthly > 250) {
      row.flag = {
        severity: 'info',
        message: `Actual runs well below the benchmark — the lender will still assess at the benchmark minimum, but the real surplus is stronger than the test implies.`,
      };
    }
  }

  const benchmarkTotal = rows.reduce((s, r) => s + r.benchmarkMonthly, 0);
  const actualTotal = rows.reduce((s, r) => s + r.actualMonthly, 0);
  return {
    rows,
    benchmarkTotal,
    actualTotal,
    assessorView:
      actualTotal > benchmarkTotal
        ? 'Statements exceed the benchmark — the assessor will use the higher, actual figure.'
        : 'Statements sit inside the benchmark — the assessor applies the benchmark minimum.',
  };
}

// ---------------------------------------------------------------------------
// Three-way expense table: AKAHU ACTUAL vs FACT FIND DECLARED vs BANK
// BENCHMARK per category. Three different concepts, never blended. The bank
// benchmarks a household *bucket*, not categories, so per-category benchmark
// figures are the bucket apportioned by fixed Blueprint comparison weights —
// labelled "comparison benchmark" in the UI for exactly that reason.

const BASELINE_WEIGHTS: Partial<Record<SpendCategory, number>> = {
  'Food & groceries': 0.42,
  'Eating out & takeaways': 0.12,
  'Utilities & phone': 0.16,
  'Health & personal care': 0.08,
  'Entertainment & lifestyle': 0.09,
  'Household & garden': 0.07,
  Subscriptions: 0.03,
  Other: 0.03,
};

export interface ThreeWayRow {
  category: string;
  akahuActualMonthly?: number;
  factFindMonthly?: number;
  benchmarkMonthly?: number;
  /** actual vs comparison benchmark, e.g. +0.82 = 82% above */
  differenceVsBenchmark?: number;
  status: 'ok' | 'review' | 'info';
  observation?: string;
  bucket: 'baseline' | 'vehicles' | 'commitments' | 'other';
}

export interface ThreeWayTable {
  rows: ThreeWayRow[];
  actualTotal: number;
  declaredTotal: number;
  benchmarkTotal: number;
  note: string;
}

export function threeWayExpenseTable(
  analysis: FeedAnalysis,
  client: Client,
  policy: LenderPolicy,
  netIncomeMonthly: number,
  opts: { excludedMonthlyByCategory?: Record<string, number> } = {},
): ThreeWayTable {
  const bench = policy.expenseBenchmark;
  const baselineBenchmark =
    (client.household.adults === 2 ? bench.couple : bench.single) + bench.perDependant * client.household.dependants;
  const declaredFor = (cats: SpendCategory[]) => {
    let total = 0;
    let found = false;
    for (const [re, cs] of DECLARED_MATCH) {
      if (cs.some((c) => cats.includes(c))) {
        const matches = client.expenses.declaredMonthly.filter((d) => re.test(d.category));
        if (matches.length) {
          found = true;
          total += matches.reduce((s, m) => s + m.amount, 0);
        }
      }
    }
    return found ? total : undefined;
  };

  const rows: ThreeWayRow[] = [];
  const excluded = opts.excludedMonthlyByCategory ?? {};
  for (const c of analysis.spendByCategory) {
    if (NON_SPEND_CATEGORIES.includes(c.category)) continue;
    const isBaseline = BASELINE_CATEGORIES.includes(c.category);
    const isVehicle = VEHICLE_CATEGORIES.includes(c.category);
    const isCommitment = COMMITMENT_CATEGORIES.includes(c.category);
    const actual = Math.max(0, c.monthlyAverage - (excluded[c.category] ?? 0));
    const benchmarkMonthly = isBaseline
      ? baselineBenchmark * (BASELINE_WEIGHTS[c.category] ?? 0.03)
      : isVehicle
        ? bench.perVehicle * client.household.vehicles || undefined
        : undefined;
    const diff = benchmarkMonthly && benchmarkMonthly > 0 ? actual / benchmarkMonthly - 1 : undefined;
    const pctOfNet = netIncomeMonthly > 0 ? actual / netIncomeMonthly : 0;
    let status: ThreeWayRow['status'] = 'ok';
    let observation: string | undefined;
    if (diff !== undefined && diff > 0.3 && actual - (benchmarkMonthly ?? 0) > 150) {
      status = 'review';
      observation = `${c.category} represents ${(pctOfNet * 100).toFixed(1)}% of household net income and is materially above the current comparison benchmark.`;
    } else if (c.declaredMonthly !== undefined && actual > c.declaredMonthly * 1.5 && actual - c.declaredMonthly > 150) {
      status = 'review';
      observation = `The statements show ${Math.round((actual / Math.max(1, c.declaredMonthly) - 1) * 100)}% more than the Fact Find declares for this category — lenders reconcile statements against the application.`;
    }
    if (c.category === 'Childcare & education' && actual > 200) {
      const endEvent = client.financialEvents.find((e) => e.kind === 'childcare-end');
      if (endEvent) {
        status = status === 'review' ? 'review' : 'info';
        observation = `Childcare is currently a significant fixed commitment, but the planned end date in ${endEvent.startDate.slice(0, 4)} materially changes future cashflow.`;
      }
    }
    rows.push({
      category: c.category,
      akahuActualMonthly: actual,
      factFindMonthly: c.declaredMonthly,
      benchmarkMonthly,
      differenceVsBenchmark: diff,
      status,
      observation,
      bucket: isBaseline ? 'baseline' : isVehicle ? 'vehicles' : isCommitment ? 'commitments' : 'other',
    });
  }
  rows.sort((a, b) => (b.akahuActualMonthly ?? 0) - (a.akahuActualMonthly ?? 0));

  return {
    rows,
    actualTotal: rows.reduce((s, r) => s + (r.akahuActualMonthly ?? 0), 0),
    declaredTotal: client.expenses.declaredMonthly.reduce((s, d) => s + d.amount, 0),
    benchmarkTotal: baselineBenchmark + bench.perVehicle * client.household.vehicles,
    note:
      'Three separate concepts: what the statements show (Akahu actual), what the client declared (Fact Find), and the lender minimum (comparison benchmark — the bank benchmarks the household bucket; per-category figures apportion it by fixed comparison weights).',
  };
}

// ---------------------------------------------------------------------------
// "Items worth checking" — meaningful one-off transactions that must not be
// silently treated as permanent monthly spending.

export interface OutlierTransaction {
  id: string;
  merchant: string;
  date: string;
  amount: number; // positive spend value
  likelyCategory: SpendCategory;
  recurring: 'yes' | 'no' | 'unknown';
  reason: string;
}

const ONE_OFF_HINTS: [RegExp, string][] = [
  [/air ?(nz|new zealand)|jetstar|qantas|flight/i, 'Flights'],
  [/airbnb|hotel|accor|novotel|sudima/i, 'Accommodation'],
  [/harvey norman|noel leeming|pb tech|jb hi-?fi/i, 'Large electronics or furniture purchase'],
  [/furniture|freedom|nood|target furniture/i, 'Furniture'],
  [/mechanic|automotive|vtnz|aa auto|panel ?beater/i, 'Vehicle repair'],
  [/hospital|surgery|dental|specialist/i, 'Medical payment'],
  [/wedding|event hire/i, 'Wedding or event'],
];

export function detectOutliers(snapshot: FeedSnapshot, opts: { minAmount?: number } = {}): OutlierTransaction[] {
  const minAmount = opts.minAmount ?? 400;
  const groups = new Map<string, FeedTransaction[]>();
  for (const t of snapshot.transactions) {
    if (t.amount >= 0) continue;
    groups.set(normaliseMerchant(t), [...(groups.get(normaliseMerchant(t)) ?? []), t]);
  }
  const out: OutlierTransaction[] = [];
  for (const t of snapshot.transactions) {
    if (t.amount >= 0) continue;
    const spend = -t.amount;
    const cat = categoriseTransaction(t);
    if (cat === 'Debt repayments' || cat === 'Transfers & savings' || cat === 'Rates') continue;
    const peers = groups.get(normaliseMerchant(t)) ?? [t];
    const merchantLabel = t.merchant ?? t.description;
    const hint = ONE_OFF_HINTS.find(([re]) => re.test(merchantLabel));
    const infrequent = peers.length <= 2;
    const others = peers.filter((p) => p.id !== t.id).map((p) => -p.amount);
    const typical = others.length ? others.reduce((s, a) => s + a, 0) / others.length : 0;
    const sizeOutlier = spend >= minAmount && (infrequent || (typical > 0 && spend > typical * 3));
    if (!hint && !sizeOutlier) continue;
    if (spend < (hint ? 150 : minAmount)) continue;
    out.push({
      id: t.id,
      merchant: merchantLabel,
      date: t.date,
      amount: spend,
      likelyCategory: cat,
      recurring: peers.length >= 3 ? 'yes' : peers.length === 1 ? 'no' : 'unknown',
      reason: hint
        ? hint[1]
        : infrequent
          ? 'Large amount from a merchant seen once or twice in the window'
          : 'Well above this merchant’s typical transaction size',
    });
  }
  out.sort((a, b) => b.amount - a.amount);
  // de-duplicate: keep the largest few per merchant
  const seen = new Map<string, number>();
  return out.filter((o) => {
    const k = o.merchant.toLowerCase();
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n < 2;
  }).slice(0, 12);
}

/** Actual repayments seen in the feed vs recorded loan repayments. */
export function repaymentCrossCheck(analysis: FeedAnalysis, client: Client): { feedMonthly: number; recordedMonthly: number } {
  return {
    feedMonthly: analysis.debtRepaymentsMonthly,
    recordedMonthly: client.mortgages.reduce((s, m) => s + toMonthly(m.repayment.amount, m.repayment.frequency), 0),
  };
}
