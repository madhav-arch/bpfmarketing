import type { AuditLine, Client } from '../domain/types';
import type { KiwiSaverSettings, RetirementSettings } from '../rules/types';
import { futureValue, todaysDollars } from './finance';
import { projectKiwiSaver } from './kiwisaver';
import { combinedTrajectory } from './amortisation';
import { activeValuation } from './equity';

/** Per-scenario KiwiSaver projection options shared with compute. */
export interface KsProjectionOpts {
  salaryGrowth?: number;
  returnOverride?: number;
  withdrawalFor?: (accountId: string) => { year: number; amount: number; keepMinimum: number } | undefined;
}

export interface RetirementResult {
  yearsToRetirement: number;
  retirementYear: number;
  mode: 'low' | 'base' | 'high';
  projectedPropertyValue: number;
  projectedInvestmentPropertyValue: number;
  projectedKiwiSaver: number;
  projectedDebtAtRetirement: number;
  mortgageFreeBeforeRetirement: boolean;
  mortgageFreeYear: number;
  projectedNetWorth: number;
  incomeStreams: { label: string; annual: number; note?: string }[];
  projectedAnnualIncome: number;
  goalAnnualIncome: number;
  gap: number; // negative = shortfall
  drawdownRate: number;
  /** inflation assumption used for today's-dollar figures */
  inflation: number;
  projectedKiwiSaverToday: number;
  projectedNetWorthToday: number;
  projectedAnnualIncomeToday: number;
  projectedWeeklyIncomeToday: number;
  audit: AuditLine[];
}

export function computeRetirement(
  client: Client,
  settings: RetirementSettings,
  ksSettings: KiwiSaverSettings,
  opts: {
    mode?: 'low' | 'base' | 'high';
    currentYear?: number;
    extraRepaymentMonthly?: number;
    inflationOverride?: number;
    ks?: KsProjectionOpts;
  } = {},
): RetirementResult {
  const mode = opts.mode ?? 'base';
  const growth = settings.growth[mode];
  const inflation = opts.inflationOverride ?? settings.inflation;
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const oldest = Math.max(...client.applicants.map((a) => a.age));
  const yearsToRetirement = Math.max(1, client.retirement.targetAge - oldest);
  const retirementYear = currentYear + yearsToRetirement;

  let projectedPropertyValue = 0;
  let projectedInvestmentPropertyValue = 0;
  for (const p of client.properties) {
    const fv = futureValue(activeValuation(p).value, growth, yearsToRetirement);
    if (p.use === 'owner-occupied') projectedPropertyValue += fv;
    else projectedInvestmentPropertyValue += fv;
  }

  const ksProjections = client.kiwiSaverAccounts.map((a) =>
    projectKiwiSaver(a, ksSettings, {
      mode,
      horizonYears: yearsToRetirement,
      salaryGrowth: opts.ks?.salaryGrowth,
      returnOverride: opts.ks?.returnOverride,
      withdrawal: opts.ks?.withdrawalFor?.(a.id),
    }),
  );
  const projectedKiwiSaver = ksProjections.reduce((s, p) => s + p.atHorizon, 0);

  const traj = combinedTrajectory(
    client.mortgages.map((m) => ({
      principal: m.balance,
      annualRate: m.rate,
      years: m.termRemainingYears,
      interestOnly: m.interestOnly,
      offsetBalance: m.offsetBalance,
    })),
    opts.extraRepaymentMonthly ?? 0,
  );
  const monthsToRetirement = yearsToRetirement * 12;
  const balanceAtRetirement =
    traj.schedule.length > monthsToRetirement
      ? traj.schedule[monthsToRetirement - 1]?.balance ?? 0
      : 0;
  const mortgageFreeYear = currentYear + Math.ceil(traj.termYears);

  const liquid = projectedKiwiSaver;
  const investmentEquity = Math.max(0, projectedInvestmentPropertyValue - balanceAtRetirement);
  const drawdownBase = liquid + investmentEquity;
  const superAnnual = client.household.adults === 2 ? settings.nzSuperAnnualCouple : settings.nzSuperAnnualSingle;

  const incomeStreams = [
    { label: 'NZ Super (current settings)', annual: superAnnual, note: 'Assumes both qualify at 65; settings change over time.' },
    {
      label: `Drawdown on KiwiSaver (${(settings.drawdownRate * 100).toFixed(0)}% planning assumption)`,
      annual: projectedKiwiSaver * settings.drawdownRate,
      note: `${(settings.drawdownRate * 100).toFixed(0)}% rule is one planning heuristic — not a guarantee, and adviser-adjustable.`,
    },
  ];
  if (investmentEquity > 0) {
    incomeStreams.push({
      label: `Drawdown on investment property equity (${(settings.drawdownRate * 100).toFixed(0)}%)`,
      annual: investmentEquity * settings.drawdownRate,
      note: 'Assumes equity could be realised or rent-yielded at the same heuristic rate.',
    });
  }
  const projectedAnnualIncome = incomeStreams.reduce((s, i) => s + i.annual, 0);
  const goalAnnualIncome = client.retirement.desiredAnnualIncome;
  const projectedNetWorthNominal =
    projectedPropertyValue + projectedInvestmentPropertyValue + projectedKiwiSaver - balanceAtRetirement;
  const projectedAnnualIncomeToday = todaysDollars(projectedAnnualIncome, inflation, yearsToRetirement);

  return {
    yearsToRetirement,
    retirementYear,
    mode,
    projectedPropertyValue,
    projectedInvestmentPropertyValue,
    projectedKiwiSaver,
    projectedDebtAtRetirement: balanceAtRetirement,
    mortgageFreeBeforeRetirement: balanceAtRetirement <= 0.01,
    mortgageFreeYear,
    projectedNetWorth: projectedNetWorthNominal,
    incomeStreams,
    projectedAnnualIncome,
    goalAnnualIncome,
    gap: projectedAnnualIncome - goalAnnualIncome,
    drawdownRate: settings.drawdownRate,
    inflation,
    projectedKiwiSaverToday: todaysDollars(projectedKiwiSaver, inflation, yearsToRetirement),
    projectedNetWorthToday: todaysDollars(projectedNetWorthNominal, inflation, yearsToRetirement),
    projectedAnnualIncomeToday,
    projectedWeeklyIncomeToday: projectedAnnualIncomeToday / 52,
    audit: [
      { label: `Inflation assumption (today's-dollar conversions)`, value: inflation, format: 'percent', note: 'Editable modelling assumption — nominal figures divided by (1 + inflation)^years.' },
      { label: `Years to retirement (age ${client.retirement.targetAge})`, value: yearsToRetirement, format: 'number' },
      { label: `Growth assumption (${mode})`, value: growth, format: 'percent', note: 'Modelling assumption — not a guarantee.' },
      { label: 'Projected property value', value: projectedPropertyValue + projectedInvestmentPropertyValue, format: 'currency' },
      { label: 'Projected KiwiSaver', value: projectedKiwiSaver, format: 'currency' },
      { label: 'Projected mortgage at retirement', value: -balanceAtRetirement, format: 'currency' },
      { label: 'Projected annual income', value: projectedAnnualIncome, format: 'currency' },
      { label: 'Goal income', value: -goalAnnualIncome, format: 'currency' },
      { label: 'Gap / surplus', value: projectedAnnualIncome - goalAnnualIncome, format: 'currency' },
    ],
  };
}

