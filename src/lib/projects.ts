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

/**
 * A featured project gets its own page (/projects/<id>) once its Markdown file has a write-up
 * below the frontmatter. Only USA_FIELDS has one so far. The project page step will use this
 * same check to decide which pages to build, so a card's link and its page always match.
 */
export function hasDetailPage(project: Project): boolean {
  return project.data.featured && Boolean(project.body?.trim());
}

/** Where a card or list row should send people: its page, else GitHub, else a demo, else nowhere. */
export function projectLink(project: Project): { href: string; label: string; external: boolean } | undefined {
  if (hasDetailPage(project)) return { href: `/projects/${project.id}`, label: 'Open mission file', external: false };
  const { github, demo } = project.data.links ?? {};
  if (github) return { href: github, label: 'GitHub', external: true };
  if (demo) return { href: demo, label: 'Live demo', external: true };
  return undefined;
}
