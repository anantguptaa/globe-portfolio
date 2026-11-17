/**
 * Site globe controller — bundled into BaseLayout, so it runs ONCE per visit, not per page.
 *
 * The globe lives in BaseLayout's persistent layer (transition:persist), so one Three.js
 * scene survives every page change. Each page has a GlobeSlot saying where the globe sits and
 * what it points at. On every `astro:page-load` (the first load and each navigation) this:
 *  1. finds the new page's slot;
 *  2. moves the globe's window and stage over it (window = the slot's box, with its fade and
 *     clipping; stage = the square disc inside it, where the canvas is drawn). A sticky slot
 *     (GlobePage) gets a sticky window, so the browser keeps the two together while scrolling;
 *     nothing here runs on scroll;
 *  3. hands the globe the page's pins and active pin, and the slot as its drag area;
 *  4. aims: on the first page instantly (lookAt, settled); after a navigation, flyTo.
 * The globe itself is loaded lazily by loader.ts (tiers, WebGL check, after page load).
 * Until it's ready, and if it never is, each page's still image shows in the slot.
 * Hover, focus and taps on the page's items (menu rows, cards, roles) are handled by
 * interactions.ts, which this file starts once.
 */
import type { Globe, GlobePin } from './Globe';
import { setupInteractions } from './interactions';
import { mountGlobe } from './loader';
import { setupTransitions } from './transitions';

const root = document.documentElement;
const layer = document.querySelector<HTMLElement>('[data-globe-layer]');
const track = layer?.querySelector<HTMLElement>('[data-globe-track]');
const windowEl = layer?.querySelector<HTMLElement>('[data-globe-window]');
const stage = layer?.querySelector<HTMLElement>('[data-globe-stage]');

interface SlotInfo {
  slot: HTMLElement;
  disc: HTMLElement;
  pins: GlobePin[];
  active: string;
}

let globe: Globe | null = null;

/** The live globe, or null (not loaded yet, low-end tier, no WebGL). For page scripts. */
export const getSiteGlobe = (): Globe | null => globe;
let live = false;
let current: SlotInfo | null = null; // the slot the globe is placed over
let setUpSlot: HTMLElement | null = null; // the slot whose page has been set up (pins, aim)
let firstPage = true; // the page the visitor arrived on: aim without a flight

// Menu rows, cards and roles that aim the globe. Its listeners live on `document`.
const interactions = setupInteractions({
  getGlobe: () => globe,
  getPins: () => current?.pins ?? [],
});

/** The current page's slot and its data, or null on pages without a globe. */
function readSlot(): SlotInfo | null {
  const slot = document.querySelector<HTMLElement>('[data-globe-slot]');
  const disc = slot?.querySelector<HTMLElement>('[data-globe-disc]');
  if (!slot || !disc) return null;
  let pins: GlobePin[] = [];
  try {
    pins = JSON.parse(slot.dataset.pins ?? '[]');
  } catch {
    pins = [];
  }
  return { slot, disc, pins, active: slot.dataset.active ?? '' };
}

/** Border plus padding at the top and bottom of an element, in px. */
function insetsY(css: CSSStyleDeclaration): [number, number] {
  const n = (v: string) => parseFloat(v) || 0;
  return [
    n(css.borderTopWidth) + n(css.paddingTop),
    n(css.borderBottomWidth) + n(css.paddingBottom),
  ];
}

/**
 * Put the window over the slot and the stage over the disc. Positions are measured on
 * screen and converted to the layer's own coordinates, so scrolling doesn't matter.
 * The slot's fade, clipping and background are copied from its computed CSS, so they're
 * defined once (GlobeSlot.astro).
 *
 * A sticky slot (inner pages) sticks within its parent. The window copies that: the track
 * is laid over the parent, and the window sticks inside the track with the slot's own `top`.
 * The browser then moves both on scroll, in step, without any script. This relies on the
 * slot being its parent's first child with no top margin (GlobePage.astro), because a stuck
 * slot's on-screen position no longer says where it would sit unstuck.
 */
