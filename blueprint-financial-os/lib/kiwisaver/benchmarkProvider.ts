// KiwiSaverBenchmarkProvider — the return-assumption data seam.
//
// Rules of engagement (from the Iteration 2 brief, held to strictly):
//  - No scraping or redistribution of copyrighted Morningstar datasets
//    without licensing. The Morningstar adapter exists but is unavailable
//    until a licensed feed is supplied.
//  - No single provider's historic performance presented as a national
//    expected return (no hardcoded Milford figures anywhere).
//  - Every assumption is labelled with its source and carries the
//    past-performance disclaimer.

import type { FundType } from '../domain/types';

export interface FundCategoryAssumption {
  fundType: FundType | 'cash';
  label: string;
  /** long-term annual return assumption, net of fees where noted */
  annualReturn: number;
  note: string;
}

export interface KiwiSaverBenchmarkDataset {
  sourceId: 'manual' | 'adviser-csv' | 'morningstar' | 'sorted';
  sourceLabel: string;
  asAt: string;
  disclaimer: string;
  categories: FundCategoryAssumption[];
}

export interface KiwiSaverBenchmarkProvider {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  getDataset(): KiwiSaverBenchmarkDataset;
}

export const PAST_PERFORMANCE_DISCLAIMER =
  'Historical return assumption. Past performance is not a reliable indicator of future performance.';

/** Default provider: Blueprint's long-term category assumptions (gross of the
 *  ~0.8% default fee applied separately in the projection engine). These are
 *  modelling assumptions, not market data. */
export const manualAssumptionProvider: KiwiSaverBenchmarkProvider = {
  id: 'manual',
  label: 'Blueprint category assumptions',
  available: true,
  getDataset() {
    return {
      sourceId: 'manual',
      sourceLabel: 'Blueprint modelling assumptions (long-term category ranges, before fees)',
      asAt: '2026-08-31',
      disclaimer: PAST_PERFORMANCE_DISCLAIMER,
      categories: [
        { fundType: 'cash', label: 'Cash', annualReturn: 0.025, note: 'Long-term category assumption' },
        { fundType: 'conservative', label: 'Conservative', annualReturn: 0.035, note: 'Long-term category assumption' },
        { fundType: 'balanced', label: 'Balanced', annualReturn: 0.045, note: 'Long-term category assumption' },
        { fundType: 'growth', label: 'Growth', annualReturn: 0.055, note: 'Long-term category assumption' },
        { fundType: 'aggressive', label: 'Aggressive', annualReturn: 0.065, note: 'Long-term category assumption' },
      ],
    };
  },
};

/** Adviser-uploaded CSV: `fundType,annualReturnPercent,label?` rows. */
export function adviserCsvProvider(csv: string, opts: { label?: string; asAt?: string } = {}): KiwiSaverBenchmarkProvider {
  const categories: FundCategoryAssumption[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const m = line.match(/^\s*(cash|defensive|conservative|balanced|growth|aggressive)\s*,\s*([\d.]+)\s*%?\s*(?:,\s*(.+?)\s*)?$/i);
    if (!m) continue;
    const ft = m[1].toLowerCase() as FundCategoryAssumption['fundType'];
    categories.push({
      fundType: ft === 'defensive' ? 'conservative' : ft,
      label: m[3] ?? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(),
      annualReturn: parseFloat(m[2]) / 100,
      note: 'Adviser-uploaded assumption',
    });
  }
  return {
    id: 'adviser-csv',
    label: opts.label ?? 'Adviser-uploaded dataset',
    available: categories.length > 0,
    unavailableReason: categories.length === 0 ? 'No parseable rows — expected `fundType,annualReturn%` lines.' : undefined,
    getDataset() {
      return {
        sourceId: 'adviser-csv',
        sourceLabel: opts.label ?? 'Adviser-uploaded dataset',
        asAt: opts.asAt ?? new Date().toISOString().slice(0, 10),
        disclaimer: PAST_PERFORMANCE_DISCLAIMER,
        categories,
      };
    },
  };
}

/** Licensed Morningstar adapter — intentionally unavailable until a licensed
 *  feed exists. Morningstar publishes KiwiSaver category performance, but
 *  redistribution requires an agreement; production can wire the feed in here
 *  and everything downstream keeps working. */
export const morningstarProvider: KiwiSaverBenchmarkProvider = {
  id: 'morningstar',
  label: 'Morningstar (licensed)',
  available: false,
  unavailableReason:
    'Morningstar KiwiSaver category data requires a licensing agreement before it can be stored or redistributed. Until one exists, use the category assumptions or an adviser-uploaded dataset.',
  getDataset() {
    throw new Error('Morningstar provider not configured — licensing agreement required.');
  },
};

/** Sorted Smart Investor adapter — public tool, no bulk API; same seam. */
export const sortedProvider: KiwiSaverBenchmarkProvider = {
  id: 'sorted',
  label: 'Sorted Smart Investor',
  available: false,
  unavailableReason:
    'Sorted Smart Investor has no bulk data API. Individual fund figures looked up there can be entered as adviser assumptions with source labels.',
  getDataset() {
    throw new Error('Sorted provider not configured.');
  },
};

export const KIWISAVER_BENCHMARK_PROVIDERS = [manualAssumptionProvider, morningstarProvider, sortedProvider];
