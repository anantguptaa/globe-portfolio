/**
 * Page transitions (spec "Transitions and motion"). Started once by site-globe.ts; all
 * listeners live on `document`, which survives every ClientRouter navigation.
 *
 * On astro:before-preparation each navigation is sorted into one kind (html[data-nav]):
 *
 *   crossfade  reduced motion, or no live globe (low-end tier, no WebGL): 0.2s crossfade;
 *              the globe jumps to its pin (stills crossfade with the page).
 *   zoom       landing → inner page via a menu row (T1): dive ×9 into the pin, settle ×3 → ×1.
 *   glide      inner page → landing: the globe glides back to its landing spot (0.6s) while
 *              the landing page fades in (0.3s). No zoom out.
 *   move       inner page → inner page (T2): the globe moves to its new spot (0.9s) and turns
 *              to the new pin; old content fades out (0.25s), new fades in (0.45s, 0.3s
 *              delay). Through a header word, that word also flies into the page title.
 *
 * Back/forward use the equivalent link: back to the landing page glides; forward from the
 * landing page to a menu page zooms into that row's pin; to a header page, its word morphs.
 * Direct visits and reloads aren't navigations, so nothing here runs: the page shows settled.
 *
 * Astro's events, in order, and what happens at each:
 *   astro:before-preparation  sort the navigation; remember where the globe is; zoom: start
 *                             the dive (the loader is wrapped so the swap waits for it);
 *                             morph: name the clicked word (view-transition-name).
 *   astro:after-preparation   (new page fetched)
 *   astro:before-swap         (view transition: snapshot of the old page)
 *   swap
 *   astro:after-swap          put the globe in the new slot and animate it from where it was;
 *                             morph: give the new title the same name; CSS fades content in.
 *   astro:page-load           (site-globe.ts aims the globe at the page's pin)
 *
 * The word morph and duplicate names: a view-transition-name must be unique on a page, and
 * the current page's header link and its title would otherwise share one. So nothing carries
 * the name in the HTML. Only the clicked link gets it (before the old snapshot), only the new
 * title gets it (after the swap), and both are removed when the transition is over.
 */
import type { TransitionBeforePreparationEvent, TransitionBeforeSwapEvent } from 'astro:transitions/client';
import type { Globe } from './Globe';

type Kind = 'crossfade' | 'zoom' | 'glide' | 'move';

