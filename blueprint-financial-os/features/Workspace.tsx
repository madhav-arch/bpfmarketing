'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Client, ClientType } from '@/lib/domain/types';
import { DEMO_CLIENTS, PRESET_SCENARIOS } from '@/lib/data/demoClients';
import { DEFAULT_RULE_CONTEXT, ALL_RULE_SETS } from '@/lib/rules/context';
import { applyScenario } from '@/lib/scenarios/apply';
import { computeAll, type CalculationResult } from '@/lib/scenarios/compute';
import { describeChange, type ScenarioChange } from '@/lib/scenarios/changes';
import { buildOverrideLog, type ChangeEntry } from '@/lib/scenarios/overrides';
import { DATA_STATUS_LABELS, type DataStatus } from '@/lib/data-sources/providers';
import { AuditDrawer, Pill, type AuditRequest } from '@/components/ui';
import { money, moneyShort } from '@/lib/format';
import { GoalsSection, TodaySection, BankViewSection, CapacitySection } from './CoreSections';
import { OptionsSection } from './OptionsSection';
import { FutureSection, ProtectionSection } from './PlanningSections';
import { BlueprintSection } from './BlueprintSection';
import { PolicyLibrarySection } from './PolicyLibrary';
import { CompareView, type CompareColumn } from './CompareView';
import { Copilot } from './Copilot';
import { useFeed } from './LiveDataPanel';
import { IntakeWizard } from './IntakeWizard';
import type { SectionProps } from './types';

const CUSTOM_CLIENTS_KEY = 'bpf-custom-clients-v1';

