# Current Process Analysis — Blueprint Finance Strategy Sessions

> Source material: two real strategy-session transcripts (a first-home buyer couple, "Client A";
> a self-employed homeowner couple with a rental in a family trust, "Client B"), the two Excel
> "Blueprint Strategy Session" workbooks used in those meetings, and a Mortgage Fact Find PDF.
> All personally identifying details are deliberately omitted from this document. Demo fixtures
> in `/lib/data` are anonymised derivatives.

## 1. How a strategy session runs today

1. **Fact Find first.** The client completes a structured Fact Find (applicants, employment,
   incomes, monthly expenses by category, assets incl. properties/KiwiSaver/cash/businesses,
   liabilities incl. per-loan balances/rates, motivations). The adviser pre-loads a copy of the
   Excel "Strategy Session" workbook with this data before the call.
2. **Meeting on Google Meet, adviser shares the spreadsheet.** The session follows a consistent
   narrative arc regardless of client type:
   - Rapport + goal confirmation ("plan for a family in 3 years?", "pay the home off faster").
   - **Property value context** — the adviser pulls the bank's AVM range ("the system values it
     1.07–1.34, lands in the middle at 1.21") and explains comparable-sales logic.
   - **"What goes on behind closed doors"** — income is split into bank-recognised lines:
     base salary vs overtime/commission (scaled to 80%), boarder/rental income (scaled),
     one-off back-pay stripped out, everything converted to net monthly.
   - **Bank expense treatment** — the adviser explains the four-bucket living-cost model
     (couple baseline ≈ $1,700–$2,500/mo depending on bank; per-vehicle $250/mo; per-dependant
     ≈ $400/mo; fixed commitments from the statements), credit-card limits at 3% of limit/month
     regardless of balance, and the ~7% stress test on all mortgage debt over 30 years.
   - **Uncommitted monthly income (UMI)** — "$11k in, $3.7k out, $210 credit card → ~$7k left,
     which is also the repayment on $1.07m at 7%". Minimum UMI the bank wants left over:
     ~$350/mo (loans < $1m) to ~$900–1,050/mo (loans > $1m).
   - **Client-type-specific modelling** (see §2).
   - **Costs and process** — upfront cash needed (lawyer ~$2.5k paid at the end, valuation ~$1k,
     building report ~$500, i.e. "have ~$4k set aside"), cashback from the bank at settlement,
     sale & purchase agreement walk-through, finance/LIM/building condition timelines.
   - **Nature & scope disclosure** — providers, commission ranges, conflicts, reliability events.
3. **Follow-up email** summarising everything discussed, then document requests
   (IRD income summaries, accountant financials) and pre-approval.

## 2. What is modelled per client type

### First-home buyer (Client A)
- Income scaling: base pay separated from overtime; overtime at 80% after tax; boarder at
  $250/wk → ~$867/mo recognised (80% in the meeting narrative; the workbook uses 75% × 4.33).
- Self-employed side income (rideshare) — flagged as a risk if the accountant filed a loss
  (a loss is *deducted* from personal income by the bank).
- Borrowing capacity at 5% vs 10% vs 20% deposit; low-equity margin buckets
  (LVR 90.01–95% → +1.20%; 85–90% → +0.75%; drops as LVR falls with valuation growth).
- Comfortable vs maximum: adviser explicitly advises *below* bank maximum
  ("you should be looking at 1.15–1.16 max; go lower if you can — I want you to enjoy your life").
- Repayments quoted per pay frequency, sensitivity to extra flatmates/side income.
- Pre-settlement cash requirements + when each is paid.

### Homeowner / restructure (Client B)
- Both self-employed; incomes ≈ $52k + $188k gross; two properties (~$2.19m total value,
  ~$977k total debt) held in a family trust; four loan splits with different rates/frequencies.
- Modelling of debt-to-LTC restructure (shift rental-secured debt into a look-through company
  for interest deductibility; ~$6k/yr tax saving estimated by the associated accountant).
- Revolving-credit strategy tiers: start 50k facility funded by surplus cash, extend to 75k,
  clear 25k tranches at each refix; explicitly matched to the family's "nest egg" discipline
  profile rather than raising scheduled repayments.
- Refinance benefit maths: cashback ~1% (workbook default 0.8%), minus solicitor ~$1.8k
  (entity change), minus pro-rata clawback ($2.5k unless settlement timed past the clawback
  window), plus tax savings → "upfront benefit ≈ $11.5k".
- Fixed-term laddering (consistent 1-year fixes) timed against lumpy income (royalties).
- Investor "next level": dual-income property example (2 dwellings, $600k, $1,100/wk rent,
  9.53% gross yield vs the 7% stress rate), equity as 30% deposit → "your $703k usable equity
  supports up to ~$2.3m of purchases", IO on investment debt, surplus rent redirected at the
  home loan.

## 3. The workbook, reverse-engineered

Eight sheets: Nature & Scope Disclosure, **Servicing Power**, **Equity position**,
**Repayment calculator**, Retirement, Investment Property Calculator, Amortisation table,
Lookups. Key logic (all reproduced in `/lib/calculators`, constants in `/lib/rules`):

