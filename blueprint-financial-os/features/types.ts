import type { Client } from '@/lib/domain/types';
import type { CalculationResult, RuleContext } from '@/lib/scenarios/compute';
import type { ScenarioChange } from '@/lib/scenarios/changes';
import type { AuditRequest } from '@/components/ui';

export interface SectionProps {
  /** scenario-transformed client */
  client: Client;
  baselineClient: Client;
  result: CalculationResult;
  baseline: CalculationResult;
  presentation: boolean;
  openAudit: (req: AuditRequest) => void;
  addChanges: (changes: ScenarioChange[], name?: string) => void;
  ctx: RuleContext;
}
