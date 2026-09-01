# Iteration 2 — Gap Analysis

Audit of the Phase 1 prototype against the Iteration 2 brief, item by item.

> **Note on the feedback PDF.** The PDF did not arrive with the original
> Iteration 2 message, so the first pass ran against the written 58-section
> brief. The PDF was supplied afterwards and reconciled in full — see
> **PDF reconciliation** at the end of this document. The brief turned out to
> be a faithful expansion of the PDF; the reconciliation pass closed the six
> page-level details the brief had not fully carried over.

Status legend: **DONE** (already correct in Phase 1) · **PARTIAL** (exists but
falls short) · **MISSING** (not built) · → all PARTIAL/MISSING items are
implemented in this iteration.

---

## 1. Client strategy selector (§2)

- **FEEDBACK ITEM**: Explicit, editable FHB / HOMEOWNER / INVESTOR selector; shared financial core + contextual journey.
- **CURRENT BEHAVIOUR**: `client.clientType` is fixed per demo client; switching "mode" means switching client files. Journey sections are shared; only section 05 branches.
- **REQUIRED BEHAVIOUR**: A strategy selector at the top of Adviser Mode changes the journey, insights, scenario controls and recommendations for the *same* client data; classification is editable (FHB → homeowner → investor over time).
- **FILES / COMPONENTS AFFECTED**: `features/Workspace.tsx` (selector + clientType override), `features/OptionsSection.tsx`, `features/BlueprintSection.tsx`, `lib/insights/engine.ts`.
- **CALCULATION CHANGES**: None — one engine already serves all types.
- **DATA CHANGES**: `clientType` becomes an overridable presentation of the same `Client`.
- **STATUS**: PARTIAL → implemented (segmented selector, journey/labels/insights follow the selected strategy, data unchanged).

## 2. Data-source hierarchy & override provenance (§3)

- **FEEDBACK ITEM**: Every input has provenance (Fact Find / Akahu / adviser / client confirmed / bank policy / benchmark / assumption); overrides preserve originalValue, currentValue, source, overriddenBy, overriddenAt, reason.
- **CURRENT BEHAVIOUR**: `Sourced<T>` carries sourceType/sourceName/observedAt on valuations, balances, rent. Scenario changes are non-destructive over an immutable baseline, but there is no override log showing original → current with who/when/why.
- **REQUIRED BEHAVIOUR**: An override record for every adviser edit; provenance never destroyed.
- **FILES**: `lib/scenarios/overrides.ts` (new), `features/Workspace.tsx` (timestamps edits), audit drawer.
- **CALCULATION CHANGES**: None (the baseline-plus-ordered-change-log already guarantees originals survive).
- **DATA CHANGES**: Change entries gain `{at, by, reason?}` metadata; an override log view derives originalValue/currentValue per edited field.
- **STATUS**: PARTIAL → implemented.

## 3. Akahu as a BankDataProvider abstraction (§4)

- **FEEDBACK ITEM**: `BankDataProvider` interface with AkahuProvider / DemoBankProvider / ManualProvider / CSVProvider; one-off account-information flow; server-side routes only; "Connect financial data" button; data-status states; never "upload statements".
- **CURRENT BEHAVIOUR**: `scripts/akahu-pull.ts` (adviser-run, server-side, PII-redacted snapshot) + `demoFeedFor` fallback inside `useFeed`. No formal provider interface, no in-app connect affordance, no CSV path, no data-status chip beyond "Akahu connected / Demo feed".
- **REQUIRED BEHAVIOUR**: Formal provider abstraction, an API route boundary that keeps tokens server-side, a prominent connect card with the specified copy, and a four-state data status (Fact Find only / Akahu connected / Client confirmed / Needs review).
- **FILES**: `lib/data-sources/providers.ts` (new), `app/api/akahu/snapshot/route.ts` (new, server-side; static builds emit a not-connected stub so the single-file demo still works), `features/LiveDataPanel.tsx`, `features/Workspace.tsx`.
- **CALCULATION CHANGES**: None.
- **DATA CHANGES**: `FeedSnapshot` unchanged (already the normalised contract).
- **STATUS**: PARTIAL → implemented.

