import { describe, expect, it } from 'vitest';
import { demoFhb, demoHomeowner, demoInvestor, PRESET_SCENARIOS } from '../lib/data/demoClients';
import { applyScenario } from '../lib/scenarios/apply';
import { computeAll } from '../lib/scenarios/compute';
import { explainChange } from '../lib/scenarios/diff';
import { DEFAULT_RULE_CONTEXT } from '../lib/rules/context';
import { localParser } from '../lib/ai/localParser';
import { scenarioChangeSchema } from '../lib/scenarios/changes';
import { generateInsights } from '../lib/insights/engine';
import { buildMeetingSummary } from '../lib/summary/meetingSummary';

const ctx = DEFAULT_RULE_CONTEXT;

describe('scenario engine', () => {
  it('baseline is never mutated by applying changes', () => {
    const before = JSON.stringify(demoHomeowner);
    const state = applyScenario(demoHomeowner, [
      { kind: 'adjustRepayment', delta: 500, frequency: 'fortnightly' },
      { kind: 'setRateDelta', delta: 0.01 },
    ]);
    expect(JSON.stringify(demoHomeowner)).toBe(before);
    expect(state.client.mortgages[0].rate).toBeCloseTo(demoHomeowner.mortgages[0].rate + 0.01, 10);
  });

  it('repayment increase pulls the mortgage-free date forward and saves interest', () => {
    const base = computeAll(applyScenario(demoHomeowner, []), ctx);
    const alt = computeAll(
      applyScenario(demoHomeowner, [{ kind: 'adjustRepayment', delta: 500, frequency: 'fortnightly' }]),
      ctx,
    );
    expect(alt.amortisation.blueprint.termYears).toBeLessThan(base.amortisation.blueprint.termYears - 2);
    expect(alt.amortisation.blueprint.totalInterest).toBeLessThan(base.amortisation.blueprint.totalInterest - 50_000);
    const diffs = explainChange(base, alt);
    expect(diffs.find((d) => d.label === 'Mortgage-free date')).toBeTruthy();
    expect(diffs.find((d) => d.label === 'Lifetime interest')!.delta).toBeLessThan(0);
  });

  it('boarder increases FHB borrowing capacity', () => {
    const base = computeAll(applyScenario(demoFhb, []), ctx);
    const alt = computeAll(applyScenario(demoFhb, [{ kind: 'setBoarder', perWeek: 250, count: 1 }]), ctx);
    expect(alt.servicing.maxNewLending).toBeGreaterThan(base.servicing.maxNewLending + 80_000);
  });

  it('sell + buy scenario reshapes the investor portfolio', () => {
    const preset = PRESET_SCENARIOS['demo-investor'].find((p) => p.id === 'inv-sell-buy')!;
    const state = applyScenario(demoInvestor, preset.changes);
    expect(state.client.properties.find((p) => p.id === 'inv-r2')).toBeUndefined();
    expect(state.client.properties.some((p) => p.nickname.includes('Proposed investment'))).toBe(true);
    const result = computeAll(state, ctx);
    expect(result.investment).toBeTruthy();
    expect(result.investment!.grossYield).toBeCloseTo((1_250 * 52) / 820_000, 4);
  });

  it('rate shock at 7% raises FHB repayments', () => {
    const base = computeAll(applyScenario(demoFhb, []), ctx);
    const shocked = computeAll(applyScenario(demoFhb, [{ kind: 'setRateAbsolute', value: 0.07 }]), ctx);
    expect(shocked.fhb!.repaymentMonthly).toBeGreaterThan(base.fhb!.repaymentMonthly);
  });

  it('closing credit cards releases servicing', () => {
    const base = computeAll(applyScenario(demoFhb, []), ctx);
    const closed = computeAll(applyScenario(demoFhb, [{ kind: 'closeCreditCards' }]), ctx);
    expect(closed.servicing.umi).toBeCloseTo(base.servicing.umi + 7_000 * 0.03, 0);
  });

  it('every module produces audit lines and rule set ids', () => {
    const result = computeAll(applyScenario(demoHomeowner, []), ctx);
    expect(result.servicing.audit.length).toBeGreaterThan(3);
    expect(result.equity.properties[0].audit.length).toBeGreaterThan(3);
    expect(result.ruleSetIds).toContain(ctx.policy.id);
    expect(result.refinance).toBeTruthy();
    expect(result.refinance!.taxSavingAnnual).toBe(6_000);
  });
});

describe('local NL parser', () => {
  const cases: [string, string][] = [
    ['Increase repayments by $500 a fortnight', 'adjustRepayment'],
    ['What if they buy for $850k instead?', 'setPurchasePrice'],
    ['What if interest rates go to 7%?', 'setRateAbsolute'],
    ['Put $50k into revolving credit.', 'addRevolvingCredit'],
    ['Add a boarder paying $250 per week', 'setBoarder'],
    ['What if this rental gets $700 a week?', 'setRent'],
    ['Compare a 10% and 20% deposit', 'setDepositPercent'],
    ['Assume salary increases 3% per year', 'setSalaryGrowth'],
    ['Assume the house grows 3% per year', 'setHouseGrowth'],
    ['Make the next loan interest only', 'setInterestOnly'],
    ['Show me their position at age 50', 'setHorizonAge'],
    ['What if they switch KiwiSaver contribution from 3.5% to 6%?', 'setKiwiSaverRate'],
    ['What happens when childcare finishes in March 2029?', 'setLivingCostDelta'],
    ['Model six months of parental leave', 'setLivingCostDelta'],
    ['Close the credit cards', 'closeCreditCards'],
  ];

  for (const [utterance, expectedKind] of cases) {
    it(`parses: "${utterance}"`, () => {
      const res = localParser.parse(utterance, { client: demoFhb });
      expect(res.changes.length).toBeGreaterThan(0);
      expect(res.changes.map((c) => c.change.kind)).toContain(expectedKind);
      // every emitted change validates against the schema — the AI contract
      for (const c of res.changes) expect(() => scenarioChangeSchema.parse(c.change)).not.toThrow();
    });
  }

  it('parses sell-to-buy on the investor', () => {
    const res = localParser.parse('Sell the townhouse for $580k and use the proceeds toward the next purchase', {
      client: demoInvestor,
    });
    expect(res.changes.some((c) => c.change.kind === 'sellProperty')).toBe(true);
  });

  it('never fabricates a change from unrelated text', () => {
    const res = localParser.parse('tell me a joke about mortgages', { client: demoFhb });
    expect(res.changes.length).toBe(0);
    expect(res.unrecognised).toBeTruthy();
  });
});

