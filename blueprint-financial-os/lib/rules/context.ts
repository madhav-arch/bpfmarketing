import type { RuleContext } from '../scenarios/compute';
import { BLUEPRINT_MODELLING_POLICY } from './lenderPolicies';
import { NZ_BANK_POLICIES } from './nzBankPolicies';
import { TAX_CURRENT } from './taxTables';
import {
  CASHBACK_EXAMPLE,
  FHB_COSTS,
  KIWISAVER_SETTINGS,
  KIWISAVER_WITHDRAWAL_WORKFLOW,
  MODELLING,
  OWNERSHIP_COSTS,
  RETIREMENT_SETTINGS,
} from './assumptions';

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
  ownership: OWNERSHIP_COSTS,
  cashback: CASHBACK_EXAMPLE,
  ksWithdrawal: KIWISAVER_WITHDRAWAL_WORKFLOW,
};

export const ALL_RULE_SETS = [
  BLUEPRINT_MODELLING_POLICY,
  ...NZ_BANK_POLICIES,
  TAX_CURRENT,
  FHB_COSTS,
  KIWISAVER_SETTINGS,
  RETIREMENT_SETTINGS,
  MODELLING,
  OWNERSHIP_COSTS,
  CASHBACK_EXAMPLE,
  KIWISAVER_WITHDRAWAL_WORKFLOW,
];
