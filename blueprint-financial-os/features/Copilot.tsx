'use client';

// BLUEPRINT COPILOT — a compact scenario conversation. The copilot NEVER
// calculates: it translates language into structured ScenarioChange actions
// (validated schema), the deterministic engine runs, and the result is
// explained from engine diffs. Policy questions are answered only from the
// verified BankPolicyKnowledgeBase.

import { useRef, useState } from 'react';
import type { Client } from '@/lib/domain/types';
import type { CalculationResult } from '@/lib/scenarios/compute';
import type { ScenarioChange } from '@/lib/scenarios/changes';
import type { ProposedChange } from '@/lib/ai/copilot';
import { localParser } from '@/lib/ai/localParser';
import { explainChange, type ChangeExplanation } from '@/lib/scenarios/diff';
import { answerPolicyQuestion } from '@/lib/policy/knowledgeBase';
import { money, moneyShort, pct } from '@/lib/format';

type Msg =
  | { role: 'user'; text: string }
  | { role: 'copilot'; kind: 'preview'; pending: ProposedChange[]; sourceText: string; commentary?: string; open: boolean }
  | { role: 'copilot'; kind: 'answer'; text: string }
  | { role: 'copilot'; kind: 'result'; applied: string[]; diffs: ChangeExplanation[]; offeredSave: boolean }
  | { role: 'copilot'; kind: 'note'; text: string };

const fmtDiff = (d: ChangeExplanation) => {
  const f = (v: number) => (d.format === 'currency' ? moneyShort(v) : d.format === 'percent' ? pct(v) : d.format === 'year' ? `${v.toFixed(1)} yrs` : v.toFixed(0));
  return { before: f(d.before), after: f(d.after) };
};

