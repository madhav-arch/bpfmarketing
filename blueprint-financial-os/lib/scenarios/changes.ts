import { z } from 'zod';
import type { FinancialEvent, Frequency } from '../domain/types';

// Discriminated union of every structured change the copilot or the UI can
// apply. The AI layer may ONLY emit these — never computed numbers.

export type ScenarioChange =
  | { kind: 'setPurchasePrice'; value: number }
  | { kind: 'setDepositPercent'; value: number }
  | { kind: 'setDepositSource'; source: 'kiwiSaver' | 'savings' | 'gift' | 'other'; value: number }
  | { kind: 'adjustRepayment'; delta: number; frequency: Frequency }
  | { kind: 'setRateDelta'; delta: number }
  | { kind: 'setRateAbsolute'; value: number }
  | { kind: 'setBoarder'; perWeek: number; count?: number }
  | { kind: 'removeBoarder' }
  | { kind: 'setRent'; propertyId?: string; perWeek: number }
  | { kind: 'sellProperty'; propertyId: string; price?: number }
  | { kind: 'buyProperty'; price: number; rentPerWeek?: number; interestOnly?: boolean; useProceeds?: boolean; ownerOccupied?: boolean }
  | { kind: 'setInterestOnly'; loanId?: string; on: boolean }
  | { kind: 'addRevolvingCredit'; limit: number; funded: number; monthlyTransfer?: number }
  | { kind: 'setKiwiSaverRate'; applicantIndex?: number; rate: number }
  | { kind: 'setSalaryGrowth'; percent: number }
  | { kind: 'setHouseGrowth'; percent: number }
  | { kind: 'setLivingCostDelta'; monthly: number; label?: string }
  | { kind: 'addEvent'; event: FinancialEvent }
  | { kind: 'setHorizonAge'; age: number }
  | { kind: 'addIncome'; label: string; netAnnual: number }
  | { kind: 'closeCreditCards' }
  | { kind: 'lumpSumRepayment'; amount: number }
  | {
      kind: 'addValuation';
      propertyId?: string;
      value: number;
      sourceName?: string; // e.g. "QV E-Valuer", "Registered valuation"
      useAsActive?: boolean;
    }
  // --- Iteration 2 structured actions --------------------------------------
  | { kind: 'setIncome'; applicantIndex: number; incomeId?: string; grossAnnual: number }
  | { kind: 'addGrossIncome'; applicantIndex?: number; incomeKind: 'salary' | 'overtime-commission' | 'self-employed' | 'other'; label: string; grossAnnual: number }
  | { kind: 'setStressRate'; value: number }
  | { kind: 'setLoanTerm'; years: number }
  | { kind: 'setLowEquityMargin'; value: number }
  | { kind: 'setOwnershipCost'; item: 'rates' | 'insurance' | 'other'; monthly: number }
  | { kind: 'setCashback'; amount: number; retentionMonths?: number }
  | { kind: 'kiwiSaverLumpSum'; amount: number; applicantIndex?: number; fromCash?: boolean }
  | { kind: 'setKiwiSaverWithdrawal'; on: boolean }
  | { kind: 'setInflation'; value: number }
  | { kind: 'setRetirementAge'; age: number }
  | { kind: 'setCreditCardLimit'; debtId?: string; limit: number }
  | { kind: 'removeDebt'; debtId?: string; debtKind?: 'personal-loan' | 'credit-card' | 'store-card' | 'other' }
  | { kind: 'setKiwiSaverReturn'; value: number };

const frequency = z.enum(['weekly', 'fortnightly', 'monthly', 'annual']);

