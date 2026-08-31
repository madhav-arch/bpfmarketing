'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Client } from '@/lib/domain/types';
import { DEMO_CLIENTS, PRESET_SCENARIOS } from '@/lib/data/demoClients';
import { DEFAULT_RULE_CONTEXT, ALL_RULE_SETS } from '@/lib/rules/context';
import { applyScenario } from '@/lib/scenarios/apply';
import { computeAll } from '@/lib/scenarios/compute';
import { explainChange } from '@/lib/scenarios/diff';
import { describeChange, type ScenarioChange } from '@/lib/scenarios/changes';
import { localParser } from '@/lib/ai/localParser';
import type { ProposedChange } from '@/lib/ai/copilot';
import { AuditDrawer, Delta, Pill, type AuditRequest } from '@/components/ui';
import { money, moneyShort, pct } from '@/lib/format';
import { GoalsSection, TodaySection, BankViewSection, CapacitySection } from './CoreSections';
import { OptionsSection } from './OptionsSection';
import { FutureSection, ProtectionSection } from './PlanningSections';
import { BlueprintSection } from './BlueprintSection';
import { useFeed } from './LiveDataPanel';
import type { SectionProps } from './types';

interface Scenario {
  id: string;
  name: string;
  changes: ScenarioChange[];
}

