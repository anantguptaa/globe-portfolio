/**
 * Based on vertex-earth by Bobby Roe:
 * https://github.com/bobbyroe/vertex-earth
 * MIT License, Copyright (c) 2024 Bobby Roe.
 */

/**
 * Globe — a sphere of dots with pins, drawn with Three.js.
 *
 * Step 5a built the globe; 5b (this file now) adds pins, the label, flyTo and scroll spin.
 * 5c: pauses while off-screen or in a hidden tab, and reports when its first full frame is
 * drawn (onReady) so the loader can fade it in over the still image. Don't import this file
 * directly in a page: use ./loader.ts, which loads it after first paint.
 *
 * How it's put together:
 *  - an icosahedron (a ball made of triangles) gives evenly spread points on a sphere;
 *  - every point is drawn as a dot by the shaders in ./shaders.ts, which read the land mask
 *    to tell land from ocean and drop the dots on the far side;
 *  - the globe is turned by rotating a group (`earth`) that holds the dots and the pins; the
 *    camera never moves (except closer or further, to keep the globe fitted to its container);
 *  - the label is ordinary HTML, moved each frame to where the active pin appears on screen.
 *
 * Dragging: the visible disc of the globe can be dragged to turn it (mouse or touch). On
 * release it keeps turning briefly and slows down (momentum), then after a few seconds
 * untouched it flies back to its "home": the active pin, or the last flyTo/lookAt target.
 * There is no keyboard control on purpose: arrow keys belong to page scrolling, and every
 * place on the globe is also reachable as a normal link.
 *
 * Frames are drawn only while something is changing: a flight, a scroll ease, a drag or its
 * momentum, or the active pin's pulse. The loop also stops while the globe is off-screen or
 * the tab is hidden, and picks up where it left off on return. When everything is still (and always under reduced motion) the loop stops.
 *
 * Public API:
 *   setPins(pins)        replace the pins
 *   setActive(id | null) choose the active pin (the others dim to 55%)
 *   flyTo(lat, lon)      eased turn to a place, shortest way round
 *   lookAt(lat, lon)     instant turn to a place
 *   dispose()            free everything
 */
import * as THREE from 'three';
import './globe.css';
import { fragmentShader, pinFragmentShader, pinVertexShader, vertexShader } from './shaders';

/** A place marked on the globe. */
export interface GlobePin {
  /** Unique name, used with setActive(). */
  id: string;
  lat: number;
  lon: number;
  /** Coordinates as shown in the label, e.g. "53.52°N 113.53°W". */
  coords: string;
  /** Place name as shown in the label, e.g. "Edmonton". */
  label: string;
}

export interface GlobeOptions {
  /** Icosahedron detail. The loader passes 80 or 40 from the device tier (see tier.ts). */
  detail?: number;
  /** URL of the equirectangular land mask. */
  landMaskUrl?: string;
  /** Text alternative for the canvas (it is announced as one image). */
  label?: string;
  /** A canvas and WebGL 2 context created beforehand (loader.ts); otherwise Three.js makes them. */
  canvas?: HTMLCanvasElement;
  context?: WebGL2RenderingContext;
  /** Turn the globe a little as the page scrolls. Default: true. */
  scrollSpin?: boolean;
  /** Let people turn the globe by dragging its visible disc. Default: true. */
  draggable?: boolean;
  /** Called when the globe starts moving (false) and when it comes to rest (true). */
  onSettle?: (settled: boolean) => void;
  /** Called once, when the land mask has loaded and the first full frame is on screen. */
  onReady?: () => void;
}

const RADIUS = 1;
const FOV = 30; // camera field of view, in degrees
const FILL = 0.92; // the globe's outline spans this share of the container's shorter side
const DOT_FILL = 0.55; // dot diameter as a share of the gap between neighbouring dots
const OCEAN_ALPHA = 0.3;
const MAX_PIXEL_RATIO = 2;
const DEG = Math.PI / 180;

const FLY_DURATION = 900; // ms
const SCROLL_DEGREES_PER_PIXEL = 0.25;
const SCROLL_EASE_TIME = 150; // ms: how quickly the scroll spin catches up with the scrollbar
const SETTLE_DELAY = 160; // ms of stillness before the globe counts as settled
const PULSE_DURATION = 1800; // ms
const PIN_DISC_RADIUS = 4; // CSS pixels
const PIN_BOX_SIZE = 36; // CSS pixels: the square a pin is drawn in (the ring's largest size)
const LABEL_MIN_FACING = 0.2; // the label hides once its pin gets this close to the edge
const DRAG_THRESHOLD = 3; // px the pointer must move before a press counts as a drag
const DRAG_TILT_LIMIT = 60; // degrees: how far a drag may tilt the globe north or south
const MOMENTUM_TIME = 325; // ms: how quickly the spin after a flick dies away
const MOMENTUM_MIN_SPEED = 0.002; // degrees per ms: below this the momentum stops
const MOMENTUM_MAX_SPEED = 0.15; // degrees per ms: a hard flick coasts about 50° at most
const RETURN_DELAY = 3000; // ms untouched after a drag before the globe flies back home

