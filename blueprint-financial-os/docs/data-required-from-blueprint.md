# Data required from Blueprint

Information the prototype currently covers with clearly labelled, editable
assumptions. Nothing here blocks the demo; everything here improves accuracy
when supplied. Each item names where the assumption lives so it can be swapped
without touching components.

## CRITICAL FOR ACCURACY

| Item | What we have today | What we need | Where it plugs in |
|---|---|---|---|
| Current bank servicing calculators (refresh cadence) | ANZ v11.4 (Jun 2026), ASB (Jun 2026), BNZ v12.34 (Oct 2025 + GLEE Jun 2026), Westpac (Jul 2026), Kiwibank (release unconfirmed — flagged "test with adviser") | Each new calculator release as banks update test rates / CPI-indexed benchmarks | `lib/rules/nzBankPolicies.ts` (one versioned rule set per release) |
| TSB, SBS, Bank of China calculators | Not loaded — shown as "to be tested — check with adviser" | Their servicing calculators or written policy | Same file; they then join the comparison automatically |
| ASB + Kiwibank overtime scaling | Assumed 80% (not visible in the workbooks) — marked "confirm" | Confirmed scaling % | `nzBankPolicies.ts` `otScaling` |
| Kiwibank HEB benchmark | Approximated from the CCCFA statistical model at typical incomes | Current HEB coefficients or worked examples | `nzBankPolicies.ts` `expenseBenchmark` |
| Low-equity margins per lender | One generic band table (0.3% / 0.75% / 1.2%) applied to all lenders, adviser-overridable per scenario | Each lender's actual LEM/LEP table | `nzBankPolicies.ts` `lowEquityMargins` |
| Cashback rules per lender | Configurable example ($5,000 · 36 months · pro-rata), labelled as an example | Current campaign amounts, retention periods, clawback methods, eligibility | `lib/rules/assumptions.ts` `CASHBACK_EXAMPLE` |
| Current advertised mortgage rates | Client repayment demonstrations default to an editable ~6% (labelled assumption); each demo client carries a `modellingRate` | A rate card (special vs standard, by term) refreshed periodically | Client `modellingRate` + scenario `setRateAbsolute` |
| Akahu production app credentials | Personal-app token flow + demo fixtures; full provider boundary built | Blueprint's registered Akahu app (OAuth) for per-client consent | `app/api/akahu/*` + `lib/data-sources/providers.ts` |

## USEFUL LATER

| Item | What we have today | What we need | Where it plugs in |
|---|---|---|---|
| Licensed KiwiSaver benchmark dataset (Morningstar or equivalent) | Long-term fund-*category* assumptions (2.5%–6.5% by fund type), labelled Blueprint modelling assumptions with the past-performance disclaimer; provider adapter ready | A licensed Morningstar feed or adviser-maintained CSV (provider, fund, category, 10-yr return, fees, as-at date) | `lib/kiwisaver/benchmarkProvider.ts` |
| Insurance benchmark dataset | Ratio-based flags only (premium as % of net income + adviser prompts); cohort hooks defined | A credible premium dataset by cohort (household type, age band, sum insured) if one is licensed | `lib/insurance/benchmarkProvider.ts` |
| Valuation system mappings | Manual entry with source + date (QV E-Valuer, bank AVM, registered) — honest because QV has no public API | CoreLogic/Valocity adviser credentials if API access is arranged | `lib/data-sources/types.ts` `ValuationProvider` |
| Bank policy documents (credit policy PDFs) | Knowledge base answers only from the extracted calculator facts; otherwise says it lacks verified material | Written credit policies per lender to widen what the copilot may answer | `lib/policy/knowledgeBase.ts` + Policy Library |
| KiwiSaver withdrawal processing times per provider | "~9 working days once the lawyer holds signed documents" as a configurable workflow assumption with "actual processing can vary" | Provider-specific guidance if Blueprint tracks it | `lib/rules/assumptions.ts` `KIWISAVER_WITHDRAWAL_WORKFLOW` |
| Blueprint's email template | Summary generator mirrors the structure seen in the supplied post-meeting emails | The actual template/letterhead wording | `lib/summary/meetingSummary.ts` |

## OPTIONAL

| Item | Notes |
|---|---|
| Actual KiwiSaver product data (per-fund fees, PIR handling) | The modeller currently uses a default 0.80% fee, editable per account |
| Break-fee formulas per lender | The refinance module uses a labelled proxy estimate; true break fees are quote-only from the lender |
| Property running-cost defaults by region (rates) | Rates default to $350/month (editable); council data could localise this |
| NZ Super settings auto-update | Current couple/single rates are versioned manually; an annual update task suffices |
| CPI series for benchmark indexation | Westpac's ~2.1%/yr benchmark uplift is noted; a CPI feed could pre-age benchmarks between calculator releases |
