'use client';

import { useMemo, useState } from 'react';
import { Card, SectionHeading, Pill } from '@/components/ui';
import { money, moneyShort, years } from '@/lib/format';
import type { SectionProps } from './types';
import type { ScenarioChange } from '@/lib/scenarios/changes';
import { describeChange } from '@/lib/scenarios/changes';
import { explainChange } from '@/lib/scenarios/diff';
import { buildMeetingSummary } from '@/lib/summary/meetingSummary';
import { generateInsights } from '@/lib/insights/engine';

interface BlueprintProps extends SectionProps {
  scenarioName: string;
  scenarioChanges: ScenarioChange[];
  isRecommended: boolean;
  onSetRecommended: () => void;
}

const DEFAULT_RATIONALE = {
  benefits: [
    'Keeps the plan inside a comfortable monthly buffer, not just inside bank policy.',
    'Every dollar of extra repayment goes straight onto principal.',
  ],
  risks: [
    'Assumed rates, valuations and rules change — the plan is reviewed at every refix.',
    'Projections use stated growth assumptions and are not guaranteed.',
  ],
  considerations: [
    'Confirm all income and expense figures against source documents before application.',
    'Lender policy details to be confirmed at application time.',
  ],
};

export function BlueprintSection(props: BlueprintProps) {
  const { client, result, baseline, scenarioName, scenarioChanges, isRecommended, onSetRecommended, presentation, ctx } = props;
  const diffs = useMemo(() => explainChange(baseline, result), [baseline, result]);
  const insights = useMemo(() => generateInsights(client, result, ctx), [client, result, ctx]);
  const [rationale, setRationale] = useState(DEFAULT_RATIONALE);
  const [showSummary, setShowSummary] = useState(false);
  const [approved, setApproved] = useState(false);

  const summary = useMemo(
    () =>
      buildMeetingSummary({
        client,
        scenarioName,
        changes: scenarioChanges,
        baseline,
        selected: result,
        diffs,
        rationale,
      }),
    [client, scenarioName, scenarioChanges, baseline, result, diffs, rationale],
  );

  const hasChanges = scenarioChanges.length > 0;

  return (
    <section>
      <SectionHeading
        index="08 · Your blueprint"
        title="Current → Blueprint → Future"
        lede="The agreed path, why it's the right one, and the record it leaves behind."
        right={
          !presentation ? (
            <button
              onClick={onSetRecommended}
              disabled={!hasChanges}
              className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
                isRecommended
                  ? 'bg-green-600b text-white'
                  : hasChanges
                    ? 'bg-navy-900 text-white hover:bg-navy-800'
                    : 'cursor-not-allowed bg-mist text-slate-400'
              }`}
            >
              {isRecommended ? '✓ Recommended Blueprint' : 'Set as Recommended Blueprint'}
            </button>
          ) : isRecommended ? (
            <Pill tone="green">Recommended Blueprint</Pill>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-6">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500b">Current position</div>
          <div className="mt-3 space-y-2.5 text-[13px]">
            {client.mortgages.length > 0 ? (
              <>
                <Row
                  label="Mortgage-free"
                  value={baseline.amortisation.current.paidOff ? `~${baseline.amortisation.current.payoffYear} (${years(baseline.amortisation.current.termYears)})` : 'Not on a payoff path (IO)'}
                />
                <Row label="Interest remaining" value={moneyShort(baseline.amortisation.current.totalInterest)} />
              </>
            ) : null}
            <Row label="Net worth" value={moneyShort(baseline.snapshot.netWorth)} />
            <Row label="Monthly surplus" value={money(baseline.snapshot.monthlySurplus)} />
            <Row label="Retirement gap" value={money(baseline.retirement.gap, { sign: true }) + '/yr'} />
          </div>
        </Card>

        <Card tone="aqua" className="relative p-6">
          <div className="absolute -left-2 top-1/2 hidden -translate-y-1/2 text-teal-500 md:block">→</div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-500">The change — {scenarioName}</div>
          <div className="mt-3 space-y-2">
            {hasChanges ? (
              scenarioChanges.map((c, i) => (
                <div key={i} className="rounded-lg bg-white/80 px-3.5 py-2 text-[13px] font-medium text-navy-800">
                  {describeChange(c)}
                </div>
              ))
            ) : (
              <p className="text-[13px] leading-relaxed text-navy-800/70">
                No changes applied yet — explore options in section 05 or ask the copilot, then lock the winning scenario in here.
              </p>
            )}
          </div>
          <div className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-teal-500 md:block">→</div>
        </Card>

        <Card tone="navy" className="p-6">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-300/80">Projected result</div>
          <div className="mt-3 space-y-2.5 text-[13px]">
            {client.mortgages.length > 0 ? (
              <>
                <Row
                  dark
                  label="Mortgage-free"
                  value={result.amortisation.blueprint.paidOff ? `~${result.amortisation.blueprint.payoffYear} (${years(result.amortisation.blueprint.termYears)})` : 'Not on a payoff path (IO)'}
                />
                <Row dark label="Interest remaining" value={moneyShort(result.amortisation.blueprint.totalInterest)} />
              </>
            ) : null}
            <Row dark label="Net worth" value={moneyShort(result.snapshot.netWorth)} />
            <Row dark label="Monthly surplus" value={money(result.snapshot.monthlySurplus)} />
            <Row dark label="Retirement gap" value={money(result.retirement.gap, { sign: true }) + '/yr'} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Why this strategy</h3>
          <div className="mt-3 space-y-4">
            {(
              [
                ['Benefits', 'benefits', 'green'],
                ['Risks', 'risks', 'rose'],
                ['Considerations', 'considerations', 'slate'],
              ] as const
            ).map(([label, key, tone]) => (
              <div key={key}>
                <Pill tone={tone}>{label}</Pill>
                <div className="mt-2 space-y-1.5">
                  {rationale[key].map((item, i) => (
                    <div key={i} className="group flex items-start gap-2 text-[13px] leading-relaxed text-slate-500b">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal-500" />
                      {presentation ? (
                        <span>{item}</span>
                      ) : (
                        <input
                          value={item}
                          onChange={(e) =>
                            setRationale((r) => ({ ...r, [key]: r[key].map((x, xi) => (xi === i ? e.target.value : x)) }))
                          }
                          className="w-full bg-transparent outline-none focus:text-ink"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {!presentation ? <p className="mt-3 text-[11px] text-slate-500b">Adviser-editable — click any line to edit before generating the summary.</p> : null}
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold text-ink">Deterministic insights</h3>
          <p className="mt-0.5 text-[12px] text-slate-500b">Rules-based observations from the engine — each one traceable, none invented.</p>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {insights.map((ins) => (
              <div
                key={ins.id}
                className={`rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                  ins.severity === 'attention'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : ins.severity === 'opportunity'
                      ? 'border-teal-300/50 bg-aqua-100 text-navy-800'
                      : 'border-line bg-white text-slate-500b'
                }`}
              >
                <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{ins.category}</span>
                {ins.message}
                {ins.discuss && !presentation ? <div className="mt-1 text-[11.5px] italic opacity-70">{ins.discuss}</div> : null}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {!presentation ? (
        <Card className="mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">Post-meeting summary</h3>
              <p className="mt-0.5 text-[12.5px] text-slate-500b">
                Drafted from the {isRecommended ? 'recommended' : 'active'} scenario — every number comes from the calculation engine.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSummary((s) => !s)}
                className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-ink hover:bg-mist"
              >
                {showSummary ? 'Hide draft' : 'Generate draft'}
              </button>
              {showSummary ? (
                <>
                  <label className="flex items-center gap-1.5 text-[12.5px] text-slate-500b">
                    <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="accent-[#2ab3b1]" />
                    Adviser reviewed & approved
                  </label>
                  <button
                    disabled={!approved}
                    onClick={() => navigator.clipboard?.writeText(summary)}
                    className={`rounded-lg px-4 py-2 text-[13px] font-semibold ${approved ? 'bg-teal-500 text-white hover:bg-teal-400' : 'cursor-not-allowed bg-mist text-slate-400'}`}
                  >
                    Copy for email
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {showSummary ? (
            <pre className="mt-4 max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-mist p-5 font-sans text-[12.5px] leading-relaxed text-ink">
              {summary}
            </pre>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}

function Row({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={dark ? 'text-navy-100/70' : 'text-slate-500b'}>{label}</span>
      <span className={`num font-semibold ${dark ? 'text-white' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