describe('insights + summary', () => {
  it('flags credit-card drag and suspicious expenses for the FHB', () => {
    const result = computeAll(applyScenario(demoFhb, []), ctx);
    const insights = generateInsights(demoFhb, result, ctx);
    expect(insights.some((i) => i.id === 'cards-drag')).toBe(true);
    expect(insights.some((i) => i.category === 'expenses')).toBe(true);
    expect(insights.every((i) => i.sourceRuleSetId.length > 0)).toBe(true);
  });

  it('surfaces the valuation-spread opportunity for the homeowner', () => {
    const result = computeAll(applyScenario(demoHomeowner, []), ctx);
    const insights = generateInsights(demoHomeowner, result, ctx);
    expect(insights.some((i) => i.id.startsWith('valuation-spread'))).toBe(true);
  });

  it('meeting summary contains only engine-derived figures and the draft disclaimer', () => {
    const baseline = computeAll(applyScenario(demoHomeowner, []), ctx);
    const changes = PRESET_SCENARIOS['demo-homeowner'][1].changes;
    const state = applyScenario(demoHomeowner, changes);
    const selected = computeAll(state, ctx);
    const summary = buildMeetingSummary({
      client: demoHomeowner,
      scenarioName: 'Faster repayment',
      changes,
      baseline,
      selected,
      diffs: explainChange(baseline, selected),
      rationale: { benefits: ['b'], risks: ['r'], considerations: ['c'] },
    });
    expect(summary).toContain('Adviser review required');
    expect(summary).toContain('illustrative modelling');
    expect(summary).toContain(`$${Math.round(selected.servicing.umi).toLocaleString()}`);
  });
});

describe('sell-home-and-buy (compound adviser prompt)', () => {
  it('parses "sell my house … and buy another home for $1.6m"', () => {
    const res = localParser.parse(
      'what would happen if I was to sell my house (account for lawyer, agent fees) and buy another home for $1.6m and hold the investment?',
      { client: demoHomeowner },
    );
    const kinds = res.changes.map((c) => c.change.kind);
    expect(kinds).toContain('sellProperty');
    expect(kinds).toContain('buyProperty');
    const sell = res.changes.find((c) => c.change.kind === 'sellProperty')!.change as { propertyId: string };
    expect(sell.propertyId).toBe('home'); // the owner-occupied one, not the rental
  });

  it('explains the missing purchase price instead of failing silently', () => {
    const res = localParser.parse(
      'what would happen if I was to sell my house (account for lawyer, agent fees) and buy another one and hold the investment?',
      { client: demoHomeowner },
    );
    expect(res.changes.some((c) => c.change.kind === 'sellProperty')).toBe(true);
    expect(res.commentary).toMatch(/price/i);
  });

  it('sale clears home debt, deducts agent+legal, keeps the rental, funds the purchase', () => {
    const state = applyScenario(demoHomeowner, [
      { kind: 'sellProperty', propertyId: 'home' },
      { kind: 'buyProperty', price: 1_600_000, ownerOccupied: true },
    ]);
    // home gone, rental retained with its loan (62% LVR — under the 70% cap)
    expect(state.client.properties.find((p) => p.id === 'home')).toBeUndefined();
    expect(state.client.properties.find((p) => p.id === 'rental')).toBeTruthy();
    expect(state.client.mortgages.find((m) => m.id === 'loan-rental')!.balance).toBe(447_119);
    // proceeds: 1,470,000 − 3% agent (44,100) − 1,500 legal − 529,587 home loans = 894,813
    const buyLoan = state.client.mortgages.find((m) => m.lender === 'New lending')!;
    expect(buyLoan.balance).toBeCloseTo(1_600_000 - 894_813, 0);
    const result = computeAll(state, ctx);
    expect(result.equity.properties).toHaveLength(2);
  });

  it('repays lending above the 70% LVR cap on a retained investment from proceeds', () => {
    const over = structuredClone(demoHomeowner);
    over.mortgages.find((m) => m.id === 'loan-rental')!.balance = 560_000; // 78% LVR on $720k
    const state = applyScenario(over, [{ kind: 'sellProperty', propertyId: 'home' }]);
    const rentalLoan = state.client.mortgages.find((m) => m.id === 'loan-rental')!;
    expect(rentalLoan.balance).toBeCloseTo(720_000 * 0.7, 0); // paid down to the cap
    expect(state.notes.some((n) => n.includes('LVR cap'))).toBe(true);
  });
});
