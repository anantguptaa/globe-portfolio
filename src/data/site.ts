/**
 * Site-wide constants. Values marked PLACEHOLDER must be replaced before launch.
 */

export const SITE = {
  name: 'Anant Gupta',
  // PLACEHOLDER: one-line description used in <meta name="description">
  description: 'Anant Gupta: computer-vision research and software projects.',
  // Shown under the name on the landing page.
  tagline: 'cs @ ualberta · computer vision & geospatial ML',
  cvHref: '/cv.pdf',
  // Default footer coordinates until each page has its own pin (North Pole).
  defaultCoords: '90.00°N 0.00°E',
} as const;

export type SocialKind = 'email' | 'github' | 'linkedin' | 'cv';

export interface SocialLink {
  kind: SocialKind;
  href: string;
  label: string;
}

/** The one list of contact links: footer icons and the Contact page rows both read it. */
export const SOCIAL_LINKS: readonly SocialLink[] = [
  { kind: 'email', href: 'mailto:guptaanantt4@gmail.com', label: 'Email' },
  { kind: 'github', href: 'https://github.com/anantguptaa', label: 'GitHub' },
  { kind: 'linkedin', href: 'https://www.linkedin.com/in/anantgupta04', label: 'LinkedIn' },
  { kind: 'cv', href: SITE.cvHref, label: 'CV (PDF)' },
];

export const NAV_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/projects', label: 'Projects' },
  { href: '/experience', label: 'Experience' },
  { href: '/contact', label: 'Contact' },
] as const;

/**
 * Short text for a link, for the Contact page: "mailto:me@x.com" → "me@x.com",
 * "https://www.linkedin.com/in/me" → "linkedin.com/in/me". The CV shows "Download PDF".
 */
export function linkDisplay(link: SocialLink): string {
  if (link.kind === 'cv') return 'Download PDF';
  return link.href
    .replace(/^mailto:/, '')
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/$/, '');
}
