// Minimal Fact Find → full Client, with Akahu supplying income, expenses and
// debt. Deliberately asks almost nothing:
//   - client type, household size/vehicles (drives the expense benchmark)
//   - applicant first names; AGE ONLY FOR FIRST-HOME BUYERS
//   - per property: "what do you think it's worth" (CoreLogic figure keyed
//     manually), owner-occupied vs investment, rent if investment
//   - combined credit-card limits (Akahu shows balances, not limits)
//   - FHB only: KiwiSaver balances + savings for the deposit, target price
// Everything else — income streams, actual spending, loan balances, fixed
// rates and repayments — comes from the bank feed. Loans keep their real
// rates/repayments for the amortisation view but are ALWAYS stress-tested at
// the policy rate (7%) in servicing, exactly like the workbook.

import type { Client, ClientType, Goal, IncomeLine, MortgageFacility, Property } from '../domain/types';
import type { FeedSnapshot } from '../data-sources/types';
import { analyseFeed, type DetectedIncomeStream } from '../calculators/cashflow';
import { grossFromNetMonthly } from '../calculators/tax';
import type { TaxTable } from '../rules/types';

export type StreamRole =
  | 'salary-1'
  | 'salary-2'
  | 'overtime-1'
  | 'overtime-2'
  | 'self-employed-1'
  | 'self-employed-2'
  | 'rental'
  | 'boarder'
  | 'ignore';

export interface IntakePropertyInput {
  nickname: string;
  ownerEstimate: number; // "what do you think it's worth" — CoreLogic figure keyed manually
  use: 'owner-occupied' | 'investment';
  rentPerWeek?: number;
}

export interface IntakeForm {
  label: string;
  clientType: ClientType;
  applicantNames: string[]; // 1 or 2
  dependants: number;
  vehicles: number;
  /** asked only for first-home buyers */
  ages?: number[];
  creditCardLimits: number;
  properties: IntakePropertyInput[];
  /** FHB only */
  kiwiSaverTotal?: number;
  savingsForDeposit?: number;
  targetPrice?: number;
  /** stream label → role; anything not present uses the auto-classification */
  streamRoles?: Record<string, StreamRole>;
  /** feed loan-account id → property index; defaults to the first property */
  loanPropertyMap?: Record<string, number>;
  /** KiwiSaver contribution rate applied to PAYE streams (dropdown: 3–10%) */
  kiwiSaverRate?: number;
  /** manual gross annual salaries per applicant — used for manual fact-find
   *  entry, and as the income source when no feed stream is classified */
  manualGrossAnnual?: number[];
}

export interface BuiltClient {
  client: Client;
  assumptions: string[]; // every default the builder had to take, surfaced
}

const DEFAULT_AGE = 40;
const DEFAULT_LOAN_TERM_YEARS = 25;
const ASSUMED_KIWISAVER_RATE = 0.03;

export function autoClassifyStreams(streams: DetectedIncomeStream[]): Record<string, StreamRole> {
  const roles: Record<string, StreamRole> = {};
  let salarySlot = 1;
  for (const s of streams) {
    if (s.kind === 'rent-like') roles[s.label] = 'rental';
    else if (/board/i.test(s.label)) roles[s.label] = 'boarder';
    else if (s.kind === 'salary-like' && salarySlot <= 2) roles[s.label] = `salary-${salarySlot++}` as StreamRole;
    else if (s.kind === 'irregular' && s.monthlyAverage > 400) roles[s.label] = `self-employed-${Math.min(salarySlot, 2)}` as StreamRole;
    else roles[s.label] = 'ignore';
  }
  return roles;
}

