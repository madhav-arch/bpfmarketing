import type { Frequency } from '../domain/types';
import { describeChange, type ScenarioChange } from '../scenarios/changes';
import type { ParseContext, ParseResult, ProposedChange, ScenarioCopilot } from './copilot';

// ---------------------------------------------------------------------------
// Deterministic natural-language → ScenarioChange parser. No LLM required for
// the demo; an LLM provider can replace this behind the same interface.

const NUM = String.raw`\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m|grand)?`;

function parseAmount(numStr: string, suffix?: string): number {
  const n = parseFloat(numStr.replace(/,/g, ''));
  if (!suffix) return n;
  const s = suffix.toLowerCase();
  if (s === 'k' || s === 'grand') return n * 1_000;
  if (s === 'm') return n * 1_000_000;
  return n;
}

/** "850k" → 850,000; "1.2m"/"1.2 million" → 1,200,000; bare "850" in a price context → 850,000 */
function parsePrice(numStr: string, suffix?: string): number {
  let v = parseAmount(numStr, suffix);
  if (!suffix && v < 20) v *= 1_000_000; // "buy for 1.2"
  else if (!suffix && v < 5000) v *= 1_000; // "buy for 850"
  return v;
}

function freqOf(text: string): Frequency {
  if (/fortnight/i.test(text)) return 'fortnightly';
  if (/week/i.test(text)) return 'weekly';
  if (/year|annual/i.test(text)) return 'annual';
  return 'monthly';
}

interface Rule {
  pattern: RegExp;
  build: (m: RegExpMatchArray, ctx: ParseContext, utterance: string) => ScenarioChange[] | null;
}

