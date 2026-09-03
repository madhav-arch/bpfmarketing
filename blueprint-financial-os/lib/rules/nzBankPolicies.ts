// Per-bank servicing policies reverse-engineered from the five bank
// calculators supplied by the adviser (releases dated Jun–Oct 2025/2026;
// hidden parameter sheets read directly). Every figure below was extracted
// from a workbook cell, not guessed — the `notes` field records the source
// cell family and anything approximated.
//
// IMPORTANT: these calculators change with the economy (test rates, CPI-
// indexed benchmarks — Westpac's table carries an explicit annual CPI uplift
// of ~2.1%). They are versioned rule sets: effectiveFrom = the release date
// found in the workbook, requiresConfirmation = always.
//
// Servicing pass conditions: per the adviser's calibration (meeting notes
// 3 Sep 2026), each bank carries its own pass condition rather than one
// blanket floor — ANZ $500/mo minimum surplus, ASB $300/mo, Westpac $180/mo,
// Kiwibank net servicing ratio ≤ 92%, BNZ servicing index ≤ 105%. All are
// deduction/cap semantics (the condition must still hold AT maximum lending)
// and all remain flagged requiresConfirmation for ongoing testing.

import type { LenderPolicy } from './types';

const COMMON = {
  kind: 'lender-policy' as const,
  verifiedAt: '2026-09-03',
  requiresConfirmation: true,
  maxTermYears: 30,
  weeklyToMonthly: 52 / 12,
  otherFinance: { rate: 0.139, termYears: 7 },
  umiFloorIsDeduction: true, // surplus floors must REMAIN at maximum lending
  dtiMultiple: 6,
  lvrPolicy: { ownerOccupiedMax: 0.8, investmentMax: 0.7 },
  lowEquityMargins: [
    { lvrFrom: 0.9, lvrTo: 0.95, margin: 0.012 },
    { lvrFrom: 0.85, lvrTo: 0.9, margin: 0.0075 },
    { lvrFrom: 0.8, lvrTo: 0.85, margin: 0.003 },
  ],
  cashbackClawbackMonths: 28,
};

export const ANZ_POLICY: LenderPolicy = {
  ...COMMON,
  id: 'anz-lac-2026-06',
  label: 'ANZ (LAC calculator v11.4)',
  lender: 'ANZ',
  effectiveFrom: '2026-06-22',
  source: 'ANZ Lending Affordability Calculator — Variables sheet (hidden), living-expense table dated 22 Jun 2026',
  stressRate: 0.0695, // Bank SSM (O/O and RIL both 6.95%); actual rate if higher
  minUMI: { threshold: 0, below: 500, above: 500 }, // $500/mo minimum surplus (adviser calibration 3 Sep 2026)
  otScaling: 1.0, // calculator takes "other weekly income (already taxed)" at face value — adviser enters a sustainable figure
  boarderScaling: { percent: 0.5, maxBoarders: 2, maxPerBoarderWeekly: 450 }, // all-inclusive board 50% capped $450/wk (room-only 75% capped $300/wk)
  rentalScaling: 0.75,
  creditCardMonthlyFactor: 0.04,
  expenseBenchmark: { single: 1012, couple: 1924, perDependant: 276, perVehicle: 0 },
  cashbackRate: 0.009,
  brand: { color: '#0072AC', mark: 'ANZ' },
  notes:
    'GLE living expense: applicant $1,012 + joint $912 + $276/dependant; vehicles not separately benchmarked. ' +
    'Cards 4%/mo of limit; personal loans tested 13.9% over ≤7y; student loan 12% over $24,128. ' +
    'Room-only board (75%, cap $300/wk) not modelled separately — all-inclusive assumed. ANZ’s own UMI buffer is $100; the adviser-calibrated $500/mo surplus floor applies.',
};