export function Copilot({
  client,
  activeResult,
  addChanges,
  computePreview,
  onSaveScenario,
}: {
  client: Client;
  activeResult: CalculationResult;
  addChanges: (changes: ScenarioChange[], name?: string, by?: 'adviser' | 'copilot') => void;
  computePreview: (extra: ScenarioChange[]) => CalculationResult;
  onSaveScenario: (name?: string) => void;
}) {
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [expanded, setExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const push = (...m: Msg[]) =>
    setMsgs((prev) => {
      const next = [...prev.map((x) => (x.role === 'copilot' && x.kind === 'preview' ? { ...x, open: false } : x)), ...m];
      setTimeout(() => logRef.current?.scrollTo({ top: 99999 }), 30);
      return next;
    });

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setExpanded(true);
    setText('');

    // Policy questions: verified knowledge base only
    const policyAnswer = answerPolicyQuestion(t);
    if (policyAnswer) {
      push({ role: 'user', text: t }, { role: 'copilot', kind: 'answer', text: policyAnswer.text });
      return;
    }

    const res = localParser.parse(t, { client });
    if (res.changes.length > 0) {
      push(
        { role: 'user', text: t },
        { role: 'copilot', kind: 'preview', pending: res.changes, sourceText: t, commentary: res.commentary, open: true },
      );
    } else {
      push({ role: 'user', text: t }, { role: 'copilot', kind: 'note', text: res.commentary ?? 'I couldn’t map that to a modelling change.' });
    }
  };

  const apply = (m: Extract<Msg, { kind: 'preview' }>) => {
    const changes = m.pending.map((p) => p.change);
    const after = computePreview(changes);
    const diffs = explainChange(activeResult, after);
    addChanges(changes, undefined, 'copilot');
    push({ role: 'copilot', kind: 'result', applied: m.pending.map((p) => p.chip), diffs, offeredSave: true });
  };

  const latestPreviewIdx = msgs.reduce((idx, m, i) => (m.role === 'copilot' && m.kind === 'preview' && m.open ? i : idx), -1);

  return (
    <div className="pointer-events-auto w-full max-w-2xl px-6">
      {expanded && msgs.length > 0 ? (
        <div className="bp-rise mb-2 overflow-hidden rounded-xl border border-navy-800 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-line bg-navy-950 px-4 py-2">
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">Blueprint Copilot</span>
            <button onClick={() => setExpanded(false)} className="text-[11px] text-navy-100/70 hover:text-white">Minimise</button>
          </div>
          <div ref={logRef} className="max-h-[340px] space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => {
              if (m.role === 'user') {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm bg-navy-900 px-3.5 py-2 text-[12.5px] text-white">{m.text}</div>
                  </div>
                );
              }
              if (m.kind === 'answer' || m.kind === 'note') {
                return (
                  <div key={i} className="flex">
                    <div className={`max-w-[90%] rounded-xl rounded-bl-sm px-3.5 py-2 text-[12.5px] leading-relaxed ${m.kind === 'note' ? 'bg-amber-50 text-amber-900' : 'bg-mist text-ink'}`}>
                      {m.text}
                    </div>
                  </div>
                );
              }
              if (m.kind === 'preview') {
                return (
                  <div key={i} className={`rounded-xl border p-3 ${m.open ? 'border-teal-500/50 bg-aqua-100/60' : 'border-line bg-mist/50 opacity-70'}`}>
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-teal-500">I understood:</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.pending.map((p, pi) => (
                        <span key={pi} className="rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-navy-800 shadow-sm">{p.chip}</span>
                      ))}
                    </div>
                    {m.commentary ? <div className="mt-1.5 text-[11.5px] leading-snug text-navy-800/80">{m.commentary}</div> : null}
                    {m.open && i === latestPreviewIdx ? (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => apply(m)} className="rounded-lg bg-teal-500 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-teal-400">Apply</button>
                        <button
                          onClick={() => { setText(m.sourceText); setMsgs((prev) => prev.map((x) => (x === m ? { ...x, open: false } : x))); }}
                          className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-slate-500b hover:bg-mist"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setMsgs((prev) => prev.map((x) => (x === m ? { ...x, open: false } : x)))}
                          className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-slate-500b hover:bg-mist"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              }
              // result
              return (
                <div key={i} className="rounded-xl border border-line bg-white p-3 shadow-sm">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500b">
                    Applied: {m.applied.join(' · ')}
                  </div>
                  {m.diffs.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {m.diffs.slice(0, 4).map((d) => {
                        const f = fmtDiff(d);
                        const good = d.goodWhen === 'neutral' ? null : d.goodWhen === 'up' ? d.delta > 0 : d.delta < 0;
                        return (
                          <div key={d.label} className="flex items-center justify-between text-[12.5px]">
                            <span className="text-slate-500b">{d.label}</span>
                            <span className="num font-semibold">
                              <span className="text-slate-400">{f.before}</span>
                              <span className="mx-1 text-slate-300">→</span>
                              <span className={good === null ? 'text-ink' : good ? 'text-green-600b' : 'text-rose-600b'}>{f.after}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[12px] text-slate-500b">Applied — no material movement in the headline figures. Details update across every screen.</div>
                  )}
                  {m.offeredSave ? (
                    <button
                      onClick={() => { onSaveScenario(); setMsgs((prev) => prev.map((x) => (x === m ? { ...x, offeredSave: false } : x))); push({ role: 'copilot', kind: 'note', text: 'Saved as a scenario — see the scenario bar.' }); }}
                      className="mt-2 rounded-lg border border-teal-500/50 bg-aqua-100 px-3 py-1.5 text-[12px] font-semibold text-teal-500 hover:bg-teal-500 hover:text-white"
                    >
                      Save as scenario
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-2 rounded-xl border border-navy-800 bg-navy-950/95 p-2 shadow-2xl backdrop-blur">
        <button
          onClick={() => setExpanded((e) => !e)}
          title="Blueprint Copilot"
          className="pl-2 text-teal-400 transition-transform hover:scale-110"
        >
          ✦
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          onFocus={() => msgs.length > 0 && setExpanded(true)}
          placeholder="Ask Blueprint to model a change…"
          className="flex-1 bg-transparent text-[13.5px] text-white placeholder:text-navy-100/40 focus:outline-none"
        />
        <button onClick={submit} className="rounded-lg bg-teal-500 px-4 py-2 text-[12.5px] font-semibold text-navy-950 hover:bg-teal-400">
          Model it
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[10.5px] text-white/90 [text-shadow:0_1px_2px_rgba(10,20,40,0.6)]">
        <span>try:</span>
        {['Close both credit cards', 'Add a boarder paying $250 per week', 'Increase repayments by $500 a fortnight', 'Show me where they are at 65'].map((s) => (
          <button key={s} onClick={() => setText(s)} className="hover:text-teal-200 hover:underline">“{s}”</button>
        ))}
      </div>
    </div>
  );
}

export function moneyOrDash(n?: number) {
  return n === undefined ? '—' : money(n);
}
