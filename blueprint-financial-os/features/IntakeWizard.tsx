'use client';

import { useMemo, useState } from 'react';
import type { Client, ClientType } from '@/lib/domain/types';
import type { FeedSnapshot } from '@/lib/data-sources/types';
import { analyseFeed } from '@/lib/calculators/cashflow';
import {
  autoClassifyStreams,
  buildClientFromIntake,
  type IntakeForm,
  type IntakePropertyInput,
  type StreamRole,
} from '@/lib/intake/buildClient';
import { TAX_CURRENT } from '@/lib/rules/taxTables';
import { Card, Pill } from '@/components/ui';
import { parseCsvFeed } from '@/lib/data-sources/providers';
import { money, pct } from '@/lib/format';

const ROLE_OPTIONS: { value: StreamRole; label: string }[] = [
  { value: 'salary-1', label: 'Salary — applicant 1' },
  { value: 'salary-2', label: 'Salary — applicant 2' },
  { value: 'overtime-1', label: 'Overtime/commission — app. 1' },
  { value: 'overtime-2', label: 'Overtime/commission — app. 2' },
  { value: 'self-employed-1', label: 'Self-employed — applicant 1' },
  { value: 'self-employed-2', label: 'Self-employed — applicant 2' },
  { value: 'rental', label: 'Rental income' },
  { value: 'boarder', label: 'Boarder / flatmate' },
  { value: 'ignore', label: 'Ignore (transfer / one-off)' },
];

const field = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] focus:border-teal-500 focus:outline-none';
const label = 'mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500b';

/** Statutory KiwiSaver employee contribution rates — a dropdown, never free text. */
const KS_RATES = [0.03, 0.035, 0.04, 0.06, 0.08, 0.1];

interface BorrowerInput {
  name: string;
  age: string;
  /** manual fact-find entry: gross annual salary — overrides feed-detected salary for this borrower */
  gross: string;
}

