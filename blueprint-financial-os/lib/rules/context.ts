import type { RuleContext } from '../scenarios/compute';
import { BLUEPRINT_MODELLING_POLICY } from './lenderPolicies';
import { NZ_BANK_POLICIES } from './nzBankPolicies';
import { TAX_CURRENT } from './taxTables';
import { FHB_COSTS, KIWISAVER_SETTINGS, MODELLING, RETIREMENT_SETTINGS } from './assumptions';

/**
 * Default rule context: Blueprint's conservative modelling policy drives the
 * headline numbers; the five real bank profiles (from the uploaded bank
 * calculators) drive the lender comparison.
 */
export const DEFAULT_RULE_CONTEXT: RuleContext = {
  policy: BLUEPRINT_MODELLING_POLICY,
  lenders: [BLUEPRINT_MODELLING_POLICY, ...NZ_BANK_POLICIES],
  tax: TAX_CURRENT,
  fhbCosts: FHB_COSTS,
  kiwiSaver: KIWISAVER_SETTINGS,
  retirement: RETIREMENT_SETTINGS,
  modelling: MODELLING,
};

export const ALL_RULE_SETS = [
  BLUEPRINT_MODELLING_POLICY,
  ...NZ_BANK_POLICIES,
  TAX_CURRENT,
  FHB_COSTS,
  KIWISAVER_SETTINGS,
  RETIREMENT_SETTINGS,
  MODELLING,
];
