// Deterministic demo bank feed. Generates ~3 months of realistic, seeded
// transactions per demo client so the Live Data layer works end-to-end
// without Akahu credentials. Deliberate divergences from the Fact Find are
// built in (e.g. actual food spend vs a declared $100/mo) because surfacing
// exactly that gap is the point of the Expense Intelligence screen.

import type { Client } from '../domain/types';
import { toMonthly } from '../domain/frequency';
import type { FeedAccount, FeedSnapshot, FeedTransaction } from './types';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SpendPlan {
  merchant: string;
  category?: string;
  monthly: number;
  timesPerMonth: number;
  jitter?: number; // 0..1 amount variance
}

const MONTHS = 3;
const END = new Date('2026-08-28');

function* datesFor(times: number, monthOffset: number, rnd: () => number): Generator<string> {
  for (let i = 0; i < times; i++) {
    const d = new Date(END);
    d.setMonth(d.getMonth() - monthOffset);
    d.setDate(1 + Math.floor(rnd() * 27));
    yield d.toISOString().slice(0, 10);
  }
}

function buildTransactions(
  plans: SpendPlan[],
  accountId: string,
  rnd: () => number,
  sign: -1 | 1,
): FeedTransaction[] {
  const txs: FeedTransaction[] = [];
  let n = 0;
  for (const p of plans) {
    for (let m = 0; m < MONTHS; m++) {
      const per = p.monthly / p.timesPerMonth;
      for (const date of datesFor(p.timesPerMonth, m, rnd)) {
        const jitter = 1 + (rnd() - 0.5) * 2 * (p.jitter ?? 0.15);
        txs.push({
          id: `${accountId}-t${++n}`,
          accountId,
          date,
          description: p.merchant,
          merchant: p.merchant,
          amount: Math.round(per * jitter * sign * 100) / 100,
          providerCategory: p.category,
        });
      }
    }
  }
  return txs;
}

/** Regular pay credits at a realistic cadence. */
function payCredits(label: string, netMonthly: number, cadence: 'fortnightly' | 'monthly', accountId: string, startDay: number): FeedTransaction[] {
  const txs: FeedTransaction[] = [];
  const per = cadence === 'fortnightly' ? (netMonthly * 12) / 26 : netMonthly;
  const stepDays = cadence === 'fortnightly' ? 14 : 30.44;
  const count = cadence === 'fortnightly' ? 7 : 3; // ≈ 3 months
  for (let i = 0; i < count; i++) {
    const d = new Date(END);
    d.setDate(d.getDate() - Math.round(i * stepDays) - startDay);
    txs.push({
      id: `${accountId}-pay-${label.replace(/\W/g, '')}-${i}`,
      accountId,
      date: d.toISOString().slice(0, 10),
      description: `${label}`,
      merchant: label,
      amount: Math.round(per * 100) / 100,
    });
  }
  return txs;
}

const LIFESTYLE_BASE: SpendPlan[] = [
  { merchant: 'Pak n Save', monthly: 780, timesPerMonth: 5, jitter: 0.25 },
  { merchant: 'Countdown', monthly: 420, timesPerMonth: 4, jitter: 0.3 },
  { merchant: 'Uber Eats', monthly: 180, timesPerMonth: 3, jitter: 0.4 },
  { merchant: 'Local Cafe', monthly: 140, timesPerMonth: 6, jitter: 0.3 },
  { merchant: 'Z Energy', monthly: 320, timesPerMonth: 3, jitter: 0.2 },
  { merchant: 'Mercury Energy', category: 'Utilities', monthly: 260, timesPerMonth: 1, jitter: 0.1 },
  { merchant: 'One NZ', category: 'Utilities', monthly: 130, timesPerMonth: 1, jitter: 0.02 },
  { merchant: 'Netflix', category: 'Subscriptions', monthly: 23, timesPerMonth: 1, jitter: 0 },
  { merchant: 'Spotify', category: 'Subscriptions', monthly: 15, timesPerMonth: 1, jitter: 0 },
  { merchant: 'CityFitness', category: 'Subscriptions', monthly: 60, timesPerMonth: 1, jitter: 0 },
  { merchant: 'Chemist Warehouse', monthly: 90, timesPerMonth: 2, jitter: 0.4 },
  { merchant: 'Kmart', monthly: 120, timesPerMonth: 2, jitter: 0.5 },
  { merchant: 'Bunnings', monthly: 110, timesPerMonth: 1, jitter: 0.6 },
];

