# Bank Servicing Profiles

`lib/rules/nzBankPolicies.ts` encodes the five real bank servicing calculators
supplied by the adviser (ANZ LAC v11.4, ASB, BNZ Affordability v12.34,
Westpac Assess, Kiwibank Adviser HL Worksheet). Hidden/veryHidden parameter
sheets were read directly (ANZ `Variables`/`GLE expense`, BNZ `Sheet1`/`Glee
Table`, Westpac `Workings`, Kiwibank hidden calc sheets).

**The calculator workbooks themselves are NOT committed to this repository**
— they are bank-confidential broker tools and contain client data. Only the
extracted parameters live here, each policy carrying its release date,
source-cell notes and `requiresConfirmation: true`.

| Parameter | ANZ | ASB | BNZ | Westpac | Kiwibank |
|---|---|---|---|---|---|
| Test rate | 6.95% SSM | 6.95% | max(actual, 7.10% floor) | 6.95% LAR | 6.95% |
| OT / bonus / commission | as entered¹ | ~80%¹ | 80% | 80% | ~80%¹ |
| Rental income | 75% | 75% | 75% | 75% (offshore 60%) | 98% − 23% costs ≈ 75.5% |
| Boarder income | 50%, cap $450/wk² | 80% | 80%, cap $500/wk | 80% | 80% |
| Card limits /mo | 4.0% | 3.0% | 3.8% (incl. store/OD) | 3.8% (incl. BNPL) | 5.0% (OD 4%) |
| Living benchmark | $1,012 + $912 joint + $276/dep | $829 + $430/adult + $161/dep + 7% GMI | GLEE table (income band × deps) | income-band table, CPI-indexed ~2.1%/yr | CCCFA model (approximated) |
| Bank's own surplus floor | $100 | — | ~$1 MBS | $150 | — |
| Tax | all five: 2024 PAYE brackets + ACC 1.75% capped at $156,641; student loan 12% over $24,128 |

¹ not visible in the workbook — assumed, confirm with the bank/BDM.
² ANZ room-only board is 75% capped $300/wk (not modelled separately).

**Blueprint overlay:** per adviser instruction, a **$500/month minimum
surplus** is applied to every bank and *deducted* when sizing capacity —
$500/mo must remain at maximum lending. Banded benchmarks (BNZ GLEE, Westpac)
are approximated at typical dual-income bands; the full tables live in the
source workbooks.

**These parameters move with the economy.** Kiwibank's change log alone shows
its test rate at 5.5% → 6% → 7% → 6.95% over successive releases, and
Westpac's benchmark table carries explicit CPI uplifts. Re-extract on each
new calculator release and bump `effectiveFrom`.

**To be tested — check with adviser:** TSB, SBS Bank, Kiwibank (re-verify
against the latest release), Bank of China. These appear as muted marks in
the borrowing-power screen until their calculators are sourced.