/**
 * Latitude/longitude (degrees) → a point on the globe's surface, in the globe's own space.
 * North is +Y; longitude 0° is +Z (facing the camera before any rotation); east is +X.
 * This is the exact inverse of the lat/lon maths in the vertex shader, so pins placed with
 * it line up with the land mask.
 */
export function latLonToVector3(lat: number, lon: number, radius = RADIUS): THREE.Vector3 {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(lambda),
  );
}

/** Reads a colour token (e.g. "--text") from CSS, so no hex values live in this file. */
function tokenColor(name: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) throw new Error(`Globe: CSS token ${name} is not defined`);
  return new THREE.Color(value);
}

/** Wraps a longitude (or a difference of two) into −180…180. */
function wrapDegrees(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/**
 * The same curve as CSS cubic-bezier(x1, y1, x2, y2): give it progress in time (0…1) and it
 * returns eased progress (0…1). The curve is defined by a hidden parameter t, so we first
 * find the t whose x equals our time (a few rounds of Newton's method), then read off y.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (time: number) => number {
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  const slope = (t: number, a: number, b: number) =>
    3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
  return (time) => {
    if (time <= 0) return 0;
    if (time >= 1) return 1;
    let t = time;
    for (let i = 0; i < 8; i++) {
      const error = curve(t, x1, x2) - time;
      const s = slope(t, x1, x2);
      if (Math.abs(error) < 1e-5 || s === 0) break;
      t = Math.min(1, Math.max(0, t - error / s));
    }
    return curve(t, y1, y2);
  };
}

const easeMove = cubicBezier(0.65, 0, 0.35, 1); // same curve as the --ease-move token

/**
 * The icosahedron's corner points, each one once.
 * Three.js stores every triangle separately, so each point appears about six times; drawing
 * them all would cost six times the work and make see-through dots look too bright.
 */
function uniqueSpherePoints(detail: number): Float32Array {
  const source = new THREE.IcosahedronGeometry(RADIUS, detail);
  const positions = source.getAttribute('position');
  const seen = new Set<string>();
  const unique: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(x, y, z);
  }
  source.dispose();
  return new Float32Array(unique);
}

interface Flight {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number; // not wrapped: fromLon plus the shortest difference
  start: number;
}

export class Globe {
  readonly canvas: HTMLCanvasElement;
  /** Number of dots (land + ocean, both sides). */
  readonly pointCount: number;

  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  /** Everything that turns with the Earth: the dots and the pins. */
  private readonly earth = new THREE.Group();
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pinPoints: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly rim: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly landMask: THREE.Texture;
  private readonly blankElevation: THREE.DataTexture;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly scrollSpin: boolean;
  private readonly onSettle?: (settled: boolean) => void;
  private onReady?: () => void; // cleared once called
  private readonly intersectionObserver: IntersectionObserver;
  private readonly draggable: boolean;
  /** The element that receives drag gestures: the canvas, or a page's globe slot. */
  private dragSurface: HTMLElement | null = null;

  // The label (HTML) and the text for screen readers.
  private readonly labelEl: HTMLDivElement;
  private readonly labelCoordsEl: HTMLSpanElement;
  private readonly labelPlaceEl: HTMLSpanElement;
  private readonly srEl: HTMLParagraphElement;

  private pins: GlobePin[] = [];
  private activeId: string | null = null;
  private activeVector: THREE.Vector3 | null = null; // the active pin's place, in the globe's own space

  // Where the globe points. "base" is where flyTo/lookAt put it; scroll spin is added on top.
  private baseLat = 0;
  private baseLon = 0;
  private flight: Flight | null = null;
  private scrollTarget = 0; // extra longitude asked for by the scrollbar
  private scrollCurrent = 0; // extra longitude applied so far (eases towards scrollTarget)

  private frame = 0;
  private lastTime = 0;
  private movingUntil = 0; // the globe counts as moving until this time
  private settled = true;
  private labelVisible = false;
  private disposed = false;

  // Pausing: the loop stops while off-screen or in a hidden tab.
  private onScreen = true;
  private paused = false;
  private pausedAt = 0;
  private returnPending = false; // a drift-back was waiting when the globe paused

