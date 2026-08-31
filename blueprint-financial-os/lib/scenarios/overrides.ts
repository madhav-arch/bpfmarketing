// Override provenance. The scenario model is already non-destructive — the
// baseline Client is immutable and every edit is an ordered ScenarioChange —
// so provenance can never be destroyed. This module makes it *visible*:
// each adviser edit becomes an OverrideRecord with originalValue,
// currentValue, source, overriddenBy, overriddenAt and reason.

import type { Client } from '../domain/types';
import { describeChange, type ScenarioChange } from './changes';

/** A change plus who/when/why metadata, as stored per scenario. */
export interface ChangeEntry {
  change: ScenarioChange;
  at: string; // ISO timestamp
  by: 'adviser' | 'copilot';
  reason?: string;
}

export interface OverrideRecord {
  field: string;
  originalValue: string;
  currentValue: string;
  source: string; // provenance of the original value
  overriddenBy: string;
  overriddenAt: string;
  reason?: string;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pctf = (n: number) => `${(n * 100).toFixed(2)}%`;

/** original-vs-current pairs for the fields a change list touches. */
export function buildOverrideLog(baseline: Client, entries: ChangeEntry[]): OverrideRecord[] {
  const records: OverrideRecord[] = [];
  for (const e of entries) {
    const c = e.change;
    const base = {
      overriddenBy: e.by === 'copilot' ? 'Adviser (via Blueprint Copilot)' : 'Adviser',
      overriddenAt: e.at,
      reason: e.reason,
    };
    switch (c.kind) {
      case 'setPurchasePrice':
        if (baseline.targetPurchase)
          records.push({ field: 'Purchase price', originalValue: fmt(baseline.targetPurchase.price), currentValue: fmt(c.value), source: 'Fact Find / strategy session', ...base });
        break;
      case 'setDepositSource': {
        const orig = baseline.targetPurchase?.depositSources[c.source] ?? 0;
        records.push({ field: `Deposit — ${c.source === 'kiwiSaver' ? 'KiwiSaver' : c.source}`, originalValue: fmt(orig), currentValue: fmt(c.value), source: 'Fact Find', ...base });
        break;
      }
      case 'setIncome': {
        const app = baseline.applicants[c.applicantIndex];
        const line = (c.incomeId && app?.incomes.find((i) => i.id === c.incomeId)) ?? app?.incomes[0];
        if (app && line)
          records.push({ field: `${app.displayName} — ${line.label} (gross/yr)`, originalValue: fmt(line.grossAnnual), currentValue: fmt(c.grossAnnual), source: 'Fact Find / Akahu detected', ...base });
        break;
      }
      case 'setRateAbsolute':
        records.push({ field: 'Modelled interest rate', originalValue: pctf(baseline.modellingRate), currentValue: pctf(c.value), source: 'Blueprint modelling assumption', ...base });
        break;
      case 'setStressRate':
        records.push({ field: 'Servicing test rate', originalValue: 'policy default', currentValue: pctf(c.value), source: 'Versioned lender policy', ...base });
        break;
      case 'setOwnershipCost':
        records.push({ field: c.item === 'rates' ? 'Rates assumption' : c.item === 'insurance' ? 'Home insurance assumption' : 'Other ownership costs', originalValue: 'rule-set default', currentValue: `${fmt(c.monthly)}/mo`, source: 'Ownership-cost assumption set', ...base });
        break;
      case 'setRetirementAge':
        records.push({ field: 'Retirement age', originalValue: `${baseline.retirement.targetAge}`, currentValue: `${c.age}`, source: 'Fact Find', ...base });
        break;
      case 'setInflation':
        records.push({ field: 'Inflation assumption', originalValue: 'rule-set default', currentValue: pctf(c.value), source: 'Retirement settings rule set', ...base });
        break;
      case 'addValuation':
        records.push({ field: 'Property valuation', originalValue: 'previous active valuation retained', currentValue: `${fmt(c.value)} (${c.sourceName ?? 'adviser-entered'})`, source: 'Valuation history (all prior valuations kept)', ...base });
        break;
      case 'setCreditCardLimit':
        records.push({ field: 'Credit-card limit', originalValue: fmt(baseline.otherDebts.find((d) => d.id === c.debtId)?.limit ?? baseline.otherDebts.find((d) => d.kind === 'credit-card')?.limit ?? 0), currentValue: fmt(c.limit), source: 'Fact Find / Akahu', ...base });
        break;
      default:
        records.push({ field: describeChange(c), originalValue: 'baseline', currentValue: describeChange(c), source: 'Scenario change log', ...base });
    }
  }
  return records;
}
