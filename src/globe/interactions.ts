/**
 * Page interactions that move the globe: landing menu rows, project cards and roles.
 * Started once by site-globe.ts.
 *
 * Any element with data-globe-target="<pin id>" can aim the globe. Optional extras:
 *   data-globe-highlight      keep data-globe-active on it while the globe points at it
 *   data-globe-coords/place   text for the page's readout ([data-globe-readout])
 *   data-globe-still          still image to crossfade to when there's no live globe
 *   data-globe-tap="aim-first"  touch: first tap aims, second tap opens (landing rows)
 *
 * All listeners are on `document`, which stays the same across ClientRouter navigations,
 * so they're added once and never doubled. Each new page only resets the state (reset()).
 *
 * What aims the globe:
 *   hover   mouse only (pointerover); a fast sweep just retargets the flight in progress
 *   focus   keyboard (focusin)
 *   tap     click on the item, e.g. a card's body or a role's accordion row
 * The globe stays on the last item when the pointer leaves: there is no "leave" handling.
 */
import type { Globe, GlobePin } from './Globe';

interface Context {
  /** The live globe, or null (not loaded yet, low-end tier, or no WebGL). */
  getGlobe(): Globe | null;
  /** The current page's pins. */
  getPins(): GlobePin[];
}

const ACTIVE = 'globeActive'; // dataset name → data-globe-active
const AIMED = 'aimed'; // dataset name → data-aimed

export interface Interactions {
  /** Start a new page: forget the previous page's active item; the page's default pin is active. */
  reset(defaultId: string | null): void;
  /** The pin the page is currently showing (hovered, focused or tapped, or the default). */
  activeId(): string | null;
}

export function setupInteractions(ctx: Context): Interactions {
  let activeId: string | null = null;
  let activeEl: HTMLElement | null = null;
  let aimedEl: HTMLElement | null = null; // landing row aimed by a first tap
  // How the latest press started: 'mouse', 'touch', 'pen', or '' after a key press.
  let pressType = '';

  const targetOf = (node: EventTarget | null): HTMLElement | null =>
    node instanceof Element ? node.closest<HTMLElement>('[data-globe-target]') : null;

  /** Make an item the one the globe points at. */
  function activate(el: HTMLElement): void {
    const id = el.dataset.globeTarget;
    if (!id) return;

    // Highlight and readout follow the element, even when its pin is the same as before
    // (two roles in the same city share a pin but have different titles).
    if (el !== activeEl) {
      if (activeEl) delete activeEl.dataset[ACTIVE];
      if (el.hasAttribute('data-globe-highlight')) el.dataset[ACTIVE] = '';
      activeEl = el;
      updateReadout(el);
    }

    // Same pin as now: don't start another flight. A different one mid-flight: flyTo
    // retargets smoothly from wherever the globe is, so sweeps never queue up.
    if (id === activeId) return;
    activeId = id;

    const globe = ctx.getGlobe();
    if (globe) {
      const pin = ctx.getPins().find((p) => p.id === id);
      if (!pin) return;
      globe.setActive(id);
      globe.flyTo(pin.lat, pin.lon); // jumps instead under reduced motion
    } else if (el.dataset.globeStill) {
      crossfadeStill(el.dataset.globeStill);
    }
  }

  /** Copy the item's coordinates and place into the page's readout, if both exist. */
  function updateReadout(el: HTMLElement): void {
    const readout = document.querySelector<HTMLElement>('[data-globe-readout]');
    const { globeCoords, globePlace } = el.dataset;
    if (!readout || !globeCoords || !globePlace) return;
    const coords = readout.querySelector('[data-readout-coords]');
    const place = readout.querySelector('[data-readout-place]');
    if (coords) coords.textContent = globeCoords;
    if (place) place.textContent = globePlace;
  }

  /**
   * No live globe: fade the slot's still image to another still. A copy of the image (so it
   * keeps the slot's scoped styles and fade timing) is laid on top, faded in, then the
   * original takes the new picture and the copy is removed.
   */
  function crossfadeStill(name: string): void {
    const base = document.querySelector<HTMLImageElement>('[data-globe-slot] .globe-still:not([data-next])');
    if (!base) return;
    const src = `/globe/still-${name}.webp`;
    if (base.getAttribute('src') === src) return;

    base.parentElement?.querySelectorAll('[data-next]').forEach((old) => old.remove()); // fast sweeps
    const next = base.cloneNode() as HTMLImageElement;
    next.dataset.next = '';
    next.alt = '';
    Object.assign(next.style, { position: 'absolute', inset: '0', opacity: '0' });
    next.src = src;
    base.after(next);

    const finish = () => {
      if (!next.isConnected) return; // replaced by a newer crossfade
      base.src = src;
      next.remove();
    };
    next.decode().then(
      () => {
        requestAnimationFrame(() => {
          next.style.opacity = '1';
          const ms = parseFloat(getComputedStyle(next).transitionDuration) * 1000 || 0;
          setTimeout(finish, ms + 50);
        });
      },
      () => next.remove(), // image failed: keep the current still
    );
  }

  // Remember how each press started, so a click can tell a touch tap from a mouse click.
  // Keyboard clicks (Enter) have no press before them, so a key press clears it.
  document.addEventListener('pointerdown', (event) => (pressType = event.pointerType), { capture: true });
  document.addEventListener('keydown', () => (pressType = ''), { capture: true });

  // Hover: mouse only. Touch screens fire pointerover on a tap too; taps are handled by click.
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return;
    const el = targetOf(event.target);
    if (el) activate(el);
  });

  // Keyboard focus moving onto an item, or anything inside it (a card's link, a role's button).
  document.addEventListener('focusin', (event) => {
    const el = targetOf(event.target);
    if (el) activate(el);
  });

  // Taps and clicks. Capture phase, so it runs before ClientRouter's own click handling and
  // can cancel a landing row's first tap before any navigation starts.
  document.addEventListener(
    'click',
    (event) => {
      const el = targetOf(event.target);
      if (!el) return;
      const touch = event.detail > 0 && (pressType === 'touch' || pressType === 'pen');

      if (el.dataset.globeTap === 'aim-first' && touch && el !== aimedEl) {
        // First tap on this row: aim only. The next tap on the same row opens it.
        event.preventDefault();
        if (aimedEl) delete aimedEl.dataset[AIMED];
        aimedEl = el;
        el.dataset[AIMED] = '';
      }
      activate(el);
    },
    { capture: true },
  );

  return {
    reset(defaultId) {
      activeId = defaultId;
      activeEl = null; // the previous page's elements are gone
      aimedEl = null;
    },
    activeId: () => activeId,
  };
}
