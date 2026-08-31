// Normalise raw Akahu API payloads (https://developers.akahu.nz) into a
// FeedSnapshot. Defensive by design: every enrichment field is optional and
// PII is redacted at this boundary — account/formatted numbers are dropped,
// only display names, balances, dates, amounts and merchant text survive.

import type { FeedAccount, FeedAccountType, FeedSnapshot, FeedTransaction } from './types';

// Shapes cover the fields we read; Akahu sends more. Kept loose on purpose.
export interface AkahuRawAccount {
  _id: string;
  name?: string;
  type?: string;
  balance?: { current?: number; available?: number };
  connection?: { name?: string };
  meta?: {
    loan_details?: {
      interest?: { rate?: number; expires_at?: string };
      repayment?: { amount?: number; frequency?: string };
    };
  };
  attributes?: string[];
}

export interface AkahuRawTransaction {
  _id: string;
  _account: string;
  date: string;
  description?: string;
  amount: number;
  merchant?: { name?: string };
  category?: { name?: string; groups?: { personal_finance?: { name?: string } } };
}

function mapAccountType(raw?: string): FeedAccountType {
  switch ((raw ?? '').toUpperCase()) {
    case 'CHECKING':
    case 'TRANSACTION': return 'transaction';
    case 'SAVINGS': return 'savings';
    case 'CREDITCARD':
    case 'CREDIT CARD': return 'credit-card';
    case 'MORTGAGE':
    case 'HOME_LOAN': return 'mortgage';
    case 'LOAN': return 'loan';
    case 'KIWISAVER': return 'kiwisaver';
    case 'INVESTMENT': return 'investment';
    default: return 'other';
  }
}

function mapFrequency(raw?: string): 'weekly' | 'fortnightly' | 'monthly' | undefined {
  switch ((raw ?? '').toUpperCase()) {
    case 'WEEKLY': return 'weekly';
    case 'FORTNIGHTLY': return 'fortnightly';
    case 'MONTHLY': return 'monthly';
    default: return undefined;
  }
}

/** Strip anything that looks like an account number from display text. */
function redact(text: string): string {
  return text
    .replace(/\b\d{2}[- ]?\d{4}[- ]?\d{7}[- ]?\d{2,3}\b/g, '••')
    .replace(/\b\d{6,}\b/g, '••');
}

export function mapAkahuSnapshot(
  rawAccounts: AkahuRawAccount[],
  rawTransactions: AkahuRawTransaction[],
  opts: { syncedAt?: string; months: number },
): FeedSnapshot {
  const accounts: FeedAccount[] = rawAccounts.map((a) => {
    const loan = a.meta?.loan_details;
    const rate = loan?.interest?.rate;
    return {
      id: a._id,
      name: redact(a.name ?? 'Account'),
      bank: a.connection?.name ?? 'Bank',
      type: mapAccountType(a.type),
      balance: a.balance?.current ?? 0,
      loanDetails:
        loan && (rate !== undefined || loan.repayment?.amount !== undefined)
          ? {
              interestRate: rate !== undefined ? (rate > 1 ? rate / 100 : rate) : undefined,
              repaymentAmount: loan.repayment?.amount,
              repaymentFrequency: mapFrequency(loan.repayment?.frequency),
              expiresAt: loan.interest?.expires_at,
            }
          : undefined,
    };
  });

  const transactions: FeedTransaction[] = rawTransactions.map((t) => ({
    id: t._id,
    accountId: t._account,
    date: t.date.slice(0, 10),
    description: redact(t.description ?? ''),
    merchant: t.merchant?.name,
    amount: t.amount,
    providerCategory: t.category?.groups?.personal_finance?.name ?? t.category?.name,
  }));

  return {
    provider: 'akahu',
    providerLabel: 'Akahu (open finance)',
    syncedAt: opts.syncedAt ?? new Date().toISOString(),
    monthsCovered: opts.months,
    accounts,
    transactions,
  };
}