export const ASB_POLICY: LenderPolicy = {
  ...COMMON,
  id: 'asb-calc-2026',
  label: 'ASB (servicing calculator)',
  lender: 'ASB',
  effectiveFrom: '2026-06-01',
  source: 'ASB servicing calculator — Calc sheet scaling block + benchmark cells',
  stressRate: 0.0695,
  minUMI: { threshold: 0, below: 300, above: 300 }, // $300/mo minimum surplus (adviser calibration 3 Sep 2026)
  otScaling: 0.8, // scaling table partially hidden — 80% assumed in line with peers; confirm
  boarderScaling: { percent: 0.8, maxBoarders: 2 },
  rentalScaling: 0.75,
  creditCardMonthlyFactor: 0.03,
  expenseBenchmark: {
    single: 829 + 430,
    couple: 829 + 860,
    perDependant: 161,
    perVehicle: 0,
    incomeLinkedRate: 0.07, // GMI factor: +7% of gross monthly income
  },
  cashbackRate: 0.008,
  brand: { color: '#FDB913', textColor: '#1a1a1a', mark: 'ASB' },
  notes:
    'Benchmark = $829 accommodation base + $430/adult + $161/dependant + 7% of gross monthly income (GMI factor), ' +
    'vs customer-declared — higher used. Boarder 80%, rental 75%, cards 3%/mo of limit. OT scaling not visible in workbook — 80% assumed, confirm.',
};

export const BNZ_POLICY: LenderPolicy = {
  ...COMMON,
  id: 'bnz-afford-12-34',
  label: 'BNZ (Affordability Calculator v12.34)',
  lender: 'BNZ',
  effectiveFrom: '2025-10-23',
  source: 'BNZ Affordability Calculator v12.34 — Sheet1 AIR inputs (released 23 Oct 2025) + GLEE table (11 Jun 2026)',
  stressRate: 0.071, // IR floor; loans test at max(actual + buffer[currently 0], 7.10%)
  stressRateIsFloor: true,
  minUMI: { threshold: 0, below: 0, above: 0 },
  servicingRatioCap: 1.05, // servicing index ≤ 105% (adviser calibration 3 Sep 2026 — verify against release)
  otScaling: 0.8, // overtime/bonus/commission/investment all shaded to 80%
  boarderScaling: { percent: 0.8, maxBoarders: 2, maxPerBoarderWeekly: 500 },
  rentalScaling: 0.75,
  creditCardMonthlyFactor: 0.038, // cards, store cards & overdraft limits all 3.8%/mo
  expenseBenchmark: {
    // GLEE is an income-banded table; values below are the $137k–$156k
    // household band (typical dual income). Full table retained in notes.
    single: 1910,
    couple: 2873,
    perDependant: 180,
    perVehicle: 0,
  },
  cashbackRate: 0.008,
  brand: { color: '#002B6E', mark: 'BNZ' },
  notes:
    'GLEE (11 Jun 2026): couple 0-dep $2,344/mo (low income) → $5,123 (high); engine uses the $137–156k band ($2,873). ' +
    'MBS = income − commitments − max(GLEE, declared). Boarder capped $500/wk @80%. Foreign income 90%/60%. ' +
    'QMR 4.5% + buffer vs 7.10% floor — floor binds at current rates.',
};

