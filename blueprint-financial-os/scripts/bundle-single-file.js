#!/usr/bin/env node
// Collapse the static export in /out into ONE self-contained HTML file
// (all JS chunks, CSS and fonts inlined) so the prototype can be opened or
// hosted anywhere with zero setup.
//
// Usage:
//   STATIC_EXPORT=1 npm run build
//   npm run bundle          → dist/blueprint-financial-os-single.html
//
// Turbopack chunks normally identify themselves via their <script src>; once
// inlined that is gone, so we feed the runtime its documented escape hatch,
// globalThis.TURBOPACK_NEXT_CHUNK_URLS (popped per registration, hence the
// reversed order below).
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'out');
const distDir = path.resolve(__dirname, '..', 'dist');
if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  console.error('No static export found. Run: STATIC_EXPORT=1 npm run build');
  process.exit(1);
}
let html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');

const read = (url) => fs.readFileSync(path.join(outDir, url.replace(/^\//, '')), 'utf8');
const readB64 = (url) => fs.readFileSync(path.join(outDir, url.replace(/^\//, ''))).toString('base64');

// 1. Inline stylesheets; embed referenced font files as data URIs.
html = html.replace(/<link rel="stylesheet" href="(\/_next\/[^"]+\.css)"[^>]*\/?>/g, (_, href) => {
  const css = read(href).replace(
    /url\((\/_next\/static\/media\/[^)]+?\.(woff2|woff|ttf))\)/g,
    (_m, u, ext) => {
      const mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : 'font/ttf';
      return `url(data:${mime};base64,${readB64(u)})`;
    },
  );
  return `<style>${css}</style>`;
});

// 2. Inline scripts in document order, tracking chunk registrations.
const chunkUrlsInOrder = [];
let firstScript = true;
html = html.replace(/<script src="(\/_next\/(static\/chunks\/[^"]+\.js))"[^>]*><\/script>/g, (_, src, chunkPath) => {
  const js = read(src).replace(/<\/script>/g, '<\\/script>');
  const pushes = (js.match(/TURBOPACK=\[\]\)\)\.push\(/g) || []).length;
  for (let i = 0; i < pushes; i++) chunkUrlsInOrder.push(chunkPath);
  const prefix = firstScript ? '__TURBOPACK_URLS__' : '';
  firstScript = false;
  return `${prefix}<script>${js}</script>`;
});
html = html.replace(
  '__TURBOPACK_URLS__',
  `<script>globalThis.TURBOPACK_NEXT_CHUNK_URLS=${JSON.stringify([...chunkUrlsInOrder].reverse())};</script>`,
);

// 3. Drop preload/prefetch links pointing at /_next.
html = html.replace(/<link rel="(preload|prefetch)"[^>]*\/_next[^>]*\/?>/g, '');

// 3b. Embed a pre-pulled, PII-redacted live feed snapshot when present
//     (written by `npm run apply:pull` / `npm run sync:akahu`). The static
//     page cannot call Akahu itself, so the snapshot rides along inside the
//     bundle and useFeed picks it up via globalThis.__BPF_LIVE_FEED__.
const liveFeedPath = path.resolve(__dirname, '..', 'public', 'feed', 'live.json');
if (fs.existsSync(liveFeedPath)) {
  const feedJson = fs.readFileSync(liveFeedPath, 'utf8').replace(/<\//g, '<\\/');
  html = html.replace('<script>globalThis.TURBOPACK_NEXT_CHUNK_URLS', `<script>globalThis.__BPF_LIVE_FEED__=${feedJson};</script><script>globalThis.TURBOPACK_NEXT_CHUNK_URLS`);
  console.log(`Embedded live feed snapshot (${(feedJson.length / 1024).toFixed(0)} KB) from public/feed/live.json`);
}

// 4. Some minified strings contain a literal U+FFFD, which strict hosts
//    reject — escape it inside JS string literals (semantically identical).
html = html.replace(/"�"/g, '"\\uFFFD"');

fs.mkdirSync(distDir, { recursive: true });
const dest = path.join(distDir, 'blueprint-financial-os-single.html');
fs.writeFileSync(dest, html);
console.log(`Wrote ${dest} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
