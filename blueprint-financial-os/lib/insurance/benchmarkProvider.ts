// InsuranceBenchmarkProvider — cohort benchmarking seam for premiums.
//
// Hard rules (Iteration 2 brief): never fabricate a "NZ national average
// insurance premium"; never declare someone over-insured from premium alone.
// Until a credible licensed dataset exists, benchmarking is RATIO-based
// (premium as a share of net income) plus adviser prompts.

import type { Client, InsurancePolicy } from '../domain/types';

export interface InsuranceCohort {
  householdAdults: number;
  dependants: number;
  oldestAge: number;
  netIncomeMonthly: number;
  mortgageDebt: number;
}

export interface PremiumFlag {
  severity: 'info' | 'attention';
  message: string;
  adviserPrompt?: string;
}

export interface InsuranceBenchmarkResult {
  sourceLabel: string;
  premiumMonthly: number;
  premiumShareOfNetIncome: number;
  flags: PremiumFlag[];
}

export interface InsuranceBenchmarkProvider {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  assess(policies: InsurancePolicy[], cohort: InsuranceCohort): InsuranceBenchmarkResult;
}

/** Ratio provider — always available; makes no market-average claims. */
export const ratioBenchmarkProvider: InsuranceBenchmarkProvider = {
  id: 'ratio',
  label: 'Premium-to-income ratios (no market dataset)',
  available: true,
  assess(policies, cohort) {
    const premiumMonthly = policies.reduce((s, p) => s + p.premiumMonthly, 0);
    const share = cohort.netIncomeMonthly > 0 ? premiumMonthly / cohort.netIncomeMonthly : 0;
    const flags: PremiumFlag[] = [];
    if (premiumMonthly > 0 && share > 0.05) {
      flags.push({
        severity: 'attention',
        message: `Premium burden appears material at ${(share * 100).toFixed(1)}% of household net income — adviser should confirm what policies and benefits are included.`,
        adviserPrompt: 'Confirm cover levels, excesses, benefit periods and who is insured before drawing any conclusion from the premium alone.',
      });
    } else if (premiumMonthly > 0 && share > 0.035) {
      flags.push({
        severity: 'info',
        message: `Premiums total ${(share * 100).toFixed(1)}% of household net income — worth confirming the cover matches current needs.`,
      });
    }
    const health = policies.filter((p) => p.kind === 'health').reduce((s, p) => s + p.premiumMonthly, 0);
    if (health > 350) {
      flags.push({
        severity: 'info',
        message: 'High health premium detected.',
        adviserPrompt: 'Confirm the number of insured people, the excess and the benefits before comparing.',
      });
    }
    const life = policies.filter((p) => p.kind === 'life').reduce((s, p) => s + p.premiumMonthly, 0);
    if (life > 250) {
      flags.push({
        severity: 'info',
        message: 'High life premium detected.',
        adviserPrompt: 'Confirm cover amount, age, smoking status and policy type — premium alone says nothing about over- or under-insurance.',
      });
    }
    return {
      sourceLabel: 'Ratio-based only — no credible market premium dataset is loaded, so no market comparison is made.',
      premiumMonthly,
      premiumShareOfNetIncome: share,
      flags,
    };
  },
};

/** Licensed dataset adapter — unavailable until Blueprint supplies one. */
export const datasetBenchmarkProvider: InsuranceBenchmarkProvider = {
  id: 'dataset',
  label: 'Cohort premium dataset (licensed)',
  available: false,
  unavailableReason:
    'No credible premium dataset is loaded. Insurance cost depends on age, smoking, health, occupation, sum insured, policy type, excess and benefits — a fabricated average would mislead. Supply a licensed dataset to enable cohort comparison.',
  assess() {
    throw new Error('Insurance dataset provider not configured.');
  },
};

export function cohortOf(client: Client, netIncomeMonthly: number): InsuranceCohort {
  return {
    householdAdults: client.household.adults,
    dependants: client.household.dependants,
    oldestAge: Math.max(...client.applicants.map((a) => a.age)),
    netIncomeMonthly,
    mortgageDebt: client.mortgages.reduce((s, m) => s + m.balance, 0),
  };
}
