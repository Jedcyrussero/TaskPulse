import fs from 'node:fs';
import path from 'node:path';

/**
 * For each HTML page, resolve its entry script plus every module that script
 * imports (transitively), then confirm every `$('#id')` selector used by those
 * modules exists somewhere in that page's markup.
 */
const PUBLIC = 'public';

function collectIds(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

function moduleFor(page) {
  const src = fs.readFileSync(path.join(PUBLIC, page), 'utf8');
  const match = src.match(/<script[^>]+src="\/js\/([^"]+\.js)"/);
  return match ? match[1] : null;
}

/** Depth-first walk of the static import graph. */
function moduleGraph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);

  const file = path.join(PUBLIC, 'js', entry);
  const src = fs.readFileSync(file, 'utf8');

  for (const m of src.matchAll(/from\s+'\.\/([^']+)'/g)) {
    moduleGraph(m[1], seen);
  }
  return seen;
}

const pages = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'));
let problems = 0;

for (const page of pages) {
  const html = fs.readFileSync(path.join(PUBLIC, page), 'utf8');
  const ids = collectIds(html);
  const entry = moduleFor(page);

  if (!entry) {
    console.log(`${page.padEnd(16)} no module script (static page)`);
    continue;
  }

  const modules = [...moduleGraph(entry)];
  const refs = new Set();

  for (const mod of modules) {
    const src = fs.readFileSync(path.join(PUBLIC, 'js', mod), 'utf8');
    for (const m of src.matchAll(/\$\('#([^']+)'\)/g)) refs.add(m[1]);
  }

  // Elements absent from some pages by design: either created at runtime, or
  // accessed behind a null-guard in the module.
  const OPTIONAL = new Set([
    'toast-host', // created on demand by ui.js
    'demo-fill',  // login page only; auth-forms.js null-guards it
  ]);
  const missing = [...refs].filter((id) => !ids.has(id) && !OPTIONAL.has(id));

  if (missing.length) {
    problems += 1;
    console.log(`${page.padEnd(16)} MISSING: ${missing.join(', ')}`);
  } else {
    console.log(`${page.padEnd(16)} ok  (${refs.size} selectors across ${modules.length} modules)`);
  }

  // Duplicate ids within a single page break lookups.
  const all = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = [...new Set(all.filter((id, i) => all.indexOf(id) !== i))];
  if (dupes.length) {
    problems += 1;
    console.log(`${' '.repeat(17)}DUPLICATE IDS: ${dupes.join(', ')}`);
  }
}

console.log(problems ? `\n${problems} problem(s) found.` : '\nAll pages clean.');
process.exit(problems ? 1 : 0);