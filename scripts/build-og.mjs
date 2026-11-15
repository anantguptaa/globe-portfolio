/**
 * Renders the share image shown when a link to the site is pasted into LinkedIn, Slack,
 * iMessage and so on: public/og.png, 1200 × 630.
 *
 *   npm run og:build
 *
 * Re-run it when the name, tagline, colours or landing globe still change (the still comes
 * from npm run globe:stills), then commit the new image.
 *
 * Needs: Google Chrome installed (playwright-core drives your Chrome, as the stills script does).
 *
 * Made only from existing assets, nothing typed in twice:
 *  - the name and tagline are read from src/data/site.ts
 *  - the colours are read from src/styles/tokens.css
 *  - the fonts are the site's own: the subset display font and JetBrains Mono
 *  - the globe is public/globe/still-landing.webp
 * The page is rendered in Chrome so the text looks exactly like the site's, then the
 * screenshot is reduced to a 64-colour PNG (the image is flat colour and a dotted globe).
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const read = (path) => readFile(new URL(path, import.meta.url));
const dataUrl = async (path, type) => `data:${type};base64,${(await read(path)).toString('base64')}`;

// Colours from the design tokens.
const tokens = await readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const color = (name) => {
  const m = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`Token ${name} not found in tokens.css`);
  return m[1];
};
const bg = color('--bg');
const text = color('--text');
const muted = color('--text-muted');
const accent = color('--accent');
const border = color('--border-strong');

// Name and tagline from the site data.
const site = await readFile(new URL('../src/data/site.ts', import.meta.url), 'utf8');
const field = (name) => {
  const m = site.match(new RegExp(`\\b${name}:\\s*'([^']*)'`));
  if (!m) throw new Error(`${name} not found in src/data/site.ts`);
  return m[1];
};
const name = field('name');
const tagline = field('tagline'); // "cs @ ualberta · computer vision & geospatial ML"
const taglineLines = tagline.split(' · '); // shown on separate lines
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const fonts = {
  display: await dataUrl('../public/fonts/TeXGyreAdventor-Bold-subset.woff2', 'font/woff2'),
  mono: await dataUrl('../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2', 'font/woff2'),
};
const globe = await dataUrl('../public/globe/still-landing.webp', 'image/webp');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: Display; src: url(${fonts.display}) format('woff2'); font-weight: 700; }
  @font-face { font-family: Mono; src: url(${fonts.mono}) format('woff2'); font-weight: 500; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; background: ${bg}; }
  .globe { position: absolute; width: 720px; height: 720px; top: -45px; right: -150px; }
  .text { position: absolute; left: 84px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; gap: 36px; }
  .eyebrow { font: 500 22px Mono; letter-spacing: 0.1em; text-transform: uppercase; color: ${accent}; }
  h1 { font: 700 104px/1 Display; letter-spacing: -0.03em; color: ${text}; }
  .tagline { display: flex; flex-direction: column; gap: 10px; font: 500 30px/1.25 Mono; color: ${muted}; }
  .rule { width: 96px; height: 3px; background: ${accent}; }
  .frame { position: absolute; inset: 0; border: 1px solid ${border}; }
</style></head><body>
  <img class="globe" src="${globe}" alt="">
  <div class="text">
    <div class="eyebrow">Portfolio</div>
    <h1>${escape(name)}</h1>
    <div class="rule"></div>
    <div class="tagline">${taglineLines.map((l) => `<span>${escape(l)}</span>`).join('')}</div>
  </div>
  <div class="frame"></div>
</body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ type: 'png' });
  const out = await sharp(shot).png({ palette: true, colours: 64, effort: 10, dither: 0.6 }).toBuffer();
  const meta = await sharp(out).metadata();
  if (meta.width !== 1200 || meta.height !== 630) throw new Error(`Unexpected size ${meta.width}×${meta.height}`);
  await writeFile(new URL('../public/og.png', import.meta.url), out);
  console.log(`public/og.png: ${meta.width}×${meta.height}, ${(out.length / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
await stat(new URL('../public/og.png', import.meta.url));