export const scenarioChangeSchema: z.ZodType<ScenarioChange> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('setPurchasePrice'), value: z.number().positive() }),
  z.object({ kind: z.literal('setDepositPercent'), value: z.number().min(0.01).max(1) }),
  z.object({ kind: z.literal('setDepositSource'), source: z.enum(['kiwiSaver', 'savings', 'gift', 'other']), value: z.number().min(0) }),
  z.object({ kind: z.literal('adjustRepayment'), delta: z.number(), frequency }),
  z.object({ kind: z.literal('setRateDelta'), delta: z.number() }),
  z.object({ kind: z.literal('setRateAbsolute'), value: z.number().min(0).max(0.25) }),
  z.object({ kind: z.literal('setBoarder'), perWeek: z.number().min(0), count: z.number().int().positive().optional() }),
  z.object({ kind: z.literal('removeBoarder') }),
  z.object({ kind: z.literal('setRent'), propertyId: z.string().optional(), perWeek: z.number().min(0) }),
  z.object({ kind: z.literal('sellProperty'), propertyId: z.string(), price: z.number().positive().optional() }),
  z.object({
    kind: z.literal('buyProperty'),
    price: z.number().positive(),
    rentPerWeek: z.number().min(0).optional(),
    interestOnly: z.boolean().optional(),
    useProceeds: z.boolean().optional(),
    ownerOccupied: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('setInterestOnly'), loanId: z.string().optional(), on: z.boolean() }),
  z.object({ kind: z.literal('addRevolvingCredit'), limit: z.number().positive(), funded: z.number().min(0), monthlyTransfer: z.number().min(0).optional() }),
  z.object({ kind: z.literal('setKiwiSaverRate'), applicantIndex: z.number().int().min(0).optional(), rate: z.number().min(0).max(0.15) }),
  z.object({ kind: z.literal('setSalaryGrowth'), percent: z.number().min(0).max(0.2) }),
  z.object({ kind: z.literal('setHouseGrowth'), percent: z.number().min(-0.05).max(0.2) }),
  z.object({ kind: z.literal('setLivingCostDelta'), monthly: z.number(), label: z.string().optional() }),
  z.object({
    kind: z.literal('addEvent'),
    event: z.object({
      id: z.string(),
      kind: z.string(),
      label: z.string(),
      startDate: z.string(),
      endDate: z.string().optional(),
      monthlyImpact: z.number().optional(),
      amount: z.number().optional(),
    }) as z.ZodType<FinancialEvent>,
  }),
  z.object({ kind: z.literal('setHorizonAge'), age: z.number().int().min(18).max(100) }),
  z.object({ kind: z.literal('addIncome'), label: z.string(), netAnnual: z.number() }),
  z.object({ kind: z.literal('closeCreditCards') }),
  z.object({ kind: z.literal('lumpSumRepayment'), amount: z.number().positive() }),
  z.object({
    kind: z.literal('addValuation'),
    propertyId: z.string().optional(),
    value: z.number().positive(),
    sourceName: z.string().optional(),
    useAsActive: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('setIncome'), applicantIndex: z.number().int().min(0), incomeId: z.string().optional(), grossAnnual: z.number().min(0) }),
  z.object({
    kind: z.literal('addGrossIncome'),
    applicantIndex: z.number().int().min(0).optional(),
    incomeKind: z.enum(['salary', 'overtime-commission', 'self-employed', 'other']),
    label: z.string(),
    grossAnnual: z.number().positive(),
  }),
  z.object({ kind: z.literal('setStressRate'), value: z.number().min(0.02).max(0.15) }),
  z.object({ kind: z.literal('setLoanTerm'), years: z.number().min(5).max(35) }),
  z.object({ kind: z.literal('setLowEquityMargin'), value: z.number().min(0).max(0.03) }),
  z.object({ kind: z.literal('setOwnershipCost'), item: z.enum(['rates', 'insurance', 'other']), monthly: z.number().min(0) }),
  z.object({ kind: z.literal('setCashback'), amount: z.number().min(0), retentionMonths: z.number().int().min(0).max(60).optional() }),
  z.object({ kind: z.literal('kiwiSaverLumpSum'), amount: z.number().positive(), applicantIndex: z.number().int().min(0).optional(), fromCash: z.boolean().optional() }),
  z.object({ kind: z.literal('setKiwiSaverWithdrawal'), on: z.boolean() }),
  z.object({ kind: z.literal('setInflation'), value: z.number().min(0).max(0.1) }),
  z.object({ kind: z.literal('setRetirementAge'), age: z.number().int().min(50).max(80) }),
  z.object({ kind: z.literal('setCreditCardLimit'), debtId: z.string().optional(), limit: z.number().min(0) }),
  z.object({ kind: z.literal('removeDebt'), debtId: z.string().optional(), debtKind: z.enum(['personal-loan', 'credit-card', 'store-card', 'other']).optional() }),
  z.object({ kind: z.literal('setKiwiSaverReturn'), value: z.number().min(-0.02).max(0.12) }),
]);