const SECTIONS = [
  { id: 'goals', num: '01', label: 'Your Goals' },
  { id: 'today', num: '02', label: 'Where You Are Today' },
  { id: 'bank', num: '03', label: 'How The Bank Sees You' },
  { id: 'capacity', num: '04', label: 'Borrowing Power' },
  { id: 'options', num: '05', label: 'Explore Your Options' },
  { id: 'future', num: '06', label: 'Future Trajectory' },
  { id: 'protection', num: '07', label: 'Protection' },
  { id: 'blueprint', num: '08', label: 'Your Blueprint' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const RULE_LABELS = Object.fromEntries(
  ALL_RULE_SETS.map((r) => [
    r.id,
    { label: r.label, kind: r.kind, source: r.source, effectiveFrom: r.effectiveFrom, verifiedAt: r.verifiedAt, requiresConfirmation: r.requiresConfirmation },
  ]),
);

export default function Workspace() {
  const ctx = DEFAULT_RULE_CONTEXT;
  const [clientId, setClientId] = useState(DEMO_CLIENTS[0].id);
  const [presentation, setPresentation] = useState(false);
  const [section, setSection] = useState<SectionId>('goals');
  const [scenariosByClient, setScenariosByClient] = useState<Record<string, Scenario[]>>({});
  const [activeScenarioId, setActiveScenarioId] = useState('baseline');
  const [recommendedId, setRecommendedId] = useState<Record<string, string | null>>({});
  const [audit, setAudit] = useState<AuditRequest | null>(null);
  const [pending, setPending] = useState<ProposedChange[]>([]);
  const [copilotText, setCopilotText] = useState('');
  const [copilotMsg, setCopilotMsg] = useState<string | null>(null);
  const scenarioCounter = useRef(0);
  const mainRef = useRef<HTMLDivElement>(null);

  const baselineClient: Client = DEMO_CLIENTS.find((c) => c.id === clientId)!;
  const scenarios = scenariosByClient[clientId] ?? [];
  const activeScenario = scenarios.find((s) => s.id === activeScenarioId);
  const activeChanges = activeScenario?.changes ?? [];

  const baselineResult = useMemo(() => computeAll(applyScenario(baselineClient, []), ctx), [baselineClient, ctx]);
  const activeState = useMemo(() => applyScenario(baselineClient, activeChanges), [baselineClient, activeChanges]);
  const activeResult = useMemo(() => computeAll(activeState, ctx), [activeState, ctx]);
  const diffs = useMemo(() => explainChange(baselineResult, activeResult), [baselineResult, activeResult]);

  useEffect(() => {
    setActiveScenarioId('baseline');
    setPending([]);
    setCopilotMsg(null);
    setSection('goals');
  }, [clientId]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [section, clientId]);

  const addChanges = useCallback(
    (changes: ScenarioChange[], name?: string) => {
      setScenariosByClient((prev) => {
        const list = prev[clientId] ?? [];
        const current = list.find((s) => s.id === activeScenarioId);
        if (current) {
          return {
            ...prev,
            [clientId]: list.map((s) => (s.id === activeScenarioId ? { ...s, changes: [...s.changes, ...changes] } : s)),
          };
        }
        const id = `scenario-${++scenarioCounter.current}`;
        const scenario: Scenario = { id, name: name ?? `Scenario ${String.fromCharCode(64 + list.length + 1)}`, changes };
        setActiveScenarioId(id);
        return { ...prev, [clientId]: [...list, scenario] };
      });
    },
    [clientId, activeScenarioId],
  );

  const submitCopilot = () => {
    const text = copilotText.trim();
    if (!text) return;
    const res = localParser.parse(text, { client: activeState.client });
    if (res.changes.length > 0) {
      setPending(res.changes);
      setCopilotMsg(null);
    } else {
      setPending([]);
      setCopilotMsg(res.commentary ?? 'Not recognised.');
    }
  };

  const applyPending = () => {
    if (pending.length === 0) return;
    addChanges(pending.map((p) => p.change));
    setPending([]);
    setCopilotText('');
  };

  const undoLast = () => {
    setScenariosByClient((prev) => {
      const list = prev[clientId] ?? [];
      return {
        ...prev,
        [clientId]: list.map((s) => (s.id === activeScenarioId ? { ...s, changes: s.changes.slice(0, -1) } : s)),
      };
    });
  };

  const saveAsScenario = () => {
    if (!activeScenario) return;
    const id = `scenario-${++scenarioCounter.current}`;
    setScenariosByClient((prev) => ({
      ...prev,
      [clientId]: [...(prev[clientId] ?? []), { ...activeScenario, id, name: `${activeScenario.name} (copy)` }],
    }));
    setActiveScenarioId(id);
  };

  const feed = useFeed(baselineClient);

  const sectionProps: SectionProps = {
    client: activeState.client,
    baselineClient,
    result: activeResult,
    baseline: baselineResult,
    presentation,
    openAudit: setAudit,
    addChanges,
    ctx,
    feed,
  };

  const s = activeResult.snapshot;
  const isRecommended = recommendedId[clientId] === activeScenarioId && activeScenarioId !== 'baseline';

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ---------------------------------------------------------------- Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-navy-800 bg-navy-950 px-4 text-white">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 font-display text-[15px] font-bold text-navy-950">B</div>
            <div className="leading-tight">
              <div className="font-display text-[14px] font-semibold tracking-tight">Blueprint Financial OS</div>
              <div className="text-[9.5px] uppercase tracking-[0.22em] text-teal-300/70">Your Financial Blueprint</div>
            </div>
          </div>
          <div className="ml-4 flex items-center gap-1 rounded-lg bg-navy-900 p-1">
            {DEMO_CLIENTS.map((c) => (
              <button
                key={c.id}
                onClick={() => setClientId(c.id)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  c.id === clientId ? 'bg-teal-500 text-navy-950' : 'text-navy-100/70 hover:text-white'
                }`}
              >
                {c.shortLabel}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!presentation ? (
            <span className="hidden text-[11px] text-navy-100/50 xl:block">Illustrative modelling — not financial advice output until adviser-approved</span>
          ) : null}
          <button
            onClick={() => setPresentation((p) => !p)}
            className={`rounded-lg border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              presentation ? 'border-teal-400 bg-teal-500 text-navy-950' : 'border-navy-700 text-navy-100 hover:border-teal-400'
            }`}
          >
            {presentation ? '● Presentation mode' : '○ Adviser mode'}
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------------- Scenario tabs */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-white px-4">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Scenarios</span>
          <ScenarioTab
            name="Baseline"
            active={activeScenarioId === 'baseline'}
            onClick={() => setActiveScenarioId('baseline')}
          />
          {scenarios.map((sc) => (
            <ScenarioTab
              key={sc.id}
              name={sc.name}
              active={activeScenarioId === sc.id}
              recommended={recommendedId[clientId] === sc.id}
              onClick={() => setActiveScenarioId(sc.id)}
              onClose={
                presentation
                  ? undefined
                  : () => {
                      setScenariosByClient((prev) => ({ ...prev, [clientId]: (prev[clientId] ?? []).filter((x) => x.id !== sc.id) }));
                      if (activeScenarioId === sc.id) setActiveScenarioId('baseline');
                    }
              }
            />
          ))}
          {!presentation && (PRESET_SCENARIOS[clientId] ?? []).length > 0 && scenarios.length === 0 ? (
            <div className="ml-2 flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500b">try:</span>
              {(PRESET_SCENARIOS[clientId] ?? []).slice(0, 3).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    const id = `scenario-${++scenarioCounter.current}`;
                    setScenariosByClient((prev) => ({ ...prev, [clientId]: [...(prev[clientId] ?? []), { id, name: p.name, changes: [...p.changes] }] }));
                    setActiveScenarioId(id);
                  }}
                  title={p.description}
                  className="rounded-full border border-dashed border-teal-500/50 px-2.5 py-1 text-[11px] font-medium text-teal-500 hover:bg-aqua-100"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {activeScenario && !presentation ? (
          <div className="flex items-center gap-2">
            <button onClick={undoLast} disabled={activeChanges.length === 0} className="rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-slate-500b hover:bg-mist disabled:opacity-40">
              ↶ Undo
            </button>
            <button onClick={saveAsScenario} className="rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-slate-500b hover:bg-mist">
              Save as scenario
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------------------------------------- Left rail */}
        <nav className="flex w-56 shrink-0 flex-col border-r border-line bg-white">
          <div className="flex-1 overflow-y-auto py-3">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setSection(sec.id)}
                className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  section === sec.id ? 'bg-aqua-100/70' : 'hover:bg-mist'
                }`}
              >
                <span
                  className={`num font-display text-[11px] font-semibold ${section === sec.id ? 'text-teal-500' : 'text-slate-400'}`}
                >
                  {sec.num}
                </span>
                <span className={`text-[12.5px] font-medium ${section === sec.id ? 'text-navy-800' : 'text-slate-500b'}`}>{sec.label}</span>
              </button>
            ))}
          </div>
          {/* Snapshot */}
          <div className="border-t border-line p-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500b">Blueprint snapshot</div>
            <div className="mt-2.5 space-y-2 text-[12px]">
              <SnapRow label="Net worth" value={moneyShort(s.netWorth)} />
              {baselineClient.mortgages.length > 0 ? <SnapRow label="Mortgage-free" value={`${s.mortgageFreeYear ?? '—'}`} /> : null}
              <SnapRow label="UMI" value={`${money(s.umi)}/mo`} />
              <SnapRow label="Capacity" value={`${moneyShort(s.maxLendingRange.min)}–${moneyShort(s.maxLendingRange.max)}`} />
              {s.usableEquity > 0 ? <SnapRow label="Usable equity" value={moneyShort(s.usableEquity)} /> : null}
              <SnapRow label="KiwiSaver" value={`${moneyShort(s.kiwiSaverNow)} → ${moneyShort(s.kiwiSaverProjected)}`} />
              {s.protectionIssues > 0 ? <SnapRow label="Protection" value={`${s.protectionIssues} to review`} warn /> : null}
            </div>
          </div>
        </nav>

        {/* ------------------------------------------------------------- Main */}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
          <div key={`${clientId}-${section}`} className="bp-rise mx-auto max-w-[1120px] px-8 py-8 pb-36">
            {!presentation && section === 'goals' ? (
              <div className="mb-5 rounded-lg border border-line bg-white px-4 py-2.5 text-[12px] text-slate-500b">
                <strong className="text-ink">{baselineClient.label}</strong> — {baselineClient.narrative}
              </div>
            ) : null}
            {section === 'goals' ? <GoalsSection {...sectionProps} /> : null}
            {section === 'today' ? <TodaySection {...sectionProps} /> : null}
            {section === 'bank' ? <BankViewSection {...sectionProps} /> : null}
            {section === 'capacity' ? <CapacitySection {...sectionProps} /> : null}
            {section === 'options' ? <OptionsSection {...sectionProps} /> : null}
            {section === 'future' ? <FutureSection {...sectionProps} /> : null}
            {section === 'protection' ? <ProtectionSection {...sectionProps} /> : null}
            {section === 'blueprint' ? (
              <BlueprintSection
                {...sectionProps}
                scenarioName={activeScenario?.name ?? 'Baseline'}
                scenarioChanges={activeChanges}
                isRecommended={isRecommended}
                onSetRecommended={() => setRecommendedId((prev) => ({ ...prev, [clientId]: activeScenarioId }))}
              />
            ) : null}
            <div className="mt-10 flex items-center justify-between border-t border-line pt-4 text-[11px] text-slate-500b">
              <span>
                Rules: {activeResult.ruleSetIds.length} versioned rule sets ·{' '}
                <button className="text-teal-500 hover:underline" onClick={() => setAudit({ title: 'Rule sets in effect', lines: [], ruleSetIds: activeResult.ruleSetIds })}>
                  view provenance
                </button>
              </span>
              <span>Blueprint Financial OS — Phase 1 prototype · demo data only</span>
            </div>
          </div>
        </main>

        {/* ------------------------------------------------------------- What changed */}
        {activeScenario && diffs.length > 0 ? (
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-white p-4 lg:block">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-500">What changed?</div>
              <Pill tone="slate">{activeScenario.name}</Pill>
            </div>
            <div className="mt-3 space-y-3">
              {diffs.map((d) => (
                <div key={d.label} className="rounded-lg border border-line p-3">
                  <div className="text-[11.5px] font-medium text-slate-500b">{d.label}</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="num text-[13px] text-slate-400 line-through decoration-slate-300">
                      {d.format === 'currency' ? moneyShort(d.before) : d.format === 'percent' ? pct(d.before) : d.before.toFixed(1)}
                    </span>
                    <span className="text-slate-300">→</span>
                    <span className="num font-display text-[15px] font-semibold text-ink">
                      {d.format === 'currency' ? moneyShort(d.after) : d.format === 'percent' ? pct(d.after) : d.after.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1 text-right">
                    <Delta value={d.delta} goodWhen={d.goodWhen} format={d.format === 'year' ? 'years' : d.format === 'currency' ? 'money' : d.format === 'percent' ? 'percent' : 'months'} />
                  </div>
                  {d.why && !presentation ? <div className="mt-1.5 text-[11px] leading-snug text-slate-500b">{d.why}</div> : null}
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-mist p-3 text-[11px] leading-relaxed text-slate-500b">
              <div className="mb-1 font-semibold text-ink">Applied changes</div>
              {activeChanges.map((c, i) => (
                <div key={i}>· {describeChange(c)}</div>
              ))}
            </div>
          </aside>
        ) : null}
      </div>

      {/* ---------------------------------------------------------------- Copilot bar */}
      {!presentation ? (
        <div className="pointer-events-none absolute bottom-0 left-56 right-0 z-40 flex justify-center pb-5">
          <div className="pointer-events-auto w-full max-w-2xl px-6">
            {pending.length > 0 ? (
              <div className="bp-rise mb-2 rounded-xl border border-teal-500/40 bg-white p-3 shadow-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500b">Proposed:</span>
                  {pending.map((p, i) => (
                    <span key={i} className="rounded-full bg-aqua-100 px-3 py-1 text-[12px] font-semibold text-navy-800">
                      {p.chip}
                    </span>
                  ))}
                  <div className="ml-auto flex gap-2">
                    <button onClick={applyPending} className="rounded-lg bg-teal-500 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-400">
                      Apply
                    </button>
                    <button onClick={() => setPending([])} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-slate-500b hover:bg-mist">
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {copilotMsg ? (
              <div className="bp-rise mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900 shadow-lg">{copilotMsg}</div>
            ) : null}
            <div className="flex items-center gap-2 rounded-xl border border-navy-800 bg-navy-950/95 p-2 shadow-2xl backdrop-blur">
              <span className="pl-2 text-teal-400">✦</span>
              <input
                value={copilotText}
                onChange={(e) => setCopilotText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCopilot()}
                placeholder='Ask Blueprint to model something… e.g. "Increase repayments by $500 a fortnight"'
                className="flex-1 bg-transparent text-[13.5px] text-white placeholder:text-navy-100/40 focus:outline-none"
              />
              <button onClick={submitCopilot} className="rounded-lg bg-teal-500 px-4 py-2 text-[12.5px] font-semibold text-navy-950 hover:bg-teal-400">
                Model it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AuditDrawer request={audit} onClose={() => setAudit(null)} ruleLabels={RULE_LABELS} />
    </div>
  );
}

function ScenarioTab({
  name,
  active,
  recommended,
  onClick,
  onClose,
}: {
  name: string;
  active: boolean;
  recommended?: boolean;
  onClick: () => void;
  onClose?: () => void;
}) {
  return (
    <span
      className={`group inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
        active ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-slate-500b hover:border-navy-700'
      }`}
      onClick={onClick}
    >
      {recommended ? <span className="text-teal-400">✓</span> : null}
      {name}
      {onClose ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`ml-0.5 hidden text-[10px] group-hover:inline ${active ? 'text-navy-100' : 'text-slate-400'}`}
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}

function SnapRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500b">{label}</span>
      <span className={`num font-semibold ${warn ? 'text-amber-600b' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
