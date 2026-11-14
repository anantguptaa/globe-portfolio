/**
 * Landing → page zoom (spec T1). Started once by site-globe.ts; listeners live on `document`.
 *
 * Runs only when leaving the landing page through a menu row (a new navigation, not
 * back/forward). Header links between inner pages, the back button, direct visits and
 * reloads keep the normal behaviour.
 *
 * Astro's navigation events, in order, and what happens at each:
 *   astro:before-preparation  → DIVE. html[data-zoom="out"] fades the landing page out (CSS);
 *                               the globe's stage scales ×9 into the clicked pin and fades.
 *                               The event's loader is wrapped so the swap waits for both the
 *                               new page and the end of the dive.
 *   astro:after-preparation   (new page fetched and parsed)
 *   astro:before-swap         (the view transition snapshots the old page: by now it's empty)
 *   swap                      (new DOM in; the persisted globe is carried over)
 *   astro:after-swap          → SETTLE. The globe is moved into the new page's slot, starts at
 *                               ×3, invisible, and settles to ×1; html[data-zoom="in"] fades
 *                               the new content in (CSS).
 *   astro:page-load           (site-globe.ts sets up the page; the globe already faces the pin)
 *
 * No live globe (low-end tier, no WebGL, not loaded yet): only the content fades, so the
 * landing still fades out and the page's still fades in with it. Reduced motion: nothing
 * here runs, and Astro's plain swap is used (step 7b finalises it).
 */
import type { TransitionBeforePreparationEvent } from 'astro:transitions/client';
import type { Globe } from './Globe';

interface Context {
  getGlobe(): Globe | null;
  /** The element the globe is drawn in (scaled during the zoom). */
  stage: HTMLElement;
  /** Find the new page's slot and move the globe over it (without aiming). */
  relayout(): void;
}

const ZOOM_SCALE = 9; // dive: ×1 → ×9
const SETTLE_FROM = 3; // settle: ×3 → ×1
const GIVE_UP_AFTER = 4000; // ms: clean up if the swap never comes (Astro's own limit is 4s)

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** A duration token like "0.62s" in ms, with a fallback if it's missing. */
function tokenMs(name: string, fallback: number): number {
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return value.endsWith('ms') ? n : n * 1000;
}

/** An easing token like "cubic-bezier(…)"; usable directly by the Web Animations API. */
function tokenEase(name: string, fallback: string): string {
  return getComputedStyle(root).getPropertyValue(name).trim() || fallback;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function setupZoom(ctx: Context): void {
  const { stage } = ctx;

  /** The zoom in progress, if any. */
  let zoom: {
    globe: Globe | null;
    pin: { lat: number; lon: number } | null;
    giveUp: number;
  } | null = null;

  function cleanUp(): void {
    if (!zoom) return;
    clearTimeout(zoom.giveUp);
    stage.getAnimations().forEach((a) => a.cancel());
    stage.style.transformOrigin = '';
    delete root.dataset.zoom;
    zoom = null;
  }

  document.addEventListener('astro:before-preparation', (event) => {
    const e = event as TransitionBeforePreparationEvent;
    cleanUp(); // a new navigation interrupts an old zoom

    const onLanding = document.body.classList.contains('is-landing');
    const row = e.sourceElement?.closest<HTMLElement>('.menu-row[data-globe-target]');
    if (!onLanding || !row || e.navigationType !== 'push' || reducedMotion.matches) return;

    const live = root.dataset.globe === 'live';
    const globe = live ? ctx.getGlobe() : null;
    const pinId = row.dataset.globeTarget ?? '';
    const fadeOut = tokenMs('--dur-fade-out', 250);

    root.dataset.zoom = 'out'; // CSS: landing header, menu and footer fade out
    zoom = { globe, pin: null, giveUp: window.setTimeout(cleanUp, GIVE_UP_AFTER) };

    let dive: Promise<unknown> = wait(fadeOut); // no live globe: just the content fade
    if (globe) {
      const pins = JSON.parse(document.querySelector<HTMLElement>('[data-globe-slot]')?.dataset.pins ?? '[]');
      zoom.pin = pins.find((p: { id: string }) => p.id === pinId) ?? null;

      const duration = tokenMs('--dur-zoom', 620);
      const scale = stage.animate(
        [{ transform: 'scale(1)' }, { transform: `scale(${ZOOM_SCALE})` }],
        { duration, easing: tokenEase('--ease-zoom-in', 'cubic-bezier(0.7, 0, 0.84, 0)'), fill: 'forwards' },
      );
      // Fades out over the last part of the dive, gone by the peak.
      stage.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: fadeOut,
        delay: Math.max(0, duration - fadeOut),
        fill: 'forwards',
      });

      // Anchor the scale on the pin's real position, following it if the globe is still
      // flying there. Only touches the style when the point actually moves.
      let last = '';
      const follow = () => {
        if (!zoom || scale.playState !== 'running') return;
        const p = globe.pinScreenPoint(pinId);
        const origin = p ? `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px` : '50% 50%';
        if (origin !== last) stage.style.transformOrigin = last = origin;
        requestAnimationFrame(follow);
      };
      follow();
      dive = scale.finished.catch(() => undefined);
    }

    // Swap only when the new page has loaded AND the dive has reached its peak.
    const load = e.loader;
    e.loader = async () => {
      await Promise.all([load(), dive]);
    };
  });

  document.addEventListener('astro:after-swap', () => {
    if (!zoom) return;
    root.dataset.zoom = 'in'; // re-applied: Astro copied the new page's <html> attributes
    const { globe, pin } = zoom;
    stage.getAnimations().forEach((a) => a.cancel());
    stage.style.transformOrigin = '50% 50%';
    ctx.relayout(); // globe into the new page's slot

    const fadeIn = tokenMs('--dur-fade-in', 450);
    let finished: Promise<unknown> = wait(fadeIn);
    if (globe) {
      // Invisible right now, so snapping to face the pin can't be seen.
      if (pin) globe.lookAt(pin.lat, pin.lon);
      const settle = tokenMs('--dur-settle', 600);
      const move = stage.animate(
        [{ transform: `scale(${SETTLE_FROM})` }, { transform: 'scale(1)' }],
        { duration: settle, easing: tokenEase('--ease-settle', 'cubic-bezier(0.16, 1, 0.3, 1)'), fill: 'backwards' },
      );
      stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(350, settle), fill: 'backwards' });
      finished = Promise.all([move.finished.catch(() => undefined), finished]);
    }
    void finished.then(() => {
      if (zoom) cleanUp();
    });
  });
}
