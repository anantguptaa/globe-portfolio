/**
 * Which version of the globe this device gets. Tweak the numbers below to change who gets what.
 *
 *   'full'  — the live globe at full detail (about 65,600 dots)
 *   'lite'  — the live globe with fewer dots (about 16,800): small screens, or data saver on
 *   'still' — only the pre-rendered image; Three.js is never downloaded
 *
 * For testing, add ?globe=off (still image), ?globe=lite or ?globe=full to the page's URL.
 *
 * This file is tiny and has no imports on purpose: it runs before the globe is loaded.
 */

export type GlobeTier = 'full' | 'lite' | 'still';

/** Below this window width, use the lite globe. Matches the site's mobile breakpoint. */
const LITE_MAX_WIDTH = 767.98;

/**
 * Low-end device: this many CPU cores or fewer AND this much memory (GB) or less.
 * Each check only counts where the browser reports it (Safari and Firefox don't report
 * memory), so an unknown value never makes a device "low-end" on its own.
 */
const LOW_END_MAX_CORES = 4;
const LOW_END_MAX_MEMORY_GB = 4;

/** Icosahedron detail for each live tier. */
export const TIER_DETAIL = { full: 80, lite: 40 } as const;

/** Browser extras that TypeScript doesn't know about (not in every browser). */
interface NavigatorExtras {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export function getGlobeTier(): GlobeTier {
  // Manual override for testing: ?globe=off | lite | full
  const forced = new URLSearchParams(window.location.search).get('globe');
  if (forced === 'off') return 'still';
  if (forced === 'lite' || forced === 'full') return forced;

  const nav = navigator as Navigator & NavigatorExtras;

  const cores = nav.hardwareConcurrency;
  const memory = nav.deviceMemory;
  const fewCores = cores !== undefined && cores <= LOW_END_MAX_CORES;
  const littleMemory = memory !== undefined && memory <= LOW_END_MAX_MEMORY_GB;
  if (fewCores && littleMemory) return 'still';

  const saveData = nav.connection?.saveData === true;
  const smallScreen = window.matchMedia(`(max-width: ${LITE_MAX_WIDTH}px)`).matches;
  if (saveData || smallScreen) return 'lite';

  return 'full';
}
