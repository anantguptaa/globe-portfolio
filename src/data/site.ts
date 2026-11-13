/**
 * Site-wide constants. Values marked PLACEHOLDER must be replaced before launch.
 */

export const SITE = {
  name: 'Anant Gupta',
  // PLACEHOLDER: one-line description used in <meta name="description">
  description: 'Anant Gupta: computer-vision research and software projects.',
  // Default footer coordinates until each page has its own pin (North Pole).
  defaultCoords: '90.00°N 0.00°E',
} as const;

export type SocialKind = 'email' | 'github' | 'linkedin' | 'cv';

export interface SocialLink {
  kind: SocialKind;
  href: string;
  label: string;
}

export const SOCIAL_LINKS: readonly SocialLink[] = [
  // PLACEHOLDER: your real email address
  { kind: 'email', href: 'mailto:guptaanantt4@gmail.com', label: 'Email' },
  // PLACEHOLDER: your GitHub profile URL
  { kind: 'github', href: 'https://github.com/anantguptaa', label: 'GitHub' },
  // PLACEHOLDER: your LinkedIn profile URL
  { kind: 'linkedin', href: 'https://www.linkedin.com/in/anantgupta04', label: 'LinkedIn' },
  { kind: 'cv', href: '/cv.pdf', label: 'CV (PDF)' },
];

export const NAV_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/projects', label: 'Projects' },
  { href: '/experience', label: 'Experience' },
  { href: '/contact', label: 'Contact' },
] as const;
