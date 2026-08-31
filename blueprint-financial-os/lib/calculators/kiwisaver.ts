import type { AuditLine, KiwiSaverAccount } from '../domain/types';
import type { KiwiSaverSettings } from '../rules/types';

export interface KiwiSaverWithdrawalEvent {
  year: number;
  amount: number;
  balanceAfter: number;
}

export interface KiwiSaverProjection {
  accountId: string;
  mode: 'low' | 'base' | 'high';
  returnRate: number;
  balances: { year: number; balance: number }[];
  at5Years: number;
  at10Years: number;
  atHorizon: number;
  horizonYears: number;
  contributionMonthly: number;
  /** first-home withdrawal modelled in this projection, when applicable */
  withdrawalEvent?: KiwiSaverWithdrawalEvent;
  audit: AuditLine[];
}

export function projectKiwiSaver(
  account: KiwiSaverAccount,
  settings: KiwiSaverSettings,
  opts: {
    mode: 'low' | 'base' | 'high';
    horizonYears: number;
    salaryGrowth?: number;
    contributionRateOverride?: number;
    /** annual net return override (adviser assumption) — replaces the mode band */
    returnOverride?: number;
    /** model a first-home withdrawal: at `year`, withdraw `amount` (capped so
     *  at least `keepMinimum` stays in the account) */
    withdrawal?: { year: number; amount: number; keepMinimum: number };
  },
): KiwiSaverProjection {
  const gross = settings.returnAssumptions[opts.mode];
  const fee = account.feesPercent ?? settings.defaultFeePercent;
  const net = opts.returnOverride ?? gross - fee;
  const monthlyRate = net / 12;
  const salaryGrowth = opts.salaryGrowth ?? 0;
  const contributionRate = opts.contributionRateOverride ?? account.contributionRate;

  let balance = account.balance.value;
  let salary = account.salaryForContribution;
  const balances: { year: number; balance: number }[] = [{ year: 0, balance }];
  const years = Math.max(1, Math.round(opts.horizonYears));
  let withdrawalEvent: KiwiSaverWithdrawalEvent | undefined;

  for (let y = 1; y <= years; y++) {
    const memberAnnual = salary * contributionRate + (account.voluntaryMonthly ?? 0) * 12;
    const employerAnnual = salary * account.employerRate * (1 - settings.esctApproxRate);
    const memberForGovt = Math.min(memberAnnual, settings.memberContributionCapForGovt / settings.governmentContributionMatchRate);
    const govt = Math.min(settings.governmentContributionAnnual, memberForGovt * settings.governmentContributionMatchRate);
    const monthly = (memberAnnual + employerAnnual + govt) / 12;
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthly;
    }
    if (opts.withdrawal && y === Math.max(1, Math.round(opts.withdrawal.year))) {
      const maxWithdrawable = Math.max(0, balance - opts.withdrawal.keepMinimum);
      const amount = Math.min(opts.withdrawal.amount, maxWithdrawable);
      balance -= amount;
      withdrawalEvent = { year: y, amount, balanceAfter: balance };
    }
    salary *= 1 + salaryGrowth;
    balances.push({ year: y, balance });
  }

  const at = (y: number) => balances[Math.min(y, years)].balance;
  const memberAnnual0 = account.salaryForContribution * contributionRate + (account.voluntaryMonthly ?? 0) * 12;
  const employerAnnual0 = account.salaryForContribution * account.employerRate * (1 - settings.esctApproxRate);

  return {
    accountId: account.id,
    mode: opts.mode,
    returnRate: net,
    balances,
    at5Years: at(5),
    at10Years: at(10),
    atHorizon: balances[years].balance,
    horizonYears: years,
    contributionMonthly: (memberAnnual0 + employerAnnual0) / 12,
    withdrawalEvent,
    audit: [
      ...(withdrawalEvent
        ? [{ label: `First-home withdrawal (year ${withdrawalEvent.year})`, value: -withdrawalEvent.amount, format: 'currency' as const, note: `Balance continues from $${Math.round(withdrawalEvent.balanceAfter).toLocaleString()} after the withdrawal — today's purchase decision changes the retirement projection.` }]
        : []),
      { label: 'Current balance', value: account.balance.value, format: 'currency', note: account.balance.sourceName },
      { label: `Member contributions (${(contributionRate * 100).toFixed(1)}% of salary${account.voluntaryMonthly ? ' + voluntary' : ''})`, value: memberAnnual0 / 12, format: 'currency', note: 'per month' },
      { label: `Employer contributions (${(account.employerRate * 100).toFixed(0)}% less ESCT)`, value: employerAnnual0 / 12, format: 'currency', note: 'per month' },
      { label: 'Government contribution', value: settings.governmentContributionAnnual, format: 'currency', note: 'per year, at current settings — these change; versioned' },
      { label: `Assumed net return (${opts.mode})`, value: net, format: 'percent', note: `Gross ${(gross * 100).toFixed(1)}% − fees ${(fee * 100).toFixed(2)}%. Assumption, not a guarantee.` },
    ],
  };
}

export interface KiwiSaverPositionNote {
  severity: 'info' | 'attention';
  message: string;
}

/** Transparent, non-ranking observations — never "your provider is bad". */
export function kiwiSaverPosition(
  account: KiwiSaverAccount,
  ownerAge: number,
  settings: KiwiSaverSettings,
): KiwiSaverPositionNote[] {
  const notes: KiwiSaverPositionNote[] = [];
  const growthFunds = ['growth', 'aggressive'];
  if (account.firstHomeIntent && growthFunds.includes(account.fundType)) {
    notes.push({
      severity: 'attention',
      message: `This account is in a ${account.fundType} fund but is earmarked for a first-home withdrawal — a short horizon usually calls for a lower-volatility fund. Worth a KiwiSaver adviser conversation.`,
    });
  }
  if (!account.firstHomeIntent && ownerAge < 50 && ['defensive', 'conservative'].includes(account.fundType)) {
    notes.push({
      severity: 'attention',
      message: `A ${account.fundType} fund with a ${65 - ownerAge}-year horizon may be misaligned to the investment timeframe. Worth a KiwiSaver adviser conversation.`,
    });
  }
  if ((account.feesPercent ?? settings.defaultFeePercent) > 0.012) {
    notes.push({
      severity: 'attention',
      message: 'Fees look high relative to comparable funds — compare on Sorted Smart Investor before deciding.',
    });
  }
  if (account.contributionRate < 0.03 && !account.voluntaryMonthly) {
    notes.push({ severity: 'info', message: 'Contribution rate is below 3% — government and employer matching may not be maximised.' });
  }
  return notes;
}
