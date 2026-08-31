# Screen Hierarchy (Phase 1)

```
/ (demo selector: FHB · Homeowner · Investor)
└─ Workspace  [mode toggle: Adviser | Presentation]  [scenario tabs: Baseline | A | B …]
   ├─ 01 Your Goals              — goal cards, editable in adviser mode
   ├─ 02 Where You Are Today     — adaptive position stats + net-worth composition
   ├─ 03 How The Bank Sees You   — income recognition waterfall (actual → recognised),
   │                               living-cost buckets vs actual spending, stressed debt,
   │                               UMI headline; per-item "why scaled" tooltips
   ├─ 04 Borrowing Power         — capacity range band, lender comparison, explain-difference,
   │                               rent/deposit sensitivity (FHB: deposit tiers + comfortable
   │                               vs maximum + money-before-settlement)
   ├─ 05 Explore Your Options    — client-type specific lab:
   │       FHB: purchase price/deposit sliders
   │       Homeowner: repayment lab (amortisation curves), revolving credit modeller,
   │                  refinance/refix comparison + fixed-expiry timeline
   │       Investor: portfolio dashboard, investment calculator (servicing drag),
   │                 scenario columns (keep+buy / sell+buy / …)
   ├─ 06 KiwiSaver & Retirement  — projection (low/base/high), retirement gap, 4% heuristic
   ├─ 07 Protection              — cover status, gap analysis, premium burden
   ├─ 08 Your Blueprint          — recommended scenario: Current → Change → Result,
   │                               benefits/risks/considerations, meeting summary draft
   ├─ [floating] Copilot bar     — "Ask Blueprint to model something…" (adviser mode only)
   ├─ [floating] What changed?   — top diffs vs baseline + Why did this happen?
   └─ [drawer]  How was this calculated? — audit lines + rule set provenance
```

Navigation is a persistent left rail (numbered journey). Sections render only when relevant
to the client type (a FHB never sees the portfolio dashboard; an investor never sees the
deposit stack).
