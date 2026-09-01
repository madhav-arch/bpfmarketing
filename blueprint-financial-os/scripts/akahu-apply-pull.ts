// Akahu Apply automation — the one-off client data flow, end to end.
//
//   npm run apply:invite -- --reference "Jane & Sam"   create an application +
//                                                      sharing request, print
//                                                      the link to send
//   npm run apply:pull                                 pull the most recent
//                                                      application's data →
//                                                      public/feed/live.json
//   npm run apply:pull -- --application app_xxx        pull a specific one
//
// Requires AKAHU_APPLY_API_KEY in .env.local (generated in the Akahu Apply
// portal under Settings → Manage API keys; Bearer auth). The key and the raw
// report never leave this machine; only the PII-redacted FeedSnapshot is
// written, to a git-ignored path. Endpoints per developers.akahu.nz Apply
// API reference (verified 2026-09-01):
//   POST /v1/applications {reference}
//   POST /v1/applications/{id}/sharing-request {requested_days, ...}
//   GET  /v1/applications/{id}/resources
//   POST /v1/applications/{id}/reports
//   GET  /v1/applications/{id}/reports/{reportId}
//   GET  /v1/applications/{id}/reports/{reportId}/json
import fs from 'node:fs';
import path from 'node:path';
import { mapApplyReport, type ApplyReportJson } from '../lib/data-sources/mapApply.ts';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const API_KEY = process.env.AKAHU_APPLY_API_KEY;
if (!API_KEY) {
  console.error('Missing AKAHU_APPLY_API_KEY in blueprint-financial-os/.env.local (Akahu Apply portal → Settings → Manage API keys).');
  process.exit(1);
}

const BASE = 'https://api.apply.akahu.nz';
const STATE_FILE = path.join(root, '.akahu-apply.json'); // git-ignored

async function api(method: string, pathname: string, body?: unknown) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${pathname} → HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

interface StoredApp {
  applicationId: string;
  reference: string;
  link?: string;
  createdAt: string;
}

function loadState(): StoredApp[] {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function saveState(apps: StoredApp[]) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(apps, null, 2));
}

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
};
const mode = argv.includes('--create') || argv.includes('--invite') || flag('reference') ? 'invite' : 'pull';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function invite() {
  const reference = flag('reference') ?? `Blueprint client ${new Date().toISOString().slice(0, 10)}`;
  const days = parseInt(flag('days') ?? '180', 10);
  console.log(`Creating Akahu Apply application "${reference}"…`);
  const app = await api('POST', '/v1/applications', { reference });
  console.log(`  application: ${app._id}`);
  const sr = await api('POST', `/v1/applications/${app._id}/sharing-request`, {
    requested_days: Math.min(730, Math.max(30, days)),
    allow_manual_uploads: true,
  });
  const apps = loadState();
  apps.push({ applicationId: app._id, reference, link: sr.link, createdAt: new Date().toISOString() });
  saveState(apps);
  console.log('\nSend this link to the client (expires ' + (sr.expires_at ?? 'per portal settings') + '):');
  console.log(`  ${sr.link}`);
  console.log('\nOnce they have submitted, run:  npm run apply:pull');
}

async function pull() {
  const apps = loadState();
  const applicationId = flag('application') ?? apps[apps.length - 1]?.applicationId;
  if (!applicationId) {
    console.error('No application on record. Run `npm run apply:invite -- --reference "Name"` first, or pass --application app_xxx (visible in the Akahu Apply portal URL).');
    process.exit(1);
  }
  const reference = apps.find((a) => a.applicationId === applicationId)?.reference ?? applicationId;
  console.log(`Pulling application ${applicationId} ("${reference}")…`);

  // 1. wait for resources to finish processing
  for (let i = 0; i < 36; i++) {
    const { items } = await api('GET', `/v1/applications/${applicationId}/resources`);
    const statuses = (items as { status: string }[]).map((r) => r.status);
    if (items.length === 0) {
      console.error('No resources on this application yet — the client has not submitted data. Send them the sharing link first.');
      process.exit(1);
    }
    const pending = statuses.filter((s) => s !== 'completed' && s !== 'failed').length;
    console.log(`  resources: ${statuses.length} total, ${statuses.filter((s) => s === 'completed').length} completed, ${pending} processing`);
    if (pending === 0) break;
    if (i === 35) {
      console.error('Resources still processing after 3 minutes — try again shortly.');
      process.exit(1);
    }
    await sleep(5000);
  }

  // 2. generate a report and poll to completion
  const report = await api('POST', `/v1/applications/${applicationId}/reports`);
  console.log(`  report: ${report._id} (${report.status})`);
  let status = report.status;
  for (let i = 0; i < 60 && status !== 'completed' && status !== 'failed'; i++) {
    await sleep(5000);
    const r = await api('GET', `/v1/applications/${applicationId}/reports/${report._id}`);
    status = r.status;
    console.log(`  report status: ${status}`);
  }
  if (status !== 'completed') {
    console.error('Report did not complete — check the application in the Akahu Apply portal.');
    process.exit(1);
  }

  // 3. download the full dataset and normalise + redact
  const json = (await api('GET', `/v1/applications/${applicationId}/reports/${report._id}/json`)) as ApplyReportJson;
  console.log(`  dataset: ${json.accounts.length} accounts, ${json.transactions.length} transactions, ${(json.insights ?? []).length} insights`);
  const snapshot = mapApplyReport(json, { reference });
  const dest = path.join(root, 'public', 'feed', 'live.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${dest}`);
  console.log(`  ${snapshot.accounts.length} accounts · ${snapshot.transactions.length} transactions · ${snapshot.monthsCovered} months`);
  console.log('Restart the dev server, or rebuild the bundle — the app picks this snapshot up automatically.');
}

(mode === 'invite' ? invite() : pull()).catch((e) => {
  console.error(String(e));
  process.exit(1);
});
