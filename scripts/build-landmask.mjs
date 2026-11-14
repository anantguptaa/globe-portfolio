/**
 * One-off: draws the globe's land mask.
 *   npm run globe:mask
 *
 * Output: public/globe/landmask.webp — 2048 × 1024, equirectangular (longitude −180…180 left to
 * right, latitude 90…−90 top to bottom), land white, ocean black. The globe's shader reads it to
 * decide which dots are land.
 *
 * Source: Natural Earth land shapes (public domain) from the world-atlas package.
 * Re-run only if you want a different size or level of detail; the result is committed.
 */
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { geoEquirectangular, geoPath } from 'd3-geo';
import sharp from 'sharp';
import { feature } from 'topojson-client';

const WIDTH = 2048;
const HEIGHT = 1024;
const MAX_BYTES = 150 * 1024;
const OUT = new URL('../public/globe/landmask.webp', import.meta.url);

// world-atlas ships TopoJSON (a compact format); topojson-client turns it into plain GeoJSON shapes.
const require = createRequire(import.meta.url);
const topology = JSON.parse(await readFile(require.resolve('world-atlas/land-50m.json'), 'utf8'));
const land = feature(topology, topology.objects.land);

// Equirectangular: x is longitude, y is latitude, both linear. A scale of WIDTH / 2π makes the
// full 360° exactly WIDTH pixels wide. d3-geo cuts shapes cleanly at the ±180° date line.
const projection = geoEquirectangular()
  .scale(WIDTH / (2 * Math.PI))
  .translate([WIDTH / 2, HEIGHT / 2]);
const d = geoPath(projection)(land);

// These two colours are mask data (white = land, black = ocean), not interface colours.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="100%" height="100%" fill="black"/>
  <path d="${d}" fill="white"/>
</svg>`;

await mkdir(new URL('.', OUT), { recursive: true });
const info = await sharp(Buffer.from(svg)).greyscale().webp({ lossless: true, effort: 6 }).toFile(OUT.pathname);

const kb = (info.size / 1024).toFixed(1);
console.log(`landmask.webp: ${info.width} × ${info.height}, ${kb} KB`);
if (info.size > MAX_BYTES) {
  console.error(`Too big: the budget is ${MAX_BYTES / 1024} KB.`);
  process.exit(1);
}
