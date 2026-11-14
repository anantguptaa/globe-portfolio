/**
 * Project helpers for the Projects page (and the project pages later).
 * Like the role helpers, these run at build time; none of this reaches the browser.
 */
import type { CollectionEntry } from 'astro:content';

type Project = CollectionEntry<'projects'>;

const byOrder = (a: Project, b: Project) => a.data.order - b.data.order;

/** Featured projects (the cards) and the rest ("Other builds"), each sorted by `order`. */
export function splitProjects(projects: Project[]) {
  return {
    featured: projects.filter((p) => p.data.featured).sort(byOrder),
    others: projects.filter((p) => !p.data.featured).sort(byOrder),
  };
}

/** Every featured project gets its own page at /projects/<id>. */
export function hasDetailPage(project: Project): boolean {
  return project.data.featured;
}

/**
 * True when a field has real content: not missing, not blank, and not a "TODO" placeholder.
 * Pages use it to hide sections that aren't written yet, so unfinished projects still look clean.
 */
export function isFilled(text: string | undefined | null): text is string {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed !== '' && !/^TODO\b/i.test(trimmed);
}

/** Where a card or list row should send people: its page, else GitHub, else a demo, else nowhere. */
export function projectLink(project: Project): { href: string; label: string; external: boolean } | undefined {
  if (hasDetailPage(project)) return { href: `/projects/${project.id}`, label: 'Open mission file', external: false };
  const { github, demo } = project.data.links ?? {};
  if (github) return { href: github, label: 'GitHub', external: true };
  if (demo) return { href: demo, label: 'Live demo', external: true };
  return undefined;
}