function loadCustomClients(): { clients: Client[]; assumptions: Record<string, string[]> } {
  try {
    const raw = localStorage.getItem(CUSTOM_CLIENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private mode / blocked storage — start fresh */
  }
  return { clients: [], assumptions: {} };
}

function saveCustomClients(clients: Client[], assumptions: Record<string, string[]>) {
  try {
    localStorage.setItem(CUSTOM_CLIENTS_KEY, JSON.stringify({ clients, assumptions }));
  } catch {
    /* non-fatal */
  }
}

interface SavedScenario {
  id: string;
  name: string;
  entries: ChangeEntry[];
  savedAt: string;
}

const STRATEGY_LABELS: Record<ClientType, string> = {
  fhb: 'First home buyer',
  homeowner: 'Existing homeowner',
  investor: 'Property investor',
};

const OPTIONS_LABEL: Record<ClientType, string> = {
  fhb: 'Your First Home',
  homeowner: 'Restructure Lab',
  investor: 'Portfolio Lab',
};

const RULE_LABELS = Object.fromEntries(
  ALL_RULE_SETS.map((r) => [
    r.id,
    { label: r.label, kind: r.kind, source: r.source, effectiveFrom: r.effectiveFrom, verifiedAt: r.verifiedAt, requiresConfirmation: r.requiresConfirmation },
  ]),
);

type ViewId = 'baseline' | 'working' | string;

export default function Workspace() {
  const ctx = DEFAULT_RULE_CONTEXT;
  const [clientId, setClientId] = useState(DEMO_CLIENTS[0].id);
  const [presentation, setPresentation] = useState(false);
  const [section, setSection] = useState<string>('goals');
  const [typeOverrides, setTypeOverrides] = useState<Record<string, ClientType>>({});
  const [dataStatus, setDataStatus] = useState<Record<string, DataStatus | undefined>>({});

  // Scenario model: one mutable WORKING scenario per client + immutable saves.
  const [workingByClient, setWorkingByClient] = useState<Record<string, ChangeEntry[]>>({});
  const [undoStacks, setUndoStacks] = useState<Record<string, ChangeEntry[][]>>({});
  const [redoStacks, setRedoStacks] = useState<Record<string, ChangeEntry[][]>>({});
  const [savedByClient, setSavedByClient] = useState<Record<string, SavedScenario[]>>({});
  const [recommendedId, setRecommendedId] = useState<Record<string, string | null>>({});
  const [view, setView] = useState<ViewId>('working');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [comparePick, setComparePick] = useState<Set<string> | null>(null);
  const [compareCols, setCompareCols] = useState<CompareColumn[] | null>(null);

  const [audit, setAudit] = useState<AuditRequest | null>(null);
  const scenarioCounter = useRef(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const [customClients, setCustomClients] = useState<Client[]>([]);
  const [intakeAssumptions, setIntakeAssumptions] = useState<Record<string, string[]>>({});
  const [showIntake, setShowIntake] = useState(false);
  const [dismissedAssumptions, setDismissedAssumptions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = loadCustomClients();
    if (stored.clients.length) {
      setCustomClients(stored.clients);
      setIntakeAssumptions(stored.assumptions);
    }
  }, []);

  const allClients = [...DEMO_CLIENTS, ...customClients];
  const rawClient: Client = allClients.find((c) => c.id === clientId) ?? DEMO_CLIENTS[0];
  const clientType: ClientType = typeOverrides[clientId] ?? rawClient.clientType;
  const baselineClient: Client = useMemo(
    () => (clientType === rawClient.clientType ? rawClient : { ...rawClient, clientType }),
    [rawClient, clientType],
  );

  const working = workingByClient[clientId] ?? [];
  const saved = savedByClient[clientId] ?? [];
  const viewedSaved = saved.find((s) => s.id === view);
  const activeEntries: ChangeEntry[] = view === 'baseline' ? [] : viewedSaved ? viewedSaved.entries : working;
  const activeChanges = useMemo(() => activeEntries.map((e) => e.change), [activeEntries]);
  const activeName = view === 'baseline' ? 'Baseline' : viewedSaved ? viewedSaved.name : 'Working scenario';

  const baselineResult = useMemo(() => computeAll(applyScenario(baselineClient, []), ctx), [baselineClient, ctx]);
  const activeState = useMemo(() => applyScenario(baselineClient, activeChanges), [baselineClient, activeChanges]);
  const activeResult = useMemo(() => computeAll(activeState, ctx), [activeState, ctx]);

  const computePreview = useCallback(
    (extra: ScenarioChange[]): CalculationResult => computeAll(applyScenario(baselineClient, [...activeChanges, ...extra]), ctx),
    [baselineClient, activeChanges, ctx],
  );

  useEffect(() => {
    setView('working');
    setSection('goals');
    setComparePick(null);
    setCompareCols(null);
  }, [clientId]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [section, clientId]);

  const pushUndo = useCallback(
    (snapshot: ChangeEntry[]) => {
      setUndoStacks((prev) => ({ ...prev, [clientId]: [...(prev[clientId] ?? []).slice(-30), snapshot] }));
      setRedoStacks((prev) => ({ ...prev, [clientId]: [] }));
    },
    [clientId],
  );

  const addChanges = useCallback(
    (changes: ScenarioChange[], _name?: string, by: 'adviser' | 'copilot' = 'adviser') => {
      const now = new Date().toISOString();
      const entries: ChangeEntry[] = changes.map((change) => ({ change, at: now, by }));
      setWorkingByClient((prev) => {
        const cur = prev[clientId] ?? [];
        // editing while viewing a saved scenario continues from what's on screen
        const base = view !== 'working' && view !== 'baseline' && viewedSaved ? viewedSaved.entries : view === 'baseline' ? [] : cur;
        pushUndo(cur);
        return { ...prev, [clientId]: [...base, ...entries] };
      });
      setView('working');
    },
    [clientId, view, viewedSaved, pushUndo],
  );

  const undo = () => {
    const stack = undoStacks[clientId] ?? [];
    if (stack.length === 0) return;
    const prevState = stack[stack.length - 1];
    setUndoStacks((p) => ({ ...p, [clientId]: stack.slice(0, -1) }));
    setRedoStacks((p) => ({ ...p, [clientId]: [...(p[clientId] ?? []), working] }));
    setWorkingByClient((p) => ({ ...p, [clientId]: prevState }));
    setView('working');
  };
  const redo = () => {
    const stack = redoStacks[clientId] ?? [];
    if (stack.length === 0) return;
    const nextState = stack[stack.length - 1];
    setRedoStacks((p) => ({ ...p, [clientId]: stack.slice(0, -1) }));
    setUndoStacks((p) => ({ ...p, [clientId]: [...(p[clientId] ?? []), working] }));
    setWorkingByClient((p) => ({ ...p, [clientId]: nextState }));
    setView('working');
  };
  const resetToBaseline = () => {
    if (working.length === 0 && view === 'working') return;
    pushUndo(working);
    setWorkingByClient((p) => ({ ...p, [clientId]: [] }));
    setView('working');
  };

  const autoName = (entries: ChangeEntry[]) => {
    if (entries.length === 0) return `Scenario ${++scenarioCounter.current}`;
    const first = describeChange(entries[0].change);
    return entries.length === 1 ? first : `${first} +${entries.length - 1}`;
  };

  const saveScenario = useCallback(
    (name?: string) => {
      const entries = activeEntries;
      if (entries.length === 0) return;
      const id = `saved-${Date.now()}-${++scenarioCounter.current}`;
      const scenario: SavedScenario = {
        id,
        name: name ?? autoName(entries),
        entries: entries.map((e) => ({ ...e })),
        savedAt: new Date().toISOString(),
      };
      setSavedByClient((prev) => ({ ...prev, [clientId]: [...(prev[clientId] ?? []), scenario] }));
      setView(id);
    },
    [activeEntries, clientId],
  );

  const duplicateScenario = (s: SavedScenario) => {
    pushUndo(working);
    setWorkingByClient((p) => ({ ...p, [clientId]: s.entries.map((e) => ({ ...e })) }));
    setView('working');
  };
  const deleteScenario = (id: string) => {
    setSavedByClient((p) => ({ ...p, [clientId]: (p[clientId] ?? []).filter((s) => s.id !== id) }));
    setRecommendedId((p) => (p[clientId] === id ? { ...p, [clientId]: null } : p));
    if (view === id) setView('working');
  };

  const feed = useFeed(baselineClient);
  const effectiveDataStatus: DataStatus = dataStatus[clientId] ?? (feed.isLive ? 'akahu-connected' : 'fact-find-only');

  const sectionProps: SectionProps = {
    client: activeState.client,
    baselineClient,
    result: activeResult,
    baseline: baselineResult,
    presentation,
    openAudit: setAudit,
    addChanges,
    computePreview,
    onSaveScenario: saveScenario,
    ctx,
    feed,
  };

  const SECTIONS = [
    { id: 'goals', num: '01', label: 'Your Goals' },
    { id: 'today', num: '02', label: 'Where You Are Today' },
    { id: 'bank', num: '03', label: 'How The Bank Sees You' },
    { id: 'capacity', num: '04', label: 'Borrowing Power' },
    { id: 'options', num: '05', label: OPTIONS_LABEL[clientType] },
    { id: 'future', num: '06', label: 'Future Trajectory' },
    { id: 'protection', num: '07', label: 'Protection' },
    { id: 'blueprint', num: '08', label: 'Your Blueprint' },
    ...(!presentation ? [{ id: 'policy', num: '09', label: 'Policy Library' }] : []),
  ];

  const s = activeResult.snapshot;
  const b = baselineResult.snapshot;
  const isRecommended = recommendedId[clientId] === view;
  const recommendedScenario = saved.find((x) => x.id === recommendedId[clientId]);
  const showBlueprintCol = activeChanges.length > 0 && view !== 'baseline';

  const openComparePicker = () => {
    const pre = new Set<string>(['baseline']);
    if (working.length > 0) pre.add('working');
    if (recommendedId[clientId]) pre.add(recommendedId[clientId]!);
    for (const sc of saved) if (pre.size < 4) pre.add(sc.id);
    setComparePick(pre);
  };
  const runCompare = () => {
    if (!comparePick) return;
    const cols: CompareColumn[] = [];
    const addCol = (id: string, name: string, entries: ChangeEntry[]) =>
      cols.push({
        id,
        name,
        recommended: recommendedId[clientId] === id,
        result: computeAll(applyScenario(baselineClient, entries.map((e) => e.change)), ctx),
      });
    if (comparePick.has('baseline')) addCol('baseline', 'Baseline', []);
    if (comparePick.has('working') && working.length > 0) addCol('working', 'Working scenario', working);
    for (const sc of saved) if (comparePick.has(sc.id)) addCol(sc.id, sc.name, sc.entries);
    setCompareCols(cols.slice(0, 4));
    setComparePick(null);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ---------------------------------------------------------------- Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-navy-800 bg-navy-950 px-4 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 font-display text-[15px] font-bold text-navy-950">B</div>
            <div className="leading-tight">
              <div className="font-display text-[14px] font-semibold tracking-tight">Blueprint Financial OS</div>
              <div className="text-[9.5px] uppercase tracking-[0.22em] text-teal-300/70">Your Financial Blueprint</div>
            </div>
          </div>
          <div className="ml-2 flex items-center gap-1 rounded-lg bg-navy-900 p-1">
            {allClients.map((c) => (
              <span key={c.id} className="group relative inline-flex">
                <button
                  onClick={() => {
                    setClientId(c.id);
                    setShowIntake(false);
                  }}
                  className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    c.id === clientId && !showIntake ? 'bg-teal-500 text-navy-950' : 'text-navy-100/70 hover:text-white'
                  }`}
                >
                  {c.shortLabel}
                </button>
                {c.id.startsWith('intake-') ? (
                  <button
                    title="Remove this client file"
                    onClick={() => {
                      const next = customClients.filter((x) => x.id !== c.id);
                      setCustomClients(next);
                      saveCustomClients(next, intakeAssumptions);
                      if (clientId === c.id) setClientId(DEMO_CLIENTS[0].id);
                    }}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-navy-700 text-[9px] text-navy-100 group-hover:flex"
                  >
                    ✕
                  </button>
                ) : null}
              </span>
            ))}
            <button
              onClick={() => setShowIntake(true)}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${showIntake ? 'bg-teal-500 text-navy-950' : 'text-teal-300 hover:text-white'}`}
            >
              ＋ New client
            </button>
          </div>
          {/* Strategy selector — editable classification, same financial core */}
          {!showIntake ? (
            <div className="ml-1 hidden items-center gap-1 rounded-lg bg-navy-900 p-1 lg:flex" title="Client strategy — the journey adapts; the financial data stays the same">
              {(['fhb', 'homeowner', 'investor'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeOverrides((p) => ({ ...p, [clientId]: t }))}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                    clientType === t ? 'bg-white text-navy-950' : 'text-navy-100/60 hover:text-white'
                  }`}
                >
                  {t === 'fhb' ? 'First home' : t === 'homeowner' ? 'Homeowner' : 'Investor'}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {!presentation ? (
            <select
              value={effectiveDataStatus}
              onChange={(e) => setDataStatus((p) => ({ ...p, [clientId]: e.target.value as DataStatus }))}
              title="Data status for this client file"
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                effectiveDataStatus === 'akahu-connected' || effectiveDataStatus === 'client-confirmed'
                  ? 'border-teal-400/50 bg-teal-500/15 text-teal-300'
                  : effectiveDataStatus === 'needs-review'
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                    : 'border-navy-700 bg-navy-900 text-navy-100/80'
              }`}
            >
              {(Object.keys(DATA_STATUS_LABELS) as DataStatus[]).map((k) => (
                <option key={k} value={k} className="bg-navy-900 text-white">
                  Data: {DATA_STATUS_LABELS[k]}
                </option>
              ))}
            </select>
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

      {/* ---------------------------------------------------------------- Scenario bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          <span className="mr-1 shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500b">Scenarios</span>
          <ScenarioTab name="Baseline" active={view === 'baseline'} onClick={() => setView('baseline')} />
          <ScenarioTab
            name={working.length > 0 ? `Working (${working.length})` : 'Working'}
            active={view === 'working'}
            onClick={() => setView('working')}
          />
          {saved.map((sc) =>
            renaming === sc.id ? (
              <input
                key={sc.id}
                value={renameText}
                autoFocus
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={() => {
                  setSavedByClient((p) => ({ ...p, [clientId]: (p[clientId] ?? []).map((x) => (x.id === sc.id ? { ...x, name: renameText || x.name } : x)) }));
                  setRenaming(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="w-40 rounded-full border border-teal-500 px-3 py-1 text-[12px] font-semibold outline-none"
              />
            ) : (
              <ScenarioTab
                key={sc.id}
                name={sc.name}
                saved
                active={view === sc.id}
                recommended={recommendedId[clientId] === sc.id}
                onClick={() => setView(sc.id)}
                onClose={presentation ? undefined : () => deleteScenario(sc.id)}
              />
            ),
          )}
          {!presentation && (PRESET_SCENARIOS[clientId] ?? []).length > 0 && saved.length === 0 && working.length === 0 ? (
            <div className="ml-2 flex shrink-0 items-center gap-1.5">
              <span className="text-[11px] text-slate-500b">try:</span>
              {(PRESET_SCENARIOS[clientId] ?? []).slice(0, 2).map((p) => (
                <button
                  key={p.id}
                  onClick={() => addChanges([...p.changes], p.name)}
                  title={p.description}
                  className="rounded-full border border-dashed border-teal-500/50 px-2.5 py-1 text-[11px] font-medium text-teal-500 hover:bg-aqua-100"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {!presentation ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {viewedSaved ? (
              <>
                <ToolbarBtn onClick={() => duplicateScenario(viewedSaved)} label="Duplicate" title="Copy into the working scenario to modify" />
                <ToolbarBtn onClick={() => { setRenaming(viewedSaved.id); setRenameText(viewedSaved.name); }} label="Rename" />
                <button
                  onClick={() => setRecommendedId((p) => ({ ...p, [clientId]: p[clientId] === viewedSaved.id ? null : viewedSaved.id }))}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${isRecommended ? 'bg-green-600b text-white' : 'border border-line text-slate-500b hover:bg-mist'}`}
                >
                  {isRecommended ? '✓ Recommended' : 'Set as recommended'}
                </button>
              </>
            ) : (
              <>
                <ToolbarBtn onClick={undo} disabled={(undoStacks[clientId] ?? []).length === 0} label="↶ Undo" />
                <ToolbarBtn onClick={redo} disabled={(redoStacks[clientId] ?? []).length === 0} label="↷ Redo" />
                <ToolbarBtn onClick={resetToBaseline} disabled={working.length === 0} label="Reset to baseline" />
                <button
                  onClick={() => saveScenario()}
                  disabled={activeEntries.length === 0}
                  className="rounded-md bg-navy-900 px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-navy-800 disabled:opacity-30"
                >
                  Save scenario
                </button>
              </>
            )}
            <ToolbarBtn onClick={openComparePicker} disabled={saved.length === 0 && working.length === 0} label="Compare" />
          </div>
        ) : null}
      </div>

      {/* Compare picker */}
      {comparePick ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-aqua-100/60 px-4 py-2">
          <span className="text-[11.5px] font-semibold text-navy-800">Compare (pick 2–4):</span>
          {[{ id: 'baseline', name: 'Baseline' }, ...(working.length ? [{ id: 'working', name: 'Working scenario' }] : []), ...saved].map((o) => (
            <label key={o.id} className="flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink">
              <input
                type="checkbox"
                checked={comparePick.has(o.id)}
                onChange={(e) => {
                  const next = new Set(comparePick);
                  if (e.target.checked) next.add(o.id);
                  else next.delete(o.id);
                  setComparePick(next);
                }}
                className="accent-[#2ab3b1]"
              />
              {o.name}
            </label>
          ))}
          <button
            onClick={runCompare}
            disabled={comparePick.size < 2}
            className="rounded-lg bg-teal-500 px-3 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40"
          >
            Compare {Math.min(comparePick.size, 4)}
          </button>
          <button onClick={() => setComparePick(null)} className="text-[11.5px] text-slate-500b hover:underline">cancel</button>
        </div>
      ) : null}

      {showIntake ? (
        <main className="min-w-0 flex-1 overflow-y-auto bg-mist">
          <IntakeWizard
            feed={feed.snapshot}
            isLive={feed.isLive}
            onCancel={() => setShowIntake(false)}
            onCreate={(client, assumptions) => {
              const next = [...customClients.filter((c) => c.id !== client.id), client];
              const nextAssumptions = { ...intakeAssumptions, [client.id]: assumptions };
              setCustomClients(next);
              setIntakeAssumptions(nextAssumptions);
              saveCustomClients(next, nextAssumptions);
              setShowIntake(false);
              setClientId(client.id);
            }}
          />
        </main>
      ) : null}

      <div className={`min-h-0 flex-1 ${showIntake ? 'hidden' : 'flex'}`}>
        {/* ------------------------------------------------------------- Left rail */}
        <nav className="flex w-60 shrink-0 flex-col border-r border-line bg-white">
          <div className="border-b border-line px-4 py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500b">Client strategy</div>
            <div className="mt-0.5 text-[13px] font-semibold text-ink">{STRATEGY_LABELS[clientType]}</div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setSection(sec.id)}
                className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  section === sec.id ? 'bg-aqua-100/70' : 'hover:bg-mist'
                }`}
              >
                <span className={`num font-display text-[11px] font-semibold ${section === sec.id ? 'text-teal-500' : 'text-slate-400'}`}>
                  {sec.num}
                </span>
                <span className={`text-[12.5px] font-medium ${section === sec.id ? 'text-navy-800' : 'text-slate-500b'}`}>{sec.label}</span>
              </button>
            ))}
          </div>
          {/* Snapshot: TODAY vs the scenario on screen, with explicit timeframes */}
          <div className="border-t border-line p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500b">Snapshot</div>
              {showBlueprintCol ? <span className="text-[9px] uppercase tracking-wide text-teal-500">today · {activeName.length > 14 ? 'scenario' : activeName.toLowerCase()}</span> : null}
            </div>
            <div className="mt-2.5 space-y-1.5 text-[11.5px]">
              <SnapRow2 label="Net worth (today)" a={moneyShort(b.netWorth)} b={showBlueprintCol ? moneyShort(s.netWorth) : undefined} better={s.netWorth > b.netWorth + 1000 ? 'b' : s.netWorth < b.netWorth - 1000 ? 'a' : undefined} />
              {baselineClient.mortgages.length > 0 ? (
                <SnapRow2
                  label="Mortgage-free"
                  a={b.mortgageFreeYear ? `${b.mortgageFreeYear}` : 'IO'}
                  b={showBlueprintCol ? (s.mortgageFreeYear ? `${s.mortgageFreeYear}` : 'IO') : undefined}
                  better={s.mortgageFreeYear && b.mortgageFreeYear && s.mortgageFreeYear < b.mortgageFreeYear ? 'b' : undefined}
                />
              ) : null}
              <SnapRow2 label="Monthly buffer" a={money(b.monthlySurplus)} b={showBlueprintCol ? money(s.monthlySurplus) : undefined} better={s.monthlySurplus > b.monthlySurplus + 40 ? 'b' : s.monthlySurplus < b.monthlySurplus - 40 ? 'a' : undefined} />
              <SnapRow2 label="Capacity" a={`${moneyShort(b.maxLendingRange.min)}–${moneyShort(b.maxLendingRange.max)}`} b={showBlueprintCol ? `${moneyShort(s.maxLendingRange.min)}–${moneyShort(s.maxLendingRange.max)}` : undefined} />
              {b.usableEquity > 0 || s.usableEquity > 0 ? (
                <SnapRow2 label="Usable equity" a={moneyShort(b.usableEquity)} b={showBlueprintCol ? moneyShort(s.usableEquity) : undefined} better={s.usableEquity > b.usableEquity + 1000 ? 'b' : undefined} />
              ) : null}
              <SnapRow2
                label={`KiwiSaver at ${baselineClient.retirement.targetAge} (nominal)`}
                a={moneyShort(b.kiwiSaverProjected)}
                b={showBlueprintCol ? moneyShort(s.kiwiSaverProjected) : undefined}
                better={s.kiwiSaverProjected > b.kiwiSaverProjected + 2000 ? 'b' : s.kiwiSaverProjected < b.kiwiSaverProjected - 2000 ? 'a' : undefined}
              />
              {b.protectionIssues > 0 ? <SnapRow2 label="Protection" a={`${b.protectionIssues} to review`} warn /> : null}
            </div>
            {recommendedScenario && view !== recommendedScenario.id ? (
              <button
                onClick={() => setView(recommendedScenario.id)}
                className="mt-3 w-full rounded-lg border border-teal-500/50 bg-aqua-100 px-2 py-1.5 text-[11px] font-semibold text-teal-500 hover:bg-teal-500 hover:text-white"
              >
                ✓ View recommended: {recommendedScenario.name}
              </button>
            ) : null}
          </div>
        </nav>

        {/* ------------------------------------------------------------- Main */}
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
          <div key={`${clientId}-${section}`} className="bp-rise mx-auto max-w-[1120px] px-8 py-8 pb-40">
            {!presentation && intakeAssumptions[clientId]?.length && !dismissedAssumptions[clientId] ? (
              <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600b">
                      Assumptions this file was built on — confirm before advice
                    </div>
                    <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-amber-900">
                      {intakeAssumptions[clientId].map((a, i) => (
                        <li key={i}>· {a}</li>
                      ))}
                    </ul>
                  </div>
                  <button
                    onClick={() => setDismissedAssumptions((d) => ({ ...d, [clientId]: true }))}
                    className="shrink-0 rounded-md border border-amber-200 px-2 py-1 text-[11px] text-amber-600b hover:bg-white"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
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
            {section === 'policy' && !presentation ? <PolicyLibrarySection {...sectionProps} /> : null}
            {section === 'blueprint' ? (
              <BlueprintSection
                {...sectionProps}
                scenarioName={activeName}
                scenarioChanges={activeChanges}
                isRecommended={isRecommended || (view === 'working' && false)}
                recommendedResult={
                  recommendedScenario && recommendedScenario.id !== view
                    ? computeAll(applyScenario(baselineClient, recommendedScenario.entries.map((e) => e.change)), ctx)
                    : undefined
                }
                recommendedName={recommendedScenario?.name}
                onSetRecommended={() => {
                  if (viewedSaved) setRecommendedId((prev) => ({ ...prev, [clientId]: viewedSaved.id }));
                  else if (activeEntries.length > 0) {
                    // save first, then recommend the save
                    const id = `saved-${Date.now()}-${++scenarioCounter.current}`;
                    const scenario: SavedScenario = { id, name: autoName(activeEntries), entries: activeEntries.map((e) => ({ ...e })), savedAt: new Date().toISOString() };
                    setSavedByClient((prev) => ({ ...prev, [clientId]: [...(prev[clientId] ?? []), scenario] }));
                    setRecommendedId((prev) => ({ ...prev, [clientId]: id }));
                    setView(id);
                  }
                }}
              />
            ) : null}
            <div className="mt-10 flex items-center justify-between border-t border-line pt-4 text-[11px] text-slate-500b">
              <span>
                Rules: {activeResult.ruleSetIds.length} versioned rule sets ·{' '}
                <button className="text-teal-500 hover:underline" onClick={() => setAudit({ title: 'Rule sets in effect', lines: [], ruleSetIds: activeResult.ruleSetIds })}>
                  view provenance
                </button>
                {activeEntries.length > 0 ? (
                  <>
                    {' · '}
                    <button
                      className="text-teal-500 hover:underline"
                      onClick={() =>
                        setAudit({
                          title: `Override log — ${activeName}`,
                          lines: buildOverrideLog(baselineClient, activeEntries).map((r) => ({
                            label: `${r.field}: ${r.originalValue} → ${r.currentValue}`,
                            format: 'text' as const,
                            note: `${r.overriddenBy} · ${r.overriddenAt.slice(0, 16).replace('T', ' ')} · original source: ${r.source}${r.reason ? ` · reason: ${r.reason}` : ''} — original value preserved in the baseline`,
                          })),
                          sourceNote: 'Every edit is a non-destructive change over the immutable baseline — provenance is never destroyed.',
                        })
                      }
                    >
                      override log ({activeEntries.length})
                    </button>
                  </>
                ) : null}
              </span>
              <span>Blueprint Financial OS — Iteration 2 prototype · demo data only</span>
            </div>
          </div>
        </main>

        {/* ------------------------------------------------------------- What changed */}
        {activeChanges.length > 0 ? (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-line bg-white p-4 xl:block">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-500">Applied changes</div>
              <Pill tone="slate">{activeName}</Pill>
            </div>
            <div className="mt-3 space-y-1.5">
              {activeEntries.map((e, i) => (
                <div key={i} className="rounded-lg border border-line px-3 py-2 text-[12px]">
                  <div className="font-medium text-ink">{describeChange(e.change)}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {e.by === 'copilot' ? 'via copilot' : 'adviser'} · {e.at.slice(11, 16)}
                  </div>
                </div>
              ))}
            </div>
            {!presentation && view === 'working' ? (
              <button
                onClick={() => saveScenario()}
                className="mt-3 w-full rounded-lg bg-navy-900 py-2 text-[12px] font-semibold text-white hover:bg-navy-800"
              >
                Save scenario
              </button>
            ) : null}
          </aside>
        ) : null}
      </div>

      {/* ---------------------------------------------------------------- Copilot */}
      {!presentation ? (
        <div className="pointer-events-none absolute bottom-0 left-60 right-0 z-40 flex justify-center pb-4">
          <Copilot
            client={activeState.client}
            activeResult={activeResult}
            addChanges={addChanges}
            computePreview={computePreview}
            onSaveScenario={saveScenario}
          />
        </div>
      ) : null}

      {compareCols ? <CompareView columns={compareCols} onClose={() => setCompareCols(null)} onLoad={(id) => { const sc = saved.find((x) => x.id === id); if (sc) duplicateScenario(sc); else if (id === 'working') setView('working'); setCompareCols(null); }} /> : null}
      <AuditDrawer request={audit} onClose={() => setAudit(null)} ruleLabels={RULE_LABELS} />
    </div>
  );
}

function ToolbarBtn({ onClick, label, disabled, title }: { onClick: () => void; label: string; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-slate-500b hover:bg-mist disabled:opacity-30"
    >
      {label}
    </button>
  );
}

function ScenarioTab({
  name,
  active,
  recommended,
  saved,
  onClick,
  onClose,
}: {
  name: string;
  active: boolean;
  recommended?: boolean;
  saved?: boolean;
  onClick: () => void;
  onClose?: () => void;
}) {
  return (
    <span
      className={`group inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
        active ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-slate-500b hover:border-navy-700'
      }`}
      onClick={onClick}
      title={saved ? 'Saved scenario — immutable snapshot; duplicate to modify' : undefined}
    >
      {recommended ? <span className="text-teal-400">✓</span> : saved ? <span className={active ? 'text-teal-300' : 'text-slate-300'}>◈</span> : null}
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

function SnapRow2({ label, a, b, better, warn }: { label: string; a: string; b?: string; better?: 'a' | 'b'; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-slate-500b" title={label}>{label}</span>
      <span className="num shrink-0 font-semibold">
        <span className={warn ? 'text-amber-600b' : better === 'a' ? 'text-ink' : b ? 'text-slate-400' : 'text-ink'}>{a}</span>
        {b !== undefined && b !== a ? (
          <>
            <span className="mx-1 text-slate-300">→</span>
            <span className={better === 'b' ? 'text-green-600b' : better === 'a' ? 'text-rose-600b' : 'text-ink'}>{b}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