export function IntakeWizard({
  feed,
  isLive,
  onCreate,
  onCancel,
  setImported,
  inviteUrl,
}: {
  feed: FeedSnapshot;
  isLive: boolean;
  onCreate: (client: Client, assumptions: string[]) => void;
  onCancel: () => void;
  /** store an adviser/client-imported snapshot (CSV or Akahu JSON) */
  setImported?: (s: FeedSnapshot | null) => void;
  /** the Akahu Apply sharing link for this session, when one exists */
  inviteUrl?: string | null;
}) {
  const [clientType, setClientType] = useState<ClientType>('homeowner');
  const [clientLabel, setClientLabel] = useState('');
  const [borrowers, setBorrowers] = useState<BorrowerInput[]>([
    { name: '', age: '', gross: '' },
    { name: '', age: '', gross: '' },
  ]);
  const [ksRate, setKsRate] = useState(0.03);
  const [dependants, setDependants] = useState(0);
  const [vehicles, setVehicles] = useState(2);
  const [cardLimits, setCardLimits] = useState('');
  const [properties, setProperties] = useState<IntakePropertyInput[]>([]);
  const [kiwiSaverTotal, setKiwiSaverTotal] = useState('');
  const [savingsForDeposit, setSavingsForDeposit] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [roles, setRoles] = useState<Record<string, StreamRole>>({});
  const [loanMap, setLoanMap] = useState<Record<string, number>>({});

  // Feed preview — the point of the minimal form: Akahu answers these already.
  const shellClient = useMemo(
    () =>
      ({
        expenses: { declaredMonthly: [], fixedCommitmentsMonthly: [] },
        mortgages: [],
        household: { adults: borrowers.length, dependants, vehicles },
      }) as unknown as Client,
    [borrowers.length, dependants, vehicles],
  );
  const analysis = useMemo(() => analyseFeed(feed, shellClient), [feed, shellClient]);
  const autoRoles = useMemo(() => autoClassifyStreams(analysis.incomeStreams), [analysis]);
  const loanAccounts = feed.accounts.filter((a) => a.type === 'mortgage' || a.type === 'loan');
  const num = (s: string) => parseFloat(s.replace(/[^0-9.]/g, '')) || 0;

  const needsProperties = clientType !== 'fhb';

  const create = () => {
    const form: IntakeForm = {
      label: clientLabel || borrowers.map((b) => b.name).filter(Boolean).join(' & ') || 'New client',
      clientType,
      applicantNames: borrowers.map((b, i) => b.name || `Applicant ${i + 1}`),
      dependants,
      vehicles,
      ages: clientType === 'fhb' ? borrowers.map((b) => parseInt(b.age, 10) || 30) : undefined,
      creditCardLimits: num(cardLimits),
      properties: needsProperties ? properties.filter((p) => p.ownerEstimate > 0) : [],
      kiwiSaverTotal: clientType === 'fhb' ? num(kiwiSaverTotal) : undefined,
      savingsForDeposit: clientType === 'fhb' ? num(savingsForDeposit) : undefined,
      targetPrice: clientType === 'fhb' ? num(targetPrice) || undefined : undefined,
      streamRoles: roles,
      loanPropertyMap: loanMap,
      kiwiSaverRate: ksRate,
      manualGrossAnnual: borrowers.map((b) => num(b.gross)),
    };
    const built = buildClientFromIntake(form, feed, TAX_CURRENT);
    onCreate(built.client, built.assumptions);
  };

  return (
    <div className="mx-auto max-w-[880px] px-8 py-8 pb-24">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="font-display text-[11px] font-medium uppercase tracking-[0.22em] text-teal-500">New client — minimal intake</div>
          <h2 className="font-display mt-1 text-[26px] font-semibold text-ink">Ask little, let the data answer</h2>
          <p className="mt-1.5 max-w-xl text-[13.5px] text-slate-500b">
            The bank feed supplies income, expenses and debt. You supply what only a conversation can: who they are, what they own, and what they think it's worth.
          </p>
        </div>
        <button onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-slate-500b hover:bg-white">
          Cancel
        </button>
      </div>

      {/* 1 — Who */}
      <Card className="p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink">1 · Who they are</h3>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="col-span-2 md:col-span-3">
            <span className={label}>Client type</span>
            <div className="flex gap-2">
              {(
                [
                  ['fhb', 'First-home buyer'],
                  ['homeowner', 'Existing homeowner'],
                  ['investor', 'Property investor'],
                ] as [ClientType, string][]
              ).map(([t, l]) => (
                <button
                  key={t}
                  onClick={() => setClientType(t)}
                  className={`rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition-colors ${clientType === t ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-slate-500b hover:border-navy-700'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>File label</span>
            <input className={field} value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} placeholder="e.g. Madhav — own test" />
          </div>
          <div>
            <span className={label}>Dependants</span>
            <input className={field} type="number" min={0} value={dependants} onChange={(e) => setDependants(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <span className={label}>Vehicles</span>
            <input className={field} type="number" min={0} value={vehicles} onChange={(e) => setVehicles(parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <span className={label}>Combined credit-card limits</span>
            <input className={field} value={cardLimits} onChange={(e) => setCardLimits(e.target.value)} placeholder="$ (feed shows balances, not limits)" />
          </div>
          <div>
            <span className={label}>KiwiSaver contribution rate</span>
            <select className={field} value={String(ksRate)} onChange={(e) => setKsRate(parseFloat(e.target.value))}>
              {KS_RATES.map((r) => (
                <option key={r} value={String(r)}>{(r * 100).toLocaleString()}%</option>
              ))}
            </select>
          </div>
        </div>

        {/* Borrowers — up to 4; each extra borrower scales the living-cost benchmark */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className={label}>Borrowers ({borrowers.length})</span>
            {borrowers.length < 4 ? (
              <button
                onClick={() => setBorrowers([...borrowers, { name: '', age: '', gross: '' }])}
                className="rounded-lg border border-teal-500/50 bg-aqua-100 px-3 py-1.5 text-[12px] font-semibold text-teal-500 hover:bg-teal-500 hover:text-white"
              >
                + Add borrower
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-2">
            {borrowers.map((b, i) => (
              <div key={i} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-line p-3 md:grid-cols-4">
                <div>
                  <span className={label}>Borrower {i + 1} first name</span>
                  <input className={field} value={b.name} onChange={(e) => setBorrowers(borrowers.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))} />
                </div>
                {clientType === 'fhb' ? (
                  <div>
                    <span className={label}>Age</span>
                    <input className={field} value={b.age} onChange={(e) => setBorrowers(borrowers.map((x, xi) => (xi === i ? { ...x, age: e.target.value } : x)))} placeholder="asked for FHBs only" />
                  </div>
                ) : null}
                <div>
                  <span className={label}>Gross salary /yr — manual entry</span>
                  <input className={field} value={b.gross} onChange={(e) => setBorrowers(borrowers.map((x, xi) => (xi === i ? { ...x, gross: e.target.value } : x)))} placeholder="$ (optional — feed fills this)" />
                </div>
                {borrowers.length > 1 ? (
                  <button
                    onClick={() => setBorrowers(borrowers.filter((_, xi) => xi !== i))}
                    className="justify-self-start rounded-lg border border-line px-3 py-2 text-[12px] text-slate-500b hover:bg-mist"
                  >
                    remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500b">
            A manual salary overrides feed-detected salary for that borrower — use it when there's no bank connection or the feed misreads the income.
            Each borrower beyond two scales the household living-cost benchmark the banks apply.
          </p>
        </div>
      </Card>

      {/* 2 — Connect accounts (Akahu one-off share) */}
      <Card className={`mt-4 p-6 ${isLive ? '' : 'border-teal-500/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-[15px] font-semibold text-ink">2 · Connect your accounts</h3>
          <Pill tone={isLive ? 'green' : 'slate'}>
            {isLive ? `● Connected — ${feed.accounts.length} accounts · ${feed.transactions.length} transactions` : '○ Not connected yet'}
          </Pill>
        </div>
        {isLive ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500b">
            Your bank data is in. Income, spending and lending below are pre-filled from it — confirm the classifications in step 4 and you are done.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500b">
              Securely share your accounts so income, expenses and commitments pre-fill themselves. It is a one-off share through Akahu — you
              choose which accounts, and your bank login is never seen or stored.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={inviteUrl ?? 'https://my.akahu.nz'}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-navy-900 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-navy-800"
              >
                Connect my accounts via Akahu
              </a>
              {setImported ? (
                <label className="cursor-pointer rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-500b hover:bg-mist">
                  or import a CSV / snapshot
                  <input
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const text = String(reader.result ?? '');
                        try {
                          if (file.name.toLowerCase().endsWith('.json') || text.trimStart().startsWith('{')) {
                            const s = JSON.parse(text);
                            if (s && Array.isArray(s.transactions) && Array.isArray(s.accounts)) return setImported(s as FeedSnapshot);
                          }
                          const s = parseCsvFeed(text, { bank: file.name.replace(/\.[^.]+$/, '') });
                          if (s.transactions.length > 0) setImported(s);
                        } catch {
                          /* unreadable file — stay on the demo feed */
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              ) : null}
              <span className="text-[11.5px] text-slate-500b">You can also continue without connecting — the file starts on demo data.</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500b">
              After submitting the Akahu share, the adviser refreshes the data (`npm run apply:pull` + rebuild) and this step shows connected.
            </p>
          </>
        )}
      </Card>

      {/* 3 — Property */}
      <Card className="mt-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            3 · {clientType === 'fhb' ? 'The purchase' : 'What they own'}
          </h3>
          {needsProperties ? (
            <button
              onClick={() => setProperties([...properties, { nickname: '', ownerEstimate: 0, use: properties.length === 0 ? 'owner-occupied' : 'investment' }])}
              className="rounded-lg border border-teal-500/50 bg-aqua-100 px-3 py-1.5 text-[12px] font-semibold text-teal-500 hover:bg-teal-500 hover:text-white"
            >
              + Add property
            </button>
          ) : null}
        </div>
        {clientType === 'fhb' ? (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <span className={label}>Target purchase price</span>
              <input className={field} value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="$" />
            </div>
            <div>
              <span className={label}>KiwiSaver available (combined)</span>
              <input className={field} value={kiwiSaverTotal} onChange={(e) => setKiwiSaverTotal(e.target.value)} placeholder="$" />
            </div>
            <div>
              <span className={label}>Savings toward deposit</span>
              <input className={field} value={savingsForDeposit} onChange={(e) => setSavingsForDeposit(e.target.value)} placeholder="$" />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {properties.length === 0 ? (
              <p className="text-[12.5px] text-slate-500b">Add each property and ask one question: “what do you think it's worth?” (key the CoreLogic figure here — it's stored as an owner estimate until a bank AVM replaces it).</p>
            ) : null}
            {properties.map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-line p-3 md:grid-cols-5">
                <div className="md:col-span-2">
                  <span className={label}>Nickname</span>
                  <input className={field} value={p.nickname} onChange={(e) => setProperties(properties.map((x, xi) => (xi === i ? { ...x, nickname: e.target.value } : x)))} placeholder={`Property ${i + 1}`} />
                </div>
                <div>
                  <span className={label}>What's it worth?</span>
                  <input className={field} value={p.ownerEstimate || ''} onChange={(e) => setProperties(properties.map((x, xi) => (xi === i ? { ...x, ownerEstimate: num(e.target.value) } : x)))} placeholder="$ owner estimate" />
                </div>
                <div>
                  <span className={label}>Use</span>
                  <select className={field} value={p.use} onChange={(e) => setProperties(properties.map((x, xi) => (xi === i ? { ...x, use: e.target.value as IntakePropertyInput['use'] } : x)))}>
                    <option value="owner-occupied">Owner-occupied</option>
                    <option value="investment">Investment</option>
                  </select>
                </div>
                <div>
                  <span className={label}>Rent /wk (if rental)</span>
                  <input className={field} disabled={p.use !== 'investment'} value={p.rentPerWeek || ''} onChange={(e) => setProperties(properties.map((x, xi) => (xi === i ? { ...x, rentPerWeek: num(e.target.value) } : x)))} placeholder="$" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 4 — What the feed already knows */}
      <Card className="mt-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold text-ink">4 · What the bank feed already answered</h3>
          <Pill tone={isLive ? 'green' : 'slate'}>{isLive ? '● Akahu connected' : '○ Demo feed shown until accounts are connected'}</Pill>
        </div>

        <div className="mt-4">
          <span className={label}>Detected income — confirm the classification, nothing else</span>
          <div className="divide-y divide-line rounded-lg border border-line">
            {analysis.incomeStreams.slice(0, 8).map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">{s.label}</div>
                  <div className="text-[11px] text-slate-500b">
                    {money(s.monthlyAverage)}/mo net · {s.cadence} · {s.occurrences} credits
                  </div>
                </div>
                <select
                  className="shrink-0 rounded-lg border border-line bg-white px-2 py-1.5 text-[12px]"
                  value={roles[s.label] ?? autoRoles[s.label] ?? 'ignore'}
                  onChange={(e) => setRoles({ ...roles, [s.label]: e.target.value as StreamRole })}
                >
                  {ROLE_OPTIONS.filter((o) => borrowers.length >= 2 || !o.value.endsWith('2')).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500b">Net credits are grossed up deterministically via the current PAYE table for servicing — verified against IRD summaries at application time.</p>
        </div>

        {loanAccounts.length > 0 ? (
          <div className="mt-5">
            <span className={label}>Detected lending — real rates & repayments kept; stress test stays at 7%</span>
            <div className="divide-y divide-line rounded-lg border border-line">
              {loanAccounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{a.name} · {a.bank}</div>
                    <div className="text-[11px] text-slate-500b">
                      {money(Math.abs(a.balance))}
                      {a.loanDetails?.interestRate ? ` @ ${pct(a.loanDetails.interestRate)}` : ' · rate not exposed'}
                      {a.loanDetails?.repaymentAmount ? ` · ${money(a.loanDetails.repaymentAmount)}/${a.loanDetails.repaymentFrequency ?? 'mo'}` : ''}
                      {a.loanDetails?.expiresAt ? ` · fixed until ${a.loanDetails.expiresAt.slice(0, 10)}` : ''}
                    </div>
                  </div>
                  {needsProperties && properties.length > 1 ? (
                    <select
                      className="shrink-0 rounded-lg border border-line bg-white px-2 py-1.5 text-[12px]"
                      value={loanMap[a.id] ?? 0}
                      onChange={(e) => setLoanMap({ ...loanMap, [a.id]: parseInt(e.target.value, 10) })}
                    >
                      {properties.map((p, i) => (
                        <option key={i} value={i}>{p.nickname || `Property ${i + 1}`}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded-lg bg-mist px-4 py-3 text-[12.5px] text-slate-500b">
          Actual spending detected: <strong className="num text-ink">{money(analysis.totalSpendMonthly)}/mo</strong> across{' '}
          {analysis.spendByCategory.length} categories — no expense questions asked. The benchmark-vs-actual comparison appears on the file the moment it's created.
        </div>
      </Card>

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2.5 text-[13px] font-semibold text-slate-500b hover:bg-white">
          Cancel
        </button>
        <button
          onClick={create}
          disabled={needsProperties && properties.filter((p) => p.ownerEstimate > 0).length === 0 && loanAccounts.length > 0}
          className="rounded-lg bg-teal-500 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Create client file
        </button>
      </div>
    </div>
  );
}
