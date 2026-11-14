/**
 * Globe — a sphere of dots, drawn with Three.js.
 *
 * Step 5a: the globe by itself. Pins, labels, flyTo and scroll spin come in 5b; loading after
 * first paint, pausing off-screen and the still-image fallback come in 5c.
 *
 * How it's put together:
 *  - an icosahedron (a ball made of triangles) gives evenly spread points on a sphere;
 *  - every point is drawn as a dot by the shaders in ./shaders.ts, which read the land mask
 *    to tell land from ocean and drop the dots on the far side;
 *  - the globe is turned by rotating a group that holds the dots; the camera never moves
 *    (except closer or further, to keep the globe fitted to its container).
 *
 * Nothing spins by itself, so a frame is drawn only when something changed (see requestRender).
 */
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shaders';

export type OceanMode = 'hidden' | 'dim';

export interface GlobeOptions {
  /** Icosahedron detail. Default: 80, or 40 when the window is narrower than 768px. */
  detail?: number;
  /** 'hidden' (default) draws land only; 'dim' also draws faint ocean dots. */
  ocean?: OceanMode;
  /** URL of the equirectangular land mask. */
  landMaskUrl?: string;
  /** Text alternative for the canvas. */
  label?: string;
}

const RADIUS = 1;
const FOV = 30; // camera field of view, in degrees
const FILL = 0.92; // the globe's outline spans this share of the container's shorter side
const DOT_FILL = 0.55; // dot diameter as a share of the gap between neighbouring dots
const OCEAN_ALPHA = 0.3;
const MAX_PIXEL_RATIO = 2;
const DEG = Math.PI / 180;

/**
 * Latitude/longitude (degrees) → a point on the globe's surface, in the globe's own space.
 * North is +Y; longitude 0° is +Z (facing the camera before any rotation); east is +X.
 * This is the exact inverse of the lat/lon maths in the vertex shader, so anything placed
 * with it (debug dots now, pins in 5b) lines up with the land mask.
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

export class Globe {
  readonly canvas: HTMLCanvasElement;
  /** Number of dots (land + ocean, both sides). */
  readonly pointCount: number;

  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  /** Everything that turns with the Earth: the dots, and anything pinned to the surface. */
  private readonly earth = new THREE.Group();
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly rim: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly landMask: THREE.Texture;
  private readonly blankElevation: THREE.DataTexture;
  private readonly resizeObserver: ResizeObserver;
  private readonly debugDots: THREE.Mesh[] = [];

  private frame = 0;
  private disposed = false;
  private centerLat = 0;
  private centerLon = 0;

  /** Throws if WebGL isn't available; the caller decides what to show instead (5c: the still). */
  constructor(container: HTMLElement, options: GlobeOptions = {}) {
    const {
      detail = window.matchMedia('(max-width: 767.98px)').matches ? 40 : 80,
      ocean = 'hidden',
      landMaskUrl = '/globe/landmask.webp',
      label = 'Dotted globe of the Earth',
    } = options;

    this.container = container;

    // ----- Renderer: transparent background, smooth edges, pixel ratio capped at 2 -----
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(0x000000, 0); // fully transparent: the page shows through

    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', label);
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

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

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uLandMask: { value: this.landMask },
        uElevationMap: { value: this.blankElevation },
        uElevationScale: { value: 0 },
        uSize: { value: 2 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uLandColor: { value: tokenColor('--text') },
        uOceanColor: { value: tokenColor('--text-muted') },
        uOceanAlpha: { value: ocean === 'dim' ? OCEAN_ALPHA : 0 },
      },
      transparent: true,
      depthTest: false, // far-side dots are dropped in the shader, so no depth sorting is needed
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.visible = false;
    this.earth.add(this.points);
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

    // ----- Keep the canvas the size of its container -----
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** The lat/lon currently facing the camera. */
  get center(): { lat: number; lon: number } {
    return { lat: this.centerLat, lon: this.centerLon };
  }

  /**
   * Turn the globe so (lat, lon) is at the centre, facing the camera. Instant;
   * the eased flyTo comes in 5b.
   */
  lookAt(lat: number, lon: number): void {
    this.centerLat = Math.max(-90, Math.min(90, lat));
    this.centerLon = ((((lon + 180) % 360) + 360) % 360) - 180; // wrap to −180…180
    // Spin about the vertical axis to bring the longitude round to the front, then tip the
    // globe to bring the latitude to the middle. Order 'XYZ' applies the Y turn first.
    this.earth.rotation.set(this.centerLat * DEG, -this.centerLon * DEG, 0, 'XYZ');
    this.requestRender();
  }

  setOcean(mode: OceanMode): void {
    this.points.material.uniforms.uOceanAlpha.value = mode === 'dim' ? OCEAN_ALPHA : 0;
    this.requestRender();
  }

  /**
   * TEMPORARY (5a): a blue dot at a known place, to check the globe's orientation by eye.
   * Removed when real pins arrive in 5b.
   */
  addDebugDot(lat: number, lon: number): void {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 12, 12),
      new THREE.MeshBasicMaterial({ color: tokenColor('--accent'), depthTest: false }),
    );
    dot.position.copy(latLonToVector3(lat, lon));
    this.earth.add(dot);
    this.debugDots.push(dot);
    this.requestRender();
  }

  /** Draw one frame soon. Many calls before the next frame still draw only once. */
  requestRender(): void {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  /** Free everything this globe created. */
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.rim.geometry.dispose();
    this.rim.material.dispose();
    for (const dot of this.debugDots) {
      dot.geometry.dispose();
      (dot.material as THREE.Material).dispose();
    }
    this.landMask.dispose();
    this.blankElevation.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private render(): void {
    // TEMPORARY (5a): hide debug dots that have turned to the far side.
    if (this.debugDots.length > 0) {
      this.earth.updateMatrixWorld();
      const world = new THREE.Vector3();
      for (const dot of this.debugDots) {
        dot.visible = dot.getWorldPosition(world).z > 0.15;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

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

    // Seen in perspective, a sphere's outline is a circle slightly in front of its centre
    // and slightly smaller than its radius. Put the rim exactly there.
    this.rim.position.z = (RADIUS * RADIUS) / distance;
    this.rim.scale.setScalar(RADIUS * Math.sqrt(1 - (RADIUS * RADIUS) / (distance * distance)));

    // Dot size follows the globe's size on screen: a fixed share of the gap between dots.
    const globeRadiusPx = (FILL * Math.min(width, height)) / 2;
    const gapPx = globeRadiusPx * Math.sqrt((4 * Math.PI) / this.pointCount);
    const uniforms = this.points.material.uniforms;
    uniforms.uSize.value = Math.max(1, gapPx * DOT_FILL);
    uniforms.uPixelRatio.value = this.renderer.getPixelRatio();

    // Draw straight away (not on the next frame): resizing clears the canvas, and waiting
    // would show one blank frame.
    this.render();
  }
}
