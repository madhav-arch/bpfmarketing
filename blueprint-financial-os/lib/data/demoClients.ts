import type { Client } from '../domain/types';
import type { ScenarioChange } from '../scenarios/changes';

// ---------------------------------------------------------------------------
// Anonymised demo clients. Derived from the *shape* of real Blueprint client
// files (income structures, loan splits, meeting narratives) with all names,
// addresses, contacts and identifying details replaced.

const src = (sourceName: string, observedAt = '2026-08-01') =>
  ({ sourceType: 'demo-fixture' as const, sourceName, observedAt });

// ---------------------------------------------------------------------------
// DEMO 1 — First-home buyers

export const demoFhb: Client = {
  id: 'demo-fhb',
  label: 'Arjun & Simran — First Home',
  shortLabel: 'First-home buyers',
  clientType: 'fhb',
  narrative:
    'Couple in their late 20s, both in healthcare-sector jobs with overtime, renting on the North Shore. Looking at a ~$1.2m home with a rentable downstairs area, 5–10% deposit, planning a family within three years.',
  household: { adults: 2, dependants: 0, vehicles: 2 },
  applicants: [
    {
      id: 'a1',
      displayName: 'Arjun',
      age: 29,
      employmentType: 'paye',
      occupation: 'Facilities coordinator',
      incomes: [
        { id: 'a1-base', kind: 'salary', label: 'Base salary', grossAnnual: 64_500, kiwiSaverRate: 0.03 },
        { id: 'a1-ot', kind: 'overtime-commission', label: 'Overtime', grossAnnual: 8_500, kiwiSaverRate: 0.03 },
      ],
    },
    {
      id: 'a2',
      displayName: 'Simran',
      age: 28,
      employmentType: 'paye',
      occupation: 'Hospital services',
      incomes: [
        { id: 'a2-base', kind: 'salary', label: 'Base salary', grossAnnual: 65_000, kiwiSaverRate: 0.03 },
        {
          id: 'a2-ot',
          kind: 'overtime-commission',
          label: 'Overtime (one-off back-pay removed)',
          grossAnnual: 27_500,
          kiwiSaverRate: 0.03,
          note: 'Declared ~$35k including a ~$7k gross one-off back-pay — modelled conservatively at $27.5k.',
        },
      ],
    },
  ],
  goals: [
    { id: 'g1', kind: 'buy-first-home', label: 'Buy their first home', detail: 'Target near work on the North Shore; downstairs area rentable after minor work' },
    { id: 'g2', kind: 'comfortable-budget', label: 'Buy at a comfortable level, not the bank maximum', detail: 'Adviser guidance: ~$1.10m lending is the sensible ceiling' },
    { id: 'g3', kind: 'family-planning', label: 'Ready for a family within 3 years', detail: 'Repayments must survive parental leave + childcare' },
    { id: 'g4', kind: 'other', label: 'Use boarder + side income to de-risk', detail: 'A boarder at $250/wk materially changes serviceability' },
  ],
  expenses: {
    declaredMonthly: [
      { category: 'Food & groceries', amount: 100, flag: 'unrealistically low for two adults — lenders will not believe this; check the Fact Find entry' },
      { category: 'Utilities & phone', amount: 380 },
      { category: 'Transport & fuel', amount: 420 },
      { category: 'Vehicle insurance (commercial — rideshare)', amount: 600, flag: 'high because one vehicle carries commercial rideshare cover' },
      { category: 'Personal & clothing', amount: 200 },
      { category: 'Entertainment', amount: 150 },
    ],
    fixedCommitmentsMonthly: [
      { label: 'Insurances', amount: 980 },
      { label: 'Content rates share / utilities contracts', amount: 300 },
      { label: 'Subscriptions', amount: 30 },
    ],
  },
  properties: [],
  mortgages: [],
  otherDebts: [
    { id: 'cc1', kind: 'credit-card', label: 'Credit card — Bank 1', limit: 5_000, balance: 0, rate: 0.209 },
    { id: 'cc2', kind: 'credit-card', label: 'Credit card — Bank 2', limit: 2_000, balance: 0, rate: 0.199 },
  ],
  cashSavings: { value: 34_000, ...src('Stated savings') },
  kiwiSaverAccounts: [
    {
      id: 'ks1',
      applicantId: 'a1',
      provider: 'Demo Provider',
      fundType: 'growth',
      balance: { value: 19_200, ...src('Provider statement') },
      contributionRate: 0.03,
      salaryForContribution: 73_000,
      employerRate: 0.03,
      firstHomeIntent: true,
    },
    {
      id: 'ks2',
      applicantId: 'a2',
      provider: 'Demo Provider',
      fundType: 'growth',
      balance: { value: 22_900, ...src('Provider statement') },
      contributionRate: 0.03,
      salaryForContribution: 92_500,
      employerRate: 0.03,
      firstHomeIntent: true,
    },
  ],
  insurancePolicies: [
    { id: 'ip1', kind: 'health', provider: 'Demo Health', premiumMonthly: 95 },
  ],
  financialEvents: [
    { id: 'e1', kind: 'child-born', label: 'Family plans — child within ~3 years', startDate: '2029-01-01', monthlyImpact: -900 },
  ],
  targetPurchase: {
    price: 1_200_000,
    depositSources: { kiwiSaver: 42_100, savings: 20_000, gift: 0, other: 0, keepAsBuffer: 14_000 },
    intendedBoarderPerWeek: 250,
    boarderCount: 1,
  },
  retirement: { targetAge: 65, desiredAnnualIncome: 80_000 },
  modellingRate: 0.0499,
};

