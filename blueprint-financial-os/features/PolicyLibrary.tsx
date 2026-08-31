'use client';

// POLICY LIBRARY — the adviser's register of verified lender-policy material.
// Answers in the copilot only ever come from what is verified here.

import { useState } from 'react';
import { Card, SectionHeading, Pill, BankMark } from '@/components/ui';
import { policyLibrary, policyFacts } from '@/lib/policy/knowledgeBase';
import type { SectionProps } from './types';

export function PolicyLibrarySection({ presentation }: SectionProps) {
  const entries = policyLibrary();
  const [openLender, setOpenLender] = useState<string | null>(null);

  return (
    <section>
      <SectionHeading
        index="09 · Policy library"
        title="Verified lender policy"
        lede="Every lender profile in the comparison traces back to a verified source with an effective date. The copilot answers policy questions only from material listed here."
      />
      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-mist/60 text-left text-[10.5px] uppercase tracking-[0.12em] text-slate-500b">
              <th className="px-4 py-2.5 font-medium">Lender</th>
              <th className="px-3 py-2.5 font-medium">Policy type</th>
              <th className="px-3 py-2.5 font-medium">Effective date</th>
              <th className="px-3 py-2.5 font-medium">Uploaded</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Last reviewed</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.lender}
                className={`border-b border-line/60 ${e.policy ? 'cursor-pointer hover:bg-aqua-100/40' : 'opacity-60'}`}
                onClick={() => e.policy && setOpenLender(openLender === e.lender ? null : e.lender)}
              >
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    {e.policy?.brand ? <BankMark mark={e.policy.brand.mark} color={e.policy.brand.color} textColor={e.policy.brand.textColor} size="sm" /> : null}
                    <span className="font-semibold text-ink">{e.lender}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-500b">{e.policyType}</td>
                <td className="num px-3 py-2.5">{e.effectiveDate}</td>
                <td className="num px-3 py-2.5">{e.uploadedDate}</td>
                <td className="px-3 py-2.5">
                  <Pill tone={e.status === 'verified' ? 'green' : e.status === 'needs-review' ? 'amber' : 'slate'}>
                    {e.status === 'verified' ? 'Verified' : e.status === 'needs-review' ? 'Needs review' : 'Not loaded'}
                  </Pill>
                </td>
                <td className="num px-3 py-2.5">{e.lastReviewed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {openLender ? (
        <Card className="mt-4 p-5">
          {(() => {
            const e = entries.find((x) => x.lender === openLender);
            if (!e?.policy) return null;
            return (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-[15px] font-semibold text-ink">{e.policy.label}</h3>
                  <span className="text-[11px] text-slate-500b">{e.sourceDescription}</span>
                </div>
                <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-slate-500b">
                  {policyFacts(e.policy).map((f, i) => (
                    <li key={i}>· {f}</li>
                  ))}
                </ul>
              </>
            );
          })()}
        </Card>
      ) : null}
      {!presentation ? (
        <Card tone="aqua" className="mt-4 p-5">
          <h3 className="font-display text-[14px] font-semibold text-navy-800">Adding policy material</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-navy-800/85">
            Drop a new bank calculator or written credit policy with the adviser and it becomes a versioned rule set here — the comparison,
            the copilot's policy answers and every audit trail pick it up automatically. TSB, SBS and Bank of China are listed as not loaded:
            the app will not invent their policy, and the copilot declines questions about them until verified material arrives.
          </p>
        </Card>
      ) : null}
    </section>
  );
}
