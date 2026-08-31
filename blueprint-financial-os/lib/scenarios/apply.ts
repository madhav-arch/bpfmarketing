import type { Client, Property, MortgageFacility } from '../domain/types';
import type { ScenarioChange } from './changes';
import type { ServicingOptions } from '../calculators/servicing';

export interface ScenarioState {
  client: Client;
  servicingOpts: ServicingOptions;
  extraRepaymentMonthly: number;
  lumpSumRepayment: number;
  rateDelta: number;
  rateAbsolute?: number;
  houseGrowthOverride?: number;
  salaryGrowthOverride?: number;
  kiwiSaverRateOverrides: Record<number, number>;
  revolving?: { limit: number; funded: number; monthlyTransfer?: number };
  horizonAge?: number;
  interestOnlyAll?: boolean;
  soldPropertyProceeds: number;
  purchasedProperty?: { price: number; rentPerWeek?: number; interestOnly?: boolean; ownerOccupied?: boolean };
  notes: string[];
}

// Sale-cost and LVR-cap assumptions used when restructuring on a sale.
// These mirror the Blueprint modelling policy (lib/rules/lenderPolicies.ts);
// kept as named constants here so the scenario layer stays context-free.
const SALE_AGENT_FEE_RATE = 0.03;
const SALE_LEGAL_FEE = 1500;
const MAX_LVR_OWNER_OCCUPIED = 0.8;
const MAX_LVR_INVESTMENT = 0.7;

let uid = 0;
const nextId = (p: string) => `${p}-scn-${++uid}`;

function clone<T>(x: T): T {
  return structuredClone(x);
}

