import type { AuditLine, Client } from '../domain/types';
import type { CalculationResult } from '../scenarios/compute';
import type { RuleContext } from '../scenarios/compute';
import { compareRepayment } from '../calculators/amortisation';

export interface Insight {
  id: string;
  severity: 'info' | 'opportunity' | 'attention';
  category: 'servicing' | 'equity' | 'mortgage' | 'kiwisaver' | 'protection' | 'expenses' | 'retirement' | 'property';
  message: string;
  supporting: AuditLine[];
  sourceRuleSetId: string;
  discuss?: string;
}

/** Deterministic, rules-based insights — computed, never invented. */
export function generateInsights(client: Client, result: CalculationResult, ctx: RuleContext): Insight[] {
  const insights: Insight[] = [];
  const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

  // Credit-card limits dragging servicing
  const cardLimits = client.otherDebts
    .filter((d) => d.kind === 'credit-card' || d.kind === 'store-card')
    .reduce((s, d) => s + d.limit, 0);
  const cardBalances = client.otherDebts
    .filter((d) => d.kind === 'credit-card' || d.kind === 'store-card')
    .reduce((s, d) => s + d.balance, 0);
  if (cardLimits > 0) {
    const monthlyHit = cardLimits * ctx.policy.creditCardMonthlyFactor;
    const capacityHit = monthlyHit > 0 ? monthlyHit / (result.servicing.umi + monthlyHit) : 0;
    insights.push({
      id: 'cards-drag',
      severity: cardBalances < cardLimits * 0.2 ? 'opportunity' : 'info',
      category: 'servicing',
      message: `Credit-card limits of ${money(cardLimits)} reduce servicing by ${money(monthlyHit)}/month even though only ${money(cardBalances)} is drawn. Reducing or closing limits releases borrowing power immediately.`,
      supporting: [
        { label: 'Combined limits', value: cardLimits, format: 'currency' },
        { label: `Monthly deduction (${(ctx.policy.creditCardMonthlyFactor * 100).toFixed(0)}% of limit)`, value: -monthlyHit, format: 'currency' },
      ],
      sourceRuleSetId: ctx.policy.id,
      discuss: 'Close or reduce card limits before applying if capacity is tight.',
    });
    void capacityHit;
  }

  // Valuation spread creating equity
  for (const p of result.equity.properties) {
    if (p.perValuation.length > 1) {
      const sorted = [...p.perValuation].sort((a, b) => b.usableEquity - a.usableEquity);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best.usableEquity - worst.usableEquity > 20_000) {
        insights.push({
          id: `valuation-spread-${p.propertyId}`,
          severity: 'opportunity',
          category: 'equity',
          message: `${p.nickname}: using the ${best.label} valuation recognises ${money(best.usableEquity - worst.usableEquity)} more usable equity than the ${worst.label} valuation. Lender choice changes what your equity is worth.`,
          supporting: sorted.map((v) => ({
            label: `${v.label} (${v.value >= 1000 ? '$' + Math.round(v.value).toLocaleString() : v.value})`,
            value: v.usableEquity,
            format: 'currency' as const,
            note: 'usable equity',
          })),
          sourceRuleSetId: ctx.policy.id,
        });
      }
    }
  }

  // Repayment increase opportunity
  if (client.mortgages.length > 0 && result.snapshot.monthlySurplus > 800 && result.amortisation.extraMonthly === 0) {
    const main = [...client.mortgages].sort((a, b) => b.balance - a.balance)[0];
    const cmp = compareRepayment(
      { principal: main.balance, annualRate: main.rate, years: main.termRemainingYears, frequency: 'monthly' },
      (500 * 26) / 12,
    );
    if (cmp.yearsSaved > 0.5) {
      insights.push({
        id: 'repayment-opportunity',
        severity: 'opportunity',
        category: 'mortgage',
        message: `A $500/fortnight repayment increase on the main loan could cut roughly ${cmp.yearsSaved.toFixed(1)} years and ${money(cmp.interestSaved)} of interest — and the surplus appears to support it.`,
        supporting: [
          { label: 'Current monthly surplus', value: result.snapshot.monthlySurplus, format: 'currency' },
          { label: 'Years saved', value: cmp.yearsSaved, format: 'number' },
          { label: 'Interest avoided', value: cmp.interestSaved, format: 'currency' },
        ],
        sourceRuleSetId: ctx.modelling.id,
        discuss: 'Try it live: “Increase repayments by $500 a fortnight”.',
      });
    }
  }

  // Mortgage extends beyond retirement
  const oldest = Math.max(...client.applicants.map((a) => a.age));
  const yearsToRetirement = client.retirement.targetAge - oldest;
  if (client.mortgages.length > 0 && result.amortisation.blueprint.termYears > yearsToRetirement + 0.5) {
    insights.push({
      id: 'mortgage-past-retirement',
      severity: 'attention',
      category: 'retirement',
      message: `At the current repayment path the mortgage runs ${(result.amortisation.blueprint.termYears - yearsToRetirement).toFixed(1)} years past the target retirement age of ${client.retirement.targetAge}.`,
      supporting: [
        { label: 'Years to mortgage-free', value: result.amortisation.blueprint.termYears, format: 'number' },
        { label: 'Years to retirement', value: yearsToRetirement, format: 'number' },
      ],
      sourceRuleSetId: ctx.modelling.id,
      discuss: 'Model a repayment increase or lump-sum strategy to pull the payoff date forward.',
    });
  }

  // KiwiSaver notes surfaced as insights
  for (let i = 0; i < result.kiwiSaverNotes.length; i++) {
    const n = result.kiwiSaverNotes[i];
    insights.push({
      id: `ks-${i}`,
      severity: n.severity === 'attention' ? 'attention' : 'info',
      category: 'kiwisaver',
      message: n.message,
      supporting: [],
      sourceRuleSetId: ctx.kiwiSaver.id,
    });
  }

  // Protection issues
  for (const issue of result.protection.issues.filter((i) => i.severity === 'attention')) {
    insights.push({
      id: `prot-${issue.kind}`,
      severity: 'attention',
      category: 'protection',
      message: issue.message,
      supporting: result.protection.audit,
      sourceRuleSetId: ctx.modelling.id,
    });
  }

  // Suspicious expense entries
  for (const e of client.expenses.declaredMonthly) {
    if (e.flag) {
      insights.push({
        id: `exp-${e.category}`,
        severity: 'info',
        category: 'expenses',
        message: `“${e.category}” is declared at ${money(e.amount)}/month — ${e.flag}`,
        supporting: [{ label: e.category, value: e.amount, format: 'currency' }],
        sourceRuleSetId: ctx.policy.id,
        discuss: 'Check this figure before it goes to a lender.',
      });
    }
  }

  // Rental yield vs stress-cover
  for (const p of client.properties.filter((p) => p.use === 'investment' && p.rentPerWeek)) {
    const val = p.valuations.find((v) => v.id === p.activeValuationId)?.value ?? 0;
    const grossYield = val > 0 ? (p.rentPerWeek!.value * 52) / val : 0;
    if (grossYield > 0 && grossYield < 0.045) {
      insights.push({
        id: `yield-${p.id}`,
        severity: 'info',
        category: 'property',
        message: `${p.nickname} runs a ${(grossYield * 100).toFixed(1)}% gross yield — below the level where recognised rent covers stress-tested repayments, so it leans on personal income for servicing.`,
        supporting: [
          { label: 'Gross yield', value: grossYield, format: 'percent' },
          { label: 'Stress rate', value: ctx.policy.stressRate, format: 'percent' },
        ],
        sourceRuleSetId: ctx.policy.id,
      });
    }
  }

  // Upcoming events that change capacity
  for (const evt of client.financialEvents) {
    if (evt.kind === 'childcare-end' && evt.monthlyImpact) {
      insights.push({
        id: `evt-${evt.id}`,
        severity: 'opportunity',
        category: 'servicing',
        message: `${evt.label} frees roughly ${money(evt.monthlyImpact)}/month — materially improving borrowing capacity from that point.`,
        supporting: [{ label: evt.label, value: evt.monthlyImpact, format: 'currency' }],
        sourceRuleSetId: ctx.modelling.id,
      });
    }
  }

  const order = { attention: 0, opportunity: 1, info: 2 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}
