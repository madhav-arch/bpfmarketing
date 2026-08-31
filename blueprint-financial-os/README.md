# Blueprint Financial OS — Phase 1 prototype

An interactive financial modelling and presentation platform for Blueprint Finance strategy
sessions. Client-facing name: **Your Financial Blueprint**.

Not a budgeting app, not a CRM, not a prettier spreadsheet — a live meeting instrument:
the adviser shares their screen on Google Meet, walks the client through a guided
"Blueprint Journey" (goals → position → how the bank sees you → borrowing power → options →
future trajectory → protection → recommended blueprint), changes assumptions live, and every
number on screen recalculates deterministically.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # vitest — engine regression fixtures from the source workbooks
npm run build
```

Best experienced at ~1440×900 (the screen-share resolution it is designed for).

## The 60-second demo

1. Pick **First-home buyers** → walk sections 01–04. On *How The Bank Sees You*, hover the
   scaled income lines and living-cost buckets.
2. In the copilot bar type: `Add a boarder paying $250 per week` → **Apply** → watch
   capacity, UMI and the snapshot rail move; the *What changed?* panel explains why.
3. Try `What if we use a 10% deposit instead?` and `What if interest rates go to 7%?`.
4. Switch to **Homeowner / restructure** → section 05 → click **+$500/fn** → the amortisation
   curve visibly drops; years and interest saved appear immediately.
5. Switch to **Property investors** → section 05 → compare *keep + buy* vs *sell + buy*
   columns; click a column header to load that strategy live.
6. Section 08: **Set as Recommended Blueprint** → *Generate draft* for the engine-derived
   post-meeting summary (adviser approval gated).
7. Toggle **Presentation mode** to hide adviser tooling for screen sharing.

## Architecture in one paragraph

`lib/calculators` is a pure, deterministic engine (servicing, amortisation, equity, FHB,
refinance, investment, KiwiSaver, retirement, protection, revolving-credit) parameterised by
versioned RuleSets in `lib/rules` (tax tables, lender policies, modelling assumptions — each
dated, sourced, and flagged if it requires adviser confirmation). `lib/scenarios` applies
non-destructive `ScenarioChange[]` to an immutable baseline client and diffs results.
`lib/ai` is the copilot seam: a deterministic local parser translates adviser language into
structured changes — **the AI never calculates numbers**; an LLM provider can plug in behind
the same interface later. See `docs/` for the full analysis, architecture, data model,
calculation engine notes and screen hierarchy.

## Data & confidentiality

All demo clients in `lib/data` are anonymised composites derived from the *structure* of real
client files — no real names, addresses, contact details or identifying information appear
anywhere in this repository. Everything on screen is illustrative modelling, not financial
advice.
