// Akahu Apply report → FeedSnapshot mapping: redaction and normalisation.
import { describe, expect, it } from 'vitest';
import { mapApplyReport, type ApplyReportJson } from '../lib/data-sources/mapApply';
import { categoriseTransaction } from '../lib/data-sources/categorise';
import { analyseFeed } from '../lib/calculators/cashflow';
import { demoFhb } from '../lib/data/demoClients';

const fixture: ApplyReportJson = {
  data_sources: [],
  insights: [],
  accounts: [
    {
      _id: 'report_acc_1',
      type: 'DEPOSITORY',
      identifier: '12-3456-7890123-00',
      holder: 'J & S EXAMPLE',
      name: 'Everyday',
      provider: { _id: 'p1', name: 'ANZ', logo: '' },
      periods: [{ from: '2026-06-01', to: '2026-08-28', opening_balance: 3100, closing_balance: 4200 }],
    },
    {
      _id: 'report_acc_2',
      type: 'LOAN',
      identifier: '12-3456-7890123-91',
      holder: 'J & S EXAMPLE',
      name: 'Home Loan Fixed',
      provider: { _id: 'p1', name: 'ANZ', logo: '' },
      periods: [{ from: '2026-06-01', to: '2026-08-28', closing_balance: 487_500 }],
    },
  ],
  transactions: [
    {
      _id: 't1',
      _account: 'report_acc_1',
      action: 'money_in',
      type: 'DIRECT CREDIT',
      date: '2026-08-14T02:00:00.000Z',
      description: 'ACME LTD SALARY 12345678',
      amount: 2950.25,
      income_category: { name: 'Salary' },
    },
    {
      _id: 't2',
      _account: 'report_acc_1',
      action: 'money_out',
      type: 'CARD',
      date: '2026-08-12T02:00:00.000Z',
      description: 'COUNTDOWN 9032',
      amount: -184.6,
      merchant: { name: 'Countdown' },
      spending_category: { name: 'Groceries' },
    },
    {
      _id: 't3',
      _account: 'report_acc_1',
      action: 'transfer',
      type: 'TRANSFER',
      date: '2026-07-01T02:00:00.000Z',
      description: 'TFR TO 12-3456-7890123-50',
      amount: -600,
    },
    {
      _id: 't4',
      _account: 'report_acc_1',
      action: 'money_out',
      type: 'LOAN',
      date: '2026-06-05T02:00:00.000Z',
      description: 'HOME LOAN PAYMENT',
      amount: -1620,
    },
  ],
};

describe('Akahu Apply mapping', () => {
  const snap = mapApplyReport(fixture, { reference: 'Test couple' });

  it('redacts account numbers and holder names everywhere', () => {
    const raw = JSON.stringify(snap);
    expect(raw).not.toContain('7890123');
    expect(raw).not.toContain('12345678');
    expect(raw).not.toContain('J & S EXAMPLE');
  });

  it('normalises accounts (loan balances negative, types mapped)', () => {
    const loan = snap.accounts.find((a) => a.id === 'report_acc_2')!;
    expect(loan.type).toBe('mortgage');
    expect(loan.balance).toBe(-487_500);
    const everyday = snap.accounts.find((a) => a.id === 'report_acc_1')!;
    expect(everyday.type).toBe('transaction');
    expect(everyday.balance).toBe(4200);
  });

  it('carries Apply enrichment into the categoriser', () => {
    const grocery = snap.transactions.find((t) => t.id === 't2')!;
    expect(categoriseTransaction(grocery)).toBe('Food & groceries');
    const transfer = snap.transactions.find((t) => t.id === 't3')!;
    expect(categoriseTransaction(transfer)).toBe('Transfers & savings');
  });

  it('computes months covered and feeds the analysis engine', () => {
    expect(snap.monthsCovered).toBeGreaterThanOrEqual(2);
    const analysis = analyseFeed(snap, demoFhb);
    expect(analysis.provider).toContain('Akahu Apply');
    expect(analysis.totalIncomeMonthly).toBeGreaterThan(0);
  });
});