/** Human-readable chip label for a proposed change. */
export function describeChange(c: ScenarioChange): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  switch (c.kind) {
    case 'setPurchasePrice': return `Purchase price → ${fmt(c.value)}`;
    case 'setDepositPercent': return `Deposit → ${Math.round(c.value * 100)}%`;
    case 'setDepositSource': return `${c.source} deposit → ${fmt(c.value)}`;
    case 'adjustRepayment': return `Repayments ${c.delta >= 0 ? '+' : '−'}${fmt(Math.abs(c.delta))}/${c.frequency === 'fortnightly' ? 'fn' : c.frequency === 'weekly' ? 'wk' : 'mo'}`;
    case 'setRateDelta': return `Rates ${c.delta >= 0 ? '+' : ''}${(c.delta * 100).toFixed(2)}%`;
    case 'setRateAbsolute': return `Rate → ${(c.value * 100).toFixed(2)}%`;
    case 'setBoarder': return `Boarder ${c.count && c.count > 1 ? `× ${c.count} ` : ''}→ $${c.perWeek}/wk`;
    case 'removeBoarder': return 'Boarder removed';
    case 'setRent': return `Rent → $${c.perWeek}/wk`;
    case 'sellProperty': return `Sell property${c.price ? ` for ${fmt(c.price)}` : ''}`;
    case 'buyProperty': return `Buy ${c.ownerOccupied ? 'home' : 'rental'} for ${fmt(c.price)}${c.rentPerWeek ? ` @ $${c.rentPerWeek}/wk` : ''}`;
    case 'setInterestOnly': return c.on ? 'Switch to interest-only' : 'Switch to P&I';
    case 'addRevolvingCredit': return `Revolving credit ${fmt(c.limit)} (${fmt(c.funded)} parked)`;
    case 'setKiwiSaverRate': return `KiwiSaver contribution → ${(c.rate * 100).toFixed(1)}%`;
    case 'setSalaryGrowth': return `Salary growth → ${(c.percent * 100).toFixed(1)}%/yr`;
    case 'setHouseGrowth': return `House growth → ${(c.percent * 100).toFixed(1)}%/yr`;
    case 'setLivingCostDelta': return `${c.label ?? 'Living costs'} ${c.monthly >= 0 ? '+' : '−'}${fmt(Math.abs(c.monthly))}/mo`;
    case 'addEvent': return `Event: ${c.event.label}`;
    case 'setHorizonAge': return `Show position at age ${c.age}`;
    case 'addIncome': return `${c.label} +${fmt(c.netAnnual)}/yr net`;
    case 'closeCreditCards': return 'Close credit cards';
    case 'lumpSumRepayment': return `Lump sum ${fmt(c.amount)} onto mortgage`;
    case 'addValuation': return `${c.sourceName ?? 'Valuation'} → ${fmt(c.value)}`;
    case 'setIncome': return `Income → ${fmt(c.grossAnnual)} gross/yr`;
    case 'addGrossIncome': return `${c.label} +${fmt(c.grossAnnual)} gross/yr`;
    case 'setStressRate': return `Test rate → ${(c.value * 100).toFixed(2)}%`;
    case 'setLoanTerm': return `Loan term → ${c.years} years`;
    case 'setLowEquityMargin': return `Low-equity margin → ${(c.value * 100).toFixed(2)}%`;
    case 'setOwnershipCost': return `${c.item === 'rates' ? 'Rates' : c.item === 'insurance' ? 'Home insurance' : 'Other ownership costs'} → ${fmt(c.monthly)}/mo`;
    case 'setCashback': return `Cashback → ${fmt(c.amount)}${c.retentionMonths ? ` (${c.retentionMonths}mo retention)` : ''}`;
    case 'kiwiSaverLumpSum': return `KiwiSaver lump sum ${fmt(c.amount)}`;
    case 'setKiwiSaverWithdrawal': return c.on ? 'Model first-home KiwiSaver withdrawal' : 'No KiwiSaver withdrawal';
    case 'setInflation': return `Inflation → ${(c.value * 100).toFixed(1)}%/yr`;
    case 'setRetirementAge': return `Retirement age → ${c.age}`;
    case 'setCreditCardLimit': return `Card limit → ${fmt(c.limit)}`;
    case 'removeDebt': return c.debtKind ? `Remove ${c.debtKind.replace('-', ' ')}` : 'Remove debt';
    case 'setKiwiSaverReturn': return `KiwiSaver return → ${(c.value * 100).toFixed(1)}%/yr`;
  }
}
