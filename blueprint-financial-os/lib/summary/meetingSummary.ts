import type { Client } from '../domain/types';
import type { CalculationResult } from '../scenarios/compute';
import type { ChangeExplanation } from '../scenarios/diff';
import { describeChange, type ScenarioChange } from '../scenarios/changes';
import { moneyTenK } from '../format';

const $ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export interface SummaryInput {
  client: Client;
  scenarioName: string;
  changes: ScenarioChange[];
  baseline: CalculationResult;
  selected: CalculationResult;
  diffs: ChangeExplanation[];
  rationale: { benefits: string[]; risks: string[]; considerations: string[] };
  /** adviser-written notes captured during the meeting */
  adviserNotes?: string;
  /** extra saved scenarios for the comparison table (name + result) */
  comparisonScenarios?: { name: string; result: CalculationResult }[];
  /** items the client still needs to supply */
  outstandingInformation?: string[];
}

/**
 * Draft post-meeting summary in the style of Blueprint's follow-up emails.
 * Every number is read from the calculation engine — nothing is invented.
 * Requires adviser review before sending.
 */
export function buildMeetingSummary(input: SummaryInput): string {
  const { client, baseline, selected, diffs } = input;
  const s = selected.snapshot;
  const lines: string[] = [];

  lines.push(`# Strategy Session Summary — ${client.label}`);
  lines.push('');
  lines.push('_Draft generated from the agreed scenario. Adviser review required before sending._');
  lines.push('');
  lines.push('## Purpose');
  lines.push(client.narrative);
  lines.push('');
  lines.push('## Your goals');
  for (const g of client.goals) lines.push(`- ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
  lines.push('');
  lines.push('## Where you are today');
  lines.push(`- Net worth: ${$(s.netWorth)} (assets ${$(s.totalAssets)}, debt ${$(s.totalDebt)})`);
  lines.push(`- Household net income: ${$(s.actualNetIncomeMonthly)}/month`);
  lines.push(`- Declared monthly spending: ${$(s.declaredSpendMonthly)}`);
  if (client.mortgages.length > 0) {
    lines.push(`- Current mortgage repayments: ${$(s.actualRepaymentsMonthly)}/month`);
  }
  if (s.usableEquity > 0) lines.push(`- Usable equity across the portfolio: ${$(s.usableEquity)}`);
  lines.push('');
  lines.push('## How the bank sees you');
  lines.push(
    `- Recognised income after lender scaling: ${$(selected.servicing.recognisedIncomeMonthly)}/month`,
  );
  lines.push(`- Benchmark living costs + commitments: ${$(selected.servicing.livingExpenses.totalMonthly)}/month`);
  lines.push(
    `- Debt servicing under the lender stress test: ${$(selected.servicing.debtServicing.totalMonthly)}/month`,
  );
  lines.push(`- Uncommitted monthly income: ${$(selected.servicing.umi)}`);
  lines.push(
    `- Indicative borrowing capacity: ${moneyTenK(selected.lenderComparison.range.min)} – ${moneyTenK(selected.lenderComparison.range.max)} (rounded to the nearest $10,000; varies by lender policy)`,
  );
  lines.push('');

  if (input.changes.length > 0) {
    lines.push('## The strategy we agreed to model');
    for (const c of input.changes) lines.push(`- ${describeChange(c)}`);
    lines.push('');
    lines.push('## What this changes');
    for (const d of diffs) {
      const dir = d.delta >= 0 ? '+' : '−';
      const val =
        d.format === 'currency'
          ? `${dir}${$(Math.abs(d.delta))}`
          : d.format === 'percent'
            ? `${dir}${(Math.abs(d.delta) * 100).toFixed(2)}%`
            : d.format === 'year'
              ? `${Math.abs(d.delta).toFixed(1)} years ${d.delta < 0 ? 'earlier' : 'later'}`
              : `${dir}${Math.abs(d.delta).toFixed(0)}`;
      lines.push(`- ${d.label}: ${val}`);
    }
    lines.push('');
  }

  if (client.mortgages.length > 0) {
    lines.push('## Mortgage trajectory');
    lines.push(
      `- Current path: mortgage-free ~${baseline.amortisation.current.payoffYear}, remaining interest ≈ ${$(baseline.amortisation.current.totalInterest)}`,
    );
    lines.push(
      `- Blueprint path: mortgage-free ~${selected.amortisation.blueprint.payoffYear}, remaining interest ≈ ${$(selected.amortisation.blueprint.totalInterest)}`,
    );
    lines.push('');
  }

  if (selected.refinance) {
    const r = selected.refinance;
    lines.push('## Restructure / refinance economics');
    lines.push(`- Cashback: ${$(r.cashback)}${r.cashbackToRepay ? `, less ${$(r.cashbackToRepay)} clawback to current lender` : ''}`);
    lines.push(`- Costs: lawyer ${$(r.lawyerFee)}, break fees ≈ ${$(r.totalBreakFees)} (estimate — to be confirmed with the lender)`);
    if (r.taxSavingAnnual > 0) lines.push(`- Structure tax saving: ≈ ${$(r.taxSavingAnnual)}/year (accountant-confirmed)`);
    lines.push(`- Net position in year one: ${r.benefit12 >= 0 ? 'benefit' : 'cost'} of ${$(Math.abs(r.benefit12))}`);
    lines.push('');
  }

  // Scenario comparison table (concise, engine figures only)
  if (input.comparisonScenarios && input.comparisonScenarios.length > 0) {
    const cols = [{ name: 'Baseline', result: baseline }, { name: input.scenarioName, result: selected }, ...input.comparisonScenarios].slice(0, 4);
    lines.push('## Scenario comparison');
    lines.push(`| | ${cols.map((c) => c.name).join(' | ')} |`);
    lines.push(`|---|${cols.map(() => '---').join('|')}|`);
    const row = (label: string, get: (r: CalculationResult) => string) =>
      lines.push(`| ${label} | ${cols.map((c) => get(c.result)).join(' | ')} |`);
    row('Monthly surplus', (r) => $(r.snapshot.monthlySurplus));
    row('Borrowing capacity', (r) => `${moneyTenK(r.lenderComparison.range.min)}–${moneyTenK(r.lenderComparison.range.max)}`);
    if (client.mortgages.length > 0) {
      row('Mortgage-free', (r) => (r.amortisation.blueprint.paidOff ? `~${r.amortisation.blueprint.payoffYear}` : 'IO — no payoff path'));
      row('Interest remaining', (r) => $(r.amortisation.blueprint.totalInterest));
    }
    if (selected.fhb) {
      row('Purchase price', (r) => (r.fhb ? $(r.fhb.purchasePrice) : '—'));
      row('Deposit', (r) => (r.fhb ? `${(r.fhb.depositPercent * 100).toFixed(1)}%` : '—'));
      row('Repayment /fn', (r) => (r.fhb ? $(r.fhb.repaymentFortnightly) : '—'));
    }
    row('KiwiSaver at retirement (nominal)', (r) => $(r.snapshot.kiwiSaverProjected));
    lines.push('');
  }

  lines.push('## KiwiSaver & retirement');
  lines.push(`- KiwiSaver today: ${$(s.kiwiSaverNow)} → projected ${$(s.kiwiSaverProjected)} at retirement (nominal, base assumptions; ≈ ${$(selected.retirement.projectedKiwiSaverToday)} in today's dollars at ${(selected.inflation * 100).toFixed(1)}% inflation)`);
  lines.push(
    `- Projected retirement income vs goal: ${s.retirementGap >= 0 ? `surplus of ${$(s.retirementGap)}/yr` : `gap of ${$(-s.retirementGap)}/yr`} (${(selected.retirement.drawdownRate * 100).toFixed(0)}% drawdown is a planning heuristic, not a guarantee)`,
  );
  lines.push(
    `- Projected retirement income in today's dollars: ≈ ${$(selected.retirement.projectedAnnualIncomeToday)}/yr (${$(selected.retirement.projectedWeeklyIncomeToday)}/week)`,
  );
  lines.push('');
  if (selected.protection.issues.length > 0) {
    lines.push('## Protection');
    for (const i of selected.protection.issues) lines.push(`- ${i.message}`);
    lines.push('');
  }
  lines.push('## Why this strategy');
  if (input.rationale.benefits.length) {
    lines.push('**Benefits**');
    for (const b of input.rationale.benefits) lines.push(`- ${b}`);
  }
  if (input.rationale.risks.length) {
    lines.push('**Risks**');
    for (const r of input.rationale.risks) lines.push(`- ${r}`);
  }
  if (input.rationale.considerations.length) {
    lines.push('**Considerations**');
    for (const c of input.rationale.considerations) lines.push(`- ${c}`);
  }
  lines.push('');
  if (input.adviserNotes && input.adviserNotes.trim().length > 0) {
    lines.push('## Adviser notes from the meeting');
    for (const n of input.adviserNotes.split('\n').filter((x) => x.trim())) lines.push(`- ${n.trim()}`);
    lines.push('');
  }
  if (input.outstandingInformation && input.outstandingInformation.length > 0) {
    lines.push('## Outstanding information');
    for (const o of input.outstandingInformation) lines.push(`- ${o}`);
    lines.push('');
  }
  lines.push('## Next steps');
  lines.push('- Confirm the figures above against source documents (IRD income summary, statements, accountant financials).');
  lines.push('- Blueprint to confirm lender policy details before any application.');
  lines.push('- Book the follow-up to lock in the structure.');
  lines.push('');
  lines.push('---');
  lines.push(
    '_All figures are illustrative modelling based on stated assumptions and versioned rule sets — not a loan offer, valuation, or guarantee. Lender policy and rates change._',
  );
  return lines.join('\n');
}

/**
 * Simplified email meeting summary — a short, client-friendly draft the
 * adviser can paste straight into an email. Same engine figures as the full
 * summary, an order of magnitude fewer of them.
 */
export function buildShortEmail(input: SummaryInput): string {
  const { client, selected } = input;
  const s = selected.snapshot;
  const firstNames = client.applicants.map((a) => a.displayName.split(' ')[0]).join(' and ');
  const lines: string[] = [];

  lines.push(`Hi ${firstNames || 'there'},`);
  lines.push('');
  lines.push('Great to catch up today. The short version of where things landed:');
  lines.push('');
  lines.push(
    `- Indicative borrowing capacity: ${moneyTenK(selected.lenderComparison.range.min)} – ${moneyTenK(selected.lenderComparison.range.max)} depending on the lender (rounded to the nearest $10,000).`,
  );
  if (selected.fhb) {
    lines.push(
      `- The purchase we modelled: ${$(selected.fhb.purchasePrice)} with a ${(selected.fhb.depositPercent * 100).toFixed(1)}% deposit — repayments about ${$(selected.fhb.repaymentFortnightly)}/fortnight.`,
    );
  }
  lines.push(`- Monthly surplus after everything: ${$(s.monthlySurplus)}.`);
  if (client.mortgages.length > 0 && selected.amortisation.blueprint.paidOff) {
    lines.push(`- On the plan we agreed, you're mortgage-free around ${selected.amortisation.blueprint.payoffYear}.`);
  }
  if (input.changes.length > 0) {
    lines.push('');
    lines.push('What we agreed to model:');
    for (const c of input.changes.slice(0, 5)) lines.push(`- ${describeChange(c)}`);
  }
  if (input.outstandingInformation && input.outstandingInformation.length > 0) {
    lines.push('');
    lines.push('What I need from you:');
    for (const o of input.outstandingInformation) lines.push(`- ${o}`);
  }
  lines.push('');
  lines.push('Next step: book the follow-up and we lock the structure in.');
  lines.push('');
  lines.push('These figures are indicative modelling, not a loan offer — lender policy and rates change.');
  lines.push('');
  lines.push('Madhav');
  return lines.join('\n');
}