## 4. Transaction intelligence: three separate concepts (§5)

- **FEEDBACK ITEM**: AKAHU ACTUAL vs FACT FIND DECLARED vs BANK BENCHMARK — never blended.
- **CURRENT BEHAVIOUR**: Two tables blend the pairs (benchmark-vs-actual; actual-vs-declared). Salary/rent/boarder/commitment detection exists.
- **REQUIRED BEHAVIOUR**: One expense table with all three columns per category, plus difference and status.
- **FILES**: `lib/calculators/cashflow.ts` (`threeWayExpenseTable`), `features/LiveDataPanel.tsx` (rebuilt as ExpensesPanel).
- **CALCULATION CHANGES**: New three-way join across feed categories, declared Fact Find categories and the active policy benchmark buckets.
- **STATUS**: PARTIAL → implemented.

## 5. Expense screen redesign + adviser controls (§6)

- **FEEDBACK ITEM**: Per-category 3-way row + DIFFERENCE + STATUS; restrained red only when materially above benchmark; deterministic observations ("Dining is 11.2% of household net income and materially above benchmark", not "you spend too much"); adviser can edit / recategorise / mark one-off / mark discretionary / exclude from forward modelling / accept.
- **CURRENT BEHAVIOUR**: Variance colouring exists; flags are deterministic but not %-of-net-income phrased; no per-row adviser actions.
- **FILES**: `lib/calculators/cashflow.ts`, `features/LiveDataPanel.tsx`.
- **CALCULATION CHANGES**: Observations computed from category ÷ net income and category ÷ benchmark ratios; excluded rows and one-offs flow into the forward model via `setLivingCostDelta` scenario changes (single engine).
- **STATUS**: PARTIAL → implemented.

## 6. Outlier transactions — "Items worth checking" (§7)

- **FEEDBACK ITEM**: List meaningful one-off transactions (flights, furniture, repairs…) with merchant, date, amount, likely category, recurring?, include-in-ongoing toggle. Never silently treat one-offs as permanent monthly spend.
- **CURRENT BEHAVIOUR**: Not built; large one-offs sit inside monthly category averages.
- **FILES**: `lib/calculators/cashflow.ts` (`detectOutliers`), `features/LiveDataPanel.tsx`, `lib/data-sources/demoFeed.ts` (seeded outliers so the demo shows them).
- **CALCULATION CHANGES**: Outlier detection = single transactions ≥ threshold vs category norm and non-recurring by cadence; excluding one adjusts the AKAHU ACTUAL averages deterministically.
- **STATUS**: MISSING → implemented.

## 7. Financial position page rework (§8)

- **FEEDBACK ITEM**: Separate ASSETS/DEPOSIT from INCOME/CASHFLOW; FHB deposit sources editable individually (KiwiSaver/cash/gift/other) with instant downstream recalculation; net income editable; click-to-edit everywhere; sliders never the only path.
- **CURRENT BEHAVIOUR**: Stat cards mix asset and income figures; deposit sources display-only; net income not editable.
- **FILES**: `features/CoreSections.tsx` (TodaySection rebuilt), `components/ui.tsx` (`EditableValue`), `lib/scenarios/changes.ts` (`setIncome`).
- **CALCULATION CHANGES**: Editable net income inverts to gross via the existing `grossFromNetMonthly` bisection so tax stays consistent.
- **STATUS**: PARTIAL → implemented.

## 8. Income breakdown table (§9)

- **FEEDBACK ITEM**: Clean table per applicant (gross / PAYE / KiwiSaver / net), then other income lines with ACTUAL / BANK RECOGNISED / SCALING % from the active BankPolicy; add-income buttons.
- **CURRENT BEHAVIOUR**: `RecognitionBars` infographic; scaling shown in prose. No PAYE/KiwiSaver decomposition on screen; no add buttons.
- **FILES**: `features/CoreSections.tsx`, `lib/calculators/tax.ts` (already decomposes), `lib/calculators/servicing.ts` (already emits scaling per line).
- **STATUS**: PARTIAL → implemented (table + "+ Boarder / + Rental / + Overtime / + Other" actions).

