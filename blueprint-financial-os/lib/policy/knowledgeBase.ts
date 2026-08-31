// BankPolicyKnowledgeBase — verified lender-policy material only.
//
// Sources today: the five bank servicing calculators supplied by the adviser
// (versioned rule sets in lib/rules/nzBankPolicies.ts, extracted cell by
// cell). Policy questions are answered ONLY from these verified facts; for
// anything else the knowledge base declines with the exact wording the brief
// requires. Uploading further policy documents adds entries here.

import type { LenderPolicy } from '../rules/types';
import { NZ_BANK_POLICIES, LENDERS_TO_BE_TESTED } from '../rules/nzBankPolicies';

export interface PolicyLibraryEntry {
  lender: string;
  policyType: string;
  effectiveDate: string;
  uploadedDate: string;
  status: 'verified' | 'needs-review' | 'not-loaded';
  lastReviewed: string;
  sourceDescription: string;
  policy?: LenderPolicy;
}

export function policyLibrary(): PolicyLibraryEntry[] {
  const loaded: PolicyLibraryEntry[] = NZ_BANK_POLICIES.map((p) => ({
    lender: p.lender,
    policyType: 'Servicing calculator',
    effectiveDate: p.effectiveFrom,
    uploadedDate: p.verifiedAt,
    status: /test with adviser|confirm/i.test(p.notes ?? '') ? 'needs-review' : 'verified',
    lastReviewed: p.verifiedAt,
    sourceDescription: p.source,
    policy: p,
  }));
  const pending: PolicyLibraryEntry[] = LENDERS_TO_BE_TESTED.filter((l) => !/re-verify/i.test(l.lender)).map((l) => ({
    lender: l.lender,
    policyType: 'Servicing calculator',
    effectiveDate: '—',
    uploadedDate: '—',
    status: 'not-loaded',
    lastReviewed: '—',
    sourceDescription: 'Not yet supplied — check with adviser before including in comparisons.',
  }));
  return [...loaded, ...pending];
}

/** Verified facts about one lender's servicing policy, in plain language. */
export function policyFacts(p: LenderPolicy): string[] {
  const facts = [
    `${p.lender} tests home-loan servicing at ${(p.stressRate * 100).toFixed(2)}%${p.stressRateIsFloor ? ' as a floor (a loan on a higher actual rate tests at its own rate)' : ''}.`,
    `Credit-card and similar limits are assessed at ${(p.creditCardMonthlyFactor * 100).toFixed(1)}% of the limit per month, drawn or not.`,
    `Rental income is recognised at ${Math.round(p.rentalScaling * 100)}%; boarder income at ${Math.round(p.boarderScaling.percent * 100)}%${p.boarderScaling.maxPerBoarderWeekly ? `, capped at $${p.boarderScaling.maxPerBoarderWeekly}/week per boarder` : ''} (max ${p.boarderScaling.maxBoarders}).`,
    `The living-expense benchmark for a couple is about $${Math.round(p.expenseBenchmark.couple).toLocaleString()}/month plus $${Math.round(p.expenseBenchmark.perDependant)}/dependant${p.expenseBenchmark.incomeLinkedRate ? `, plus ${(p.expenseBenchmark.incomeLinkedRate * 100).toFixed(0)}% of gross monthly income` : ''} — the higher of benchmark and declared expenses applies.`,
    `Overtime, bonus and commission income is scaled to ${Math.round(p.otScaling * 100)}%.`,
  ];
  if (p.notes) facts.push(`Source notes: ${p.notes}`);
  return facts;
}

export interface PolicyAnswer {
  answered: boolean;
  lender?: string;
  text: string;
  sourceIds: string[];
}

const declineFor = (lender: string) =>
  `I don't yet have enough verified ${lender} policy information to explain that difference.`;

/** Answer a policy question from verified material only. */
export function answerPolicyQuestion(question: string): PolicyAnswer | null {
  const q = question.toLowerCase();
  const isPolicyQuestion = /(why|how|what).*(lend|policy|test rate|benchmark|scal|recogni|card|boarder|rental|servic)/i.test(question) ||
    /policy|test rate|benchmark/.test(q);
  if (!isPolicyQuestion) return null;

  const known = NZ_BANK_POLICIES.filter((p) => q.includes(p.lender.toLowerCase()));
  const unknown = [...LENDERS_TO_BE_TESTED.map((l) => l.lender.split(' ')[0]), 'TSB', 'SBS', 'Bank of China', 'Co-operative', 'Heartland']
    .filter((name) => q.includes(name.toLowerCase()) && !known.some((p) => p.lender.toLowerCase() === name.toLowerCase()));

  if (known.length === 0 && unknown.length > 0) {
    return { answered: false, lender: unknown[0], text: declineFor(unknown[0]), sourceIds: [] };
  }
  if (known.length === 0) return null;

  if (known.length >= 2) {
    // comparative question — explain the parameter differences that exist
    const [a, b] = known;
    const lines: string[] = [];
    if (a.stressRate !== b.stressRate)
      lines.push(`${a.lender} tests at ${(a.stressRate * 100).toFixed(2)}% vs ${b.lender} at ${(b.stressRate * 100).toFixed(2)}%.`);
    if (Math.abs(a.expenseBenchmark.couple - b.expenseBenchmark.couple) > 50)
      lines.push(`Couple benchmark: ${a.lender} ≈ $${Math.round(a.expenseBenchmark.couple).toLocaleString()}/mo vs ${b.lender} ≈ $${Math.round(b.expenseBenchmark.couple).toLocaleString()}/mo.`);
    if (a.creditCardMonthlyFactor !== b.creditCardMonthlyFactor)
      lines.push(`Card limits: ${a.lender} ${(a.creditCardMonthlyFactor * 100).toFixed(1)}%/mo vs ${b.lender} ${(b.creditCardMonthlyFactor * 100).toFixed(1)}%/mo.`);
    if (a.boarderScaling.percent !== b.boarderScaling.percent || a.boarderScaling.maxPerBoarderWeekly !== b.boarderScaling.maxPerBoarderWeekly)
      lines.push(`Boarders: ${a.lender} ${Math.round(a.boarderScaling.percent * 100)}%${a.boarderScaling.maxPerBoarderWeekly ? ` (cap $${a.boarderScaling.maxPerBoarderWeekly}/wk)` : ''} vs ${b.lender} ${Math.round(b.boarderScaling.percent * 100)}%${b.boarderScaling.maxPerBoarderWeekly ? ` (cap $${b.boarderScaling.maxPerBoarderWeekly}/wk)` : ''}.`);
    if (a.expenseBenchmark.incomeLinkedRate || b.expenseBenchmark.incomeLinkedRate) {
      const linked = a.expenseBenchmark.incomeLinkedRate ? a : b;
      lines.push(`${linked.lender}'s benchmark also scales with income (+${((linked.expenseBenchmark.incomeLinkedRate ?? 0) * 100).toFixed(0)}% of gross monthly income).`);
    }
    return {
      answered: true,
      text:
        lines.length > 0
          ? `From the verified calculators (${a.label}; ${b.label}): ${lines.join(' ')} The borrowing-power screen shows how these land for this household.`
          : `The verified ${a.lender} and ${b.lender} calculators use very similar parameters here — the difference for this household will come from how the shared inputs interact; check the drivers list on the borrowing-power screen.`,
      sourceIds: [a.id, b.id],
    };
  }

  const p = known[0];
  return { answered: true, lender: p.lender, text: `From ${p.label} (effective ${p.effectiveFrom}): ${policyFacts(p).slice(0, 4).join(' ')}`, sourceIds: [p.id] };
}