/** Applies changes functionally: the baseline client is never mutated. */
export function applyScenario(baseline: Client, changes: ScenarioChange[]): ScenarioState {
  const client = clone(baseline);
  const state: ScenarioState = {
    client,
    servicingOpts: {},
    extraRepaymentMonthly: 0,
    lumpSumRepayment: 0,
    rateDelta: 0,
    kiwiSaverRateOverrides: {},
    soldPropertyProceeds: 0,
    notes: [],
  };

  for (const c of changes) {
    switch (c.kind) {
      case 'setPurchasePrice': {
        if (client.targetPurchase) client.targetPurchase.price = c.value;
        break;
      }
      case 'setDepositPercent': {
        if (client.targetPurchase) {
          // keep price, resize the deposit stack proportionally to hit the %.
          const t = client.targetPurchase;
          const want = t.price * c.value;
          const d = t.depositSources;
          const have = d.kiwiSaver + d.savings + d.gift + d.other;
          if (have > 0) {
            const f = want / have;
            d.kiwiSaver *= f; d.savings *= f; d.gift *= f; d.other *= f;
            state.notes.push(`Deposit stack scaled to ${(c.value * 100).toFixed(0)}% of purchase (illustrative — actual funds are what they are).`);
          }
        }
        break;
      }
      case 'setDepositSource': {
        if (client.targetPurchase) client.targetPurchase.depositSources[c.source] = c.value;
        break;
      }
      case 'adjustRepayment': {
        const perYear = { weekly: 52, fortnightly: 26, monthly: 12, annual: 1 }[c.frequency];
        state.extraRepaymentMonthly += (c.delta * perYear) / 12;
        break;
      }
      case 'setRateDelta': state.rateDelta += c.delta; break;
      case 'setRateAbsolute': state.rateAbsolute = c.value; break;
      case 'setBoarder': {
        state.servicingOpts.boarderPerWeekOverride = c.perWeek;
        state.servicingOpts.boarderCount = c.count ?? 1;
        if (client.targetPurchase) {
          client.targetPurchase.intendedBoarderPerWeek = c.perWeek;
          client.targetPurchase.boarderCount = c.count ?? 1;
        }
        break;
      }
      case 'removeBoarder': {
        state.servicingOpts.boarderPerWeekOverride = 0;
        state.servicingOpts.boarderCount = 0;
        break;
      }
      case 'setRent': {
        const target =
          (c.propertyId && client.properties.find((p) => p.id === c.propertyId)) ||
          client.properties.find((p) => p.use === 'investment');
        if (target) {
          state.servicingOpts.rentPerWeekOverrides = {
            ...state.servicingOpts.rentPerWeekOverrides,
            [target.id]: c.perWeek,
          };
          target.rentPerWeek = { value: c.perWeek, sourceType: 'adviser-estimate', sourceName: 'Scenario override' };
        }
        break;
      }
      case 'sellProperty': {
        const idx = client.properties.findIndex((p) => p.id === c.propertyId);
        if (idx >= 0) {
          const prop = client.properties[idx];
          const value = c.price ?? prop.valuations.find((v) => v.id === prop.activeValuationId)?.value ?? 0;
          const debt = client.mortgages.filter((m) => m.propertyId === prop.id).reduce((s, m) => s + m.balance, 0);
          const agentFees = value * SALE_AGENT_FEE_RATE;
          const legalFee = SALE_LEGAL_FEE;
          let proceeds = Math.max(0, value - agentFees - legalFee - debt);
          state.notes.push(
            `Sold ${prop.nickname} for $${Math.round(value).toLocaleString()}: less agent ~${Math.round(SALE_AGENT_FEE_RATE * 100)}% ($${Math.round(agentFees).toLocaleString()}), legal $${legalFee.toLocaleString()}, and $${Math.round(debt).toLocaleString()} debt cleared → net proceeds ≈ $${Math.round(proceeds).toLocaleString()}.`,
          );
          client.properties.splice(idx, 1);
          client.mortgages = client.mortgages.filter((m) => m.propertyId !== prop.id);
          // Lender check at settlement: remaining properties must sit inside
          // LVR caps once this security is released. Any excess lending is
          // repaid from proceeds (pay back min(current lending, LVR limit)).
          for (const kept of client.properties) {
            const keptValue = kept.valuations.find((v) => v.id === kept.activeValuationId)?.value ?? 0;
            const cap = kept.use === 'owner-occupied' ? MAX_LVR_OWNER_OCCUPIED : MAX_LVR_INVESTMENT;
            const keptLoans = client.mortgages.filter((m) => m.propertyId === kept.id);
            const keptDebt = keptLoans.reduce((s, m) => s + m.balance, 0);
            let excess = Math.max(0, keptDebt - keptValue * cap);
            if (excess > 0.01) {
              const payDown = Math.min(excess, proceeds);
              proceeds -= payDown;
              let remaining = payDown;
              for (const loan of keptLoans.sort((a, b) => b.balance - a.balance)) {
                const pay = Math.min(remaining, loan.balance);
                loan.balance -= pay;
                remaining -= pay;
                if (remaining <= 0) break;
              }
              state.notes.push(
                `${kept.nickname} sits above the ${Math.round(cap * 100)}% LVR cap once the sold security is released — $${Math.round(payDown).toLocaleString()} of proceeds repaid to bring it inside the limit${payDown < excess ? ' (proceeds insufficient to fully clear the excess)' : ''}.`,
              );
            }
          }
          state.soldPropertyProceeds += proceeds;
        }
        break;
      }
      case 'buyProperty': {
        state.purchasedProperty = c;
        const propId = nextId('prop');
        const proceeds = c.useProceeds !== false ? state.soldPropertyProceeds : 0;
        const loanAmount = Math.max(0, c.price - proceeds);
        state.soldPropertyProceeds = Math.max(0, state.soldPropertyProceeds - (c.useProceeds !== false ? proceeds : 0));
        const prop: Property = {
          id: propId,
          nickname: c.ownerOccupied ? 'Proposed home purchase' : 'Proposed investment purchase',
          use: c.ownerOccupied ? 'owner-occupied' : 'investment',
          entity: 'personal',
          purchasePrice: c.price,
          valuations: [{ id: `${propId}-v`, value: c.price, sourceType: 'adviser-estimate', sourceName: 'Scenario purchase price' }],
          activeValuationId: `${propId}-v`,
          rentPerWeek: c.rentPerWeek ? { value: c.rentPerWeek, sourceType: 'adviser-estimate', sourceName: 'Scenario rent' } : undefined,
          ratesPerYear: Math.round(c.price * 0.0035),
          insurancePerYear: c.ownerOccupied ? 2200 : 1800,
          propertyMgmtRate: c.ownerOccupied ? undefined : 0.08,
        };
        client.properties.push(prop);
        if (loanAmount > 0) {
          const loan: MortgageFacility = {
            id: nextId('loan'),
            propertyId: propId,
            lender: 'New lending',
            entity: 'personal',
            balance: loanAmount,
            rate: state.rateAbsolute ?? client.modellingRate + state.rateDelta,
            loanType: 'floating',
            interestOnly: c.interestOnly ?? false,
            termRemainingYears: 30,
            repayment: { amount: 0, frequency: 'monthly' },
          };
          client.mortgages.push(loan);
        }
        break;
      }
      case 'setInterestOnly': {
        if (c.loanId) {
          const loan = client.mortgages.find((m) => m.id === c.loanId);
          if (loan) loan.interestOnly = c.on;
        } else {
          state.interestOnlyAll = c.on;
          for (const m of client.mortgages) m.interestOnly = c.on;
        }
        break;
      }
      case 'addRevolvingCredit': {
        state.revolving = { limit: c.limit, funded: c.funded, monthlyTransfer: c.monthlyTransfer };
        break;
      }
      case 'setKiwiSaverRate': {
        const idx = c.applicantIndex ?? 0;
        state.kiwiSaverRateOverrides[idx] = c.rate;
        const acc = client.kiwiSaverAccounts[idx];
        if (acc) acc.contributionRate = c.rate;
        break;
      }
      case 'setSalaryGrowth': state.salaryGrowthOverride = c.percent; break;
      case 'setHouseGrowth': state.houseGrowthOverride = c.percent; break;
      case 'setLivingCostDelta': {
        state.servicingOpts.livingCostDeltaMonthly =
          (state.servicingOpts.livingCostDeltaMonthly ?? 0) + c.monthly;
        break;
      }
      case 'addEvent': client.financialEvents.push(c.event); break;
      case 'setHorizonAge': state.horizonAge = c.age; break;
      case 'addIncome': {
        state.servicingOpts.extraNetAnnualIncome = [
          ...(state.servicingOpts.extraNetAnnualIncome ?? []),
          { label: c.label, amount: c.netAnnual },
        ];
        break;
      }
      case 'closeCreditCards': {
        state.servicingOpts.excludeCreditCards = true;
        client.otherDebts = client.otherDebts.filter((d) => d.kind !== 'credit-card' && d.kind !== 'store-card');
        break;
      }
      case 'lumpSumRepayment': {
        state.lumpSumRepayment += c.amount;
        // applied against the largest P&I loan
        const loans = [...client.mortgages].sort((a, b) => b.balance - a.balance);
        let remaining = c.amount;
        for (const l of loans) {
          const pay = Math.min(remaining, l.balance);
          l.balance -= pay;
          remaining -= pay;
          if (remaining <= 0) break;
        }
        break;
      }
    }
  }

  // Apply rate overrides to all mortgages
  if (state.rateAbsolute !== undefined || state.rateDelta !== 0) {
    for (const m of client.mortgages) {
      m.rate = state.rateAbsolute !== undefined ? state.rateAbsolute : m.rate + state.rateDelta;
    }
  }

  return state;
}
