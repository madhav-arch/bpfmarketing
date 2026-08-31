// Deterministic Benefits / Risks / Considerations for a Recommended
// Blueprint. Every line is generated from engine facts (with the supporting
// calculation named); an AI layer may polish wording but may never invent
// the underlying reason. The adviser can still edit before anything ships.

import type { CalculationResult } from '../scenarios/compute';
import type { ScenarioChange } from '../scenarios/changes';
import { years as fmtYears } from '../format';

export interface RationaleItem {
  text: string;
  supporting: string; // which engine produced the fact
}

export interface Rationale {
  benefits: RationaleItem[];
  risks: RationaleItem[];
  considerations: RationaleItem[];
}

const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

export function buildRationale(
  baseline: CalculationResult,
  result: CalculationResult,
  changes: ScenarioChange[],
): Rationale {
  const benefits: RationaleItem[] = [];
  const risks: RationaleItem[] = [];
  const considerations: RationaleItem[] = [];

  // --- Mortgage term / interest
  const termDelta = result.amortisation.blueprint.termYears - baseline.amortisation.current.termYears;
  const interestDelta = result.amortisation.blueprint.totalInterest - baseline.amortisation.current.totalInterest;
  if (baseline.amortisation.current.paidOff && result.amortisation.blueprint.paidOff && termDelta < -0.3) {
    benefits.push({
      text: `The strategy reduces the modelled mortgage term by ${fmtYears(Math.abs(termDelta))} (mortgage-free around ${result.amortisation.blueprint.payoffYear} instead of ${baseline.amortisation.current.payoffYear}).`,
      supporting: 'mortgage amortisation engine',
    });
  }
  if (interestDelta < -1000) {
    benefits.push({
      text: `Modelled lifetime interest falls by about ${money(interestDelta)} (${money(baseline.amortisation.current.totalInterest)} to ${money(result.amortisation.blueprint.totalInterest)}).`,
      supporting: 'mortgage amortisation engine',
    });
  }

  // --- Cashflow
  const surplusDelta = result.snapshot.monthlySurplus - baseline.snapshot.monthlySurplus;
  if (surplusDelta < -100) {
    risks.push({
      text: `The strategy reduces monthly free cashflow by ${money(surplusDelta)} (from ${money(baseline.snapshot.monthlySurplus)} to ${money(result.snapshot.monthlySurplus)} per month) — it needs to stay affordable on an ordinary month, not just on paper.`,
      supporting: 'cashflow engine',
    });
  } else if (surplusDelta > 100) {
    benefits.push({
      text: `Monthly free cashflow improves by ${money(surplusDelta)} under this scenario.`,
      supporting: 'cashflow engine',
    });
  }
  if (result.snapshot.monthlySurplus < 400) {
    risks.push({
      text: `The remaining monthly buffer is modelled at ${money(result.snapshot.monthlySurplus)} — thin against rate rises or one-off costs.`,
      supporting: 'cashflow engine',
    });
  }

  // --- Capacity
  const capDelta = result.servicing.maxNewLending - baseline.servicing.maxNewLending;
  if (capDelta > 10_000) {
    benefits.push({
      text: `Modelled borrowing capacity improves by about ${money(capDelta)} under the Blueprint servicing view.`,
      supporting: 'servicing engine',
    });
  } else if (capDelta < -10_000) {
    risks.push({
      text: `Modelled borrowing capacity reduces by about ${money(capDelta)} — future flexibility is traded away.`,
      supporting: 'servicing engine',
    });
  }

  // --- FHB specifics
  if (result.fhb) {
    const f = result.fhb;
    if (f.lowEquityMargin > 0) {
      risks.push({
        text: `At ${(f.lvr * 100).toFixed(1)}% LVR a low-equity margin of ${(f.lowEquityMargin * 100).toFixed(2)}% applies, taking the modelled rate to ${(f.effectiveRate * 100).toFixed(2)}% until the LVR drops below the band.`,
        supporting: 'low-equity pricing model',
      });
    }
    if (f.kiwiSaverShareOfDeposit > 0.5) {
      considerations.push({
        text: `KiwiSaver makes up ${Math.round(f.kiwiSaverShareOfDeposit * 100)}% of the deposit — settlement timing depends on the withdrawal being processed in time (allow sufficient time; actual processing can vary).`,
        supporting: 'deposit composition + withdrawal workflow assumption',
      });
    }
    if (f.cashback.amount > 0) {
      considerations.push({
        text: `The modelled ${money(f.cashback.amount)} cashback is an example offer, not an entitlement, and carries a ${f.cashback.retentionMonths}-month ${f.cashback.clawbackMethod} clawback if the loan moves early.`,
        supporting: 'cashback module (configurable example)',
      });
    }
  }

  // --- Structure-specific
  if (changes.some((c) => c.kind === 'addRevolvingCredit')) {
    considerations.push({
      text: 'A revolving-credit strategy relies on maintaining spending discipline — the comparison here assumes it holds most of the time, and the benefit disappears if the facility becomes a spending buffer.',
      supporting: 'strategy rule (revolving-credit comparison)',
    });
  }
  if (changes.some((c) => c.kind === 'setBoarder')) {
    considerations.push({
      text: 'Boarder income is recognised only partially by lenders and depends on the arrangement continuing — treat it as support, not foundation.',
      supporting: 'income recognition rules (active bank policy)',
    });
  }
  if (changes.some((c) => c.kind === 'sellProperty')) {
    considerations.push({
      text: 'Sale modelling deducts agent and legal costs and repays lending above LVR caps on retained securities; actual sale price and costs will differ from the assumption.',
      supporting: 'sale-restructure engine',
    });
  }
  if (changes.some((c) => c.kind === 'closeCreditCards' || c.kind === 'setCreditCardLimit')) {
    benefits.push({
      text: 'Reducing or closing card limits removes the monthly commitment lenders assess on the full limit, improving serviceability immediately.',
      supporting: 'servicing engine (card-limit treatment, active bank policy)',
    });
  }

  // --- KiwiSaver / retirement
  const ksDelta = result.snapshot.kiwiSaverProjected - baseline.snapshot.kiwiSaverProjected;
  if (ksDelta > 5000) {
    benefits.push({
      text: `Projected KiwiSaver at retirement improves by about ${money(ksDelta)} (nominal; about ${money(ksDelta / Math.pow(1 + result.inflation, result.retirement.yearsToRetirement))} in today's dollars).`,
      supporting: 'KiwiSaver projection engine',
    });
  } else if (ksDelta < -5000) {
    risks.push({
      text: `Projected KiwiSaver at retirement reduces by about ${money(ksDelta)} — a first-home withdrawal or lower contributions today changes the retirement position.`,
      supporting: 'KiwiSaver projection engine',
    });
  }
  const gapDelta = result.retirement.gap - baseline.retirement.gap;
  if (gapDelta > 500) {
    benefits.push({ text: `The projected retirement income position improves by about ${money(gapDelta)}/year against the goal.`, supporting: 'retirement projection engine' });
  }

  // --- Universal considerations
  considerations.push({
    text: 'All figures are modelled on versioned assumptions (rates, valuations, bank policy, growth) that change over time — the plan is reviewed at every refix and before any application.',
    supporting: 'rule-set registry',
  });
  considerations.push({
    text: 'Income and expense figures should be confirmed against source documents before anything goes to a lender.',
    supporting: 'data-provenance log',
  });

  return {
    benefits: benefits.slice(0, 5),
    risks: risks.slice(0, 4),
    considerations: considerations.slice(0, 5),
  };
}
