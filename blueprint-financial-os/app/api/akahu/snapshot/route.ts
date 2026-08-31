// Server-side Akahu boundary. Tokens (AKAHU_APP_TOKEN / AKAHU_USER_TOKEN)
// live in server env only — they are read here, never sent to the browser,
// and the snapshot returned is normalised + PII-redacted by mapAkahuSnapshot.
//
// Static-export note: the demo bundle is built with `output: "export"`, where
// route handlers execute once at build time. Without tokens in the build
// environment this emits a {connected:false} stub, and the client falls back
// to public/feed/live.json (written by `npm run sync:akahu`) or the demo
// feed. In `next dev` / a server deployment this runs per request against
// the live Akahu API.
//
// Production shape (documented in docs/data-sources.md): Blueprint's
// registered Akahu app + per-client OAuth consent — the same one-off
// account-information flow, with the exchange happening in routes like this
// one. Bank login credentials are never seen or stored by Blueprint.

import { mapAkahuSnapshot, type AkahuRawAccount, type AkahuRawTransaction } from '@/lib/data-sources/mapAkahu';

export const dynamic = 'force-static';

const BASE = 'https://api.akahu.io/v1';
const MONTHS = 3;

export async function GET(): Promise<Response> {
  const appToken = process.env.AKAHU_APP_TOKEN;
  const userToken = process.env.AKAHU_USER_TOKEN;
  if (!appToken || !userToken) {
    return Response.json({
      connected: false,
      reason: 'Akahu credentials are not configured on the server (AKAHU_APP_TOKEN / AKAHU_USER_TOKEN).',
    });
  }

  const headers = { Authorization: `Bearer ${userToken}`, 'X-Akahu-Id': appToken };
  const api = async (pathname: string, params: Record<string, string | undefined> = {}) => {
    const url = new URL(BASE + pathname);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Akahu ${pathname} → HTTP ${res.status}`);
    return res.json();
  };

  try {
    const end = new Date();
    const start = new Date(end.getTime());
    start.setMonth(start.getMonth() - MONTHS);
    const accounts: AkahuRawAccount[] = (await api('/accounts')).items ?? [];
    const transactions: AkahuRawTransaction[] = [];
    let cursor: string | undefined;
    do {
      const page = await api('/transactions', { start: start.toISOString(), end: end.toISOString(), cursor });
      transactions.push(...(page.items ?? []));
      cursor = page.cursor?.next ?? undefined;
    } while (cursor);
    return Response.json(mapAkahuSnapshot(accounts, transactions, { months: MONTHS }));
  } catch (e) {
    return Response.json({ connected: false, reason: e instanceof Error ? e.message : 'Akahu request failed.' });
  }
}
