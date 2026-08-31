import { describe, expect, it } from 'vitest';
import { demoHomeowner, demoFhb } from '../lib/data/demoClients';
import { demoFeedFor } from '../lib/data-sources/demoFeed';
import { analyseFeed, repaymentCrossCheck } from '../lib/calculators/cashflow';
import { mapAkahuSnapshot } from '../lib/data-sources/mapAkahu';
import { categoriseTransaction } from '../lib/data-sources/categorise';
import { applyScenario } from '../lib/scenarios/apply';
import { localParser } from '../lib/ai/localParser';
import { computeAll } from '../lib/scenarios/compute';
import { DEFAULT_RULE_CONTEXT } from '../lib/rules/context';

describe('deterministic categoriser', () => {
  const t = (description: string, amount = -50) => ({ id: 't', accountId: 'a', date: '2026-08-01', description, amount });
  it('classifies NZ merchants by keyword', () => {
    expect(categoriseTransaction(t('PAK N SAVE ALBANY'))).toBe('Food & groceries');
    expect(categoriseTransaction(t('Z ENERGY 2015 LTD'))).toBe('Transport & fuel');
    expect(categoriseTransaction(t('NETFLIX.COM'))).toBe('Subscriptions');
    expect(categoriseTransaction(t('PARTNERS LIFE PREMIUM'))).toBe('Insurance');
  });
  it('prefers provider enrichment when present', () => {
    expect(categoriseTransaction({ ...t('SOMETHING OPAQUE'), providerCategory: 'Utilities' })).toBe('Utilities & phone');
  });
  it('credits are income, never spending', () => {
    expect(categoriseTransaction(t('MYSTERY CREDIT', 500))).toBe('Income');
  });
});

describe('demo feed + cashflow analysis', () => {
  const feed = demoFeedFor(demoHomeowner);
  const analysis = analyseFeed(feed, demoHomeowner);

  it('is deterministic', () => {
    expect(demoFeedFor(demoHomeowner)).toBe(feed); // cached
    expect(analysis.audit[0].value).toBeGreaterThan(150); // transactions analysed
  });

  it('detects salary-like and rent-like income streams', () => {
    expect(analysis.incomeStreams.length).toBeGreaterThan(2);
    expect(analysis.incomeStreams.some((s) => s.kind === 'rent-like')).toBe(true);
    expect(analysis.totalIncomeMonthly).toBeGreaterThan(10_000);
  });

  it('produces spending by category with declared comparison', () => {
    const food = analysis.spendByCategory.find((c) => c.category === 'Food & groceries');
    expect(food).toBeTruthy();
    expect(food!.monthlyAverage).toBeGreaterThan(500);
    expect(analysis.totalSpendMonthly).toBeGreaterThan(2_000);
  });

  it('finds recurring commitments (subscriptions, insurance)', () => {
    expect(analysis.recurring.some((r) => r.category === 'Subscriptions')).toBe(true);
  });

  it('reconciles mortgage accounts, flagging the drifted balance', () => {
    expect(analysis.mortgages.length).toBe(demoHomeowner.mortgages.length);
    const drifted = analysis.mortgages.find((m) => (m.difference ?? 0) !== 0);
    expect(drifted).toBeTruthy();
    expect(Math.abs(drifted!.difference!)).toBeGreaterThan(1_000);
    const cross = repaymentCrossCheck(analysis, demoHomeowner);
    expect(cross.feedMonthly).toBeGreaterThan(4_000); // matches recorded ≈ $6.3k within jitter
  });
});

describe('Akahu mapper', () => {
  it('normalises and redacts a raw payload', () => {
    const snap = mapAkahuSnapshot(
      [
        {
          _id: 'acc_1',
          name: 'Everyday 12-3456-7890123-00',
          type: 'CHECKING',
          balance: { current: 1500 },
          connection: { name: 'ANZ' },
        },
        {
          _id: 'acc_2',
          name: 'Home Loan',
          type: 'LOAN',
          balance: { current: -447119 },
          connection: { name: 'Kiwibank' },
          meta: { loan_details: { interest: { rate: 4.89, expires_at: '2027-04-15' }, repayment: { amount: 1477.71, frequency: 'FORTNIGHTLY' } } },
        },
      ],
      [
        {
          _id: 'tx_1',
          _account: 'acc_1',
          date: '2026-08-10T00:00:00Z',
          description: 'COUNTDOWN 0123456 AUCKLAND',
          amount: -84.5,
          merchant: { name: 'Countdown' },
          category: { groups: { personal_finance: { name: 'Groceries' } } },
        },
      ],
      { months: 3, syncedAt: '2026-08-28T00:00:00Z' },
    );
    expect(snap.accounts[0].name).not.toMatch(/\d{4}/); // account number redacted
    expect(snap.accounts[1].type).toBe('loan');
    expect(snap.accounts[1].loanDetails!.interestRate).toBeCloseTo(0.0489, 5); // percent → decimal
    expect(snap.accounts[1].loanDetails!.repaymentFrequency).toBe('fortnightly');
    expect(snap.transactions[0].description).not.toMatch(/\d{6}/);
    expect(snap.transactions[0].providerCategory).toBe('Groceries');
  });
});

describe('valuation recording', () => {
  it('addValuation stores provenance and drives modelling', () => {
    const state = applyScenario(demoHomeowner, [
      { kind: 'addValuation', propertyId: 'home', value: 1_520_000, sourceName: 'QV E-Valuer' },
    ]);
    const home = state.client.properties.find((p) => p.id === 'home')!;
    const active = home.valuations.find((v) => v.id === home.activeValuationId)!;
    expect(active.value).toBe(1_520_000);
    expect(active.sourceName).toBe('QV E-Valuer');
    expect(active.sourceType).toBe('avm');
    const result = computeAll(state, DEFAULT_RULE_CONTEXT);
    const homeEq = result.equity.properties.find((p) => p.propertyId === 'home')!;
    expect(homeEq.activeValue).toBe(1_520_000);
    expect(homeEq.usableEquity).toBeCloseTo(1_520_000 * 0.8 - 529_587, 0);
  });

  it('parses "QV values the house at $1.52m"', () => {
    const res = localParser.parse('QV values the house at $1.52m', { client: demoHomeowner });
    expect(res.changes[0].change).toMatchObject({ kind: 'addValuation', value: 1_520_000, sourceName: 'QV E-Valuer' });
  });

  it('parses "add a QV valuation of $760k for the rental"', () => {
    const res = localParser.parse('add a QV valuation of $760k for the rental', { client: demoHomeowner });
    expect(res.changes[0].change).toMatchObject({ kind: 'addValuation', value: 760_000, propertyId: 'rental' });
  });

  it('FHB with no property is handled gracefully', () => {
    const res = localParser.parse('QV values the house at $900k', { client: demoFhb });
    expect(res.changes.length).toBe(0);
  });
});