## 9. "How the bank sees you" rebuilt as four blocks (§10)

- **FEEDBACK ITEM**: A NET INCOME (editable) · B BANK LIVING COSTS (rows) · C DEBT COMMITMENTS (limit / assessment % / monthly, policy-driven, not hardcoded 4%) · D STRESS-TESTED CAPACITY, making "the surplus becomes the maximum stress-tested repayment" visually obvious; test rate configurable.
- **CURRENT BEHAVIOUR**: Waterfall chart + two cards. Educational but abstract; card factor comes from policy (correct) but the A→B→C→D teaching structure is absent; test rate not editable in the UI.
- **FILES**: `features/CoreSections.tsx` (BankViewSection rebuilt), `lib/scenarios/changes.ts` (`setStressRate`), `lib/scenarios/apply.ts`, `lib/scenarios/compute.ts`.
- **CALCULATION CHANGES**: Stress-rate override threads through servicing and all lender maths as a scenario change (still a versioned assumption, never a magic number).
- **STATUS**: PARTIAL → implemented.

## 10. Borrowing capacity screen (§12) + live servicing levers (§13)

- **FEEDBACK ITEM**: Keep lender comparison; Comfortable vs Maximum with an editable custom amount; per-option purchase/deposit/loan/rate/repayment + WEEKLY/FORTNIGHTLY/MONTHLY toggle; ~6% default *client* repayment rate, editable and labelled, shown alongside the bank test rate; quick levers (add boarder / close card / reduce limit / increase income / remove personal loan / change deposit) with BEFORE → AFTER.
- **CURRENT BEHAVIOUR**: Lender comparison strong (kept). Comfortable-vs-max is display-only; no frequency toggle; modelling rate not surfaced as editable; no lever row.
- **FILES**: `features/CoreSections.tsx` (CapacitySection rebuilt), `components/ui.tsx` (`FreqToggle`), `lib/scenarios/changes.ts` (`setCreditCardLimit`, `removeDebt`, `setIncome`).
- **CALCULATION CHANGES**: Levers precompute BEFORE→AFTER through the same `applyScenario`+`computeServicing` path used on apply — no separate demo maths.
- **STATUS**: PARTIAL → implemented.

## 11. FHB purchase page fully interactive (§14) + deposit tiers as levels (§15) + low equity (§16)

- **FEEDBACK ITEM**: Every purchase input editable (price, deposit stack, base rate, margin, term, frequency); tiers presented as unlockable levels with "$X more required" that unlock live when gift/cash is added; low-equity modelled as baseRate + margin = effectiveRate with an editable margin; tier change re-applies the applicable margin automatically.
- **CURRENT BEHAVIOUR**: Price slider only; tiers table shows achievable/`out of reach today` but not the shortfall; margin from policy bands only, not adviser-overridable; no per-tier cash-buffer-remaining.
- **FILES**: `lib/calculators/fhb.ts` (tier shortfall, buffer remaining, margin override), `features/OptionsSection.tsx` (FhbLab rebuilt), `lib/scenarios/changes.ts` (`setLowEquityMargin`, `setLoanTerm`).
- **CALCULATION CHANGES**: `DepositTier` gains `additionalRequired` and `cashBufferRemaining`; `computeFhb` accepts `lemOverride` and `termYears` from the scenario.
- **STATUS**: PARTIAL → implemented.

## 12. Buying costs + ongoing ownership costs (§17)

