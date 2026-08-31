import type { AuditLine, Client } from '../domain/types';
import type { KiwiSaverSettings, RetirementSettings } from '../rules/types';
import { futureValue } from './finance';
import { projectKiwiSaver } from './kiwisaver';
import { combinedTrajectory } from './amortisation';
import { activeValuation } from './equity';

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
  audit: AuditLine[];
}

export function computeRetirement(
  client: Client,
  settings: RetirementSettings,
  ksSettings: KiwiSaverSettings,
  opts: { mode?: 'low' | 'base' | 'high'; currentYear?: number; extraRepaymentMonthly?: number } = {},
): RetirementResult {
  const mode = opts.mode ?? 'base';
  const growth = settings.growth[mode];
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
    projectKiwiSaver(a, ksSettings, { mode, horizonYears: yearsToRetirement }),
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
    projectedNetWorth:
      projectedPropertyValue + projectedInvestmentPropertyValue + projectedKiwiSaver - balanceAtRetirement,
    incomeStreams,
    projectedAnnualIncome,
    goalAnnualIncome,
    gap: projectedAnnualIncome - goalAnnualIncome,
    drawdownRate: settings.drawdownRate,
    audit: [
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
  opts: { mode?: 'low' | 'base' | 'high'; years?: number; extraRepaymentMonthly?: number } = {},
): { year: number; assets: number; debt: number; netWorth: number }[] {
  const mode = opts.mode ?? 'base';
  const growth = settings.growth[mode];
  const years = opts.years ?? 25;
  const currentYear = new Date().getFullYear();
  const propertyNow = client.properties.reduce((s, p) => s + activeValuation(p).value, 0);
  const oldest = Math.max(...client.applicants.map((a) => a.age), 30);
  const ksProj = client.kiwiSaverAccounts.map((a) =>
    projectKiwiSaver(a, ksSettings, { mode, horizonYears: years }),
  );
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
    const cash = y === 0 ? client.cashSavings.value : client.cashSavings.value; // held flat — conservative
    const assets = property + ks + cash;
    out.push({ year: currentYear + y, assets, debt: debtPoint, netWorth: assets - debtPoint });
  }
  void oldest;
  return out;
}
