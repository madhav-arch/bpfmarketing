'use client';

// Client-facing landing page — the front door to a Blueprint session.
// Details → connect accounts (Akahu one-off share) → live position.

import type { FeedState } from './LiveDataPanel';

/** Sharing link embedded at bundle time (scripts/bundle-single-file.js reads
 *  .akahu-apply.json); falls back to the Akahu portal when absent. */
export function inviteLink(): string | null {
  try {
    const l = (globalThis as unknown as { __BPF_INVITE_LINK__?: string }).__BPF_INVITE_LINK__;
    if (l && /^https:\/\/apply\.akahu\.nz\//.test(l)) return l;
  } catch {
    /* none embedded */
  }
  return null;
}

export function Landing({ feed, onStart, onExplore }: { feed: FeedState; onStart: () => void; onExplore: () => void }) {
  const connected = feed.isLive;
  return (
    <div className="blueprint-grid flex min-h-full flex-col bg-navy-950 text-white">
      <header className="flex h-16 shrink-0 items-center justify-between px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-500 font-display text-[17px] font-bold text-navy-950">B</div>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold tracking-tight">Blueprint Finance</div>
            <div className="text-[9.5px] uppercase tracking-[0.24em] text-teal-300/70">Your Financial Blueprint</div>
          </div>
        </div>
        <button onClick={onExplore} className="rounded-lg border border-navy-700 px-3.5 py-1.5 text-[12.5px] font-medium text-navy-100 transition-colors hover:border-teal-400">
          Adviser workspace →
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[980px] flex-1 flex-col justify-center px-8 pb-16 pt-8">
        <div className="max-w-2xl">
          <div className="font-display text-[11.5px] font-semibold uppercase tracking-[0.26em] text-teal-300">
            Live financial strategy, not a lecture
          </div>
          <h1 className="font-display mt-3 text-[44px] font-semibold leading-[1.08] tracking-tight">
            See your full financial position — and what it could become.
          </h1>
          <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-navy-100/80">
            Tell us a little about yourself, connect your accounts securely, and watch your income, spending, borrowing power and long-term
            trajectory come to life — then change the assumptions and see your future move.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              onClick={onStart}
              className="rounded-xl bg-teal-500 px-7 py-3.5 font-display text-[15px] font-semibold text-navy-950 shadow-lg shadow-teal-500/25 transition-all hover:-translate-y-0.5 hover:bg-teal-400"
            >
              Start my Blueprint
            </button>
            {connected ? (
              <span className="rounded-full border border-teal-400/40 bg-teal-500/15 px-3.5 py-1.5 text-[12px] font-semibold text-teal-300">
                ● Your bank data is connected
              </span>
            ) : (
              <span className="text-[12.5px] text-navy-100/60">about 5 minutes · nothing is saved outside this session</span>
            )}
          </div>
        </div>

        {/* The three steps */}
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              n: '1',
              title: 'Tell us about you',
              body: 'A handful of questions only a conversation can answer — who you are, what you own, what you are aiming for. No expense interrogation.',
            },
            {
              n: '2',
              title: 'Connect your accounts',
              body: 'A secure one-off share through Akahu pre-fills your income, spending and commitments. You choose which accounts; we never see your bank login.',
            },
            {
              n: '3',
              title: 'See your position, live',
              body: 'Your real numbers, how a bank reads them, your borrowing power — and every assumption editable so you can watch your future change.',
            },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-navy-800 bg-navy-900/70 p-5 backdrop-blur">
              <div className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-[15px] font-bold text-teal-300">{s.n}</div>
              <div className="font-display mt-3 text-[15.5px] font-semibold">{s.title}</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-navy-100/70">{s.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="shrink-0 border-t border-navy-800/70 px-8 py-4 text-[11px] leading-relaxed text-navy-100/45">
        Indicative modelling on stated assumptions — not financial advice, a loan offer or a valuation until reviewed with your adviser.
        Bank data arrives through Akahu's one-off account information share; account numbers are removed before anything is displayed.
      </footer>
    </div>
  );
}
