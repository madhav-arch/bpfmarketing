# Calculation Engine

Pure TypeScript in `lib/calculators`. No React imports, no I/O, no randomness, no Date.now()
except where a `today` parameter defaults (always overridable for tests). Every module returns
values plus `AuditLine[]` working so the UI can show "How was this calculated?".

## Modules

### tax.ts
- `payeAnnual(gross, table)` — progressive brackets (versioned tables:
  `nz-2021` matching the source workbook; `nz-2025` with current thresholds incl. 39%).
- `accLevy(gross, table)`, `studentLoanMonthly(grossMonthly, table)`.
- `netMonthlyFromSalary(gross, kiwiSaverRate, opts)` — mirrors workbook:
  `gross/12·(1−ks) − PAYE/12 − ACC/12 − SL`.

### servicing.ts (the "How the bank sees you" engine)
Inputs: applicants' income lines, household, expense profile, debts, policy.
- Income recognition per line with scaling (OT×80%, boarder/rental ×75%×(52/12 or 4.33)),
  each line reported as `{ actualMonthly, recognisedMonthly, scalingApplied, why }`.
- Living costs: benchmark(single/couple) + perVehicle·vehicles + perDependant·dependants +
  declared fixed commitments.
- Debt servicing: existing mortgages at `PMT(stress, maxTerm)`; credit cards `limit × 3%`;
  personal/other finance `PMT(10%, 5y)`.
- `UMI = recognised − living − debt`.
- `maxNewLending = PV(stress/12, maxTerm·12, UMI − minUMI)` (0 if UMI below floor).
- `dti = totalDebt/grossIncome`, `dtiCapLending = grossIncomes·6 − existingDebt`.
- `capacityAcrossLenders(policies[])` → range + per-lender waterfall of differences.
- `rentSensitivity(rentSteps)` → the workbook's rent → UMI → max-lending grid.

### amortisation.ts
- `schedule({ principal, annualRate, years, frequency, extraPerPeriod, interestOnly,
  offsetBalance, startDate })` → periods with balance/interest/principal, plus
  `{ payoffDate, totalInterest, termMonths }`.
- `compareRepayment(base, extra)` → `{ yearsSaved, monthsSaved, interestSaved, newPayoffDate }`.
- Validated against the workbook amortisation sheet ($1,062,500 @ 5.35%/30y →
  payment $5,933.15/mo, total interest ≈ $1,073,432).

### equity.ts
- Per property: `maxLending = value·maxLVR(use)`, `usableEquity = maxLending − linkedDebt`,
  LVR, valuation range across `PropertyValuation[]` (each valuation shows its own usable-equity
  consequence — the "valuation A vs valuation B" demo).
- Portfolio: totals, portfolio LVR, `maxPurchaseWithEquityAsDeposit = usable / 0.30`.

### fhb.ts
- Deposit stack (KiwiSaver + savings + gifts − buffer), deposit %, loan, LVR bucket,
  low-equity margin from policy table, effective rate, repayments at each deposit tier
  (5/10/15/20%), comfortable-vs-maximum comparison (bank max from servicing vs
  adviser-set comfortable target), upfront-cost card from `costAssumptions` RuleSet
  (lawyer/valuation/building report/LIM/buffer with when-paid stages).

### refinance.ts
- `breakFeeEstimate = (contractRate − currentMarketRate)·balance·daysToExpiry/365` (labelled
  estimate), `cashback = balance·cashbackRate`, clawback repayment if within window,
  `netUpfront`, 12/24/36-month benefit, break-even months, stay/refix/refinance comparison,
  fixed-expiry timeline data for all splits.

### investment.ts
- Gross yield, net yield, weekly/monthly/annual cashflow (rent − rates − insurance − PM% −
  maintenance − vacancy allowance − interest), cash required, portfolio deltas,
  **servicing drag**: stressed repayment + costs − recognised rent = monthly personal-income
  subsidy under lender stress testing (≥0 means the property carries itself in the test).
- `scenarioLab` composition is handled by the scenario engine (sell/buy/refinance changes).

### kiwisaver.ts
- Monthly compounding projection: employee + employer (3% less ESCT approx, configurable) +
  government contribution (versioned), salary growth, fees drag, low/base/high return modes;
  balance at 5y/10y/retirement; first-home withdrawal note if intent flagged.
- Retirement income contribution at the configured drawdown heuristic.

### retirement.ts
- Assets FV at low/base/high growth; mortgage-free check vs retirement age (from amortisation);
  NZ Super (versioned fortnightly table); income = drawdown%·liquid assets + super;
  gap vs goal. Drawdown labelled "4% planning assumption — not a guarantee", editable.

### insurance.ts
- Needs analysis: life-cover need = debt clearance + income replacement (years × net income ×
  replacement %) + dependants allowance − liquid offsets; gap vs existing cover per kind;
  premium burden as % of net income. No pricing, no market comparisons — status +
  "specialist review recommended" flags only.

### revolving.ts
- Option A (higher P&I) vs Option B (revolving/offset with assumed average float balance and
  monthly transfer discipline): interest paths, payoff dates, flexibility notes; explicit
  "saving depends on behaviour" framing; downside case if facility is redrawn.

## Fixture policy

`tests/fixtures.ts` embeds expected values computed by the source workbooks
(e.g. Client A: recognised income $10,538.17/mo, UMI $6,854.66, max lending $1,030,307.51;
Client B: recognised income $14,094.61, living $5,013.71, debt $6,798.05, UMI $2,282.84,
max lending $343,128.81, DTI headroom $1,443,624). Where the engine intentionally diverges
(current tax table, standard DTI definition), the divergence is documented in the test file —
the workbook value is still asserted using the workbook-era RuleSet, never silently
"corrected".