// ---------------------------------------------------------------------------
// DEMO 2 — Homeowners: restructure + optimisation

export const demoHomeowner: Client = {
  id: 'demo-homeowner',
  label: 'Kate & Logan — Home + Rental',
  shortLabel: 'Homeowner / restructure',
  clientType: 'homeowner',
  narrative:
    'Self-employed couple (admin/management + creative income with lumpy annual royalties), late 40s, two teens. Family home and a rental both sit in the family trust with ~$977k of lending across four splits. Goals: move rental debt into an LTC for deductibility, pay the home off faster without squeezing cashflow, and set up the next investment step.',
  household: { adults: 2, dependants: 2, vehicles: 2 },
  applicants: [
    {
      id: 'b1',
      displayName: 'Kate',
      age: 48,
      employmentType: 'self-employed',
      occupation: 'Administration / business manager',
      incomes: [{ id: 'b1-se', kind: 'self-employed', label: 'Business income', grossAnnual: 52_419, kiwiSaverRate: 0 }],
    },
    {
      id: 'b2',
      displayName: 'Logan',
      age: 48,
      employmentType: 'self-employed',
      occupation: 'Creative professional (royalties)',
      incomes: [{ id: 'b2-se', kind: 'self-employed', label: 'Business income + royalties', grossAnnual: 188_185, kiwiSaverRate: 0 }],
    },
  ],
  boarderIncomePerWeek: 200, // adult son boards
  goals: [
    { id: 'g1', kind: 'restructure', label: 'Restructure lending into an LTC', detail: 'Shift rental-secured debt to the look-through company — accountant estimates ~$6k/yr tax saving' },
    { id: 'g2', kind: 'pay-off-faster', label: 'Family home mortgage-free faster', detail: 'Target the trust debt first; ~12-year path at current repayments' },
    { id: 'g3', kind: 'improve-cashflow', label: 'Keep repayments comfortable', detail: '"Nest egg" family — flexibility beats forced repayments' },
    { id: 'g4', kind: 'help-children', label: 'Help the kids into first homes', detail: 'Build a revolving-credit war chest over 3–5 years' },
    { id: 'g5', kind: 'buy-investment', label: 'Next: a cashflow-positive dual-income rental', detail: 'Only if yield beats the stress test' },
  ],
  expenses: {
    declaredMonthly: [
      { category: 'Food (restaurants, takeaways, groceries)', amount: 2_000 },
      { category: 'Utilities', amount: 600 },
      { category: 'Transport', amount: 650 },
      { category: 'Personal care & clothing', amount: 250 },
      { category: 'Household & garden', amount: 100 },
      { category: 'Entertainment', amount: 100 },
      { category: 'Education', amount: 100 },
      { category: 'Savings & voluntary KiwiSaver', amount: 820 },
    ],
    fixedCommitmentsMonthly: [
      { label: 'Insurances (vehicle, house, contents, personal)', amount: 1_257 },
      { label: 'Rates (family home)', amount: 400 },
      { label: 'Education costs', amount: 100 },
      { label: 'Subscriptions', amount: 60 },
    ],
  },
  properties: [
    {
      id: 'home',
      nickname: 'Family home — Bay of Plenty',
      use: 'owner-occupied',
      entity: 'trust',
      purchasePrice: 1_100_000,
      valuations: [
        { id: 'home-v1', value: 1_450_000, sourceType: 'client-stated', sourceName: 'Owner estimate', observedAt: '2026-08-01', confidence: 'low' },
        { id: 'home-v2', value: 1_470_000, sourceType: 'bank-internal-valuation', sourceName: 'Lender AVM', observedAt: '2026-08-20', confidence: 'medium' },
      ],
      activeValuationId: 'home-v2',
      ratesPerYear: 4_800,
      insurancePerYear: 2_420,
    },
    {
      id: 'rental',
      nickname: 'Rental — Waikato',
      use: 'investment',
      entity: 'trust',
      purchasePrice: 445_000,
      valuations: [
        { id: 'rental-v1', value: 720_000, sourceType: 'bank-internal-valuation', sourceName: 'Lender AVM', observedAt: '2026-08-20', confidence: 'medium' },
        { id: 'rental-v2', value: 690_000, sourceType: 'avm', sourceName: 'Independent AVM', observedAt: '2026-08-10', confidence: 'medium' },
      ],
      activeValuationId: 'rental-v1',
      rentPerWeek: { value: 557, sourceType: 'fact-find', sourceName: 'Current tenancy', note: 'Rising to $625/wk at next review' },
      ratesPerYear: 4_800,
      insurancePerYear: 1_440,
      propertyMgmtRate: 0.075,
    },
  ],
  mortgages: [
    {
      id: 'loan-rental',
      propertyId: 'rental',
      lender: 'Current lender',
      entity: 'trust',
      balance: 447_119,
      rate: 0.0489,
      loanType: 'fixed',
      interestOnly: false,
      fixedExpiry: '2027-04-15',
      termRemainingYears: 26,
      repayment: { amount: 1_477.71, frequency: 'fortnightly' },
    },
    {
      id: 'loan-home-main',
      propertyId: 'home',
      lender: 'Current lender',
      entity: 'trust',
      balance: 510_536,
      rate: 0.0485,
      loanType: 'fixed',
      interestOnly: false,
      fixedExpiry: '2026-12-15',
      termRemainingYears: 26,
      repayment: { amount: 1_337.8, frequency: 'fortnightly' },
    },
    {
      id: 'loan-home-2',
      propertyId: 'home',
      lender: 'Current lender',
      entity: 'trust',
      balance: 13_800,
      rate: 0.0625,
      loanType: 'floating',
      interestOnly: false,
      termRemainingYears: 9,
      repayment: { amount: 149.28, frequency: 'monthly' },
    },
    {
      id: 'loan-home-3',
      propertyId: 'home',
      lender: 'Current lender',
      entity: 'trust',
      balance: 5_251,
      rate: 0.0625,
      loanType: 'floating',
      interestOnly: false,
      termRemainingYears: 7,
      repayment: { amount: 36.75, frequency: 'fortnightly' },
    },
  ],
  otherDebts: [
    { id: 'cc1', kind: 'credit-card', label: 'Credit card', limit: 10_000, balance: 1_600, rate: 0.129 },
  ],
  cashSavings: { value: 82_000, ...src('Royalty account balance') },
  kiwiSaverAccounts: [
    {
      id: 'ks1',
      applicantId: 'b1',
      provider: 'Demo Provider',
      fundType: 'growth',
      balance: { value: 32_500, ...src('Provider statement') },
      contributionRate: 0,
      voluntaryMonthly: 108,
      salaryForContribution: 52_419,
      employerRate: 0,
    },
    {
      id: 'ks2',
      applicantId: 'b2',
      provider: 'Demo Provider',
      fundType: 'growth',
      balance: { value: 19_000, ...src('Provider statement') },
      contributionRate: 0,
      voluntaryMonthly: 108,
      salaryForContribution: 188_185,
      employerRate: 0,
    },
  ],
  insurancePolicies: [
    { id: 'ip1', kind: 'life', provider: 'Demo Life Co', cover: 500_000, premiumMonthly: 336 },
    { id: 'ip2', kind: 'health', provider: 'Demo Health', premiumMonthly: 210 },
  ],
  financialEvents: [
    { id: 'e1', kind: 'rate-expiry', label: 'Home loan fixed rate expires', startDate: '2026-12-15' },
    { id: 'e2', kind: 'rent-change', label: 'Rental review → $625/wk', startDate: '2026-11-01', monthlyImpact: 295 },
    { id: 'e3', kind: 'lump-sum', label: 'Annual master royalty payout (variable)', startDate: '2027-03-01', amount: 40_000 },
  ],
  retirement: { targetAge: 65, desiredAnnualIncome: 120_000 },
  refinanceContext: {
    proposedRate: 0.0479,
    currentMarketRate: 0.0479,
    cashbackClawbackOwed: 2_500,
    entityChange: true,
    taxSavingAnnual: 6_000,
    taxSavingNote: 'LTC restructure — estimated by the associated chartered accountant; timing settlement can avoid the $2,500 clawback.',
  },
  modellingRate: 0.0479,
};