export function buildClientFromIntake(form: IntakeForm, feed: FeedSnapshot, tax: TaxTable): BuiltClient {
  const assumptions: string[] = [];
  const id = `intake-${form.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const adults = Math.max(1, Math.min(4, form.applicantNames.length));

  // --- Properties ----------------------------------------------------------
  const properties: Property[] = form.properties.map((p, i) => ({
    id: `${id}-prop-${i}`,
    nickname: p.nickname || `Property ${i + 1}`,
    use: p.use,
    entity: 'personal',
    valuations: [
      {
        id: `${id}-prop-${i}-v0`,
        value: p.ownerEstimate,
        sourceType: 'adviser-estimate',
        sourceName: 'Owner estimate (CoreLogic figure keyed manually)',
        observedAt: new Date().toISOString().slice(0, 10),
        confidence: 'low',
        note: 'Ask what they think it’s worth; replace with a bank AVM or registered valuation before advice.',
      },
    ],
    activeValuationId: `${id}-prop-${i}-v0`,
    rentPerWeek:
      p.use === 'investment' && p.rentPerWeek
        ? { value: p.rentPerWeek, sourceType: 'client-stated', sourceName: 'Stated rent' }
        : undefined,
    ratesPerYear: Math.round(p.ownerEstimate * 0.0033),
    insurancePerYear: p.use === 'owner-occupied' ? 2200 : 1700,
    propertyMgmtRate: p.use === 'investment' ? 0.08 : undefined,
  }));
  if (properties.length) {
    assumptions.push('Rates & insurance estimated from value (≈0.33%/yr + defaults) — refine when known.');
  }

  // --- Income from the feed ------------------------------------------------
  const analysis = analyseFeed(
    feed,
    // minimal shell for analysis (declared expenses are intentionally empty)
    {
      expenses: { declaredMonthly: [], fixedCommitmentsMonthly: [] },
      mortgages: [],
      household: { adults, dependants: form.dependants, vehicles: form.vehicles },
    } as unknown as Client,
  );
  const roles = { ...autoClassifyStreams(analysis.incomeStreams), ...(form.streamRoles ?? {}) };

  const incomesByApplicant: IncomeLine[][] = form.applicantNames.map(() => []);
  // Manual fact-find entry: gross salaries keyed directly by the adviser.
  // They take effect for any applicant with a manual figure; feed-classified
  // streams for that applicant are then treated as confirmation, not doubled.
  (form.manualGrossAnnual ?? []).forEach((gross, i) => {
    if (gross > 0 && incomesByApplicant[i]) {
      incomesByApplicant[i].push({
        id: `manual-salary-${i + 1}`,
        kind: 'salary',
        label: 'Salary (manual entry)',
        grossAnnual: gross,
        kiwiSaverRate: form.kiwiSaverRate ?? ASSUMED_KIWISAVER_RATE,
      });
    }
  });

  let boarderPerWeek = 0;
  let feedRentPerWeek = 0;
  for (const s of analysis.incomeStreams) {
    const role = roles[s.label] ?? 'ignore';
    if (role === 'ignore') continue;
    if (role === 'boarder') {
      boarderPerWeek += (s.monthlyAverage * 12) / 52;
      continue;
    }
    if (role === 'rental') {
      feedRentPerWeek += (s.monthlyAverage * 12) / 52;
      continue;
    }
    const applicantIdx = role.endsWith('2') && form.applicantNames.length > 1 ? 1 : 0;
    if (incomesByApplicant[applicantIdx]?.some((l) => l.id.startsWith('manual-salary')) && role.startsWith('salary')) continue;
    const kind = role.startsWith('salary') ? 'salary' : role.startsWith('overtime') ? 'overtime-commission' : 'self-employed';
    const ksRate = kind === 'self-employed' ? 0 : form.kiwiSaverRate ?? ASSUMED_KIWISAVER_RATE;
    const grossAnnual = grossFromNetMonthly(s.monthlyAverage, ksRate, tax);
    incomesByApplicant[applicantIdx].push({
      id: `${id}-inc-${incomesByApplicant[applicantIdx].length}-${applicantIdx}`,
      kind,
      label: `${s.label} (from bank feed, grossed up)`,
      grossAnnual,
      kiwiSaverRate: ksRate,
      note: `Detected ${s.cadence} credits averaging $${Math.round(s.monthlyAverage).toLocaleString()}/mo net over ${analysis.monthsCovered} months.`,
    });
  }
  assumptions.push(
    `Income grossed up from net bank credits using the current PAYE table${adults === 2 ? ' per applicant' : ''} (KiwiSaver ${ASSUMED_KIWISAVER_RATE * 100}% assumed on PAYE streams) — verify against IRD summaries before application.`,
  );
  // stated rent wins over feed-detected rent; otherwise adopt the feed figure
  const investment = properties.find((p) => p.use === 'investment');
  if (investment && !investment.rentPerWeek && feedRentPerWeek > 0) {
    investment.rentPerWeek = {
      value: Math.round(feedRentPerWeek),
      sourceType: 'statement',
      sourceName: 'Detected rent credits (bank feed)',
    };
  }

  // --- Mortgages from the feed (real rates/repayments; stress test stays 7%)
  const loanAccounts = feed.accounts.filter((a) => a.type === 'mortgage' || a.type === 'loan');
  const mortgages: MortgageFacility[] = loanAccounts.map((a, i) => {
    const propIdx = form.loanPropertyMap?.[a.id] ?? 0;
    const property = properties[Math.min(propIdx, properties.length - 1)];
    const rate = a.loanDetails?.interestRate;
    const repaymentAmount = a.loanDetails?.repaymentAmount;
    if (rate === undefined) assumptions.push(`${a.name}: rate not exposed by the bank feed — assumed 6.0% until confirmed.`);
    if (repaymentAmount === undefined) assumptions.push(`${a.name}: repayment not exposed by the bank feed — minimum P&I assumed.`);
    return {
      id: `${id}-loan-${i}`,
      propertyId: property?.id ?? '',
      lender: a.bank,
      entity: 'personal',
      balance: Math.abs(a.balance),
      rate: rate ?? 0.06,
      loanType: a.loanDetails?.expiresAt ? 'fixed' : 'floating',
      interestOnly: false,
      fixedExpiry: a.loanDetails?.expiresAt,
      termRemainingYears: DEFAULT_LOAN_TERM_YEARS,
      repayment: {
        amount: repaymentAmount ?? 0,
        frequency: a.loanDetails?.repaymentFrequency ?? 'monthly',
      },
    };
  });
  if (mortgages.length) {
    assumptions.push(
      `Loan balances, rates and repayments pulled from the bank feed; remaining term assumed ${DEFAULT_LOAN_TERM_YEARS} years. Servicing still stress-tests every dollar at the policy rate (7%).`,
    );
  }

  // --- Ages: only asked for FHBs ------------------------------------------
  const ages = form.ages && form.ages.length ? form.ages : form.applicantNames.map(() => DEFAULT_AGE);
  if (!form.ages || !form.ages.length) {
    assumptions.push(`Ages not collected (only asked for first-home buyers) — retirement projections assume age ${DEFAULT_AGE}.`);
  }

  const client: Client = {
    id,
    label: form.label,
    shortLabel: form.label,
    clientType: form.clientType,
    narrative: `Created from the minimal intake + ${feed.providerLabel} (${analysis.monthsCovered} months of data). Expenses and income are live-feed derived, not declared.`,
    household: { adults, dependants: form.dependants, vehicles: form.vehicles },
    applicants: form.applicantNames.map((name, i) => ({
      id: `${id}-app-${i}`,
      displayName: name || `Applicant ${i + 1}`,
      age: ages[i] ?? DEFAULT_AGE,
      employmentType: incomesByApplicant[i]?.some((x) => x.kind === 'self-employed') ? 'self-employed' : 'paye',
      incomes: incomesByApplicant[i] ?? [],
    })),
    boarderIncomePerWeek: boarderPerWeek > 0 ? Math.round(boarderPerWeek) : undefined,
    goals: defaultGoals(form.clientType, id),
    expenses: { declaredMonthly: [], fixedCommitmentsMonthly: [] }, // deliberate: the feed is the source
    properties,
    mortgages,
    otherDebts:
      form.creditCardLimits > 0
        ? [
            {
              id: `${id}-cc`,
              kind: 'credit-card',
              label: 'Credit cards (combined limits)',
              limit: form.creditCardLimits,
              balance: Math.abs(feed.accounts.find((a) => a.type === 'credit-card')?.balance ?? 0),
              rate: 0.2,
            },
          ]
        : [],
    cashSavings: {
      value: feed.accounts.filter((a) => a.type === 'savings' || a.type === 'transaction').reduce((s, a) => s + Math.max(0, a.balance), 0),
      sourceType: 'statement',
      sourceName: `${feed.providerLabel} account balances`,
      observedAt: feed.syncedAt.slice(0, 10),
    },
    kiwiSaverAccounts:
      form.clientType === 'fhb' && form.kiwiSaverTotal
        ? [
            {
              id: `${id}-ks`,
              applicantId: `${id}-app-0`,
              provider: 'Stated',
              fundType: 'growth',
              balance: { value: form.kiwiSaverTotal, sourceType: 'client-stated', sourceName: 'Stated combined KiwiSaver' },
              contributionRate: ASSUMED_KIWISAVER_RATE,
              salaryForContribution: incomesByApplicant.flat().reduce((s, x) => s + x.grossAnnual, 0),
              employerRate: 0.03,
              firstHomeIntent: true,
            },
          ]
        : feed.accounts
            .filter((a) => a.type === 'kiwisaver')
            .map((a, i) => ({
              id: `${id}-ks-${i}`,
              applicantId: `${id}-app-0`,
              provider: a.bank,
              fundType: 'growth' as const,
              balance: { value: a.balance, sourceType: 'statement' as const, sourceName: `${feed.providerLabel}` },
              contributionRate: ASSUMED_KIWISAVER_RATE,
              salaryForContribution: incomesByApplicant.flat().reduce((s, x) => s + x.grossAnnual, 0),
              employerRate: 0.03,
            })),
    insurancePolicies: [],
    financialEvents: [],
    targetPurchase:
      form.clientType === 'fhb'
        ? {
            price: form.targetPrice ?? 800_000,
            depositSources: {
              kiwiSaver: form.kiwiSaverTotal ?? 0,
              savings: form.savingsForDeposit ?? 0,
              gift: 0,
              other: 0,
              keepAsBuffer: 0,
            },
          }
        : undefined,
    retirement: { targetAge: 65, desiredAnnualIncome: 80_000 },
    modellingRate: 0.055,
  };
  if (form.clientType !== 'fhb') {
    assumptions.push('Retirement defaults (age 65, $80k/yr) applied — adjust in conversation if relevant.');
  }

  return { client, assumptions };
}

function defaultGoals(type: ClientType, id: string): Goal[] {
  const g = (kind: Goal['kind'], label: string, i: number): Goal => ({ id: `${id}-g${i}`, kind, label });
  if (type === 'fhb')
    return [
      g('buy-first-home', 'Buy the first home', 0),
      g('comfortable-budget', 'Buy at a comfortable level, not the bank maximum', 1),
    ];
  if (type === 'investor')
    return [
      g('buy-investment', 'Grow the portfolio without breaking serviceability', 0),
      g('build-equity', 'Recycle usable equity deliberately', 1),
    ];
  return [
    g('pay-off-faster', 'Pay the home off faster', 0),
    g('improve-cashflow', 'Keep repayments comfortable', 1),
  ];
}
