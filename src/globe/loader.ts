/**
 * Globe loader: the only globe code that loads with the page. It is tiny on purpose; Three.js
 * and Globe.ts (about 135 KB gzipped) are fetched later, as a separate file, by import().
 *
 * What happens:
 *  1. The still image is already showing: it's a plain <img> in the page's HTML
 *     (see GlobeStage.astro), so it appears even without JavaScript.
 *  2. Pick the tier (tier.ts). 'still' stops here: Three.js is never downloaded.
 *  3. Wait until the page has fully loaded (text, fonts and the still image are in), then
 *     for the browser to be idle, so the globe never competes with the page's own content
 *     for the network or the processor.
 *  4. Create the WebGL 2 context. No WebGL: stop here, quietly, before downloading anything.
 *     Creating a context can be slow (over a second without a graphics card), so it happens
 *     only now, and only once: the same context is handed to Three.js.
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

/** The context settings Three.js's renderer asks for (see Globe.ts), so it can reuse ours. */
const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
  failIfMajorPerformanceCaveat: false,
};

/**
 * A canvas with a WebGL 2 context (which Three.js needs), or null if the browser can't.
 * Checked without loading Three.js; the result is then given to the globe, not thrown away.
 */
function createContext(): { canvas: HTMLCanvasElement; context: WebGL2RenderingContext } | null {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
    return context ? { canvas, context } : null;
  } catch {
    return null;
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
  if (tier === 'still') return { tier, globe: null };

  await afterPageLoadAndIdle();

  const gl = createContext();
  if (!gl) return { tier, globe: null }; // no WebGL: keep the still

  try {
    // import() makes Globe.ts and Three.js a separate file, fetched only now.
    const { Globe } = await import('./Globe');
    const globe = new Globe(stage, {
      ...options,
      canvas: gl.canvas,
      context: gl.context,
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
