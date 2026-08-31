import type { AuditLine, Client, Property } from '../domain/types';
import type { LenderPolicy, ModellingAssumptions } from '../rules/types';

export interface PropertyEquity {
  propertyId: string;
  nickname: string;
  use: Property['use'];
  entity: Property['entity'];
  activeValue: number;
  valuationSource: string;
  valuationRange: { min: number; max: number };
  linkedDebt: number;
  lvr: number;
  maxLVR: number;
  maxLending: number;
  usableEquity: number;
  /** what usable equity each stored valuation would imply */
  perValuation: { id: string; label: string; value: number; usableEquity: number; observedAt?: string; confidence?: string }[];
  audit: AuditLine[];
}

export interface EquityResult {
  properties: PropertyEquity[];
  totalValue: number;
  totalDebt: number;
  totalUsableEquity: number;
  portfolioLVR: number;
  /** usable equity treated as a deposit at the modelling deposit rate */
  maxPurchaseWithEquity: number;
  equityDepositRate: number;
}

export function activeValuation(p: Property) {
  return p.valuations.find((v) => v.id === p.activeValuationId) ?? p.valuations[0];
}

export function computeEquity(
  client: Client,
  policy: LenderPolicy,
  modelling: ModellingAssumptions,
): EquityResult {
  const properties: PropertyEquity[] = client.properties.map((p) => {
    const active = activeValuation(p);
    const linkedDebt = client.mortgages
      .filter((m) => m.propertyId === p.id)
      .reduce((s, m) => s + m.balance, 0);
    const maxLVR = p.use === 'owner-occupied' ? policy.lvrPolicy.ownerOccupiedMax : policy.lvrPolicy.investmentMax;
    const maxLending = active.value * maxLVR;
    const usableEquity = Math.max(0, maxLending - linkedDebt);
    const values = p.valuations.map((v) => v.value);
    return {
      propertyId: p.id,
      nickname: p.nickname,
      use: p.use,
      entity: p.entity,
      activeValue: active.value,
      valuationSource: active.sourceName ?? active.sourceType,
      valuationRange: { min: Math.min(...values), max: Math.max(...values) },
      linkedDebt,
      lvr: active.value > 0 ? linkedDebt / active.value : 0,
      maxLVR,
      maxLending,
      usableEquity,
      perValuation: p.valuations.map((v) => ({
        id: v.id,
        label: v.sourceName ?? v.sourceType,
        value: v.value,
        usableEquity: Math.max(0, v.value * maxLVR - linkedDebt),
        observedAt: v.observedAt,
        confidence: v.confidence,
      })),
      audit: [
        { label: `Value (${active.sourceName ?? active.sourceType})`, value: active.value, format: 'currency', note: active.observedAt ? `Observed ${active.observedAt}` : undefined },
        { label: `Modelling LVR cap (${p.use === 'owner-occupied' ? 'owner-occupied' : 'investment'})`, value: maxLVR, format: 'percent' },
        { label: 'Maximum modelled lending', value: maxLending, format: 'currency' },
        { label: 'Existing lending against this property', value: -linkedDebt, format: 'currency' },
        { label: 'Usable equity', value: usableEquity, format: 'currency' },
      ],
    };
  });

  const totalValue = properties.reduce((s, p) => s + p.activeValue, 0);
  const totalDebt = properties.reduce((s, p) => s + p.linkedDebt, 0);
  const totalUsableEquity = properties.reduce((s, p) => s + p.usableEquity, 0);
  return {
    properties,
    totalValue,
    totalDebt,
    totalUsableEquity,
    portfolioLVR: totalValue > 0 ? totalDebt / totalValue : 0,
    maxPurchaseWithEquity: totalUsableEquity / modelling.equityDepositRate,
    equityDepositRate: modelling.equityDepositRate,
  };
}
