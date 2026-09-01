# Data Sources — live inputs

How real data gets into Blueprint Financial OS, and what each source honestly
can and can't do today.

## Bank feeds — Akahu (income, expenses, mortgages)

[Akahu](https://developers.akahu.nz) is NZ's open-finance aggregator and the
right integration point ahead of full CDR open banking. The integration is
live in this prototype:

- `lib/data-sources/types.ts` — the `BankFeedProvider` seam and the normalised
  `FeedSnapshot` the app consumes (accounts incl. mortgage balances/rates,
  transactions). PII is redacted at this boundary: no account numbers survive.
- `scripts/akahu-pull.ts` (`npm run sync:akahu`) — pulls accounts + N months of
  transactions from the real Akahu API using a **Personal App** token pair and
  writes `public/feed/live.json` (git-ignored).
- `lib/calculators/cashflow.ts` — deterministic analysis: income detection
  (recurring credits with cadence), actual spending by category, recurring
  commitments/subscriptions, observed surplus, and reconciliation of feed
  mortgage balances/rates/repayments against the recorded loan file.
- `lib/data-sources/categorise.ts` — deterministic categoriser (Akahu's
  enrichment when present, NZ-merchant keyword rules otherwise), aligned to
  Fact Find categories so ACTUAL vs DECLARED vs BENCHMARK compare fairly.
- The **Live Data** panel (section 02) renders all of it, with a demo feed
  standing in until a live snapshot exists.

### Setting up a live feed (prototype path)

1. Create an account at my.akahu.nz and connect your bank(s).
2. Create a *Personal App* at developers.akahu.nz; copy both tokens.
3. `cp .env.example .env.local` and fill in `AKAHU_APP_TOKEN` / `AKAHU_USER_TOKEN`.
4. `npm run sync:akahu` (optionally `-- --months 6`), restart the app.

### Production path (Phase 2)

Personal tokens are for the adviser's own accounts / prototyping. For client
data you register a full Akahu app: each client authorises through Akahu's
OAuth consent flow, tokens are stored server-side against the client record,
and syncs run on a schedule. The `FeedSnapshot` contract doesn't change —
only the credential handling does. Security requirements before any client
feed: encrypted token storage, per-client consent records, no snapshots on
disk, audit logging. **Never** store raw banking credentials — Akahu's whole
model exists so you don't have to.

## Property values — QV and friends

**There is no public QV API.** QV's E-Valuer and the CoreLogic AVMs behind
bank systems are commercial products; automated access requires a data
agreement (and scraping qv.co.nz would breach their terms — not a foundation
for regulated advice). So the prototype does what a compliant build should:

- `ValuationProvider` seam (`lib/data-sources/types.ts`) with a `qv` adapter
  stub that states exactly why it's disabled. When a QV/CoreLogic agreement
  exists, implement `fetchValuation` and everything downstream already works.
- **First-class manual entry**: the Live Data panel's "Record a valuation"
  form (or copilot: *"QV values the house at $1.52m"*) records the figure as
  an `addValuation` scenario change with source name, date and confidence —
  it appears in the property's valuation list, can drive modelling, and shows
  up in every "How was this calculated?" audit trail. Keying an E-Valuer
  figure takes seconds and keeps full provenance.
- Alternatives worth pursuing for Phase 2: CoreLogic NZ APIs (commercial),
  LINZ/council rating values (public but only revalued 3-yearly), and the
  lender AVMs Blueprint already sees inside bank systems (recorded manually
  today with `bank-internal-valuation` provenance).

## Where each input now comes from

| Input | Today | Phase 2 |
|---|---|---|
| Income | Fact Find + Akahu income detection (cross-check) | Akahu OAuth per client; IRD summaries stay the lender source of truth |
| Expenses | Fact Find + Akahu actuals vs benchmark | same, with longer history |
| Mortgage balances/rates | Fact Find + Akahu loan accounts (reconciliation) | Akahu; lender API where available |
| Property values | Adviser-entered with provenance (bank AVM, QV E-Valuer, RV) | QV/CoreLogic agreement → automated AVM pulls |
| KiwiSaver balances | Fact Find / provider statements | Akahu (KiwiSaver account type) where connected |

## One-off application flow (apply.akahu.nz)

The production-shaped path for client data collection, discovered viable in
testing (the adviser created an applicant and received an invite link):

1. Adviser creates an **applicant** in the Akahu dashboard (or via API) →
   Akahu generates an invite link (`https://apply.akahu.nz/submit?token=…`).
2. The client opens the link, chooses banks/accounts, authorises a **one-off
   account information share** and submits. Blueprint never sees bank logins.
3. The completed application lands in the business's Akahu dashboard and is
   retrievable by API using the **app credentials** (app ID token + app
   secret) — no per-user bearer token, because consent lives in the
   application record.
4. Blueprint's server route retrieves → `mapAkahuSnapshot` (PII redaction) →
   `FeedSnapshot` → the client file.

Status in this prototype: the invite is tracked per client on the connect
card (link + status: invite created / sent / completed / imported), and the
collected data round-trips today via dashboard export → the Import button.
Automatic retrieval (steps 3–4 as code) needs outbound access to
`api.akahu.io` from the build/deploy environment plus the app ID token —
the exact one-off retrieval endpoints must be confirmed against
developers.akahu.nz docs (unreachable from the current sandbox) before that
route is written. Never embed the app secret or invite tokens in browser
code; treat invite links as sensitive (anyone holding one can complete that
application).