const RULES: Rule[] = [
  // --- Repayments -----------------------------------------------------------
  {
    pattern: new RegExp(String.raw`(increase|raise|bump|add|extra|up)\s+(?:the\s+)?(?:mortgage\s+)?repayments?\s*(?:by\s*)?${NUM}(?:\s*(?:a|per|\/)\s*(week|fortnight|month|year))?`, 'i'),
    build: (m) => [{ kind: 'adjustRepayment', delta: parseAmount(m[2], m[3]), frequency: freqOf(m[4] ?? 'fortnight') }],
  },
  {
    pattern: new RegExp(String.raw`(reduce|drop|lower|decrease)\s+(?:the\s+)?repayments?\s*(?:by\s*)?${NUM}(?:\s*(?:a|per|\/)\s*(week|fortnight|month|year))?`, 'i'),
    build: (m) => [{ kind: 'adjustRepayment', delta: -parseAmount(m[2], m[3]), frequency: freqOf(m[4] ?? 'fortnight') }],
  },
  {
    pattern: new RegExp(String.raw`(?:pay|put)\s+(?:an?\s+)?(?:extra\s+)?${NUM}\s*(?:extra\s*)?(?:a|per|\/)\s*(week|fortnight|month)\s+(?:on|onto|off|towards?)\s+the\s+mortgage`, 'i'),
    build: (m) => [{ kind: 'adjustRepayment', delta: parseAmount(m[1], m[2]), frequency: freqOf(m[3]) }],
  },
  // --- Lump sums / revolving credit ----------------------------------------
  {
    pattern: new RegExp(String.raw`(?:put|chuck|move|park)\s+${NUM}\s+(?:in|into)\s+(?:a\s+)?(?:the\s+)?revolving`, 'i'),
    build: (m) => {
      const amt = parseAmount(m[1], m[2]);
      return [{ kind: 'addRevolvingCredit', limit: Math.max(amt * 1.5, amt + 25_000), funded: amt }];
    },
  },
  {
    pattern: new RegExp(String.raw`(?:add|set\s*up|create)\s+(?:a\s+)?${NUM}\s+revolving(?:\s+credit)?`, 'i'),
    build: (m) => {
      const amt = parseAmount(m[1], m[2]);
      return [{ kind: 'addRevolvingCredit', limit: amt, funded: Math.round(amt * 0.6) }];
    },
  },
  {
    pattern: new RegExp(String.raw`lump\s*sum\s+(?:of\s+)?${NUM}|(?:pay|put)\s+${NUM}\s+(?:straight\s+)?(?:off|onto)\s+the\s+(?:mortgage|loan)`, 'i'),
    build: (m) => {
      const amt = m[1] ? parseAmount(m[1], m[2]) : parseAmount(m[3], m[4]);
      return [{ kind: 'lumpSumRepayment', amount: amt }];
    },
  },
  // --- Purchase price / deposit --------------------------------------------
  {
    pattern: new RegExp(String.raw`(?:buy|purchase|go|offer)(?:ing)?\s+(?:it\s+)?(?:a\s+house\s+)?(?:for|at)\s+${NUM}(\s*million)?\s*(?:instead)?`, 'i'),
    build: (m) => {
      let v = parseAmount(m[1], m[2]);
      if (m[3] || (!m[2] && v < 20)) v = v < 20 ? v * 1_000_000 : v;
      else if (!m[2] && v < 5000) v *= 1_000;
      return [{ kind: 'setPurchasePrice', value: v }];
    },
  },
  {
    pattern: new RegExp(String.raw`purchase\s+price\s*(?:to|of|→|at)?\s*${NUM}`, 'i'),
    build: (m) => [{ kind: 'setPurchasePrice', value: parsePrice(m[1], m[2]) }],
  },
  {
    pattern: /(?:use|with|at|compare)?\s*a?\s*(\d{1,2})\s*(?:%|percent)\s+deposit/i,
    build: (m) => [{ kind: 'setDepositPercent', value: parseInt(m[1], 10) / 100 }],
  },
  {
    pattern: /compare\s+a?\s*(\d{1,2})\s*%?\s+and\s+a?\s*(\d{1,2})\s*(?:%|percent)\s+deposit/i,
    build: (m) => [{ kind: 'setDepositPercent', value: parseInt(m[2], 10) / 100 }],
  },
  // --- Rates ----------------------------------------------------------------
  {
    pattern: /(?:interest\s+)?rates?\s+(?:go(?:es)?|rise|move|jump)(?:s|ing)?\s+(?:up\s+)?to\s+([\d.]+)\s*%|(?:interest\s+)?rates?\s+(?:at|to|→)\s+([\d.]+)\s*%/i,
    build: (m) => [{ kind: 'setRateAbsolute', value: parseFloat(m[1] ?? m[2]) / 100 }],
  },
  {
    pattern: /rates?\s+(?:go\s+)?(up|down)\s+(?:by\s+)?([\d.]+)\s*%/i,
    build: (m) => [{ kind: 'setRateDelta', delta: (m[1].toLowerCase() === 'up' ? 1 : -1) * parseFloat(m[2]) / 100 }],
  },
  {
    pattern: /what\s+if\s+(?:interest\s+)?rates?\s+(?:were|hit|reach)\s+([\d.]+)\s*%?/i,
    build: (m) => [{ kind: 'setRateAbsolute', value: parseFloat(m[1]) / 100 }],
  },
  // --- Boarders / flatmates -------------------------------------------------
  {
    pattern: new RegExp(String.raw`(?:add|with|have|get)\s+(?:a|another|two|2)?\s*(?:boarder|flat\s*mate|flatmate)s?\s+(?:each\s+)?paying\s+${NUM}(?:\s*(?:a|per|\/)\s*week)?`, 'i'),
    build: (m, _ctx, utterance) => {
      const two = /another|two|2\s*(?:boarders|flatmates)/i.test(utterance);
      return [{ kind: 'setBoarder', perWeek: parseAmount(m[1], m[2]), count: two ? 2 : 1 }];
    },
  },
  {
    pattern: /(?:remove|drop|no)\s+(?:the\s+)?(?:boarder|flatmate)/i,
    build: () => [{ kind: 'removeBoarder' }],
  },
  // --- Rent -----------------------------------------------------------------
  {
    pattern: new RegExp(String.raw`(?:rental?|rent)\s+(?:gets?|at|to|of|→|goes\s+(?:up\s+)?to)\s+${NUM}(?:\s*(?:a|per|\/)\s*week)?`, 'i'),
    build: (m) => [{ kind: 'setRent', perWeek: parseAmount(m[1], m[2]) }],
  },
  // --- Sell / buy -----------------------------------------------------------
  {
    pattern: new RegExp(String.raw`sell\s+(?:the\s+)?([\w\s'-]+?)\s+for\s+${NUM}`, 'i'),
    build: (m, ctx) => {
      const namePart = m[1].trim().toLowerCase();
      const prop =
        ctx.client.properties.find((p) => p.nickname.toLowerCase().includes(namePart)) ??
        ctx.client.properties.find((p) => p.use === 'investment') ??
        ctx.client.properties[0];
      if (!prop) return null;
      return [{ kind: 'sellProperty', propertyId: prop.id, price: parsePrice(m[2], m[3]) }];
    },
  },
  {
    pattern: new RegExp(String.raw`sell\s+(?:the\s+)?(rental|investment|first\s+property|home)`, 'i'),
    build: (m, ctx) => {
      const wantHome = /home/i.test(m[1]);
      const prop = ctx.client.properties.find((p) => (wantHome ? p.use === 'owner-occupied' : p.use === 'investment'));
      if (!prop) return null;
      return [{ kind: 'sellProperty', propertyId: prop.id }];
    },
  },
  {
    pattern: new RegExp(String.raw`buy\s+(?:another|an?|the\s+next)\s+(?:rental|investment)(?:\s+property)?\s+(?:for|at)\s+${NUM}(?:.*?(?:rent(?:ing)?|@)\s*(?:for|at|of)?\s*${NUM}(?:\s*(?:a|per|\/)\s*week)?)?`, 'i'),
    build: (m) => [{
      kind: 'buyProperty',
      price: parsePrice(m[1], m[2]),
      rentPerWeek: m[3] ? parseAmount(m[3], m[4]) : undefined,
      interestOnly: true,
    }],
  },
  {
    pattern: new RegExp(String.raw`(?:buy|purchase)\s+(?:an?\s+)?(?:owner[-\s]occupied|new)\s+home\s+(?:for|at)\s+${NUM}`, 'i'),
    build: (m) => [{ kind: 'buyProperty', price: parsePrice(m[1], m[2]), ownerOccupied: true }],
  },
  // --- Interest only --------------------------------------------------------
  {
    pattern: /(?:make|switch|put)\s+(?:the\s+)?(?:next\s+loan|new\s+loan|loans?|it|everything)\s+(?:to\s+)?interest[-\s]only/i,
    build: () => [{ kind: 'setInterestOnly', on: true }],
  },
  {
    pattern: /(?:switch|back)\s+to\s+p\s*(?:&|and)\s*i/i,
    build: () => [{ kind: 'setInterestOnly', on: false }],
  },
  // --- KiwiSaver ------------------------------------------------------------
  {
    pattern: /kiwi\s*saver\s+(?:contribution\s+)?(?:rate\s+)?(?:from\s+[\d.]+\s*%?\s+)?to\s+([\d.]+)\s*%/i,
    build: (m) => [{ kind: 'setKiwiSaverRate', rate: parseFloat(m[1]) / 100 }],
  },
  // --- Growth assumptions ---------------------------------------------------
  {
    pattern: /salary\s+(?:increases?|grows?|growth)\s+(?:of\s+|by\s+|at\s+)?([\d.]+)\s*%(?:\s*(?:per|a|\/)\s*year)?/i,
    build: (m) => [{ kind: 'setSalaryGrowth', percent: parseFloat(m[1]) / 100 }],
  },
  {
    pattern: /(?:house|property|home)s?\s+(?:price\s+)?(?:grows?|growth|increases?|appreciates?)\s+(?:of\s+|by\s+|at\s+)?([\d.]+)\s*%/i,
    build: (m) => [{ kind: 'setHouseGrowth', percent: parseFloat(m[1]) / 100 }],
  },
  // --- Events ---------------------------------------------------------------
  {
    pattern: /childcare\s+(?:finishes?|ends?|stops?)(?:\s+in\s+(\w+\s+\d{4}|\d{4}))?/i,
    build: (m, ctx) => {
      const childcare = ctx.client.expenses.fixedCommitmentsMonthly.find((f) => /childcare/i.test(f.label));
      const when = m[1] ?? '2029';
      return [
        { kind: 'setLivingCostDelta', monthly: -(childcare?.amount ?? 800), label: `Childcare ends (${when})` },
        {
          kind: 'addEvent',
          event: {
            id: `evt-childcare-end-${Date.now()}`,
            kind: 'childcare-end',
            label: `Childcare finishes (${when})`,
            startDate: /\d{4}/.test(when) ? `${when.match(/\d{4}/)![0]}-03-01` : '2029-03-01',
            monthlyImpact: childcare?.amount ?? 800,
          },
        },
      ];
    },
  },
  {
    pattern: /(?:model\s+)?(?:(\d+|six|three|twelve)\s+months?\s+(?:of\s+)?)?(?:parental|maternity)\s+leave/i,
    build: (m, ctx) => {
      const words: Record<string, number> = { three: 3, six: 6, twelve: 12 };
      const months = m[1] ? words[m[1].toLowerCase()] ?? parseInt(m[1], 10) : 6;
      const secondary = ctx.client.applicants[1] ?? ctx.client.applicants[0];
      const lost = secondary.incomes.reduce((s, i) => s + i.grossAnnual, 0) / 12 * 0.7;
      const start = new Date();
      const end = new Date(start.getTime());
      end.setMonth(end.getMonth() + months);
      return [
        { kind: 'setLivingCostDelta', monthly: Math.round(lost * (months / 12)), label: `Parental leave (${months}mo, annualised)` },
        {
          kind: 'addEvent',
          event: {
            id: `evt-parental-${Date.now()}`,
            kind: 'parental-leave',
            label: `Parental leave — ${months} months`,
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
            monthlyImpact: -Math.round(lost),
          },
        },
      ];
    },
  },
  // --- Horizon --------------------------------------------------------------
  {
    pattern: /(?:position|show\s+me.*)\s+at\s+age\s+(\d{2})/i,
    build: (m) => [{ kind: 'setHorizonAge', age: parseInt(m[1], 10) }],
  },
  // --- Cards / income -------------------------------------------------------
  {
    pattern: /close\s+(?:the\s+)?credit\s+cards?|remove\s+(?:the\s+)?(?:credit\s+)?card\s+limits?/i,
    build: () => [{ kind: 'closeCreditCards' }],
  },
  {
    pattern: new RegExp(String.raw`(?:add|include|with)\s+([\w\s]+?)\s+income\s+(?:of\s+)?${NUM}(?:\s*(?:a|per|\/)\s*year)?`, 'i'),
    build: (m) => [{ kind: 'addIncome', label: `${m[1].trim()} income`, netAnnual: parseAmount(m[2], m[3]) }],
  },
];

