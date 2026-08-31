# Architecture — Blueprint Financial OS (Phase 1 prototype)

## Principles

1. **The AI is never the calculator.** Every number comes from a deterministic function in
   `/lib/calculators`, parameterised by a versioned RuleSet. The AI/NL layer only translates
   language → structured `ScenarioChange[]` → engine.
2. **Non-destructive scenarios.** The baseline client state is immutable; a Scenario is a list
   of changes applied functionally. Diffing two `CalculationResult`s powers "What changed?".
3. **Everything explainable.** Calculators return values *with working* (`AuditLine[]`), so any
   figure can open a "How was this calculated?" drawer citing rule set, effective date and
   source classification (regulation / lender policy / Blueprint modelling assumption).
4. **Adviser-first, presentation-ready.** One React tree, two render modes. Presentation mode
   hides assumptions, policy tables, the copilot bar and audit affordances.

## Layout

```
blueprint-financial-os/
├── app/                      # Next.js app router — thin shells only
│   ├── page.tsx              # demo selector → <Workspace/>
│   └── globals.css           # theme tokens, blueprint grid, motion
├── components/               # presentational primitives (Stat, Card, Delta, charts…)
├── features/                 # journey sections (goals, today, bank-view, capacity, …)
├── lib/
│   ├── domain/               # types + zod schemas + provenance
│   ├── rules/                # versioned RuleSets: tax tables, lender policies,
│   │                         #   Blueprint modelling assumptions, cost assumptions
│   ├── calculators/          # pure functions: tax, servicing, amortisation, equity,
│   │                         #   fhb, refinance, investment, kiwisaver, retirement,
│   │                         #   insurance, revolving
│   ├── scenarios/            # scenario engine, change application, diff/explain
│   ├── insights/             # deterministic insight rules
│   ├── ai/                   # ScenarioCopilot interface + LocalParser implementation
│   ├── summary/              # meeting-summary generator (from engine output only)
│   └── data/                 # anonymised demo clients (FHB / homeowner / investor)
├── tests/                    # vitest — regression fixtures from the source workbooks
└── docs/
```

## Data flow

```
DemoClient (immutable baseline)
   └─ Scenario { changes: ScenarioChange[] }
        └─ applyScenario(baseline, changes) → ClientState'
             └─ computeAll(ClientState', RuleSet) → CalculationResult
                  ├─ feeds every chart/stat (adviser + presentation modes)
                  ├─ diff(baselineResult, scenarioResult) → ExplainChange panel
                  ├─ insightEngine(result) → Insight[]
                  └─ buildMeetingSummary(client, scenario, result) → draft summary
Copilot input ─ LocalParser.parse(text, context) → ProposedChange[] (chips) ─ APPLY ─┘
```

## RuleSets

`RuleSet = { id, label, kind: 'regulation' | 'lender-policy' | 'modelling-assumption',
effectiveFrom, source, verifiedAt, requiresConfirmation?, … }` with typed payloads per rule
family (tax table, servicing policy, LVR policy, low-equity margins, cost assumptions,
KiwiSaver settings, retirement settings). Three lender policy variants (Bank A/B/C) ship in
the demo to power the borrowing-capacity *range* and lender comparison — they are fictional
but structurally faithful (expense benchmark / stress rate / boarder policy / credit-card
treatment differences), and clearly labelled as demo policies, not real bank policy.

## AI layer

`ScenarioCopilot` interface: `parse(utterance, context) → ParseResult` where
`ParseResult = { changes: ProposedChange[], unrecognised?: string }`.
Phase 1 ships `LocalParser` (regex/grammar over the example prompt families: purchase price,
deposit %, rates, repayments, boarder/rent, sell-to-buy, IO switch, KiwiSaver rate, salary
growth, events like childcare end/parental leave, age-horizon queries). An LLM-backed
implementation can be slotted behind the same interface later; the LLM would emit the same
`ProposedChange` JSON and never numbers.

## Phase 2 seams (deliberately stubbed interfaces)

- `BankFeedProvider` (CSV/manual now; CDR later) — `lib/data-sources/bankFeed.ts`
- `ValuationProvider` (manual now; AVM APIs later) — valuations already store
  `{ value, source, confidence, observedAt }`
- `FundDataProvider` for KiwiSaver comparison feeds
- Persistence: everything is serialisable state; a DB adapter can replace in-memory demo data.
- Client portal: presentation mode is already a restricted projection of the same state.