  // Home: where the globe drifts back to after a drag (when no pin is active).
  private homeLat = 0;
  private homeLon = 0;

  // Dragging and the momentum after it.
  private pointerId: number | null = null; // the pointer pressed on the globe, if any
  private dragging = false; // true once that pointer has moved past DRAG_THRESHOLD
  private dragStartX = 0;
  private dragStartY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastPointerTime = 0;
  private dragLatLimits: [number, number] = [-DRAG_TILT_LIMIT, DRAG_TILT_LIMIT];
  private velocityLat = 0; // degrees per ms, measured while dragging
  private velocityLon = 0;
  private momentum = false; // still turning after release
  private returnTimer = 0;
  private width = 0;
  private height = 0;

  // Scratch vectors, reused each frame so no memory is allocated while animating.
  private readonly scratchPosition = new THREE.Vector3();
  private readonly scratchNormal = new THREE.Vector3();
  private readonly scratchToCamera = new THREE.Vector3();

  /** Throws if WebGL isn't available; the caller decides what to show instead (5c: the still). */
  constructor(container: HTMLElement, options: GlobeOptions = {}) {
    const {
      detail = 80,
      landMaskUrl = '/globe/landmask.webp',
      label = 'Dotted globe of the Earth',
      scrollSpin = true,
      draggable = true,
      onSettle,
      onReady,
    } = options;

    this.container = container;
    this.scrollSpin = scrollSpin;
    this.onSettle = onSettle;
    this.onReady = onReady;
    this.draggable = draggable;

    // The label is positioned inside the container, so the container must be a positioning box.
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    // ----- Renderer: transparent background, smooth edges, pixel ratio capped at 2 -----
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      // Reuse the loader's context when given one: creating a second can take a long time.
      ...(options.canvas && options.context ? { canvas: options.canvas, context: options.context } : {}),
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(0x000000, 0); // fully transparent: the page shows through

    this.canvas = this.renderer.domElement;
    // Announced to screen readers as one image. The label never changes while the globe
    // moves; the active pin's text goes in the separate live region below.
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', label);
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.classList.add('globe-canvas');
    container.appendChild(this.canvas);

    // ----- Label: plain HTML on top of the canvas. Hidden from screen readers because it
    // comes and goes as the globe moves; they get the same text from srEl instead. -----
    this.labelEl = document.createElement('div');
    this.labelEl.className = 'globe-label';
    this.labelEl.setAttribute('aria-hidden', 'true');
    this.labelEl.dataset.visible = 'false';
    const box = document.createElement('div');
    box.className = 'globe-label__box';
    this.labelCoordsEl = document.createElement('span');
    this.labelCoordsEl.className = 'globe-label__coords';
    this.labelPlaceEl = document.createElement('span');
    this.labelPlaceEl.className = 'globe-label__place';
    box.append(this.labelCoordsEl, this.labelPlaceEl);
    this.labelEl.append(box);
    container.appendChild(this.labelEl);

    // Screen-reader text: the active pin, announced politely when it changes.
    this.srEl = document.createElement('p');
    this.srEl.className = 'globe-sr';
    this.srEl.setAttribute('aria-live', 'polite');
    container.appendChild(this.srEl);

    // ----- Land mask -----
    this.landMask = new THREE.TextureLoader().load(landMaskUrl, () => {
      this.points.visible = true; // hidden until the mask is here, so no all-ocean flash
      this.requestRender();
    });
    this.landMask.colorSpace = THREE.NoColorSpace; // it's data, not a picture
    this.landMask.wrapS = THREE.RepeatWrapping; // left and right edges meet at the date line
    this.landMask.generateMipmaps = false;
    this.landMask.minFilter = THREE.LinearFilter;

    // Stand-in for the elevation map: one black pixel = "no height anywhere".
    // TODO (later): load a real elevation texture and raise uElevationScale (about 0.03).
    this.blankElevation = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blankElevation.needsUpdate = true;

    // ----- Dots -----
    const positions = uniqueSpherePoints(detail);
    this.pointCount = positions.length / 3;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const pixelRatio = this.renderer.getPixelRatio();
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uLandMask: { value: this.landMask },
          uElevationMap: { value: this.blankElevation },
          uElevationScale: { value: 0 },
          uSize: { value: 2 },
          uPixelRatio: { value: pixelRatio },
          uLandColor: { value: tokenColor('--text') },
          uOceanColor: { value: tokenColor('--text-muted') },
          uOceanAlpha: { value: OCEAN_ALPHA }, // faint ocean dots: the sphere reads as round
        },
        transparent: true,
        depthTest: false, // far-side dots are dropped in the shader, so no depth sorting is needed
        depthWrite: false,
      }),
    );
    this.points.visible = false;
    this.earth.add(this.points);

    // ----- Pins: one point each, drawn after (on top of) the dots. Filled in by setPins(). -----
    this.pinPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        vertexShader: pinVertexShader,
        fragmentShader: pinFragmentShader,
        uniforms: {
          uColor: { value: tokenColor('--accent') },
          uBoxSize: { value: PIN_BOX_SIZE },
          uDiscRadius: { value: PIN_DISC_RADIUS },
          uPixelRatio: { value: pixelRatio },
          uPhase: { value: 0 },
          uHasActive: { value: 0 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.pinPoints.renderOrder = 1;
    this.pinPoints.frustumCulled = false; // a handful of points; skip the bounds bookkeeping
    this.pinPoints.visible = false;
    this.earth.add(this.pinPoints);
    this.scene.add(this.earth);

    // ----- Rim: a faint circle around the globe's outline. It isn't in `earth`, so it
    // doesn't turn with the globe. Its size and position are set in resize(). -----
    const rimPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      rimPoints.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    this.rim = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(rimPoints),
      new THREE.LineBasicMaterial({ color: tokenColor('--border') }),
    );
    this.scene.add(this.rim);

    // ----- Listeners -----
    if (this.scrollSpin) {
      // passive: we only read the scroll position, so the browser never waits for us.
      window.addEventListener('scroll', this.handleScroll, { passive: true });
      this.handleScroll();
      this.scrollCurrent = this.scrollTarget; // start already in place: no spin on page load
    }
    this.reducedMotionQuery.addEventListener('change', this.handleMotionPreference);
    if (this.draggable) {
      this.setDragSurface(this.canvas);
    }

    // ----- Keep the canvas the size of its container -----
    // ----- Pause while off-screen or while the tab is hidden -----
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
      this.updatePaused();
    });
    this.intersectionObserver.observe(container);
    document.addEventListener('visibilitychange', this.updatePaused);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  // ------------------------------------------------------------------ Public API

  /** The lat/lon that flyTo/lookAt last aimed at (or is passing, mid-flight). Scroll spin not included. */
  get center(): { lat: number; lon: number } {
    return { lat: this.baseLat, lon: wrapDegrees(this.baseLon) };
  }

  /**
   * Replace all pins. If the active pin is no longer in the list, no pin is active.
   * Pins turn with the globe and are hidden while on its far side.
   */
  setPins(pins: GlobePin[]): void {
    this.pins = [...pins];
    if (!this.pins.some((pin) => pin.id === this.activeId)) this.activeId = null;
    this.rebuildPins();
  }

  /**
   * Choose the active pin by id (null for none). The active pin pulses and gets the label;
   * the others draw at 55% opacity. This doesn't turn the globe: call flyTo as well.
   */
  setActive(id: string | null): void {
    this.activeId = id !== null && this.pins.some((pin) => pin.id === id) ? id : null;
    this.rebuildPins();
  }

  /**
   * Turn the globe so (lat, lon) faces the viewer, over about 0.9s with the --ease-move curve.
   * Longitude takes the shortest way round, so it never crosses the long way over the date
   * line; north stays up throughout. Calling it again mid-flight starts a new turn from
   * wherever the globe is at that moment, so the position never jumps.
   * Under prefers-reduced-motion it jumps straight there.
   */
  flyTo(lat: number, lon: number): void {
    this.setHome(lat, lon);
    this.startFlight(lat, lon);
  }

  /** Turn the globe so (lat, lon) faces the viewer, instantly. Cancels any flight. */
  lookAt(lat: number, lon: number): void {
    this.setHome(lat, lon);
    this.jumpTo(lat, lon);
  }

  /**
   * Where a pin is on screen right now, in CSS pixels from the container's top-left corner,
   * or null if there's no such pin or it's on the far side. Uses the globe's current rotation
   * (as last drawn), so it's correct mid-flight. The page-change zoom anchors on this.
   */
  pinScreenPoint(id: string): { x: number; y: number } | null {
    const pin = this.pins.find((p) => p.id === id);
    if (!pin || !this.width || !this.height) return null;
    const position = latLonToVector3(pin.lat, pin.lon).applyMatrix4(this.earth.matrixWorld);
    const toCamera = this.camera.position.clone().sub(position).normalize();
    if (position.clone().normalize().dot(toCamera) <= 0) return null; // far side
    position.project(this.camera);
    return { x: ((position.x + 1) / 2) * this.width, y: ((1 - position.y) / 2) * this.height };
  }

  /**
   * Choose which element turns the globe when dragged. By default it's the canvas. On the
   * site the canvas sits behind the page, so each page's globe slot (over the same spot)
   * is passed in instead; content on top of the slot stays clickable. null turns drag off.
   * Only presses on the globe's visible disc start a drag (see isOverGlobe).
   */
  setDragSurface(surface: HTMLElement | null): void {
    const old = this.dragSurface;
    if (old === surface) return;
    if (old) {
      old.removeEventListener('pointerdown', this.handlePointerDown);
      old.removeEventListener('pointermove', this.handlePointerMove);
      old.removeEventListener('pointerup', this.handlePointerUp);
      old.removeEventListener('pointercancel', this.handlePointerUp);
      old.removeEventListener('pointerleave', this.handlePointerLeave);
      delete old.dataset.globeDrag;
      delete old.dataset.over;
      delete old.dataset.dragging;
    }
    // A drag in progress on the old surface ends here.
    this.pointerId = null;
    this.dragging = false;
    this.dragSurface = this.draggable ? surface : null;
    const next = this.dragSurface;
    if (!next) return;
    next.dataset.globeDrag = 'true';
    next.addEventListener('pointerdown', this.handlePointerDown);
    next.addEventListener('pointermove', this.handlePointerMove);
    next.addEventListener('pointerup', this.handlePointerUp);
    next.addEventListener('pointercancel', this.handlePointerUp);
    next.addEventListener('pointerleave', this.handlePointerLeave);
  }

  /** Make sure a frame is drawn soon. The loop then keeps itself going while anything is moving. */
  requestRender(): void {
    // While paused, skip: resuming always draws a fresh frame.
    if (this.disposed || this.paused || this.frame) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Free everything this globe created. */
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.returnTimer);
    window.removeEventListener('scroll', this.handleScroll);
    this.reducedMotionQuery.removeEventListener('change', this.handleMotionPreference);
    this.setDragSurface(null);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', this.updatePaused);
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.pinPoints.geometry.dispose();
    this.pinPoints.material.dispose();
    this.rim.geometry.dispose();
    this.rim.material.dispose();
    this.landMask.dispose();
    this.blankElevation.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.labelEl.remove();
    this.srEl.remove();
  }

  // ------------------------------------------------------------------ Internals

  /** Remember where the globe should rest, and drop anything left over from a drag. */
  private setHome(lat: number, lon: number): void {
    this.homeLat = lat;
    this.homeLon = lon;
    this.momentum = false;
    this.returnPending = false;
    clearTimeout(this.returnTimer);
  }

  /** Eased turn to (lat, lon); a jump under reduced motion. Doesn't change home. */
  private startFlight(lat: number, lon: number): void {
    if (this.reducedMotionQuery.matches) {
      this.jumpTo(lat, lon);
      return;
    }
    const now = performance.now();
    this.advanceFlight(now); // bring baseLat/baseLon up to date before starting from them
    this.flight = {
      fromLat: this.baseLat,
      fromLon: this.baseLon,
      toLat: Math.max(-90, Math.min(90, lat)),
      toLon: this.baseLon + wrapDegrees(lon - this.baseLon),
      start: now,
    };
    this.requestRender();
  }

  /** Instant turn to (lat, lon). Cancels any flight. Doesn't change home. */
  private jumpTo(lat: number, lon: number): void {
    this.flight = null;
    this.baseLat = Math.max(-90, Math.min(90, lat));
    this.baseLon = wrapDegrees(lon);
    this.movingUntil = performance.now() + SETTLE_DELAY;
    this.requestRender();
  }

  /** Where to drift back to after a drag: the active pin, or else home. */
  private returnHome = (): void => {
    const activePin = this.pins.find((pin) => pin.id === this.activeId);
    if (activePin) this.startFlight(activePin.lat, activePin.lon);
    else this.startFlight(this.homeLat, this.homeLon);
  };

  private scheduleReturn(): void {
    clearTimeout(this.returnTimer);
    this.returnPending = true;
    this.returnTimer = window.setTimeout(() => {
      this.returnPending = false;
      this.returnHome();
    }, RETURN_DELAY);
  }

  /**
   * Pause or resume, from the IntersectionObserver and visibilitychange. On resume a flight
   * carries on from where it stopped (its start time is moved on by the pause), the frame
   * clock restarts so nothing lurches, and a waiting drift-back gets its full delay again.
   */
  private readonly updatePaused = (): void => {
    const shouldPause = !this.onScreen || document.visibilityState === 'hidden';
    if (shouldPause === this.paused) return;
    const now = performance.now();

    if (shouldPause) {
      this.paused = true;
      this.pausedAt = now;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (this.returnPending) clearTimeout(this.returnTimer);
      return;
    }

    this.paused = false;
    if (this.flight) this.flight.start += now - this.pausedAt;
    this.lastTime = 0;
    if (this.returnPending) this.scheduleReturn();
    this.requestRender(); // draws once, and restarts the loop if anything is still moving
  };

  /**
   * Is a screen point over the globe's visible disc? Only there does a press start a drag;
   * elsewhere on the canvas the press is left alone. The disc's radius on screen is FILL of
   * half the container's shorter side (see resize()).
   */
  private isOverGlobe(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const radius = (FILL * Math.min(rect.width, rect.height)) / 2;
    return dx * dx + dy * dy <= radius * radius;
  }

  /** Degrees of turn per pixel dragged, so the surface under the pointer roughly follows it. */
  private degreesPerPixel(): number {
    const radiusPx = (FILL * Math.min(this.width, this.height)) / 2;
    return 180 / (Math.PI * Math.max(radiusPx, 1));
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointerId !== null) return; // main button, one pointer
    if (!this.isOverGlobe(event.clientX, event.clientY)) return;
    this.pointerId = event.pointerId;
    this.dragging = false;
    this.dragStartX = this.lastPointerX = event.clientX;
    this.dragStartY = this.lastPointerY = event.clientY;
    this.lastPointerTime = performance.now();
    this.velocityLat = this.velocityLon = 0;
    // Grabbing the globe stops whatever it was doing.
    this.momentum = false;
    this.returnPending = false;
    clearTimeout(this.returnTimer);
    this.advanceFlight(performance.now());
    this.flight = null;
    this.dragSurface?.setPointerCapture(event.pointerId); // keep receiving moves outside it
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    // Not pressed: just show the grab cursor over the disc (styled in globe.css).
    if (this.pointerId === null) {
      if (this.dragSurface) this.dragSurface.dataset.over = String(this.isOverGlobe(event.clientX, event.clientY));
      return;
    }
    if (event.pointerId !== this.pointerId) return;

    if (!this.dragging) {
      const moved = Math.hypot(event.clientX - this.dragStartX, event.clientY - this.dragStartY);
      if (moved < DRAG_THRESHOLD) return;
      this.dragging = true;
      if (this.dragSurface) this.dragSurface.dataset.dragging = 'true';
      // Tilt limits: ±60°, widened if the globe already sits further out (e.g. at the North
      // Pole for About), so starting a drag never makes it jump.
      this.dragLatLimits = [Math.min(-DRAG_TILT_LIMIT, this.baseLat), Math.max(DRAG_TILT_LIMIT, this.baseLat)];
    }

    const now = performance.now();
    const perPixel = this.degreesPerPixel();
    // Dragging right brings places further west into view; dragging down tilts the north
    // towards the viewer.
    const dLon = -(event.clientX - this.lastPointerX) * perPixel;
    const dLat = (event.clientY - this.lastPointerY) * perPixel;
    const [minLat, maxLat] = this.dragLatLimits;
    this.baseLon += dLon;
    this.baseLat = Math.max(minLat, Math.min(maxLat, this.baseLat + dLat));

    // Speed for the momentum: mostly the latest move, smoothed a little.
    const dt = Math.max(now - this.lastPointerTime, 1);
    this.velocityLon = 0.8 * (dLon / dt) + 0.2 * this.velocityLon;
    this.velocityLat = 0.8 * (dLat / dt) + 0.2 * this.velocityLat;

    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.lastPointerTime = now;
    this.movingUntil = now + SETTLE_DELAY;
    this.requestRender();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    if (this.dragSurface?.hasPointerCapture(event.pointerId)) this.dragSurface.releasePointerCapture(event.pointerId);
    const wasDragging = this.dragging;
    this.pointerId = null;
    this.dragging = false;
    if (this.dragSurface) delete this.dragSurface.dataset.dragging;
    if (!wasDragging) return; // a plain click: nothing to do

    // A pause before letting go means no flick: no momentum.
    const paused = performance.now() - this.lastPointerTime > 80;
    if (paused) this.velocityLat = this.velocityLon = 0;
    // Cap the speed, keeping its direction, so a hard flick doesn't send the globe spinning.
    const speed = Math.hypot(this.velocityLat, this.velocityLon);
    if (speed > MOMENTUM_MAX_SPEED) {
      this.velocityLat *= MOMENTUM_MAX_SPEED / speed;
      this.velocityLon *= MOMENTUM_MAX_SPEED / speed;
    }
    const fast = speed > MOMENTUM_MIN_SPEED;
    if (fast && !this.reducedMotionQuery.matches) {
      this.momentum = true; // tick() runs it, then schedules the return home
      this.requestRender();
    } else {
      this.scheduleReturn();
    }
  };

  private readonly handlePointerLeave = (): void => {
    if (this.pointerId === null && this.dragSurface) delete this.dragSurface.dataset.over;
  };

  private readonly handleScroll = (): void => {
    if (this.reducedMotionQuery.matches) return; // no scroll spin under reduced motion
    this.scrollTarget = window.scrollY * SCROLL_DEGREES_PER_PIXEL;
    this.requestRender();
  };

  private readonly handleMotionPreference = (): void => {
    if (this.reducedMotionQuery.matches) {
      // Finish any flight at once and drop the scroll spin.
      if (this.flight) this.jumpTo(this.flight.toLat, this.flight.toLon);
      if (this.momentum) {
        this.momentum = false;
        this.scheduleReturn();
      }
      this.scrollTarget = 0;
      this.scrollCurrent = 0;
    } else if (this.scrollSpin) {
      this.handleScroll();
    }
    this.requestRender();
  };

  /** Rebuild the pins' geometry from this.pins and this.activeId, and update the label text. */
  private rebuildPins(): void {
    // The active pin goes last so it is drawn on top of any pin it overlaps.
    const ordered = [...this.pins].sort((a, b) => Number(a.id === this.activeId) - Number(b.id === this.activeId));
    const positions = new Float32Array(ordered.length * 3);
    const active = new Float32Array(ordered.length);
    ordered.forEach((pin, i) => {
      latLonToVector3(pin.lat, pin.lon).toArray(positions, i * 3);
      active[i] = pin.id === this.activeId ? 1 : 0;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aActive', new THREE.BufferAttribute(active, 1));
    this.pinPoints.geometry.dispose();
    this.pinPoints.geometry = geometry;
    this.pinPoints.visible = ordered.length > 0;

    const activePin = this.pins.find((pin) => pin.id === this.activeId) ?? null;
    this.pinPoints.material.uniforms.uHasActive.value = activePin ? 1 : 0;
    this.activeVector = activePin ? latLonToVector3(activePin.lat, activePin.lon) : null;

    this.labelCoordsEl.textContent = activePin?.coords ?? '';
    this.labelPlaceEl.textContent = activePin?.label ?? '';
    this.srEl.textContent = activePin ? `Globe pin: ${activePin.coords}, ${activePin.label}` : '';

    this.requestRender();
  }

  /** Move baseLat/baseLon along the current flight, ending it when its time is up. */
  private advanceFlight(now: number): void {
    const flight = this.flight;
    if (!flight) return;
    const progress = Math.min(1, (now - flight.start) / FLY_DURATION);
    const eased = easeMove(progress);
    this.baseLat = flight.fromLat + (flight.toLat - flight.fromLat) * eased;
    this.baseLon = flight.fromLon + (flight.toLon - flight.fromLon) * eased;
    if (progress >= 1) {
      this.baseLon = wrapDegrees(this.baseLon);
      this.flight = null;
    }
  }

  /** One frame: advance the motion, draw, place the label, and decide whether to keep going. */
  private readonly tick = (): void => {
    this.frame = 0;
    if (this.disposed) return;
    // Read the clock here instead of using the time the browser passes to this callback:
    // flyTo and lookAt also use performance.now(), and all three must agree.
    const now = performance.now();
    const elapsed = this.lastTime ? Math.min(now - this.lastTime, 100) : 16;
    this.lastTime = now;
    const reduced = this.reducedMotionQuery.matches;

    // 1. Flight.
    const flying = this.flight !== null;
    this.advanceFlight(now);

    // 2. Scroll spin: close a fixed share of the remaining gap each frame (an "ease out"),
    //    scaled by the frame's length so it feels the same at 60 and 120 frames a second.
    let scrolling = false;
    const gap = this.scrollTarget - this.scrollCurrent;
    if (Math.abs(gap) > 0.05) {
      this.scrollCurrent += gap * (1 - Math.exp(-elapsed / SCROLL_EASE_TIME));
      scrolling = true;
    } else {
      this.scrollCurrent = this.scrollTarget;
    }

    // 3. Momentum after a flick: keep turning at the release speed, slowing exponentially.
    let coasting = false;
    if (this.momentum) {
      const decay = Math.exp(-elapsed / MOMENTUM_TIME);
      this.baseLon += this.velocityLon * elapsed;
      this.baseLat = Math.max(
        this.dragLatLimits[0],
        Math.min(this.dragLatLimits[1], this.baseLat + this.velocityLat * elapsed),
      );
      this.velocityLon *= decay;
      this.velocityLat *= decay;
      if (Math.hypot(this.velocityLat, this.velocityLon) < MOMENTUM_MIN_SPEED) {
        this.momentum = false;
        this.scheduleReturn();
      } else {
        coasting = true;
      }
    }

    if (flying || scrolling || coasting || this.dragging) this.movingUntil = now + SETTLE_DELAY;
    const moving = now < this.movingUntil;
    this.setSettled(!moving);

    // 4. Pulse: the ring's progress through its 1.8s loop. Under reduced motion it is
    //    drawn once, still, part-way out.
    const pulsing = this.activeVector !== null && !reduced;
    this.pinPoints.material.uniforms.uPhase.value = reduced ? 0.45 : (now % PULSE_DURATION) / PULSE_DURATION;

    this.render();

    // 5. Keep the loop going only while something is still changing.
    if (moving || pulsing) this.requestRender();
    else this.lastTime = 0;
  };

  private setSettled(settled: boolean): void {
    if (settled === this.settled) return;
    this.settled = settled;
    this.onSettle?.(settled);
  }

  private render(): void {
    // Spin about the vertical axis to bring the longitude round to the front, then tip the
    // globe to bring the latitude to the middle. Order 'XYZ' applies the Y turn first.
    this.earth.rotation.set(this.baseLat * DEG, -(this.baseLon + this.scrollCurrent) * DEG, 0, 'XYZ');
    this.earth.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    this.updateLabel();

    // First full frame (dots visible, so the mask is in): tell the loader it can fade us in.
    if (this.onReady && this.points.visible) {
      const ready = this.onReady;
      this.onReady = undefined;
      ready();
    }
  }

  /**
   * Place the HTML label over the active pin.
   * 3D → screen in three steps:
   *  1. the pin's place in the globe's own space → world space, by applying the globe's
   *     current rotation (earth.matrixWorld);
   *  2. world space → "normalised device coordinates" with project(camera): x and y each
   *     run from −1 to 1 across the canvas (left to right, bottom to top);
   *  3. those → CSS pixels inside the container (y flips, because CSS counts down from the top).
   */
  private updateLabel(): void {
    let visible = false;
    if (this.activeVector && this.settled) {
      const position = this.scratchPosition.copy(this.activeVector).applyMatrix4(this.earth.matrixWorld);
      // Is the pin on the near side? Same test as the shader: compare the surface's "up"
      // direction with the direction from the pin to the camera.
      const normal = this.scratchNormal.copy(position).normalize();
      const toCamera = this.scratchToCamera.copy(this.camera.position).sub(position).normalize();
      if (normal.dot(toCamera) > LABEL_MIN_FACING) {
        position.project(this.camera);
        const x = ((position.x + 1) / 2) * this.width;
        const y = ((1 - position.y) / 2) * this.height;
        this.labelEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        visible = true;
      }
    }
    if (visible !== this.labelVisible) {
      this.labelVisible = visible;
      this.labelEl.dataset.visible = String(visible);
    }
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.width = width;
    this.height = height;

    this.renderer.setSize(width, height, false); // false: CSS keeps the canvas at 100% × 100%
    this.camera.aspect = width / height;

    // Move the camera so the globe's outline fills FILL of the container's shorter side.
    // tan(half the camera's view) covers half the screen; the globe's outline sits at
    // tan(alpha), where alpha is the angle between the globe's centre and its edge as seen
    // from the camera, and sin(alpha) = radius / distance.
    const tanHalfFov = Math.tan((FOV / 2) * DEG) * Math.min(1, this.camera.aspect);
    const tanAlpha = FILL * tanHalfFov;
    const sinAlpha = tanAlpha / Math.sqrt(1 + tanAlpha * tanAlpha);
    const distance = RADIUS / sinAlpha;
    this.camera.position.set(0, 0, distance);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    // Seen in perspective, a sphere's outline is a circle slightly in front of its centre
    // and slightly smaller than its radius. Put the rim exactly there.
    this.rim.position.z = (RADIUS * RADIUS) / distance;
    this.rim.scale.setScalar(RADIUS * Math.sqrt(1 - (RADIUS * RADIUS) / (distance * distance)));

    // Dot size follows the globe's size on screen: a fixed share of the gap between dots.
    const globeRadiusPx = (FILL * Math.min(width, height)) / 2;
    const gapPx = globeRadiusPx * Math.sqrt((4 * Math.PI) / this.pointCount);
    const pixelRatio = this.renderer.getPixelRatio();
    this.points.material.uniforms.uSize.value = Math.max(1, gapPx * DOT_FILL);
    this.points.material.uniforms.uPixelRatio.value = pixelRatio;
    this.pinPoints.material.uniforms.uPixelRatio.value = pixelRatio;

    // Draw straight away (not on the next frame): resizing clears the canvas, and waiting
    // would show one blank frame.
    this.render();
  }
}