function feedFor(client: Client, seed: number): FeedSnapshot {
  const rnd = mulberry32(seed);
  const accounts: FeedAccount[] = [
    { id: 'acc-txn', name: 'Everyday account', bank: 'Demo Bank', type: 'transaction', balance: 4820 },
    { id: 'acc-sav', name: 'Savings', bank: 'Demo Bank', type: 'savings', balance: client.cashSavings.value },
  ];
  const txs: FeedTransaction[] = [];

  // Income credits from the actual profile (net monthly ≈ engine's view)
  const netFactor = 0.75; // rough net-of-tax for credit sizing only
  client.applicants.forEach((a, i) => {
    const netMonthly = (a.incomes.reduce((s, x) => s + x.grossAnnual, 0) / 12) * netFactor;
    txs.push(...payCredits(
      a.employmentType === 'self-employed' ? `${a.displayName} Ltd drawings` : `${a.displayName} salary`,
      netMonthly,
      a.employmentType === 'self-employed' ? 'monthly' : 'fortnightly',
      'acc-txn',
      i * 4 + 1,
    ));
  });
  if (client.boarderIncomePerWeek) {
    for (let w = 0; w < 13; w++) {
      const d = new Date(END);
      d.setDate(d.getDate() - w * 7 - 2);
      txs.push({ id: `board-${w}`, accountId: 'acc-txn', date: d.toISOString().slice(0, 10), description: 'Board payment', merchant: 'Board payment', amount: client.boarderIncomePerWeek });
    }
  }

  // Rent credits + mortgage accounts per property/loan
  for (const p of client.properties.filter((p) => p.use === 'investment' && p.rentPerWeek)) {
    for (let w = 0; w < 13; w++) {
      const d = new Date(END);
      d.setDate(d.getDate() - w * 7 - 4);
      txs.push({ id: `rent-${p.id}-${w}`, accountId: 'acc-txn', date: d.toISOString().slice(0, 10), description: 'Property Mgmt Rent', merchant: 'Rent — property manager', amount: p.rentPerWeek!.value });
    }
  }
  client.mortgages.forEach((m, i) => {
    // one loan drifts slightly from the recorded balance → reconciliation demo
    const drift = i === 0 ? -3_450 : 0;
    accounts.push({
      id: `acc-loan-${i}`,
      name: `Home loan ${i + 1}`,
      bank: 'Demo Bank',
      type: 'mortgage',
      balance: -(m.balance + drift),
      loanDetails: {
        interestRate: m.rate,
        repaymentAmount: m.repayment.amount,
        repaymentFrequency: m.repayment.frequency === 'annual' ? 'monthly' : m.repayment.frequency,
        expiresAt: m.fixedExpiry,
      },
    });
    const monthly = toMonthly(m.repayment.amount, m.repayment.frequency);
    if (monthly > 0) {
      txs.push(...buildTransactions([{ merchant: `Home loan payment ${i + 1}`, category: 'Loan repayments', monthly, timesPerMonth: 2, jitter: 0 }], 'acc-txn', rnd, -1));
    }
  });

  // Lifestyle spending, scaled to household size, plus declared insurances etc.
  const scale = client.household.adults === 2 ? 1 + client.household.dependants * 0.25 : 0.7;
  const plans: SpendPlan[] = LIFESTYLE_BASE.map((p) => ({ ...p, monthly: p.monthly * scale }));
  for (const f of client.expenses.fixedCommitmentsMonthly) {
    if (/insurance/i.test(f.label)) plans.push({ merchant: 'Partners Life', category: 'Insurance', monthly: f.amount * 0.55, timesPerMonth: 1, jitter: 0 }, { merchant: 'AMI Insurance', category: 'Insurance', monthly: f.amount * 0.45, timesPerMonth: 1, jitter: 0 });
    else if (/rates/i.test(f.label)) plans.push({ merchant: 'City Council rates', category: 'Rates', monthly: f.amount, timesPerMonth: 1, jitter: 0 });
    else if (/childcare|education/i.test(f.label)) plans.push({ merchant: 'BestStart childcare', category: 'Education', monthly: f.amount, timesPerMonth: 2, jitter: 0.05 });
  }
  txs.push(...buildTransactions(plans, 'acc-txn', rnd, -1));
  // savings sweep
  txs.push(...buildTransactions([{ merchant: 'Transfer to savings', category: 'Transfers', monthly: 600 * scale, timesPerMonth: 1, jitter: 0.3 }], 'acc-txn', rnd, -1));

  txs.sort((a, b) => b.date.localeCompare(a.date));

  return {
    provider: 'demo',
    providerLabel: 'Demo feed (generated)',
    syncedAt: '2026-08-28T09:00:00.000Z',
    monthsCovered: MONTHS,
    accounts,
    transactions: txs,
    note: 'Seeded demo data shaped like an Akahu snapshot — swap in a real feed with `npm run sync:akahu`.',
  };
}

const cache = new Map<string, FeedSnapshot>();
export function demoFeedFor(client: Client): FeedSnapshot {
  if (!cache.has(client.id)) cache.set(client.id, feedFor(client, client.id.length * 7919 + 42));
  return cache.get(client.id)!;
}