export const WESTPAC_POLICY: LenderPolicy = {
  ...COMMON,
  id: 'westpac-assess-2026-07',
  label: 'Westpac (Assess calculator, Mar 2026 benchmarks)',
  lender: 'Westpac',
  effectiveFrom: '2026-07-08',
  source: 'Westpac Assess Serviceability calculator — Workings sheet (hidden); tax rates as at 8 Jul 2026; benchmark table Mar 2026 (CPI-indexed ~2.1%/yr)',
  stressRate: 0.0695, // HLN Lending Assessment Rate (personal lending 15.4% + 2.5% buffer)
  minUMI: { threshold: 0, below: 180, above: 180 }, // $180/mo minimum surplus (adviser calibration 3 Sep 2026)
  otScaling: 0.8, // overtime/allowances/bonus/commission/pension/interest all 80%
  boarderScaling: { percent: 0.8, maxBoarders: 2 },
  rentalScaling: 0.75, // NZ rent; offshore rent 60%
  creditCardMonthlyFactor: 0.038, // cards & BNPL limits 3.8%/mo
  expenseBenchmark: {
    // Income-banded partial benchmark (declared fixed items sit on top);
    // couple 0-dep ≈ $1,700/mo at typical incomes, ~$110/dependant steps.
    single: 1185,
    couple: 1700,
    perDependant: 110,
    perVehicle: 0,
  },
  cashbackRate: 0.008,
  brand: { color: '#D5002B', mark: 'Westpac' },
  notes:
    'Benchmark is partial (declared transport/insurance/childcare etc. added on top) and CPI-indexed each release ' +
    '(+2.098% then +2.120% uplifts visible in Workings). Westpac’s own minimum surplus target is $150; the adviser-calibrated $180/mo floor applies. ' +
    'Home-loan LAR 6.95%; buffer 0.35% recorded in Workings for HLN.',
};

export const KIWIBANK_POLICY: LenderPolicy = {
  ...COMMON,
  id: 'kiwibank-adviser-hl-2026',
  label: 'Kiwibank (Adviser HL Worksheet)',
  lender: 'Kiwibank',
  effectiveFrom: '2026-05-01',
  source: 'Kiwibank Adviser Home Loan Worksheet — test rate cell + haircut block (hidden columns); CCCFA benchmark model 2021 release',
  stressRate: 0.0695,
  minUMI: { threshold: 0, below: 0, above: 0 },
  servicingRatioCap: 0.92, // net servicing ratio ≤ 92% (adviser calibration 3 Sep 2026 — verify with BDM)
  otScaling: 0.8, // not directly visible — 80% assumed, confirm with BDM
  boarderScaling: { percent: 0.8, maxBoarders: 2 },
  // rent: 98% of gross recognised, then 23% rental-expense multiplier → ≈75.5% net
  rentalScaling: 0.98 * (1 - 0.23),
  creditCardMonthlyFactor: 0.05, // existing & pre-approved cards 5%/mo (OD 4%)
  expenseBenchmark: {
    // HEB uses CCCFA statistical model coefficients (2019 survey, revised for
    // Stats NZ income changes) — approximated here at typical incomes.
    single: 1450,
    couple: 2250,
    perDependant: 250,
    perVehicle: 0,
  },
  cashbackRate: 0.008,
  brand: { color: '#3DAE2B', mark: 'Kiwibank' },
  notes:
    'Adviser instruction: TEST WITH ADVISER before relying on this profile — workbook release to be confirmed. ' +
    'Test rate 6.95% (change log shows 5.5%→6%→7%→6.95% over time — moves with the economy). Cards 5%/mo of limit (highest of the five). ' +
    'Rental: 2% income haircut + 23% expense multiplier ≈ 75.5% net. HEB benchmark approximated from the CCCFA model.',
};

export const NZ_BANK_POLICIES = [ANZ_POLICY, ASB_POLICY, BNZ_POLICY, WESTPAC_POLICY, KIWIBANK_POLICY];

/** Lenders the adviser wants in the comparison once their calculators are
 *  sourced — shown in the UI as "to be tested — check with adviser". */
export const LENDERS_TO_BE_TESTED = [
  { lender: 'TSB', brand: { color: '#00546b', mark: 'TSB' } },
  { lender: 'SBS Bank', brand: { color: '#c8102e', mark: 'SBS' } },
  { lender: 'Kiwibank (re-verify)', brand: { color: '#3DAE2B', mark: 'KB' } },
  { lender: 'Bank of China', brand: { color: '#a6192e', mark: 'BOC' } },
];