/** Net-worth trajectory year by year (for the chart). */
export function netWorthTrajectory(
  client: Client,
  settings: RetirementSettings,
  ksSettings: KiwiSaverSettings,
  opts: { mode?: 'low' | 'base' | 'high'; years?: number; extraRepaymentMonthly?: number; ks?: KsProjectionOpts } = {},
): { year: number; assets: number; debt: number; netWorth: number }[] {
  const mode = opts.mode ?? 'base';
  const growth = settings.growth[mode];
  const years = opts.years ?? 25;
  const currentYear = new Date().getFullYear();
  const propertyNow = client.properties.reduce((s, p) => s + activeValuation(p).value, 0);
  const oldest = Math.max(...client.applicants.map((a) => a.age), 30);
  const ksProj = client.kiwiSaverAccounts.map((a) =>
    projectKiwiSaver(a, ksSettings, {
      mode,
      horizonYears: years,
      salaryGrowth: opts.ks?.salaryGrowth,
      returnOverride: opts.ks?.returnOverride,
      withdrawal: opts.ks?.withdrawalFor?.(a.id),
    }),
  );
  // Life events with a monthly cashflow impact bend the cash line from their
  // effective dates (a childcare end adds savings capacity; parental leave
  // subtracts it while it runs).
  const eventCashDeltaForYear = (y: number): number => {
    let delta = 0;
    for (const e of client.financialEvents) {
      if (!e.monthlyImpact) continue;
      const start = new Date(e.startDate).getFullYear() - currentYear;
      const end = e.endDate ? new Date(e.endDate).getFullYear() - currentYear : years;
      const from = Math.max(0, start);
      const to = Math.min(y, end);
      if (to > from) delta += e.monthlyImpact * 12 * (to - from);
    }
    return delta;
  };
  const traj = combinedTrajectory(
    client.mortgages.map((m) => ({
      principal: m.balance,
      annualRate: m.rate,
      years: m.termRemainingYears,
      interestOnly: m.interestOnly,
      offsetBalance: m.offsetBalance,
    })),
    opts.extraRepaymentMonthly ?? 0,
  );
  const out: { year: number; assets: number; debt: number; netWorth: number }[] = [];
  for (let y = 0; y <= years; y++) {
    const property = futureValue(propertyNow, growth, y);
    const ks = ksProj.reduce((s, p) => s + (p.balances[Math.min(y, p.balances.length - 1)]?.balance ?? 0), 0);
    const debtPoint = y === 0 ? traj.schedule[0]?.balance ?? 0 : traj.schedule[Math.min(y * 12, traj.schedule.length) - 1]?.balance ?? 0;
    // cash held flat (conservative) apart from event-driven deltas
    const cash = Math.max(0, client.cashSavings.value + eventCashDeltaForYear(y));
    const assets = property + ks + cash;
    out.push({ year: currentYear + y, assets, debt: debtPoint, netWorth: assets - debtPoint });
  }
  void oldest;
  return out;
}
