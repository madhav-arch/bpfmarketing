// Pull a live bank-feed snapshot from Akahu and write it (normalised and
// PII-redacted) to lib/data/feed/live.json, where the app picks it up.
//
// Run with:  npm run sync:akahu            (optionally: -- --months 3)
//
// Setup (Akahu "Personal App" — the fastest path for a prototype):
//   1. Create an account at https://my.akahu.nz and connect your bank(s).
//   2. Create a Personal App at https://developers.akahu.nz → copy the
//      App Token (app_token_…) and User Token (user_token_…).
//   3. Put them in blueprint-financial-os/.env.local:
//        AKAHU_APP_TOKEN=app_token_xxx
//        AKAHU_USER_TOKEN=user_token_xxx
//
// Credentials never leave this machine and are never written to the snapshot;
// account numbers are redacted at the mapping boundary; the snapshot file is
// git-ignored. Never commit real client data.
import fs from 'node:fs';
import path from 'node:path';
import { mapAkahuSnapshot, type AkahuRawAccount, type AkahuRawTransaction } from '../lib/data-sources/mapAkahu.ts';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const APP_TOKEN = process.env.AKAHU_APP_TOKEN;
const USER_TOKEN = process.env.AKAHU_USER_TOKEN;
const monthsArg = process.argv.indexOf('--months');
const MONTHS = monthsArg > -1 ? parseInt(process.argv[monthsArg + 1], 10) || 3 : 3;

if (!APP_TOKEN || !USER_TOKEN) {
  console.error(
    'Missing Akahu credentials.\n' +
      'Add AKAHU_APP_TOKEN and AKAHU_USER_TOKEN to blueprint-financial-os/.env.local\n' +
      '(create a Personal App at https://developers.akahu.nz — see the comments in scripts/akahu-pull.ts).',
  );
  process.exit(1);
}

const BASE = 'https://api.akahu.io/v1';
const headers = { Authorization: `Bearer ${USER_TOKEN}`, 'X-Akahu-Id': APP_TOKEN };

async function api(pathname: string, params: Record<string, string | undefined> = {}) {
  const url = new URL(BASE + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Akahu ${pathname} → HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function allTransactions(start: string, end: string): Promise<AkahuRawTransaction[]> {
  const items: AkahuRawTransaction[] = [];
  let cursor: string | undefined;
  do {
    const page = await api('/transactions', { start, end, cursor });
    items.push(...(page.items ?? []));
    cursor = page.cursor?.next ?? undefined;
  } while (cursor);
  return items;
}

const end = new Date();
const start = new Date(end.getTime());
start.setMonth(start.getMonth() - MONTHS);

console.log(`Pulling Akahu accounts + ${MONTHS} months of transactions…`);
const accounts: AkahuRawAccount[] = (await api('/accounts')).items ?? [];
const transactions = await allTransactions(start.toISOString(), end.toISOString());
console.log(`  ${accounts.length} accounts, ${transactions.length} transactions`);

const snapshot = mapAkahuSnapshot(accounts, transactions, { months: MONTHS });
const dest = path.join(root, 'public', 'feed', 'live.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(snapshot, null, 2));
console.log(`Wrote ${dest} (${snapshot.accounts.length} accounts, ${snapshot.transactions.length} transactions).`);
console.log('Restart the app — the Live Data panel will load this snapshot.');
