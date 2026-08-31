import type { RuleContext } from '../scenarios/compute';
import { BLUEPRINT_MODELLING_POLICY, DEMO_LENDERS } from './lenderPolicies';
import { TAX_CURRENT } from './taxTables';
import { FHB_COSTS, KIWISAVER_SETTINGS, MODELLING, RETIREMENT_SETTINGS } from './assumptions';

/** Default rule context for the live demo (current tax table). */
export const DEFAULT_RULE_CONTEXT: RuleContext = {
  policy: BLUEPRINT_MODELLING_POLICY,
  lenders: [BLUEPRINT_MODELLING_POLICY, ...DEMO_LENDERS],
  tax: TAX_CURRENT,
  fhbCosts: FHB_COSTS,
  kiwiSaver: KIWISAVER_SETTINGS,
  retirement: RETIREMENT_SETTINGS,
  modelling: MODELLING,
};

export const ALL_RULE_SETS = [
  BLUEPRINT_MODELLING_POLICY,
  ...DEMO_LENDERS,
  TAX_CURRENT,
  FHB_COSTS,
  KIWISAVER_SETTINGS,
  RETIREMENT_SETTINGS,
  MODELLING,
];
