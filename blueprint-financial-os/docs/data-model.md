# Data Model

All types live in `lib/domain/types.ts` with zod schemas in `lib/domain/schemas.ts`.
Monetary values are NZD numbers; frequencies are normalised through `lib/domain/frequency.ts`
(weekly ×52, fortnightly ×26, monthly ×12; weekly→monthly uses 52/12 with the workbook's 4.33
multiplier retained inside the Blueprint modelling RuleSet for fixture parity).

## Provenance

Every externally-sourced financial figure is a `Sourced<T>`:

```ts
interface Sourced<T> {
  value: T;
  sourceType: 'fact-find' | 'client-stated' | 'bank-internal-valuation' | 'avm'
            | 'registered-valuation' | 'adviser-estimate' | 'ird-summary' | 'statement'
            | 'demo-fixture';
  sourceName?: string;      // e.g. "Lender AVM", "Fact Find 2026-08"
  observedAt?: string;      // ISO date
  confidence?: 'low' | 'medium' | 'high';
  note?: string;
}
```

## Core entities

- **Client** — id, label, clientType ('fhb' | 'homeowner' | 'investor'), household,
  applicants[], goals[], properties[], mortgages[], otherDebts[], kiwiSaverAccounts[],
  insurancePolicies[], cash, expenses, financialEvents[], targetPurchase?, notes.
- **Applicant** — id, displayName (anonymised), age, employmentType, incomes: IncomeLine[]
  (kind: 'salary' | 'overtime-commission' | 'self-employed' | 'boarder' | 'rental' | 'other';
  gross annual or weekly; kiwiSaverRate; studentLoan flag).
- **Household** — adults, dependants, vehicles.
- **ExpenseProfile** — declared monthly by category (mirrors Fact Find categories) plus
  fixedCommitments used in servicing (insurances, rates, childcare, subscriptions, other).
- **Property** — id, nickname (anonymised, e.g. "Family home — Tauranga"), use
  ('owner-occupied' | 'investment'), ownership entity ('personal' | 'trust' | 'ltc' | 'company'),
  purchasePrice?, valuations: PropertyValuation[] (each Sourced), rentPerWeek?, ratesPerYear,
  insurancePerYear, propertyMgmtRate?, maintenanceRate?, linkedLoanIds.
- **MortgageFacility** — id, propertyId, lender, borrowerEntity, balance, rate, loanType
  ('fixed' | 'floating' | 'revolving' | 'offset'), interestOnly, fixedExpiry?, termRemainingYears,
  repayment { amount, frequency }, offsetBalance?.
- **OtherDebt** — kind ('credit-card' | 'personal-loan' | 'store-card' | 'other'),
  limit, balance, rate.
- **KiwiSaverAccount** — owner, provider, fundType ('conservative'…'aggressive'),
  balance, contributionRate, salaryForContribution, feesPercent?, firstHomeIntent?.
- **InsurancePolicy** — kind ('life' | 'trauma' | 'income-protection' | 'health' | 'other'),
  cover?, premiumMonthly, provider.
- **Goal** — id, kind (enumerated), label, targetYear?, targetAmount?, priority.
- **FinancialEvent** — id, kind ('parental-leave' | 'childcare-start' | 'childcare-end'
  | 'salary-change' | 'boarder-start' | 'boarder-end' | 'rent-change' | 'rate-expiry'
  | 'lump-sum' | 'property-sale' | 'property-purchase' | 'retirement' | 'other'),
  startDate, endDate?, monthlyImpact | amount, label.

## Rules

- **RuleSet** (see architecture.md) — versioned envelope.
- **LenderPolicy** — stressRate, maxTermYears, otScaling, boarderScaling { percent, maxBoarders },
  rentalScaling, creditCardMonthlyFactor, expenseBenchmark { single, couple, perDependant,
  perVehicle }, minUMI { belowThreshold, aboveThreshold, threshold }, dtiMultiple,
  lvrPolicy { ownerOccupiedMax, investmentMax }, lowEquityMargins: { lvrFrom, lvrTo, margin }[],
  cashbackRate, notes, source, verifiedAt.
- **TaxTable** — brackets[], accRate, accMaxIncome, studentLoanRate, studentLoanThresholdMonthly,
  effectiveFrom, label.

## Scenario layer

- **Scenario** — id, name, baselineClientId, changes: ScenarioChange[], createdAt,
  isRecommended?, rationale { benefits[], risks[], considerations[] } (adviser-editable).
- **ScenarioChange** — discriminated union, e.g.
  `{ kind: 'setPurchasePrice', value }`, `{ kind: 'setDepositPercent', value }`,
  `{ kind: 'adjustRepayment', delta, frequency }`, `{ kind: 'setRate', delta? , value? }`,
  `{ kind: 'setBoarder', perWeek, count? }`, `{ kind: 'setRent', propertyId?, perWeek }`,
  `{ kind: 'sellProperty', propertyId, price }`, `{ kind: 'buyProperty', price, rentPerWeek,
  interestOnly }`, `{ kind: 'setInterestOnly', loanId?, on }`, `{ kind: 'addRevolvingCredit',
  limit, funded }`, `{ kind: 'setKiwiSaverRate', applicantId?, rate }`,
  `{ kind: 'setSalaryGrowth', percent }`, `{ kind: 'setHouseGrowth', percent }`,
  `{ kind: 'addEvent', event }`, `{ kind: 'setLivingCostDelta', monthly }` …
- **CalculationResult** — snapshot { netWorth, umi, maxLending, dti, equity, … },
  perModule outputs (servicing, equity, amortisation, fhb, investment, kiwisaver, retirement,
  insurance, refinance?), each figure carrying `AuditLine[]` working and the ruleSet ids used.
- **Insight** — id, severity ('info' | 'opportunity' | 'attention'), category, message,
  supportingCalc: AuditLine[], sourceRuleSetId, discuss?: string.
- **Recommendation** — scenarioId, lockedResult, rationale, approvedByAdviser: boolean.
- **AuditEvent** — timestamp, actor, action, payload (in-memory ring buffer in Phase 1).