function place(): void {
  if (!layer || !track || !windowEl || !stage) return;
  if (!current) {
    windowEl.hidden = true;
    updateCompact();
    return;
  }
  windowEl.hidden = false;
  const layerBox = layer.getBoundingClientRect();
  const slotBox = current.slot.getBoundingClientRect();
  const discBox = current.disc.getBoundingClientRect();
  const css = getComputedStyle(current.slot);
  const parent = current.slot.parentElement;

  if (css.position === 'sticky' && parent) {
    const parentBox = parent.getBoundingClientRect();
    const [insetTop, insetBottom] = insetsY(getComputedStyle(parent));
    Object.assign(track.style, {
      top: `${parentBox.top - layerBox.top + insetTop}px`,
      left: `${parentBox.left - layerBox.left}px`,
      width: `${parentBox.width}px`,
      height: `${parentBox.height - insetTop - insetBottom}px`,
    });
    Object.assign(windowEl.style, {
      position: 'sticky',
      top: css.top,
      left: '',
      marginLeft: `${slotBox.left - parentBox.left}px`,
    });
  } else {
    Object.assign(track.style, { top: '0px', left: '0px', width: '100%', height: '100%' });
    Object.assign(windowEl.style, {
      position: '',
      top: `${slotBox.top - layerBox.top}px`,
      left: `${slotBox.left - layerBox.left}px`,
      marginLeft: '',
    });
  }
  windowEl.style.width = `${slotBox.width}px`;
  windowEl.style.height = `${slotBox.height}px`;

  Object.assign(stage.style, {
    top: `${discBox.top - slotBox.top}px`,
    left: `${discBox.left - slotBox.left}px`,
    width: `${discBox.width}px`,
    height: `${discBox.height}px`,
  });

  const mask = css.maskImage || css.getPropertyValue('-webkit-mask-image') || 'none';
  windowEl.style.maskImage = mask;
  windowEl.style.setProperty('-webkit-mask-image', mask);
  windowEl.style.overflow = css.overflow === 'hidden' ? 'hidden' : 'visible';
  windowEl.style.backgroundColor = css.backgroundColor;
  updateCompact();
}

/**
 * The strip (below 1100px) is "compact" once it has shrunk at least halfway: the pin label
 * then shows just the place name on one line (globe.css), so it fits the smaller strip.
 * A strip sticks at a negative top: that's how it's told apart from the desktop column.
 * Checked by an IntersectionObserver as the strip scrolls (it fires only as the strip's
 * visible part changes, so it's quiet once the strip has stuck), and on every place().
 */
function updateCompact(): void {
  if (!windowEl) return;
  let compact = false;
  if (current) {
    const top = parseFloat(getComputedStyle(current.slot).top);
    compact = top < 0 && current.slot.getBoundingClientRect().top <= top / 2;
  }
  if (compact) windowEl.dataset.compact = '';
  else delete windowEl.dataset.compact;
}

const compactObserver = new IntersectionObserver(updateCompact, {
  threshold: Array.from({ length: 51 }, (_, i) => i / 50),
});

/**
 * Hand the current page's pins to the globe and aim at the active one: the item the visitor
 * last hovered, focused or tapped, or else the page's default pin.
 */
function aim(fly: boolean): void {
  if (!globe || !current) return;
  const activeId = interactions.activeId() ?? current.active;
  globe.setPins(current.pins);
  globe.setActive(activeId || null);
  globe.setDragSurface(current.slot);
  const pin = current.pins.find((p) => p.id === activeId) ?? current.pins[0];
  if (!pin) return;
  if (fly) globe.flyTo(pin.lat, pin.lon);
  else globe.lookAt(pin.lat, pin.lon);
}

// Keep the window aligned when anything changes size: the window, the slot, or the page
// (fonts and images loading can move the slot without changing its size).
const realign = () => requestAnimationFrame(place);
const resizeObserver = new ResizeObserver(realign);
resizeObserver.observe(root);
window.addEventListener('resize', realign);
window.addEventListener('load', realign);

// Astro copies the new page's <html> attributes on every navigation, which would drop the
// "live" flag; put it back before the new page is painted, so its still stays hidden.
document.addEventListener('astro:after-swap', () => {
  if (live) root.dataset.globe = 'live';
});

/** Point `current` at the page's slot and move the globe over it. */
function relayout(): void {
  const next = readSlot();
  if (next?.slot !== current?.slot) {
    if (current) {
      resizeObserver.unobserve(current.slot);
      compactObserver.unobserve(current.slot);
    }
    if (next) {
      resizeObserver.observe(next.slot);
      compactObserver.observe(next.slot);
    }
  }
  current = next;
  place();
}

/** Set up for the page now showing. Safe to call twice for the same page. */
function onPageLoad(): void {
  relayout();
  if (current && current.slot === setUpSlot) return; // already set up (first-load double call)
  setUpSlot = current?.slot ?? null;
  interactions.reset(current?.active || null); // new page: its default pin, nothing highlighted
  aim(!firstPage);
  firstPage = false;
}

// Page transitions (zoom, move, glide, crossfade). They move the globe into the new page's
// slot themselves, during the swap, so their animations start from the right place.
if (stage) setupTransitions({ getGlobe: () => globe, stage, relayout });

// Fires after the first load and after every navigation. This script may also run after
// the first one has already fired, so it sets up the current page itself as well.
document.addEventListener('astro:page-load', onPageLoad);
onPageLoad();

// Start the globe once. When it's ready, aim at whichever page we're on by then (settled).
if (stage) {
  void mountGlobe(stage, {
    label: 'Dotted globe of the Earth showing where this page is pinned',
    onReady: () => {
      live = true;
      root.dataset.globe = 'live'; // CSS fades the canvas in and the page's still out
    },
  }).then(({ globe: created }) => {
    if (!created) return; // low-end tier, no WebGL or an error: the stills stay
    globe = created;
    aim(false);
  });
}