interface Context {
  getGlobe(): Globe | null;
  /** The element the globe is drawn in. Its parent is the window placed over the slot. */
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
const pathOf = (url: URL) => url.pathname.replace(/\/$/, '') || '/';

export function setupTransitions(ctx: Context): void {
  const { stage } = ctx;
  const windowEl = stage.parentElement as HTMLElement;

  /** The navigation in progress, if any. */
  let nav: {
    kind: Kind;
    globe: Globe | null;
    /** Zoom: the pin dived into. */
    pin: { lat: number; lon: number } | null;
    /** Move/glide: where the globe's disc was on screen before the swap. */
    fromDisc: DOMRect | null;
    /** Morph: the shared view-transition-name, and the elements carrying it. */
    morphName: string | null;
    named: HTMLElement[];
    /** Resolves when the browser's view transition is over (set at astro:before-swap). */
    transitionDone: Promise<unknown>;
    giveUp: number;
  } | null = null;

  function cleanUp(): void {
    if (!nav) return;
    clearTimeout(nav.giveUp);
    for (const el of nav.named) {
      el.style.viewTransitionName = '';
      delete el.dataset.morphWord;
    }
    stage.getAnimations().forEach((a) => a.cancel());
    windowEl.getAnimations().forEach((a) => a.cancel());
    stage.style.transformOrigin = '';
    windowEl.style.transformOrigin = '';
    delete root.dataset.nav;
    delete root.dataset.phase;
    nav = null;
  }

  /** The landing menu row for a destination (by URL), if there is one. */
  const menuRowFor = (path: string) =>
    [...document.querySelectorAll<HTMLElement>('.menu-row[data-globe-target]')].find(
      (a) => pathOf(new URL((a as HTMLAnchorElement).href)) === path,
    ) ?? null;

  /** The header word for a destination (inner pages' header nav), if there is one. */
  const headerWordFor = (path: string) =>
    [...document.querySelectorAll<HTMLAnchorElement>('.site-header nav a[href]')].find(
      (a) => pathOf(new URL(a.href)) === path,
    ) ?? null;

  document.addEventListener('astro:before-preparation', (event) => {
    const e = event as TransitionBeforePreparationEvent;
    cleanUp(); // a new navigation interrupts an old one

    const fromLanding = document.body.classList.contains('is-landing');
    const toPath = pathOf(e.to);
    const toLanding = toPath === '/';
    if (fromLanding && toLanding) return; // nothing to animate between identical layouts

    const globe = root.dataset.globe === 'live' ? ctx.getGlobe() : null;
    const source = e.sourceElement ?? null;
    const traverse = e.navigationType === 'traverse';

    let kind: Kind;
    let row: HTMLElement | null = null;
    let word: HTMLElement | null = null;
    if (reducedMotion.matches || !globe) {
      kind = 'crossfade';
    } else if (fromLanding) {
      row = source?.closest<HTMLElement>('.menu-row[data-globe-target]') ?? (traverse ? menuRowFor(toPath) : null);
      kind = row ? 'zoom' : 'move';
    } else if (toLanding) {
      kind = 'glide';
    } else {
      kind = 'move';
      // The word flies only for header pages: from the clicked header link, or (back/forward)
      // from the header link for where we're going.
      const clicked = source?.closest<HTMLElement>('.site-header nav a[href]') ?? null;
      word = clicked ?? (traverse ? headerWordFor(toPath) : null);
      if (word && pathOf(new URL((word as HTMLAnchorElement).href)) !== toPath) word = null;
    }

    root.dataset.nav = kind;
    root.dataset.phase = 'out';
    nav = {
      kind,
      globe,
      pin: null,
      fromDisc: globe ? stage.getBoundingClientRect() : null,
      morphName: null,
      named: [],
      transitionDone: Promise.resolve(),
      giveUp: window.setTimeout(cleanUp, GIVE_UP_AFTER),
    };

    if (word) {
      // Only this link carries the name in the old page's snapshot.
      nav.morphName = `title-${toPath.replace(/^\//, '').replace(/\//g, '-') || 'home'}`;
      word.style.viewTransitionName = nav.morphName;
      word.dataset.morphWord = ''; // CSS: blue at the start of the morph
      nav.named.push(word);
    }

    if (kind === 'zoom' && globe && row) startDive(e, globe, row.dataset.globeTarget ?? '');
  });

  /** Zoom (T1): fade the landing page, dive the globe ×9 into the pin; swap at the peak. */
  function startDive(e: TransitionBeforePreparationEvent, globe: Globe, pinId: string): void {
    if (!nav) return;
    const pins = JSON.parse(document.querySelector<HTMLElement>('[data-globe-slot]')?.dataset.pins ?? '[]');
    nav.pin = pins.find((p: { id: string }) => p.id === pinId) ?? null;

    const duration = tokenMs('--dur-zoom', 620);
    const fadeOut = tokenMs('--dur-fade-out', 250);
    const scale = stage.animate([{ transform: 'scale(1)' }, { transform: `scale(${ZOOM_SCALE})` }], {
      duration,
      easing: tokenEase('--ease-zoom-in', 'cubic-bezier(0.7, 0, 0.84, 0)'),
      fill: 'forwards',
    });
    // Fades out over the last part of the dive, gone by the peak.
    stage.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: fadeOut,
      delay: Math.max(0, duration - fadeOut),
      fill: 'forwards',
    });

    // Anchor the scale on the pin's real position, following it if the globe is still flying
    // there. Only touches the style when the point actually moves.
    let last = '';
    const follow = () => {
      if (!nav || scale.playState !== 'running') return;
      const p = globe.pinScreenPoint(pinId);
      const origin = p ? `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px` : '50% 50%';
      if (origin !== last) stage.style.transformOrigin = last = origin;
      requestAnimationFrame(follow);
    };
    follow();

