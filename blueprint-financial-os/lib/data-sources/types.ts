// Live-data provider layer. Phase 2 seam from the architecture doc, now real:
// a FeedSnapshot is the normalised, PII-redacted output of any bank-feed
// provider (Akahu today; CDR-accredited providers later; CSV import; demo
// generator). The app only ever consumes FeedSnapshot — never raw provider
// payloads and never credentials.

export type FeedProviderId = 'akahu' | 'csv' | 'demo';

export type FeedAccountType =
  | 'transaction'
  | 'savings'
  | 'credit-card'
  | 'mortgage'
  | 'loan'
  | 'kiwisaver'
  | 'investment'
  | 'other';

export interface FeedAccount {
  id: string; // provider id, safe to keep (opaque)
  name: string; // display name only — account numbers are redacted at ingest
  bank: string;
  type: FeedAccountType;
  balance: number; // negative for debt
  /** present on mortgage/loan accounts when the bank exposes it */
  loanDetails?: {
    interestRate?: number;
    repaymentAmount?: number;
    repaymentFrequency?: 'weekly' | 'fortnightly' | 'monthly';
    expiresAt?: string; // fixed-rate expiry
  };
}

export interface FeedTransaction {
  id: string;
  accountId: string;
  date: string; // ISO
  description: string;
  merchant?: string;
  amount: number; // negative = money out
  /** provider enrichment category, when available (e.g. Akahu personal_finance group) */
  providerCategory?: string;
}

export interface FeedSnapshot {
  provider: FeedProviderId;
  providerLabel: string;
  syncedAt: string;
  monthsCovered: number;
  accounts: FeedAccount[];
  transactions: FeedTransaction[];
  note?: string;
}

export interface BankFeedProvider {
  readonly id: FeedProviderId;
  readonly label: string;
  /** Pull + normalise + redact. Implementations must never emit credentials,
   *  full account numbers, or counterparty account numbers. */
  fetchSnapshot(opts?: { months?: number }): Promise<FeedSnapshot>;
}

// ---------------------------------------------------------------------------
// Valuations. QV / CoreLogic AVM access is commercial — no public API — so
// the provider seam exists, the manual-entry path is first-class, and any
// figure recorded carries its source, date and confidence.

export interface ValuationQuote {
  value: number;
  sourceName: string; // e.g. "QV E-Valuer", "Registered valuation"
  sourceType: 'avm' | 'bank-internal-valuation' | 'registered-valuation' | 'adviser-estimate';
  observedAt: string;
  confidence: 'low' | 'medium' | 'high';
  rangeLow?: number;
  rangeHigh?: number;
}

export interface ValuationProvider {
  readonly id: string;
  readonly label: string;
  /** Whether this provider can be called programmatically in this build. */
  readonly available: boolean;
  readonly unavailableReason?: string;
  fetchValuation(address: string): Promise<ValuationQuote>;
}

/**
 * QV adapter stub. QV's E-Valuer and CoreLogic AVMs have no public API;
 * production access needs a commercial data agreement, at which point this
 * provider gains a real fetchValuation and everything downstream already
 * works (valuations are stored with provenance today via manual entry).
 */
export const qvValuationProvider: ValuationProvider = {
  id: 'qv',
  label: 'QV E-Valuer',
  available: false,
  unavailableReason:
    'QV/CoreLogic AVM data requires a commercial agreement — no public API. ' +
    'Record E-Valuer figures manually (they keep full source/date provenance) until access is arranged.',
  async fetchValuation() {
    throw new Error('QV provider not configured — commercial data agreement required.');
  },
};
