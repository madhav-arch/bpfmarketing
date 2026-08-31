// BankDataProvider registry — the formal provider abstraction for the
// one-off "Connect financial data" flow. The app consumes FeedSnapshot only;
// credentials never reach browser code (the Akahu provider talks to a
// server-side route, which is where tokens live).

import type { Client } from '../domain/types';
import type { BankFeedProvider, FeedSnapshot } from './types';
import { demoFeedFor } from './demoFeed';

export type DataStatus = 'fact-find-only' | 'akahu-connected' | 'client-confirmed' | 'needs-review';

export const DATA_STATUS_LABELS: Record<DataStatus, string> = {
  'fact-find-only': 'Fact Find only',
  'akahu-connected': 'Akahu connected',
  'client-confirmed': 'Client confirmed',
  'needs-review': 'Needs review',
};

/**
 * Akahu, via the server-side route. The route holds the app/user tokens
 * (env), calls api.akahu.io, redacts PII through mapAkahuSnapshot and returns
 * a FeedSnapshot. In the static demo bundle the route is a build-time stub
 * ({connected:false}) and the pre-synced public/feed/live.json path (written
 * by `npm run sync:akahu`) still works.
 */
export const akahuProvider: BankFeedProvider & { describe: string } = {
  id: 'akahu',
  label: 'Akahu (open finance)',
  describe:
    'One-off account information flow: authorise at Akahu, select accounts, and Blueprint retrieves permitted account and transaction data. No bank login is ever stored by Blueprint.',
  async fetchSnapshot() {
    // Prefer the live API route (dev/server deploys); fall back to a
    // pre-synced snapshot file (static bundle / adviser CLI sync).
    for (const url of ['api/akahu/snapshot', 'feed/live.json']) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.provider === 'akahu') return j as FeedSnapshot;
      } catch {
        /* try next source */
      }
    }
    throw new Error('Akahu is not connected in this build — connect via the server route or run `npm run sync:akahu`.');
  },
};

/** Deterministic demo bank — always available, seeded per client. */
export function demoBankProvider(client: Client): BankFeedProvider {
  return {
    id: 'demo',
    label: 'Demo bank (generated)',
    async fetchSnapshot() {
      return demoFeedFor(client);
    },
  };
}

/** Manual entry — the adviser keys figures straight into the client file.
 *  Modelled as a provider so the data-status chain stays uniform. */
export const manualProvider: BankFeedProvider = {
  id: 'demo',
  label: 'Manual entry',
  async fetchSnapshot() {
    return {
      provider: 'demo',
      providerLabel: 'Manual entry',
      syncedAt: new Date().toISOString(),
      monthsCovered: 0,
      accounts: [],
      transactions: [],
      note: 'No feed — figures entered manually carry adviser-entered provenance on each field.',
    };
  },
};

/** CSV import: parse a bank-export CSV (date, description, amount) into a
 *  normalised snapshot. Kept dependency-free and forgiving on column order. */
export function parseCsvFeed(csv: string, opts: { bank?: string } = {}): FeedSnapshot {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { provider: 'csv', providerLabel: 'CSV import', syncedAt: new Date().toISOString(), monthsCovered: 0, accounts: [], transactions: [] };
  }
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''));
  const dateIdx = header.findIndex((h) => /date/.test(h));
  const descIdx = header.findIndex((h) => /desc|narrative|details|particulars|payee/.test(h));
  const amountIdx = header.findIndex((h) => /amount|value/.test(h));
  const hasHeader = dateIdx >= 0 && amountIdx >= 0;
  const rows = hasHeader ? lines.slice(1) : lines;
  const di = hasHeader ? dateIdx : 0;
  const xi = hasHeader ? (descIdx >= 0 ? descIdx : 1) : 1;
  const ai = hasHeader ? amountIdx : 2;
  const transactions = rows
    .map((line, i) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const amount = parseFloat((cols[ai] ?? '').replace(/[^0-9.-]/g, ''));
      const rawDate = cols[di] ?? '';
      const dmy = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
      const date = dmy
        ? `${dmy[3].length === 2 ? '20' + dmy[3] : dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
        : rawDate.slice(0, 10);
      if (!isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return {
        id: `csv-${i}`,
        accountId: 'csv-account',
        date,
        description: (cols[xi] ?? '').replace(/\b\d{6,}\b/g, '••'),
        merchant: cols[xi],
        amount,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
  const dates = transactions.map((t) => t.date).sort();
  const months =
    dates.length > 1
      ? Math.max(1, Math.round((new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / (30.44 * 86_400_000)))
      : 1;
  return {
    provider: 'csv',
    providerLabel: `CSV import${opts.bank ? ` (${opts.bank})` : ''}`,
    syncedAt: new Date().toISOString(),
    monthsCovered: months,
    accounts: [{ id: 'csv-account', name: 'Imported account', bank: opts.bank ?? 'CSV', type: 'transaction', balance: 0 }],
    transactions,
  };
}

export function csvProvider(csv: string, bank?: string): BankFeedProvider {
  return {
    id: 'csv',
    label: 'CSV import',
    async fetchSnapshot() {
      return parseCsvFeed(csv, { bank });
    },
  };
}
