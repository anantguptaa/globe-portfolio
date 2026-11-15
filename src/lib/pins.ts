/**
 * Globe pins for every page, built from the content collections at build time.
 * No coordinates are typed in here: they all come from the Markdown files.
 *
 *   landing     the four menu pins (About, Projects, Experience, Contact); About active
 *   about       src/content/pages/about.md → location
 *   projects    each featured project; the first one active
 *   project     that project's location
 *   experience  each role's place (same place listed once); the Experience pin active
 *   contact     src/content/pages/contact.md → location
 *   404         Null Island (0°N 0°E), the empty spot where bad coordinates end up
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { formatCoords } from './geo';
import { splitProjects } from './projects';
import { sortRoles } from './roles';

/** What a page hands to GlobeSlot, and the Globe gets through setPins(). */
export interface PagePin {
  id: string;
  lat: number;
  lon: number;
  /** Place name for the label, e.g. "Edmonton". */
  label: string;
  /** Formatted coordinates, e.g. "53.52°N 113.53°W". */
  coords: string;
}

/** A page's pins and which one is active. */
export interface PagePins {
  pins: PagePin[];
  active: string;
}

type Location = { lat: number; lon: number; label: string };

function toPin(id: string, location: Location): PagePin {
  return { id, lat: location.lat, lon: location.lon, label: location.label, coords: formatCoords(location.lat, location.lon) };
}

/** The pin for one of the single-file pages (about.md, contact.md). */
async function pagePin(id: 'about' | 'contact'): Promise<PagePin> {
  const entry = await getEntry('pages', id);
  if (!entry) throw new Error(`Missing src/content/pages/${id}.md`);
  return toPin(id, entry.data.location);
}

/**
 * The Experience page's pin: the newest role that isn't remote and isn't education.
 * Roles are sorted newest first (sortRoles), so it's the first one that qualifies.
 */
export function experienceRole(roles: CollectionEntry<'roles'>[]): CollectionEntry<'roles'> {
  const sorted = sortRoles(roles);
  const role = sorted.find((r) => !r.data.remote && r.data.kind !== 'education') ?? sorted.find((r) => !r.data.remote);
  if (!role) throw new Error('No non-remote role found for the Experience globe pin');
  return role;
}

/** Same place → same key, so a city shared by two roles gets one pin. */
const placeKey = (l: Location) => `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`;

export async function aboutPins(): Promise<PagePins> {
  const pin = await pagePin('about');
  return { pins: [pin], active: pin.id };
}

export async function contactPins(): Promise<PagePins> {
  const pin = await pagePin('contact');
  return { pins: [pin], active: pin.id };
}

export async function projectsPins(): Promise<PagePins> {
  const { featured } = splitProjects(await getCollection('projects'));
  const pins = featured.map((p) => toPin(p.id, p.data.location));
  return { pins, active: pins[0]?.id ?? '' };
}

export function projectPins(project: CollectionEntry<'projects'>): PagePins {
  const pin = toPin(project.id, project.data.location);
  return { pins: [pin], active: pin.id };
}

/**
 * Every role's place, newest first, each place once (id = the first role there).
 * The active pin is the Experience pin's place.
 * `targets` maps each role id to its pin id: two roles in the same city share one pin, so a
 * role's own id isn't always a pin id (e.g. the BSc points at the Edmonton research pin).
 */
export async function experiencePins(): Promise<PagePins & { targets: Record<string, string> }> {
  const roles = await getCollection('roles');
  const seen = new Map<string, PagePin>();
  const targets: Record<string, string> = {};
  for (const role of sortRoles(roles)) {
    const key = placeKey(role.data.location);
    if (!seen.has(key)) seen.set(key, toPin(role.id, role.data.location));
    targets[role.id] = seen.get(key)!.id;
  }
  const active = seen.get(placeKey(experienceRole(roles).data.location))!;
  return { pins: [...seen.values()], active: active.id, targets };
}

/** Landing: one pin per menu row, with ids matching the rows' data-pin. About is active. */
export async function landingPins(): Promise<PagePins> {
  const roles = await getCollection('roles');
  const { featured } = splitProjects(await getCollection('projects'));
  const firstProject = featured[0];
  if (!firstProject) throw new Error('No featured project for the Projects pin');
  const pins = [
    await pagePin('about'),
    toPin('projects', firstProject.data.location),
    toPin('experience', experienceRole(roles).data.location),
    await pagePin('contact'),
  ];
  return { pins, active: 'about' };
}

/** The 404 page's pin: Null Island, 0°N 0°E, in the Gulf of Guinea. Nowhere useful, on purpose. */
export function notFoundPins(): PagePins {
  const pin = toPin('404', { lat: 0, lon: 0, label: 'Null Island' });
  return { pins: [pin], active: pin.id };
}
