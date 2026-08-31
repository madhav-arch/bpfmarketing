// Deterministic transaction categoriser. Provider enrichment (e.g. Akahu's
// personal_finance groups) is used when present; otherwise keyword rules.
// Categories align with the Fact Find so ACTUAL vs DECLARED vs BENCHMARK
// compare like-for-like.

import type { FeedTransaction } from './types';

export type SpendCategory =
  | 'Food & groceries'
  | 'Eating out & takeaways'
  | 'Utilities & phone'
  | 'Transport & fuel'
  | 'Insurance'
  | 'Rates'
  | 'Childcare & education'
  | 'Subscriptions'
  | 'Health & personal care'
  | 'Entertainment & lifestyle'
  | 'Household & garden'
  | 'Debt repayments'
  | 'Transfers & savings'
  | 'Income'
  | 'Other';

const PROVIDER_MAP: [RegExp, SpendCategory][] = [
  [/groceries|supermarket/i, 'Food & groceries'],
  [/eating out|restaurants|cafes|takeaway|food delivery/i, 'Eating out & takeaways'],
  [/utilities|power|electricity|gas|internet|telecom|phone/i, 'Utilities & phone'],
  [/fuel|transport|parking|public transport|vehicle/i, 'Transport & fuel'],
  [/insurance/i, 'Insurance'],
  [/rates|council/i, 'Rates'],
  [/education|childcare|school/i, 'Childcare & education'],
  [/subscription|streaming|software/i, 'Subscriptions'],
  [/health|pharmacy|medical|personal care/i, 'Health & personal care'],
  [/entertainment|recreation|hobbies|sport/i, 'Entertainment & lifestyle'],
  [/home|garden|hardware|furniture/i, 'Household & garden'],
  [/loan|mortgage|repayment|lending/i, 'Debt repayments'],
  [/transfer|savings|investment/i, 'Transfers & savings'],
];

const KEYWORD_MAP: [RegExp, SpendCategory][] = [
  [/countdown|woolworths|pak ?n ?save|new world|four square|fresh choice|supervalue/i, 'Food & groceries'],
  [/mcdonald|kfc|burger|subway|uber ?eats|delivereasy|menulog|cafe|coffee|sushi|pizza|takeaway|restaurant|bakery/i, 'Eating out & takeaways'],
  [/genesis|mercury|contact energy|meridian|powershop|nova|2degrees|one nz|vodafone|spark|skinny|slingshot|orcon|watercare/i, 'Utilities & phone'],
  [/\bbp\b|z energy|mobil|caltex|npd|gull|waitomo|at hop|snapper|uber(?! ?eats)|kiwirail|parking|wilson park|vtnz|wof/i, 'Transport & fuel'],
  [/aa insurance|state insur|ami\b|tower|vero|partners life|southern cross|nib\b|fidelity|cigna|asteron|insurance/i, 'Insurance'],
  [/council|rates/i, 'Rates'],
  [/kindercare|best ?start|kindy|school|kip mcgrath|childcare|after ?school|oscar/i, 'Childcare & education'],
  [/netflix|spotify|disney|neon|sky ?(tv|sport)|youtube|apple\.com|icloud|google (one|storage)|amazon prime|gym|les mills|cityfitness|snap fitness|patreon|substack/i, 'Subscriptions'],
  [/chemist|pharmacy|unichem|life pharmacy|doctor|medical|dental|physio|specsavers|hair|barber/i, 'Health & personal care'],
  [/event cinema|hoyts|ticketek|ticketmaster|bar\b|liquor|tab\b|lotto|golf|movie/i, 'Entertainment & lifestyle'],
  [/bunnings|mitre ?10|placemakers|kings plant|briscoes|farmers|kmart|warehouse(?! stationery)|ikea|spotlight/i, 'Household & garden'],
  [/loan (payment|repay)|home ?loan|mortgage|lending|afterpay|laybuy|zip pay/i, 'Debt repayments'],
  [/transfer to|savings|sharesies|investnow|hatch|kernel|simplicity invest/i, 'Transfers & savings'],
];

export function categoriseTransaction(t: FeedTransaction): SpendCategory {
  if (t.amount > 0) {
    // credits: salary/rent/etc are classified by the income detector; here we
    // only need to keep them out of spending.
    return 'Income';
  }
  if (t.providerCategory) {
    for (const [re, cat] of PROVIDER_MAP) if (re.test(t.providerCategory)) return cat;
  }
  const hay = `${t.merchant ?? ''} ${t.description}`;
  for (const [re, cat] of KEYWORD_MAP) if (re.test(hay)) return cat;
  return 'Other';
}

/** Categories excluded from "lifestyle spending" totals (not consumption). */
export const NON_SPEND_CATEGORIES: SpendCategory[] = ['Income', 'Transfers & savings', 'Debt repayments'];