- **FEEDBACK ITEM**: Expanded configurable cost items with AMOUNT / WHEN PAID / REQUIRED-OPTIONAL; ongoing ownership costs (rates default $350/mo, insurance $150/mo, editable) and TOTAL COST OF OWNERSHIP / MONTH.
- **CURRENT BEHAVIOUR**: Upfront costs panel exists with stages; no required/optional flag, no moving costs, no ongoing ownership costs, repayment shown alone.
- **FILES**: `lib/rules/assumptions.ts` (OWNERSHIP_COSTS rule set + moving costs), `lib/calculators/fhb.ts` (ownership-cost block), `features/OptionsSection.tsx`, `lib/scenarios/changes.ts` (`setOwnershipCost`).
- **STATUS**: PARTIAL → implemented.

## 13. Cashback modelling (§18)

- **FEEDBACK ITEM**: Configurable cashbackAmount / retentionMonths / clawbackMethod / timing / eligibility; demo $5,000 · 36 months · pro-rata; clawback-if-refinanced estimate + small timeline; never presented as a universal entitlement.
- **CURRENT BEHAVIOUR**: `cashbackRate` exists in policies and refinance break-even uses clawback owed, but there is no FHB cashback module or timeline.
- **FILES**: `lib/rules/assumptions.ts` (CASHBACK_EXAMPLE rule set), `lib/calculators/fhb.ts` (cashback block with pro-rata clawback curve), `features/OptionsSection.tsx`, `lib/scenarios/changes.ts` (`setCashback`).
- **STATUS**: MISSING → implemented.

## 14. FHB purchase timeline (§19)

- **FEEDBACK ITEM**: FIND PROPERTY → OFFER → CONDITIONS → KIWISAVER/FINANCE → UNCONDITIONAL → SETTLEMENT with plain-English notes, condition reminders, the unsigned-S&P legal-cost warning, configurable "~9 working days" KiwiSaver processing with "Allow sufficient time – actual processing can vary", and a highlighted timing dependency when KiwiSaver is most of the deposit.
- **CURRENT BEHAVIOUR**: Not built.
- **FILES**: `lib/rules/assumptions.ts` (KiwiSaver withdrawal workflow assumption), `features/OptionsSection.tsx` (PurchaseTimeline).
- **STATUS**: MISSING → implemented.

## 15. Save Scenario as a first-class feature (§20) + comparison (§21)

- **FEEDBACK ITEM**: SAVE SCENARIO captures an immutable snapshot; DUPLICATE / RENAME / DELETE / SET AS RECOMMENDED / COMPARE; 2–4 scenarios side by side showing meaningful differences with better/worse/trade-off highlighting (not naive green).
- **CURRENT BEHAVIOUR**: Working scenarios exist as tabs with close/undo/save-as-copy and set-recommended; nothing is immutable; comparison exists only as the investor preset table.
- **FILES**: `features/Workspace.tsx` (saved-scenario model + toolbar), `features/CompareView.tsx` (new), `lib/scenarios/diff.ts`.
- **CALCULATION CHANGES**: Comparison computes each scenario through `computeAll` and diffs against the first column with per-row `goodWhen` semantics (purchase price is a trade-off, not "higher is worse").
- **STATUS**: PARTIAL → implemented.

## 16. Mortgage amortisation (§22) & homeowner journey (§23)

- **FEEDBACK ITEM**: Real amortisation on FHB *and* homeowner; quick-adds +$50/wk +$100/wk +$250/fn +$500/fn + CUSTOM; outputs (normal vs selected repayment, mortgage-free date, original/new term, years-months saved, total interest both paths, interest difference); homeowner page framed as "what happens if nothing changes?" vs restructure.
- **CURRENT BEHAVIOUR**: Homeowner has the chart + some quick-adds (different denominations) and stats; FHB has no amortisation view; no custom input; several outputs implicit.
- **FILES**: `features/OptionsSection.tsx` (shared RepaymentLab used by FHB + homeowner), `lib/calculators/amortisation.ts` (already correct).
- **STATUS**: PARTIAL → implemented.

## 17. Investor mode (§24) + investor scenarios (§25)

