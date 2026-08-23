// ── FinTracker production build ──────────────────────────────────────────
// App source lives in fintracker/src/ (ES modules, JSX). fintracker/index.html
// is the HTML shell with two placeholders: <!--TAILWIND_CSS--> and
// <!--APP_BUNDLE-->. This script bundles the app with esbuild and inlines a
// purged Tailwind stylesheet, emitting fintracker/dist/index.html.
// React / ReactDOM / Firebase / Chart.js stay as runtime globals (CDN).
import esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(ROOT, 'fintracker', 'index.html');
const ENTRY    = path.join(ROOT, 'fintracker', 'src', 'app.jsx');
const DIST_DIR = path.join(ROOT, 'fintracker', 'dist');
const TW_CSS   = path.join(ROOT, 'build', 'tw.css');

const log = (...a) => console.log('•', ...a);

// Build stamp. The app deploys continuously, so a semantic version number would
// say nothing — what identifies a build is when it was made and which commit it
// came from. That pair is enough to line a bug report up against the source.
// Local date, not toISOString(): Thailand is UTC+7, so anything built after 5pm
// would be stamped with yesterday's date and read as a stale build.
const BUILD_DATE = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
const GIT_HASH = (() => {
  try {
    const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim() ? '+' : '';
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim() + dirty;
  } catch { return 'nogit'; }
})();

// 1. Bundle the app modules → one IIFE (React et al. resolve to CDN globals)
const result = esbuild.buildSync({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  target: 'es2018',
  jsx: 'transform',
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  define: {
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
    __GIT_HASH__:   JSON.stringify(GIT_HASH),
  },
  write: false,
});
const js = result.outputFiles[0].text;
log(`bundled app: ${(js.length / 1024).toFixed(0)} KB (minified)`);

// 2. Static, purged Tailwind stylesheet (scans fintracker/src + index.html)
execSync(
  `npx tailwindcss -c "${path.join(ROOT, 'build', 'tailwind.config.cjs')}" -i "${path.join(ROOT, 'build', 'input.css')}" -o "${TW_CSS}" --minify`,
  { cwd: ROOT, stdio: 'inherit' }
);
const css = fs.readFileSync(TW_CSS, 'utf8');
log(`tailwind css: ${(css.length / 1024).toFixed(0)} KB (minified)`);

// 3. Inject into the HTML shell
let out = fs.readFileSync(TEMPLATE, 'utf8');
// function replacements so any '$' sequences in css/js stay literal (not $&, $1, …)
out = out.replace('<!--TAILWIND_CSS-->', () => `<style id="tw">${css}</style>`);
out = out.replace('<!--APP_BUNDLE-->', () => `<script>${js}</script>`);
if (out.includes('<!--APP_BUNDLE-->') || out.includes('<!--TAILWIND_CSS-->'))
  throw new Error('a placeholder was not replaced — check fintracker/index.html');

// 4. Write dist + copy PWA assets
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), out, 'utf8');
// copy PWA assets + any local image the bundle/HTML references (e.g. ./kbank.png)
const assetFiles = new Set(['sw.js', 'manifest.json']);
const refRe = /["'`]\.?\/?([\w.-]+\.(?:png|jpe?g|svg|webp|ico|gif))(?:\?[\w=&.\-]*)?["'`]/g;
const scanned = js + out;
let m; while ((m = refRe.exec(scanned))) assetFiles.add(m[1]);
let copied = 0;
for (const f of assetFiles) {
  const p = path.join(ROOT, 'fintracker', f);
  if (fs.existsSync(p)) { fs.copyFileSync(p, path.join(DIST_DIR, f)); copied++; }
}
log(`copied ${copied} static asset(s) (incl. referenced images)`);
log(`wrote fintracker/dist/index.html: ${(out.length / 1024).toFixed(0)} KB`);
log('done.');