// ---------------------------------------------------------------------------
// DEMO 3 — Property investors

export const demoInvestor: Client = {
  id: 'demo-investor',
  label: 'Mel & Dave — Portfolio',
  shortLabel: 'Property investors',
  clientType: 'investor',
  narrative:
    'Mid-40s couple: one strong PAYE income, one trades business. Own home plus two rentals (one held since 2015, one bought 2022). Deciding between holding and buying a dual-income property versus selling the lower-yield rental to fund a bigger move — while keeping servicing inside bank stress tests.',
  household: { adults: 2, dependants: 1, vehicles: 2 },
  applicants: [
    {
      id: 'c1',
      displayName: 'Mel',
      age: 45,
      employmentType: 'paye',
      occupation: 'Programme manager',
      incomes: [{ id: 'c1-base', kind: 'salary', label: 'Base salary', grossAnnual: 145_000, kiwiSaverRate: 0.04 }],
    },
    {
      id: 'c2',
      displayName: 'Dave',
      age: 44,
      employmentType: 'self-employed',
      occupation: 'Trades business owner',
      incomes: [{ id: 'c2-se', kind: 'self-employed', label: 'Business income', grossAnnual: 60_000, kiwiSaverRate: 0 }],
    },
  ],
  goals: [
    { id: 'g1', kind: 'buy-investment', label: 'Add a cashflow-positive property', detail: 'Target ≥ $200/wk positive across the portfolio' },
    { id: 'g2', kind: 'improve-yield', label: 'Fix the low-yield rental problem', detail: 'Rental 2 yields under 4.5% and leans on personal income' },
    { id: 'g3', kind: 'build-equity', label: 'Recycle usable equity deliberately', detail: 'Equity as 30% deposits; IO on investment debt, attack the home loan' },
    { id: 'g4', kind: 'retirement-income', label: 'Retire at 60 on $100k/yr' },
  ],
  expenses: {
    declaredMonthly: [
      { category: 'Food & groceries', amount: 1_700 },
      { category: 'Utilities', amount: 520 },
      { category: 'Transport', amount: 600 },
      { category: 'Kids & school', amount: 450 },
      { category: 'Entertainment & holidays', amount: 700 },
      { category: 'Personal', amount: 300 },
    ],
    fixedCommitmentsMonthly: [
      { label: 'Insurances', amount: 890 },
      { label: 'Rates (family home)', amount: 340 },
      { label: 'Subscriptions', amount: 80 },
      { label: 'Childcare (after-school)', amount: 480 },
    ],
  },
  properties: [
    {
      id: 'inv-home',
      nickname: 'Family home — East suburbs',
      use: 'owner-occupied',
      entity: 'personal',
      purchasePrice: 780_000,
      valuations: [
        { id: 'ih-v1', value: 1_100_000, sourceType: 'bank-internal-valuation', sourceName: 'Lender AVM', observedAt: '2026-08-15', confidence: 'medium' },
      ],
      activeValuationId: 'ih-v1',
      ratesPerYear: 4_100,
      insurancePerYear: 2_300,
    },
    {
      id: 'inv-r1',
      nickname: 'Rental 1 — dual-income street',
      use: 'investment',
      entity: 'ltc',
      purchasePrice: 430_000,
      valuations: [
        { id: 'r1-v1', value: 680_000, sourceType: 'bank-internal-valuation', sourceName: 'Lender AVM', observedAt: '2026-08-15', confidence: 'medium' },
        { id: 'r1-v2', value: 640_000, sourceType: 'avm', sourceName: 'Independent AVM', observedAt: '2026-08-01', confidence: 'medium' },
      ],
      activeValuationId: 'r1-v1',
      rentPerWeek: { value: 640, sourceType: 'fact-find', sourceName: 'Current tenancy' },
      ratesPerYear: 3_200,
      insurancePerYear: 1_700,
      propertyMgmtRate: 0.08,
    },
    {
      id: 'inv-r2',
      nickname: 'Rental 2 — newer townhouse',
      use: 'investment',
      entity: 'ltc',
      purchasePrice: 620_000,
      valuations: [
        { id: 'r2-v1', value: 590_000, sourceType: 'bank-internal-valuation', sourceName: 'Lender AVM', observedAt: '2026-08-15', confidence: 'medium' },
      ],
      activeValuationId: 'r2-v1',
      rentPerWeek: { value: 500, sourceType: 'fact-find', sourceName: 'Current tenancy' },
      ratesPerYear: 2_900,
      insurancePerYear: 1_500,
      propertyMgmtRate: 0.08,
    },
  ],
  mortgages: [
    {
      id: 'il-home',
      propertyId: 'inv-home',
      lender: 'Current lender',
      entity: 'personal',
      balance: 380_000,
      rate: 0.0495,
      loanType: 'fixed',
      interestOnly: false,
      fixedExpiry: '2027-02-01',
      termRemainingYears: 19,
      repayment: { amount: 2_720, frequency: 'monthly' },
    },
    {
      id: 'il-r1',
      propertyId: 'inv-r1',
      lender: 'Current lender',
      entity: 'ltc',
      balance: 310_000,
      rate: 0.0515,
      loanType: 'fixed',
      interestOnly: true,
      fixedExpiry: '2026-11-01',
      termRemainingYears: 25,
      repayment: { amount: 1_331, frequency: 'monthly' },
    },
    {
      id: 'il-r2',
      propertyId: 'inv-r2',
      lender: 'Current lender',
      entity: 'ltc',
      balance: 465_000,
      rate: 0.0521,
      loanType: 'fixed',
      interestOnly: true,
      fixedExpiry: '2027-06-01',
      termRemainingYears: 27,
      repayment: { amount: 2_019, frequency: 'monthly' },
    },
  ],
  otherDebts: [
    { id: 'cc1', kind: 'credit-card', label: 'Credit cards (combined)', limit: 15_000, balance: 2_400, rate: 0.199 },
  ],
  cashSavings: { value: 46_000, ...src('Offset + savings') },
  kiwiSaverAccounts: [
    {
      id: 'ks1',
      applicantId: 'c1',
      provider: 'Demo Provider',
      fundType: 'growth',
      balance: { value: 85_000, ...src('Provider statement') },
      contributionRate: 0.04,
      salaryForContribution: 145_000,
      employerRate: 0.03,
    },
    {
      id: 'ks2',
      applicantId: 'c2',
      provider: 'Demo Provider',
      fundType: 'balanced',
      balance: { value: 40_000, ...src('Provider statement') },
      contributionRate: 0,
      voluntaryMonthly: 90,
      salaryForContribution: 60_000,
      employerRate: 0,
    },
  ],
  insurancePolicies: [
    { id: 'ip1', kind: 'life', provider: 'Demo Life Co', cover: 750_000, premiumMonthly: 290 },
    { id: 'ip2', kind: 'income-protection', provider: 'Demo Life Co', cover: 0, premiumMonthly: 180 },
  ],
  financialEvents: [
    { id: 'e1', kind: 'rate-expiry', label: 'Rental 1 fixed rate expires', startDate: '2026-11-01' },
    { id: 'e2', kind: 'childcare-end', label: 'After-school care ends', startDate: '2029-01-31', monthlyImpact: 480 },
  ],
  retirement: { targetAge: 60, desiredAnnualIncome: 100_000 },
  modellingRate: 0.0509,
};