- **FEEDBACK ITEM**: Editable property cards (value/source/debt/rent/rates/insurance/mgmt/maintenance/yield/cashflow/LVR/equity); quick actions KEEP+BUY, SELL+BUY, REFINANCE+BUY, HOLD, SELL, CHANGE RENT/VALUE/RATE, IO↔P&I; sale releases equity through the engine (already true).
- **CURRENT BEHAVIOUR**: Portfolio dashboard + preset strategy columns; property cards read-only; some quick actions only via copilot.
- **FILES**: `features/OptionsSection.tsx` (InvestorLab rebuilt with editable cards + action row).
- **CALCULATION CHANGES**: None — `sellProperty`/`buyProperty`/`setRent`/`addValuation`/`setInterestOnly` already run through one engine.
- **STATUS**: PARTIAL → implemented.

## 18. KiwiSaver first-home withdrawal (§26), modeller (§27), benchmark provider (§28), controls (§29)

- **FEEDBACK ITEM**: Withdrawal modelled as a visible projection event; retirement projection starts from the post-withdrawal position; interactive modeller (contribution %, salary growth, return, inflation, retirement age, lump sums, withdrawal); fund-type comparison Cash→Aggressive without implied recommendations; `KiwiSaverBenchmarkProvider` (licensed Morningstar / Sorted / adviser CSV / manual) — no scraped Morningstar data, no Milford-as-national-average, "Historical return assumption" + past-performance disclaimer.
- **CURRENT BEHAVIOUR**: Projections (low/base/high) exist; `fundTypeReturnHint` exists but unused in UI; no withdrawal event; no modeller controls; no provider abstraction.
- **FILES**: `lib/calculators/kiwisaver.ts` (withdrawal event + lump sums in projection), `lib/kiwisaver/benchmarkProvider.ts` (new), `lib/scenarios/changes.ts` (`kiwiSaverLumpSum`, `setRetirementAge`, `setInflation`), `lib/scenarios/compute.ts`, `features/PlanningSections.tsx` (modeller + fund comparison).
- **CALCULATION CHANGES**: Projection supports `withdrawal: {year, keep}` (first-home rules keep $1,000) and one-off lump sums; retirement pulls the post-withdrawal path.
- **STATUS**: PARTIAL/MISSING → implemented.

## 19. Nominal vs today's dollars (§30) + retirement page (§31)

- **FEEDBACK ITEM**: Every long-term projection shows NOMINAL and TODAY'S DOLLARS with an editable inflation assumption; retirement page shows target age, years until, mortgage-free date, all asset lines, NZ Super, desired vs projected income, shortfall/surplus, annual **and weekly** income in today's dollars, "4% is a planning heuristic, not a guarantee".
- **CURRENT BEHAVIOUR**: Everything is nominal; the 4% heuristic wording exists; no weekly figure; inflation fixed at 2% in a rule set but not editable.
- **FILES**: `lib/calculators/finance.ts` (`todaysDollars`), `lib/calculators/retirement.ts`, `lib/calculators/kiwisaver.ts`, `features/PlanningSections.tsx`, `lib/scenarios/changes.ts` (`setInflation`).
- **STATUS**: MISSING → implemented (this was called critical; it now applies to KiwiSaver horizons, retirement income and net-worth projections).

## 20. Life events (§32)

- **FEEDBACK ITEM**: Events change the trajectory from their effective date.
- **CURRENT BEHAVIOUR**: Events display on a timeline and some (childcare-end via copilot) adjust living costs, but most are annotations.
- **FILES**: `lib/calculators/retirement.ts` (`netWorthTrajectory` applies event monthly impacts from effective dates as cash deltas), `features/PlanningSections.tsx`.
- **STATUS**: PARTIAL → improved (monthly-impact events now shift the cash line of the trajectory from their start date; property-transaction events already flow through scenario changes).

## 21. Protection expansion (§33) + insurance benchmarking (§34)

- **FEEDBACK ITEM**: Capture premiums/sums per cover type; total premium/month and % of net income; indicative need vs cover vs gap; `InsuranceBenchmarkProvider` — no fabricated "NZ national average premium", ratio-based flags plus adviser prompts ("High health premium detected – confirm insured people, excess and benefits"), never "over-insured" from premium alone.
- **CURRENT BEHAVIOUR**: Needs analysis + premium burden % exist; no per-policy premium table, no provider abstraction, no cohort hooks, prompts partially there.
- **FILES**: `lib/insurance/benchmarkProvider.ts` (new), `lib/calculators/insurance.ts` (premium table + prompts), `features/PlanningSections.tsx`.
- **STATUS**: PARTIAL → implemented.

