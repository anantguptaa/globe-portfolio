/**
 * Globe loader: the only globe code that loads with the page. It is tiny on purpose; Three.js
 * and Globe.ts (about 135 KB gzipped) are fetched later, as a separate file, by import().
 *
 * What happens:
 *  1. The still image is already showing: it's a plain <img> in the page's HTML
 *     (see GlobeStage.astro), so it appears even without JavaScript.
 *  2. Pick the tier (tier.ts). 'still' stops here: Three.js is never downloaded.
 *  3. Check WebGL 2 with a throwaway canvas. No WebGL: stop here, quietly.
 *  4. Wait until the page has fully loaded (text, fonts and the still image are in), then
 *     for the browser to be idle, so the globe never competes with the page's own content
 *     for the network or the processor.
 *  5. Download Globe.ts + Three.js, create the globe, and when its first full frame is drawn,
 *     set data-globe="live" on the stage: CSS fades the canvas in over the still.
 * Any failure along the way leaves the still in place, without errors in the console.
 */
import type { Globe, GlobeOptions } from './Globe';
import { getGlobeTier, TIER_DETAIL, type GlobeTier } from './tier';

/** Longest wait for idle time before loading anyway, in ms. */
const IDLE_TIMEOUT = 2000;

export interface MountResult {
  tier: GlobeTier;
  /** The live globe, or null when the still image stays (low-end tier, no WebGL, or an error). */
  globe: Globe | null;
}

/** Can this browser draw WebGL 2 (which Three.js needs)? Checked without loading Three.js. */
function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free it straight away
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves once the page has loaded and painted, and the browser has some idle time.
 * The `load` event comes after the page's text, fonts and images (including the still) are
 * in. Waiting only for "the next frame" isn't enough: the first frame can be painted before
 * any content has arrived.
 */
async function afterPageLoadAndIdle(): Promise<void> {
  if (document.readyState !== 'complete') {
    await new Promise<void>((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
  }
  // A frame callback runs just before a paint; the one after it, once that paint is done.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT });
    } else {
      setTimeout(resolve, 200); // Safari: no requestIdleCallback
    }
  });
}

/**
 * Start the globe inside a stage element (the box holding the still image).
 * Options are passed on to the Globe, except `detail`, which comes from the tier.
 */
export async function mountGlobe(
  stage: HTMLElement,
  options: Omit<GlobeOptions, 'detail'> = {},
): Promise<MountResult> {
  const tier = getGlobeTier();
  stage.dataset.globeTier = tier;
  if (tier === 'still' || !hasWebGL2()) return { tier, globe: null };

  await afterPageLoadAndIdle();

  try {
    // import() makes Globe.ts and Three.js a separate file, fetched only now.
    const { Globe } = await import('./Globe');
    const globe = new Globe(stage, {
      ...options,
      detail: TIER_DETAIL[tier],
      onReady: () => {
        stage.dataset.globe = 'live'; // CSS fades the canvas in over the still
        options.onReady?.();
      },
    });
    return { tier, globe };
  } catch {
    // Download failed or WebGL broke while starting: keep the still and tidy up.
    stage.querySelectorAll('canvas, .globe-label, .globe-sr').forEach((el) => el.remove());
    return { tier, globe: null };
  }
}