export class LocalParser implements ScenarioCopilot {
  readonly name = 'Blueprint local parser (deterministic)';

  parse(utterance: string, ctx: ParseContext): ParseResult {
    const changes: ProposedChange[] = [];
    const matchedSpans: [number, number][] = [];
    // Split on connectors so several asks in one line all match.
    const segments = utterance.split(/(?:\band\b|[;,]|\bthen\b|\bplus\b)/i);
    const tryText = (text: string) => {
      for (const rule of RULES) {
        const m = text.match(rule.pattern);
        if (m) {
          const built = rule.build(m, ctx, text);
          if (built) {
            for (const change of built) changes.push({ change, chip: describeChange(change) });
            return true;
          }
        }
      }
      return false;
    };

    // whole utterance first (multi-clause patterns), then segments
    const wholeMatched = tryText(utterance);
    if (!wholeMatched || segments.length > 1) {
      for (const seg of segments) {
        if (seg.trim().length < 4) continue;
        tryText(seg.trim());
      }
    }
    void matchedSpans;

    // de-duplicate identical chips
    const seen = new Set<string>();
    const deduped = changes.filter((c) => {
      if (seen.has(c.chip)) return false;
      seen.add(c.chip);
      return true;
    });

    return {
      changes: deduped,
      unrecognised: deduped.length === 0 ? utterance : undefined,
      commentary:
        deduped.length === 0
          ? 'I couldn’t map that to a modelling change. Try e.g. “Increase repayments by $500 a fortnight”, “What if they buy for $850k”, “Add a boarder paying $250 per week”.'
          : undefined,
    };
  }
}

export const localParser = new LocalParser();