## 22. Recommended Blueprint redesign (§35–37) + deterministic rationale (§38)

- **FEEDBACK ITEM**: Rebuild as the culmination: FHB CURRENT POSITION → PROPOSED PURCHASE → OPTIMISATION → LONG TERM; homeowner CURRENT → BLUEPRINT → RESULT; investor CURRENT PORTFOLIO → PROPOSED STRATEGY → RESULT. Benefits / Risks / Considerations generated from deterministic scenario facts (AI may polish wording, never invent reasons).
- **CURRENT BEHAVIOUR**: Generic three-card Current→Change→Result with static default rationale text the adviser edits.
- **FILES**: `lib/summary/rationale.ts` (new deterministic generator), `features/BlueprintSection.tsx` (rebuilt per client type).
- **STATUS**: PARTIAL (acknowledged weak) → implemented.

## 23. Insight engine expansion (§39)

- **FEEDBACK ITEM**: Insights carry type/severity/calculation/source/explanation/suggested adviser question; add missing detectors (deposit near tier unlock, expense category materially above benchmark, KS withdrawal reduces retirement, premium burden, declared-vs-actual divergence, current repayment could clear earlier).
- **CURRENT BEHAVIOUR**: 9 detectors with severity/supporting/sourceRuleSetId/discuss; several of the named detectors missing.
- **FILES**: `lib/insights/engine.ts`.
- **STATUS**: PARTIAL → implemented.

## 24. Blueprint Copilot chat (§40) + structured tools (§41) + change preview (§43)

- **FEEDBACK ITEM**: A real compact chat ("BLUEPRINT COPILOT", placeholder "Ask Blueprint to model a change…"), tools-only mutation (updateIncome, addBoarder, closeCreditCard, changePurchasePrice, sellProperty, changeKiwiSaverContribution, addLifeEvent, changeInflation, changeRetirementAge, …), preview "I understood:" with APPLY / EDIT / CANCEL, then BEFORE / AFTER / CHANGE plus SAVE AS SCENARIO.
- **CURRENT BEHAVIOUR**: Single-line bar with chips + Apply/Discard; the structured-change discipline already holds (parser emits `ScenarioChange` only). No conversation, no preview→result framing, no save-as-scenario from the result, missing verbs (inflation, retirement age, KiwiSaver lump sum, card limit, income edit).
- **FILES**: `features/Copilot.tsx` (new chat panel), `lib/ai/localParser.ts` (new verbs), `lib/scenarios/changes.ts`.
- **STATUS**: PARTIAL → implemented.

## 25. Bank policy knowledge base (§42)

- **FEEDBACK ITEM**: `BankPolicyKnowledgeBase` + POLICY LIBRARY screen (lender, type, effective, uploaded, status, last reviewed); policy questions answered only from verified material, otherwise the exact "I don't yet have enough verified … " response.
- **CURRENT BEHAVIOUR**: Five verified lender rule sets exist with provenance (the extracted calculators) and drive the comparison drivers list; no library screen, no Q&A gate.
- **FILES**: `lib/policy/knowledgeBase.ts` (new), `features/PolicyLibrary.tsx` (new section), copilot integration for "why does X lend more" questions.
- **STATUS**: PARTIAL → implemented.

## 26. Blueprint snapshot redesign (§44) + opportunity cards (§45)

- **FEEDBACK ITEM**: TODAY vs YOUR BLUEPRINT columns with explicit timeframes (never compare a today-number to a future-number unlabelled); 2–4 clickable, modelable opportunity cards beneath.
- **CURRENT BEHAVIOUR**: Single-column snapshot in the left rail; no opportunity cards.
- **FILES**: `features/Workspace.tsx` (rail snapshot two-column), `features/BlueprintSection.tsx` (full snapshot + opportunity cards from the insight engine).
- **STATUS**: PARTIAL → implemented.

