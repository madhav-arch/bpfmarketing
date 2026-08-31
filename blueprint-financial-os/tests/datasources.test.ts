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

describe('minimal intake — Akahu-first fact find', () => {
  const feed = demoFeedFor(demoHomeowner); // shaped like a real Akahu snapshot

  it('grossFromNetMonthly inverts the PAYE calculation', async () => {
    const { grossFromNetMonthly, netMonthlyFromSalary } = await import('../lib/calculators/tax');
    const { TAX_CURRENT } = await import('../lib/rules/taxTables');
    const gross = grossFromNetMonthly(6_000, 0.03, TAX_CURRENT);
    expect(netMonthlyFromSalary(gross, 0.03, TAX_CURRENT).netMonthly).toBeCloseTo(6_000, 0);
  });

  it('builds a full client from the minimal form + feed', async () => {
    const { buildClientFromIntake } = await import('../lib/intake/buildClient');
    const { TAX_CURRENT } = await import('../lib/rules/taxTables');
    const built = buildClientFromIntake(
      {
        label: 'Test Intake',
        clientType: 'homeowner',
        applicantNames: ['Kate', 'Logan'],
        dependants: 2,
        vehicles: 2,
        creditCardLimits: 10_000,
        properties: [
          { nickname: 'Home', ownerEstimate: 1_450_000, use: 'owner-occupied' },
          { nickname: 'Rental', ownerEstimate: 700_000, use: 'investment', rentPerWeek: 560 },
        ],
      },
      feed,
      TAX_CURRENT,
    );
    const c = built.client;
    // mortgages come from the feed with their real rates/repayments
    expect(c.mortgages.length).toBe(feed.accounts.filter((a) => a.type === 'mortgage' || a.type === 'loan').length);
    expect(c.mortgages[0].rate).toBeCloseTo(demoHomeowner.mortgages[0].rate, 4);
    expect(c.mortgages[0].repayment.amount).toBeCloseTo(demoHomeowner.mortgages[0].repayment.amount, 1);
    // income grossed up from detected credits — no income questions asked
    const totalGross = c.applicants.reduce((s, a) => s + a.incomes.reduce((t, i) => t + i.grossAnnual, 0), 0);
    expect(totalGross).toBeGreaterThan(120_000);
    // no declared expenses — the feed is the source
    expect(c.expenses.declaredMonthly.length).toBe(0);
    // age NOT asked for a homeowner → default with an assumption note
    expect(c.applicants[0].age).toBe(40);
    expect(built.assumptions.some((a) => /age/i.test(a))).toBe(true);
    // valuation stored as owner estimate with provenance
    expect(c.properties[0].valuations[0].sourceType).toBe('adviser-estimate');
    // savings pulled from feed balances
    expect(c.cashSavings.sourceType).toBe('statement');
  });

  it('servicing on an intake client still stress-tests at 7%', async () => {
    const { buildClientFromIntake } = await import('../lib/intake/buildClient');
    const { TAX_CURRENT } = await import('../lib/rules/taxTables');
    const { client } = buildClientFromIntake(
      { label: 'Stress', clientType: 'homeowner', applicantNames: ['A', 'B'], dependants: 0, vehicles: 1, creditCardLimits: 0, properties: [{ nickname: 'Home', ownerEstimate: 1_200_000, use: 'owner-occupied' }] },
      feed,
      TAX_CURRENT,
    );
    const result = computeAll(applyScenario(client, []), DEFAULT_RULE_CONTEXT);
    const stressed = result.servicing.debtServicing.items.find((i) => i.label.includes('stress-tested'));
    expect(stressed).toBeTruthy();
    expect(stressed!.note).toContain('7.00%');
  });

  it('asks for age when the client is a first-home buyer', async () => {
    const { buildClientFromIntake } = await import('../lib/intake/buildClient');
    const { TAX_CURRENT } = await import('../lib/rules/taxTables');
    const { client, assumptions } = buildClientFromIntake(
      { label: 'FHB', clientType: 'fhb', applicantNames: ['A'], dependants: 0, vehicles: 1, creditCardLimits: 5_000, properties: [], ages: [29], kiwiSaverTotal: 40_000, savingsForDeposit: 25_000, targetPrice: 800_000 },
      feed,
      TAX_CURRENT,
    );
    expect(client.applicants[0].age).toBe(29);
    expect(assumptions.every((a) => !/age \d+ assumed|assume age/i.test(a))).toBe(true);
    expect(client.targetPurchase!.depositSources.kiwiSaver).toBe(40_000);
  });
});

describe('benchmark vs actual comparison', () => {
  it('rolls actual spending into servicing buckets and flags abnormalities', async () => {
    const { benchmarkComparison } = await import('../lib/calculators/cashflow');
    const feed = demoFeedFor(demoHomeowner);
    const analysis = analyseFeed(feed, demoHomeowner);
    const cmp = benchmarkComparison(analysis, demoHomeowner, DEFAULT_RULE_CONTEXT.policy);
    expect(cmp.rows.length).toBe(3);
    expect(cmp.rows[0].benchmarkMonthly).toBe(1850 + 2 * 400); // couple + 2 dependants
    expect(cmp.rows[0].actualMonthly).toBeGreaterThan(1_500);
    expect(cmp.benchmarkTotal).toBeGreaterThan(0);
    expect(cmp.assessorView.length).toBeGreaterThan(10);
    // demo homeowner household actually outspends the baseline benchmark → flagged
    expect(cmp.rows.some((r) => r.flag)).toBe(true);
  });
});
