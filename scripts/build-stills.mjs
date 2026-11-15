/**
 * Renders the globe's still images: public/globe/still-<page>.webp.
 *
 *   npm run globe:stills
 *
 * Re-run it whenever the globe's look changes (dot size, colours, ocean fade, land mask,
 * pin style), then commit the new images.
 *
 * Needs: Google Chrome installed (playwright-core drives your Chrome; it downloads no browser).
 *
 * How it works:
 *  1. builds the site with the dev test page included (GLOBE_TEST_PAGE=1) and serves dist/
 *     on a spare port with a tiny built-in server (astro preview allows only one server at
 *     a time, and yours may already be running);
 *  2. for each page, opens /dev/globe/?still=<page> in headless Chrome at the still's size,
 *     with reduced motion on (so the globe jumps straight to the pin), and waits until the
 *     page says the globe is drawn;
 *  3. screenshots just the globe on a transparent background;
 *  4. saves it as WebP under 40 KB: the screenshot is reduced to 16 colours (the globe only
 *     has a few: background, two dot colours, the pin, and their soft edges), then saved as
 *     lossless WebP. That keeps every dot crisp, where normal lossy WebP smears thousands of
 *     tiny dots and ends up 2–3× larger. If a still is still too big, it is rendered again
 *     slightly smaller until it fits; the size used is printed.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const PORT = 4398;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = new URL('../public/globe/', import.meta.url);
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

/** Serves dist/ (folders → index.html). Only for this script, only on localhost. */
function serveDist() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, BASE).pathname);
      let file = normalize(join(DIST, path));
      if (!file.startsWith(DIST)) throw new Error('outside dist');
      if (path.endsWith('/')) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}
const MAX_BYTES = 40 * 1024;

/** Each still and its size in CSS pixels (square). Landing's globe is the biggest on the site. */
const STILLS = [
  { page: 'landing', size: 800 },
  { page: 'about', size: 520 },
  { page: 'projects', size: 520 },
  { page: 'experience', size: 520 },
  { page: 'contact', size: 520 },
  { page: '404', size: 520 },
];

/** Runs a command and resolves when it exits successfully. */
function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed`))));
  });
}

/** Steps down from the target size when a still won't fit (CSS pixels), and the floor. */
const SIZE_STEP = 40;
const MIN_SIZE = 400;

/** PNG screenshot → 16-colour lossless WebP. Returns the encoded bytes. */
async function encode(png) {
  const palette = await sharp(png).png({ palette: true, colours: 16, dither: 0, effort: 10 }).toBuffer();
  return sharp(palette).webp({ lossless: true, effort: 6 }).toBuffer();
}

console.log('Building the site with the globe test page…');
await run('npx', ['astro', 'build'], { GLOBE_TEST_PAGE: '1' });

const server = await serveDist();

let browser;
try {
  await mkdir(OUT_DIR, { recursive: true });

  browser = await chromium.launch({
    channel: 'chrome', // your installed Google Chrome
    // Software WebGL: identical output on any machine, with or without a graphics card.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  /** Renders one still at `size` and returns the encoded WebP. */
  async function render(name, size) {
    const context = await browser.newContext({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce', // the globe jumps to the pin and draws no pulse
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

    // ?globe=full: always the full-detail globe, whatever this machine's tier would be.
    await page.goto(`${BASE}/dev/globe/?still=${name}&globe=full`);
    await page.waitForFunction(() => document.documentElement.dataset.stillReady, null, { timeout: 30000 });
    const state = await page.evaluate(() => document.documentElement.dataset.stillReady);
    if (state !== 'true') throw new Error(`${name}: the globe could not start (${state}) ${errors.join(' ')}`);

    const png = await page.locator('[data-globe-stage]').screenshot({ omitBackground: true });
    await context.close();
    return encode(png);
  }

  for (const { page: name, size: target } of STILLS) {
    let size = target;
    let webp = await render(name, size);
    while (webp.length > MAX_BYTES && size - SIZE_STEP >= MIN_SIZE) {
      size -= SIZE_STEP;
      webp = await render(name, size);
    }
    if (webp.length > MAX_BYTES) throw new Error(`still-${name}.webp is over ${MAX_BYTES / 1024} KB even at ${size}px`);
    await writeFile(new URL(`still-${name}.webp`, OUT_DIR), webp); // the bytes as encoded
    const note = size < target ? `  (target ${target}px, reduced to fit)` : '';
    console.log(`still-${name}.webp  ${size}×${size}  ${(webp.length / 1024).toFixed(1)} KB${note}`);
  }
} finally {
  await browser?.close();
  server.close();
}

const total = (await Promise.all(
  ['landmask', ...STILLS.map((s) => `still-${s.page}`)].map(async (n) => (await stat(new URL(`${n}.webp`, OUT_DIR))).size),
)).reduce((a, b) => a + b, 0);
console.log(`public/globe total: ${(total / 1024).toFixed(1)} KB (budget 300 KB)`);
console.log('Done. Run `npm run build` again for a normal build without the test page.');
