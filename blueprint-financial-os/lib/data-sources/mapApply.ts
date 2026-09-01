// Normalise an Akahu Apply report (GET /v1/applications/{id}/reports/{id}/json
// on api.apply.akahu.nz) into a FeedSnapshot. Same boundary rules as the
// enduring-API mapper: PII is redacted here — account numbers (`identifier`),
// holder names and counterparty account numbers never survive the mapping.
//
// Schema source: developers.akahu.nz Apply API reference (OpenAPI), verified
// 2026-09-01. Kept defensive — every enrichment field is optional.

import type { FeedAccount, FeedAccountType, FeedSnapshot, FeedTransaction } from './types';

export interface ApplyReportAccount {
  _id: string;
  type?: 'DEPOSITORY' | 'CREDIT CARD' | 'LOAN' | 'TERM DEPOSIT' | 'KIWISAVER' | 'INVESTMENT' | 'UNKNOWN' | string;
  identifier?: string | null; // bank account number — REDACTED, never copied
  name?: string;
  holder?: string | null; // holder name — REDACTED, never copied
  provider?: { _id: string; name: string; logo?: string } | null;
  periods?: {
    _source?: string;
    opening_balance?: number | null;
    closing_balance?: number | null;
    from?: string;
    to?: string;
  }[];
}

export interface ApplyReportTransaction {
  _id: string;
  _account: string;
  action?: 'money_in' | 'money_out' | 'transfer' | string;
  type?: string;
  date: string; // ISO date-time
  description?: string;
  amount: number; // debits negative
  balance?: number | null;
  merchant?: { name?: string } | null;
  nzfcc?: { _id: string; name: string } | null;
  income_category?: { name?: string } | null;
  spending_category?: { name?: string } | null;
}

export interface ApplyReportJson {
  data_sources?: unknown[];
  accounts: ApplyReportAccount[];
  insights?: unknown[];
  transactions: ApplyReportTransaction[];
}

/** Strip anything that looks like an account or card number from text. */
function redact(text: string): string {
  return text
    .replace(/\b\d{2}[- ]?\d{4}[- ]?\d{7}[- ]?\d{2,3}\b/g, '••')
    .replace(/\b\d{6,}\b/g, '••');
}

function mapAccountType(a: ApplyReportAccount): FeedAccountType {
  const name = a.name ?? '';
  switch (a.type) {
    case 'DEPOSITORY':
      return /save|saver|savings/i.test(name) ? 'savings' : 'transaction';
    case 'CREDIT CARD':
      return 'credit-card';
    case 'LOAN':
      return /home|mortgage|housing|flexi ?home|table loan/i.test(name) ? 'mortgage' : 'loan';
    case 'TERM DEPOSIT':
      return 'savings';
    case 'KIWISAVER':
      return 'kiwisaver';
    case 'INVESTMENT':
      return 'investment';
    default:
      return 'other';
  }
}

function accountBalance(a: ApplyReportAccount, txs: ApplyReportTransaction[]): number {
  // Prefer the latest period's closing balance; fall back to the most recent
  // transaction that carries a running balance; else 0.
  const periods = [...(a.periods ?? [])].sort((x, y) => (y.to ?? '').localeCompare(x.to ?? ''));
  for (const p of periods) {
    if (typeof p.closing_balance === 'number') return p.closing_balance;
    if (typeof p.opening_balance === 'number') return p.opening_balance;
  }
  const withBalance = txs
    .filter((t) => t._account === a._id && typeof t.balance === 'number')
    .sort((x, y) => y.date.localeCompare(x.date));
  if (withBalance.length > 0) return withBalance[0].balance as number;
  return 0;
}

export function mapApplyReport(
  report: ApplyReportJson,
  opts: { syncedAt?: string; reference?: string } = {},
): FeedSnapshot {
  const accounts: FeedAccount[] = report.accounts.map((a) => {
    const type = mapAccountType(a);
    let balance = accountBalance(a, report.transactions);
    // debt accounts read as negative in the FeedSnapshot contract
    if ((type === 'mortgage' || type === 'loan' || type === 'credit-card') && balance > 0) balance = -balance;
    return {
      id: a._id,
      name: redact(a.name ?? 'Account'),
      bank: a.provider?.name ?? 'Bank',
      type,
      balance,
    };
  });

  const transactions: FeedTransaction[] = report.transactions.map((t) => ({
    id: t._id,
    accountId: t._account,
    date: t.date.slice(0, 10),
    description: redact(t.description ?? ''),
    merchant: t.merchant?.name,
    amount: t.amount,
    // Apply's enrichment beats our keyword rules — pass it through as the
    // provider category hint; explicit transfer detection wins outright.
    providerCategory:
      t.action === 'transfer'
        ? 'Transfer'
        : t.spending_category?.name ?? t.income_category?.name ?? t.nzfcc?.name,
  }));

  const dates = transactions.map((t) => t.date).sort();
  const monthsCovered =
    dates.length > 1
      ? Math.max(1, Math.round((new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / (30.44 * 86_400_000)))
      : 1;

  return {
    provider: 'akahu',
    providerLabel: 'Akahu Apply (one-off share)',
    syncedAt: opts.syncedAt ?? new Date().toISOString(),
    monthsCovered,
    accounts,
    transactions,
    note: `Aggregated, enriched dataset from an Akahu Apply report${opts.reference ? ` (application: ${opts.reference})` : ''}. Account numbers and holder names are redacted at this boundary.`,
  };
}
