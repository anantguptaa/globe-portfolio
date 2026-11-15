/**
 * Subsets the display font to the characters the site uses.
 *
 *   npm run fonts:subset
 *
 * In:  src/fonts/TeXGyreAdventor-Bold.full.woff2   the original, complete font (~76 KB). Kept
 *      here, outside public/, so it's never served; this script always starts from it.
 * Out: public/fonts/TeXGyreAdventor-Bold-subset.woff2   only Latin letters, digits and the
 *      punctuation and arrows below. Referenced by src/styles/global.css (with a matching
 *      unicode-range) and preloaded in BaseLayout.
 *
 * Re-run it if the original font changes, or if the check at the end reports characters the
 * subset doesn't cover (e.g. a title with a letter from outside the list). Anything outside
 * the subset still shows: the browser draws it with the fallback font instead.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import subsetFont from 'subset-font';

const SOURCE = new URL('../src/fonts/TeXGyreAdventor-Bold.full.woff2', import.meta.url);
const OUTPUT = new URL('../public/fonts/TeXGyreAdventor-Bold-subset.woff2', import.meta.url);

/**
 * Unicode ranges kept, as [first, last] code points. global.css's unicode-range lists the
 * same ranges; keep the two in step.
 */
export const RANGES = [
  [0x0020, 0x007e], // Basic Latin: A–Z, a–z, 0–9, ASCII punctuation
  [0x00a0, 0x00ff], // Latin-1 Supplement: accented letters, · ° © and similar
  [0x2013, 0x2014], // – —
  [0x2018, 0x2019], // ‘ ’
  [0x201c, 0x201d], // “ ”
  [0x2022, 0x2022], // •
  [0x2026, 0x2026], // …
  [0x2190, 0x2193], // ← ↑ → ↓
  [0x2197, 0x2197], // ↗
];

const inSubset = (cp) => RANGES.some(([a, b]) => cp >= a && cp <= b);

let text = '';
for (const [a, b] of RANGES) for (let cp = a; cp <= b; cp++) text += String.fromCodePoint(cp);

const original = await readFile(SOURCE);
const subset = await subsetFont(original, text, { targetFormat: 'woff2' });
await writeFile(OUTPUT, subset);
console.log(`TeXGyreAdventor-Bold: ${(original.length / 1024).toFixed(1)} KB → ${(subset.length / 1024).toFixed(1)} KB`);

// Check: characters in the site's source that the subset doesn't include. (A rough check:
// it scans all text, not only text set in this font, so a hit may be harmless.)
async function* files(dir) {
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory()) yield* files(path);
    else if (['.astro', '.md', '.mdx', '.ts'].includes(extname(path))) yield path;
  }
}
const missing = new Map();
for await (const path of files(new URL('../src', import.meta.url).pathname)) {
  for (const ch of await readFile(path, 'utf8')) {
    const cp = ch.codePointAt(0);
    if (cp > 0x7e && !inSubset(cp) && !/\s/.test(ch)) missing.set(ch, (missing.get(ch) ?? 0) + 1);
  }
}
if (missing.size) {
  console.log('Characters in src/ outside the subset (shown in the fallback font if used in titles):');
  console.log('  ' + [...missing.keys()].map((c) => `${c} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('  '));
} else {
  console.log('Every character in src/ is covered by the subset.');
}