export const DEMO_CLIENTS: Client[] = [demoFhb, demoHomeowner, demoInvestor];

// ---------------------------------------------------------------------------
// Preset scenarios per client — one-click starting points for the meeting.

export interface PresetScenario {
  id: string;
  name: string;
  description: string;
  changes: ScenarioChange[];
}

export const PRESET_SCENARIOS: Record<string, PresetScenario[]> = {
  'demo-fhb': [
    {
      id: 'fhb-comfortable',
      name: 'Comfortable $1.10m',
      description: 'Buy at $1.10m with the boarder — the adviser-recommended ceiling.',
      changes: [
        { kind: 'setPurchasePrice', value: 1_100_000 },
        { kind: 'setBoarder', perWeek: 250, count: 1 },
      ],
    },
    {
      id: 'fhb-10pc',
      name: '10% deposit',
      description: 'Same price, 10% deposit — watch the low-equity margin fall.',
      changes: [
        { kind: 'setDepositPercent', value: 0.1 },
        { kind: 'setBoarder', perWeek: 250, count: 1 },
      ],
    },
    {
      id: 'fhb-derisked',
      name: 'De-risked (2 boarders + side income)',
      description: 'Two boarders at $250/wk and $9k/yr net rideshare income — the resilience case.',
      changes: [
        { kind: 'setBoarder', perWeek: 250, count: 2 },
        { kind: 'addIncome', label: 'Rideshare (net, accountant-confirmed)', netAnnual: 9_000 },
      ],
    },
  ],
  'demo-homeowner': [
    {
      id: 'ho-restructure',
      name: 'LTC restructure + $50k revolving',
      description: 'Shift rental debt to the LTC, park $50k of royalties in a revolving facility.',
      changes: [
        { kind: 'addRevolvingCredit', limit: 75_000, funded: 50_000, monthlyTransfer: 2_000 },
      ],
    },
    {
      id: 'ho-faster',
      name: '+$500/fortnight repayments',
      description: 'Raise scheduled repayments instead — the discipline-free alternative.',
      changes: [{ kind: 'adjustRepayment', delta: 500, frequency: 'fortnightly' }],
    },
    {
      id: 'ho-invest',
      name: 'Buy dual-income rental ($600k @ $1,100/wk)',
      description: 'The "next level": 9.5% gross yield beats the stress test; IO lending.',
      changes: [
        { kind: 'buyProperty', price: 600_000, rentPerWeek: 1_100, interestOnly: true },
      ],
    },
  ],
  'demo-investor': [
    {
      id: 'inv-keep-buy',
      name: 'A — Keep all + buy dual-income',
      description: 'Keep the portfolio and add a $600k dual-income property at $1,100/wk.',
      changes: [{ kind: 'buyProperty', price: 600_000, rentPerWeek: 1_100, interestOnly: true }],
    },
    {
      id: 'inv-sell-buy',
      name: 'B — Sell Rental 2 + buy better',
      description: 'Sell the low-yield townhouse, redeploy into an $820k high-yield property at $1,250/wk.',
      changes: [
        { kind: 'sellProperty', propertyId: 'inv-r2', price: 590_000 },
        { kind: 'buyProperty', price: 820_000, rentPerWeek: 1_250, interestOnly: true, useProceeds: true },
      ],
    },
    {
      id: 'inv-consolidate',
      name: 'C — Sell Rental 2, attack the home loan',
      description: 'Sell the townhouse and put proceeds on the owner-occupied mortgage.',
      changes: [
        { kind: 'sellProperty', propertyId: 'inv-r2', price: 590_000 },
        { kind: 'lumpSumRepayment', amount: 110_000 },
      ],
    },
  ],
};