    // Swap only when the new page has loaded AND the dive has reached its peak.
    const dive = scale.finished.catch(() => undefined);
    const load = e.loader;
    e.loader = async () => {
      await Promise.all([load(), dive]);
    };
  }

  // The browser's view transition (or Astro's fallback for browsers without one). The
  // html[data-nav] styles must stay until it's over: removing them early would hand the
  // running transition back to the browser's default crossfade, which would start again.
  document.addEventListener('astro:before-swap', (event) => {
    if (!nav) return;
    const finished = (event as TransitionBeforeSwapEvent).viewTransition?.finished;
    if (finished) nav.transitionDone = finished.catch(() => undefined);
  });

  document.addEventListener('astro:after-swap', () => {
    if (!nav) return;
    // Re-applied: Astro copied the new page's <html> attributes during the swap.
    root.dataset.nav = nav.kind;
    root.dataset.phase = 'in';
    const { kind } = nav;

    // Morph: the new page's title takes the name (its own header link has none).
    if (nav.morphName) {
      const title = document.querySelector<HTMLElement>('main h1');
      if (title) {
        title.style.viewTransitionName = nav.morphName;
        nav.named.push(title);
      }
    }

    let done: Promise<unknown>;
    if (kind === 'zoom') {
      done = settleZoom();
    } else if (kind === 'crossfade') {
      ctx.relayout(); // the globe (if any) jumps; site-globe.ts aims it on page load
      done = wait(tokenMs('--dur-crossfade', 200));
    } else {
      done = moveGlobe(kind);
    }
    const current = nav;
    void Promise.all([done, nav.transitionDone]).then(() => {
      if (nav === current) cleanUp(); // not if a newer navigation has already taken over
    });
  });

  /** Zoom settle: the globe appears in the new slot at ×3, invisible, and settles to ×1. */
  function settleZoom(): Promise<unknown> {
    if (!nav) return Promise.resolve();
    const { globe, pin } = nav;
    stage.getAnimations().forEach((a) => a.cancel());
    stage.style.transformOrigin = '50% 50%';
    ctx.relayout();
    const fadeIn = wait(tokenMs('--dur-fade-in', 450));
    if (!globe) return fadeIn;
    if (pin) globe.lookAt(pin.lat, pin.lon); // invisible right now, so the snap can't be seen
    const settle = tokenMs('--dur-settle', 600);
    const move = stage.animate([{ transform: `scale(${SETTLE_FROM})` }, { transform: 'scale(1)' }], {
      duration: settle,
      easing: tokenEase('--ease-settle', 'cubic-bezier(0.16, 1, 0.3, 1)'),
      fill: 'backwards',
    });
    stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(350, settle), fill: 'backwards' });
    return Promise.all([move.finished.catch(() => undefined), fadeIn]);
  }

  /**
   * Move and glide: place the globe in the new slot, then animate it from where its disc was
   * before the swap back to its new place (a "FLIP": the move is measured, then played back).
   * The whole window moves, so the new slot's fade moves with it; scaling is uniform, from
   * one disc size to the other. Meanwhile site-globe.ts flies it to the new pin.
   */
  function moveGlobe(kind: 'move' | 'glide'): Promise<unknown> {
    if (!nav) return Promise.resolve();
    const from = nav.fromDisc;
    const fadeIn =
      kind === 'glide'
        ? wait(tokenMs('--dur-landing-in', 300))
        : wait(tokenMs('--delay-fade-in', 300) + tokenMs('--dur-fade-in', 450));
    ctx.relayout();
    const to = stage.getBoundingClientRect();
    if (!from || !to.width || !from.width) return fadeIn;

    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = from.width / to.width;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return fadeIn; // same spot

    // Scale around the new disc's centre, in the window's own coordinates.
    const win = windowEl.getBoundingClientRect();
    windowEl.style.transformOrigin = `${to.left - win.left + to.width / 2}px ${to.top - win.top + to.height / 2}px`;
    const duration = kind === 'glide' ? tokenMs('--dur-glide', 600) : tokenMs('--dur-move', 900);
    const anim = windowEl.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: 'none' }],
      { duration, easing: tokenEase('--ease-move', 'cubic-bezier(0.65, 0, 0.35, 1)'), fill: 'backwards' },
    );
    return Promise.all([anim.finished.catch(() => undefined), fadeIn]);
  }
}
