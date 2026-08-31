import type { AuditLine, Client, InsuranceKind } from '../domain/types';
import { netMonthlyFromSalary } from './tax';
import type { TaxTable } from '../rules/types';

export interface ProtectionResult {
  existingCover: Record<InsuranceKind, number>;
  hasCover: Record<InsuranceKind, boolean>;
  premiumMonthlyTotal: number;
  premiumBurdenPercent: number; // of net household income
  lifeCoverNeed: number;
  lifeCoverGap: number;
  issues: { kind: InsuranceKind | 'general'; severity: 'info' | 'attention'; message: string }[];
  audit: AuditLine[];
}

const KINDS: InsuranceKind[] = ['life', 'trauma', 'income-protection', 'health', 'other'];

/**
 * Needs analysis only — no pricing, no market comparison. The need model:
 * clear all debt + replace `replacementYears` of 70% net household income
 * + dependants allowance − liquid assets/KiwiSaver.
 */
export function computeProtection(
  client: Client,
  tax: TaxTable,
  opts: { replacementYears?: number; replacementPercent?: number; perDependantAllowance?: number } = {},
): ProtectionResult {
  const replacementYears = opts.replacementYears ?? 5;
  const replacementPercent = opts.replacementPercent ?? 0.7;
  const perDependant = opts.perDependantAllowance ?? 50_000;

  const existingCover = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<InsuranceKind, number>;
  const hasCover = Object.fromEntries(KINDS.map((k) => [k, false])) as Record<InsuranceKind, boolean>;
  let premiumMonthlyTotal = 0;
  for (const pol of client.insurancePolicies) {
    existingCover[pol.kind] += pol.cover ?? 0;
    hasCover[pol.kind] = true;
    premiumMonthlyTotal += pol.premiumMonthly;
  }

  const netMonthlyHousehold = client.applicants.reduce(
    (s, a) => s + a.incomes.reduce((t, i) => t + netMonthlyFromSalary(i.grossAnnual, i.kiwiSaverRate, tax, i.studentLoan).netMonthly, 0),
    0,
  );

  const totalDebt =
    client.mortgages.reduce((s, m) => s + m.balance, 0) +
    client.otherDebts.reduce((s, d) => s + d.balance, 0);
  const incomeReplacement = netMonthlyHousehold * 12 * replacementPercent * replacementYears;
  const dependantsAllowance = client.household.dependants * perDependant;
  const liquidOffsets = client.cashSavings.value + client.kiwiSaverAccounts.reduce((s, k) => s + k.balance.value, 0);
  const lifeCoverNeed = Math.max(0, totalDebt + incomeReplacement + dependantsAllowance - liquidOffsets);
  const lifeCoverGap = lifeCoverNeed - existingCover.life;
  const premiumBurdenPercent = netMonthlyHousehold > 0 ? premiumMonthlyTotal / netMonthlyHousehold : 0;

  const issues: ProtectionResult['issues'] = [];
  if (lifeCoverGap > 50_000) {
    issues.push({
      kind: 'life',
      severity: 'attention',
      message: `Existing life cover appears about $${Math.round(lifeCoverGap / 1000)}k below the indicative need. Specialist review recommended.`,
    });
  } else if (existingCover.life > lifeCoverNeed * 1.5 && existingCover.life > 0) {
    issues.push({
      kind: 'life',
      severity: 'info',
      message: 'Current life cover appears high relative to the stated protection requirement — a review could reduce premiums.',
    });
  }
  if (!hasCover['income-protection'] && client.applicants.some((a) => a.employmentType === 'self-employed')) {
    issues.push({
      kind: 'income-protection',
      severity: 'attention',
      message: 'No income protection held while household income is self-employed. Specialist review recommended.',
    });
  } else if (!hasCover['income-protection']) {
    issues.push({ kind: 'income-protection', severity: 'info', message: 'No income protection recorded — worth reviewing given mortgage commitments.' });
  }
  if (!hasCover.trauma) {
    issues.push({ kind: 'trauma', severity: 'info', message: 'No trauma cover recorded.' });
  }
  if (premiumBurdenPercent > 0.05) {
    issues.push({
      kind: 'general',
      severity: 'info',
      message: `Insurance premiums represent ${(premiumBurdenPercent * 100).toFixed(1)}% of current household net income.`,
    });
  }

  return {
    existingCover,
    hasCover,
    premiumMonthlyTotal,
    premiumBurdenPercent,
    lifeCoverNeed,
    lifeCoverGap,
    issues,
    audit: [
      { label: 'Debt clearance', value: totalDebt, format: 'currency' },
      { label: `Income replacement (${(replacementPercent * 100).toFixed(0)}% × ${replacementYears} years)`, value: incomeReplacement, format: 'currency' },
      { label: `Dependants allowance (${client.household.dependants} × $${perDependant.toLocaleString()})`, value: dependantsAllowance, format: 'currency' },
      { label: 'Less liquid assets & KiwiSaver', value: -liquidOffsets, format: 'currency' },
      { label: 'Indicative life-cover need', value: lifeCoverNeed, format: 'currency' },
      { label: 'Existing life cover', value: -existingCover.life, format: 'currency' },
      { label: 'Indicative gap', value: lifeCoverGap, format: 'currency', note: 'Needs analysis only — pricing and product advice sit with a personal-risk specialist.' },
    ],
  };
}