## 27. Post-meeting summary (§46) + copy/export (§47)

- **FEEDBACK ITEM**: Generated from baseline + recommended scenario + deterministic insights + adviser notes; scenario table; every figure maps to engine output; COPY EMAIL SUMMARY / EXPORT PDF / COPY SCENARIO / PRINT VIEW; concise.
- **CURRENT BEHAVIOUR**: `buildMeetingSummary` uses engine figures with an approval gate; no scenario table, no adviser notes input, only clipboard copy.
- **FILES**: `lib/summary/meetingSummary.ts`, `features/BlueprintSection.tsx` (adds notes, scenario table, print view via `window.print`, copy-scenario JSON).
- **STATUS**: PARTIAL → implemented (PDF export = the print/presentation view routed through the browser's print-to-PDF; a server PDF renderer is a production item).

## 28. Design & copy (§48–51)

- **FEEDBACK ITEM**: Information density without clutter; hierarchy headline-insight → key number → comparison → control → explanation; charts only where they clarify; no double hyphens in client-facing prose; natural NZ English; direct manipulation with exact numeric fields always preserved; smooth interpolation (exists via AnimatedNumber); plain-language explanations with technical detail behind "How was this calculated?"; Indicative/Modelled/Estimated language, never Guaranteed/Approved.
- **CURRENT BEHAVIOUR**: Mostly compliant; a few decorative gaps and em-dash-heavy client copy; sliders exist without paired numeric fields in one place.
- **STATUS**: PARTIAL → applied across rebuilt screens (every slider now pairs with a numeric field; client-facing copy sweep for certainty language and punctuation).

## 29. Versioned rules — no magic numbers (§52) & performance (§54)

- **CURRENT BEHAVIOUR**: Already the architecture: stress rates, scalings, card factors, UMI floors, LVR, DTI, LEM bands, cashback rate, KiwiSaver/govt settings, tax, inflation, growth, loan rates all live in versioned rule sets; two sale constants sat in `apply.ts` (documented, now sourced from the modelling rule set); recalcs are pure local functions well under 100ms; the LLM is never in the recalc path.
- **STATUS**: DONE (minor cleanup done); performance verified in tests.

## 30. Tests (§53)

- **FEEDBACK ITEM**: 13 named critical tests.
- **CURRENT BEHAVIOUR**: 81 tests cover workbook parity, scenario engine, data sources, bank policies. Of the 13: gift→deposit, tier→LVR/LEM, close-card→capacity, boarder scaling, sell-property equity release and baseline-immutability exist in some form; +$500/fn amortisation, frequency-annual-equivalence, rent→servicing-scaling, KS withdrawal, KS contribution, inflation/today-dollars, and AI-equals-manual are missing.
- **FILES**: `tests/iteration2.test.ts` (new).
- **STATUS**: PARTIAL → implemented (all 13 present and passing).

## 31. Missing source data (§55) & domain corrections (§56)

- **STATUS**: `/docs/data-required-from-blueprint.md` written this iteration. Domain corrections verified: card % is per-policy (3–5% from the calculators, adviser-configurable), test rate is per-policy and now scenario-editable, $5k/36mo/pro-rata cashback ships as a labelled configurable example, no Morningstar/Milford/insurance averages are fabricated anywhere, and no "over-insured" wording exists (needs analysis says "potential surplus … specialist review").

---

## PDF reconciliation (feedback PDF supplied after the first pass)

Each annotation in the 8-page PDF, against the build:

| PDF annotation | Status |
|---|---|
| Explain Akahu under homeowner/investor; direct access to load the data (not statements) | DONE — "Connect financial data" card renders for every client type; copy explains the one-off account-information flow and the access model (personal test connections free; client connections need Blueprint's commercial Akahu app — Akahu charges the business, not the client) |
| Pick FHB / existing homeowner / property investor and the numbers populate | DONE — editable strategy selector over one shared financial core |
| Deposit and income separated; KiwiSaver / cash / gift editable on the page; net income editable, pre-populated via Akahu; expenses editable via Akahu | DONE — deposit stack fully editable; net income click-to-edit (gross re-solved through PAYE); **expense amounts now editable in place** (reconciliation pass): the Akahu-actual cell adjusts forward modelling without rewriting feed data, the Fact Find cell edits the declared figure |
| Actual in red, benchmark on the right, Akahu-detected income, yellow-box notes for high categories | DONE — restrained red only when materially above benchmark; per-category observations in note boxes |
| Bank view: table style with a drag bar for net income; show KiwiSaver and PAYE removed; benchmark + broken-down fixed commitments; 4% card; actual loan repayments before the surplus; surplus = repayment at the test rate; fixed expenses manually changeable; boarder/rent addable everywhere with scaling shown; no double hyphens; outliers listed | DONE — reconciliation pass added: gross → PAYE+ACC → KiwiSaver → net strip, a drag bar paired with the exact field, **fixed commitments itemised line by line and editable**, and an explicit actual-vs-stressed repayment callout in block C. Card % is policy-driven (3–5% per verified calculator), test rate editable |
| Comfortable vs maximum interchangeable; repayments over the life of the mortgage at ~6% assumption; weekly/fortnightly/monthly; boarder / cancel-cards with live borrowing change | DONE — custom amount editable, frequency toggle, live levers with before → after; demo FHB client rate set to the requested 6% default (editable, labelled as an assumption) |
| Deposit changeable with live loan; editable low-equity margin and effective rate; fortnightly repayments; tiers as "unlocked"; save scenario feeding the client email | DONE — plus the saved-scenario table lands in the generated summary |
| Under-20% cashback $5,000 pro-rata over 3 years; explain payback and when it arrives | DONE — modelled as a labelled configurable offer (per the brief's own domain correction that cashback is never a universal entitlement), with payment timing and a clawback timeline |
| Timeline: KiwiSaver-heavy deposits need the signed S&P + ~9 working days; conditions (finance, building report, LIM, solicitor); unsigned S&Ps increase legal costs; $150/mo insurance + $350/mo rates in cost of ownership | DONE — all present, plain-English, with the KiwiSaver timing dependency highlighted automatically when it dominates the deposit |
| Future trajectory: scenario when KiwiSaver is emptied; inflation-adjusted "worth today at 65"; contribution and fund-type options with Morningstar/Milford figures | DONE for the mechanics (withdrawal event, nominal vs today's dollars, contribution/lump-sum/return controls, Cash→Aggressive comparison). Data source follows the brief's own correction: labelled long-term category assumptions with the past-performance disclaimer; the Morningstar adapter activates when a licensed feed is supplied — one provider's historic returns are never presented as a national average |
| Protection: premiums listed; national-average comparison, over-insured flag; prompt adviser if health/life high | DONE for premiums + prompts. Per the brief's correction, no fabricated national average and no over-insured verdict from premium alone — ratio-based flags plus the exact adviser prompts, with the dataset seam ready if credible NZ data is licensed |
| Blueprint page: map cashflow → benchmark → repayments → stress test → surplus at the test rate; FHB purchase at various amounts; extra payments → mortgage-free year **and the KiwiSaver balance at that time**; benefits/risks/considerations + insights per type; post-meeting summary | DONE — reconciliation pass added the KiwiSaver-at-mortgage-free row to the FHB blueprint |
| "Model it" as an AI chat using bank policies and KiwiSaver compounding, making real changes | DONE — Blueprint Copilot chat mutates real scenario state through structured actions and answers policy questions only from the verified calculators. Send further bank policy documents and they join the knowledge base (see docs/data-required-from-blueprint.md for the list) |
| Snapshot clearer, showing the blueprint vs "what they could be at their best" | DONE — reconciliation pass added the "At your best" column: the current scenario with every open opportunity applied, computed deterministically from the same opportunity actions the cards model |
