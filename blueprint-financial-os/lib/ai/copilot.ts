import type { Client } from '../domain/types';
import type { ScenarioChange } from '../scenarios/changes';

export interface ParseContext {
  client: Client;
}

export interface ProposedChange {
  change: ScenarioChange;
  chip: string;
}

export interface ParseResult {
  changes: ProposedChange[];
  /** parts of the utterance the parser could not act on */
  unrecognised?: string;
  commentary?: string;
}

/**
 * The AI seam. Implementations translate adviser language into structured
 * ScenarioChange objects — they NEVER produce financial numbers themselves.
 * Phase 1 ships LocalParser; an LLM-backed provider plugs in here later and
 * must emit the same schema (validated with scenarioChangeSchema).
 */
export interface ScenarioCopilot {
  readonly name: string;
  parse(utterance: string, ctx: ParseContext): ParseResult;
}