| Concept | Formula in workbook |
|---|---|
| Net monthly per applicant | `gross/12 × (1 − KiwiSaver%) − PAYE(monthly) − ACC − studentLoan` |
| PAYE | Bracket table: 10.5% ≤ $14k, 17.5% ≤ $48k, 30% ≤ $70k, 33% above |
| ACC levy | 1.4% of gross, capped at $125k income ($1,750/yr) |
| Student loan | 12% of (gross/12 − $1,670) |
| OT & commission | net monthly × **80%** |
| Rental & boarder income | weekly × **4.33** × **75%** |
| Living expense benchmark | ~$1,850–1,900/mo couple, $1,250 single (income-adjusted array formula); + $250/vehicle; + $400/dependant; + declared fixed commitments (insurances, rates, childcare, subscriptions…) |
| Debt servicing | existing mortgage `PMT(7%/12, 30y)`; credit cards `3% × limit`; other finance `PMT(10%, 5y)` |
| UMI | recognised income − living expenses − debt servicing |
| Max new lending | `PV(7%/12, 360, UMI − minUMI)` where minUMI = $900 if debt > $1m else $350 |
| DTI cap | total gross incomes (+ scaled rentals) × **6** |
| Usable equity | `value × maxLVR − debt` (maxLVR 0.80 owner-occupied, 0.70 investment); ÷ 0.30 → max purchase with equity as full deposit |
| Property cashflow | rent/mo − rates − insurance − PM (7.5–8%) |
| Gross yield | annual rent ÷ purchase price |
| Break fee estimate | `(oldRate − currentRate) × balance × daysToExpiry/365` (adviser-entered fee also supported) |
| Refinance benefit | cashback (0.8–1%) − lawyer − break fee − clawback repaid + interest/tax savings |
| Retirement | FV at 4/5/6% growth for property & KiwiSaver (+$500/yr govt contribution), 4% drawdown, NZ Super fortnightly table by tax code, gap vs goal income |
| Amortisation | monthly schedule, fixed scheduled payment, optional flat extra payment |

## 4. Repeated manual work (automation opportunities)

- Re-keying Fact Find values into the workbook, then re-typing the same numbers into the
  follow-up email. Three representations of one dataset.
- Reading loan-by-loan repayments to the adviser over the phone mid-meeting (Client B spent
  ~4 minutes dictating four loan repayments).
- Manually converting frequencies (weekly/fortnightly/monthly) throughout.
- Manually copying bank AVM values in from a separate system, with no provenance kept.
- Re-running "what if rent is X" by editing cells; the rent-sensitivity table exists but is a
  static 25-row grid.
- Scenario comparison is done by narrating over a single mutating sheet — no side-by-side, no
  undo, no record of what was agreed.

## 5. Spreadsheet limitations observed

- One live copy per meeting; edits destroy the baseline (no scenario history).
- Constants (stress rate, scalings, benchmarks, tax brackets) buried in a Lookups sheet with
  no effective dates, no lender attribution, no source notes.
- Tax bracket table matches pre-2024 thresholds; needs versioning, not silent correction.
- Boarder scaling inconsistency: meeting narrative says 80%, workbook uses 75%×4.33.
- Single stress rate / single "bank" — no lender comparison despite the meetings constantly
  referencing between-bank differences (benchmarks "some banks $2.3k, TSB/Kiwibank ~$1.7k").
- `4.33` weekly→monthly multiplier vs `52/12 = 4.333…` used elsewhere — small inconsistencies.
- TDTI ratio cell computes `debt服icing/income × 10`, which is not a DTI; the DTI *cap*
  (gross × 6) is correct. Needs adviser confirmation (see §6).
- No audit trail: an output cannot explain which rules produced it.

## 6. Calculation logic requiring adviser confirmation (NOT guessed in the engine)

These are reproduced as-is from the workbook, flagged `requiresConfirmation` in
`/lib/rules/blueprintModelling.ts`, and each carries a note:

1. **Tax brackets** — workbook uses 10.5/17.5/30/33 with 14k/48k/70k thresholds (superseded
   by the 15.5k/53.5k/78.1k thresholds + 39% top rate). Engine ships both table versions;
   the workbook version is used for regression fixtures, the current version for live demos.
2. **Boarder/rental scaling 75% vs the 80% quoted in meetings** — both configurable.
3. **Living-expense array formula** — income-linked adjustment on top of the $1,850 couple
   benchmark could not be fully extracted; engine uses the flat benchmark and documents a
   ±$50/mo variance against workbook fixtures.
4. **"TDTI Ratio ×10"** cell — engine implements standard DTI (total debt ÷ gross income)
   and the ×6 cap, and records the workbook's variant in the fixture notes.
5. **Minimum-UMI thresholds** ($350/$900) — lender-specific in reality; modelled per RuleSet.
6. **KiwiSaver government contribution** modelled in workbook as flat $500/yr — kept
   configurable and version-dated.
7. **Break-fee formula** is a rough proxy (banks use wholesale-rate differentials); labelled
   "estimate — confirm with lender" everywhere it is shown.

## 7. What the meeting narrative tells us the product must do

- Tell the story in the same order the adviser already tells it (goals → position → bank view
  → capacity → options → recommendation → next steps).
- Make the *scaling* steps visible (actual → bank-recognised) — this is the moment clients
  say "I've never had anyone show me this".
- Keep "comfortable vs maximum" explicit; the adviser routinely advises below bank max.
- Support live sensitivity (rent, deposit %, repayment, boarder) with instant recalcs.
- Preserve compliance framing: nature & scope, provenance, "illustrative modelling" labels.
