import type { Client } from '@/lib/domain/types';
import type { CalculationResult, RuleContext } from '@/lib/scenarios/compute';
import type { ScenarioChange } from '@/lib/scenarios/changes';
import type { AuditRequest } from '@/components/ui';
import type { FeedState } from './LiveDataPanel';

export interface SectionProps {
  /** scenario-transformed client */
  client: Client;
  baselineClient: Client;
  result: CalculationResult;
  baseline: CalculationResult;
  presentation: boolean;
  openAudit: (req: AuditRequest) => void;
  addChanges: (changes: ScenarioChange[], name?: string, by?: 'adviser' | 'copilot') => void;
  /** compute active scenario + extra changes without applying (for BEFORE → AFTER previews) */
  computePreview: (extra: ScenarioChange[]) => CalculationResult;
  onSaveScenario: (name?: string) => void;
  ctx: RuleContext;
  feed: FeedState;
}
