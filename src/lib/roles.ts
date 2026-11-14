/**
 * Role helpers: ordering and date labels for the Experience page.
 * These run in page frontmatter, i.e. at build time — none of this reaches the browser.
 */
import type { CollectionEntry } from 'astro:content';

type Role = CollectionEntry<'roles'>;

/**
 * Newest first by start date; education always last.
 * Dates are ISO strings ("2026-05" or "2026-05-14"), which sort correctly as plain text.
 * Ties (same start) put the role that ends later first, with "no end" (present) as latest.
 */
export function sortRoles(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => {
    const aEdu = a.data.kind === 'education';
    const bEdu = b.data.kind === 'education';
    if (aEdu !== bEdu) return aEdu ? 1 : -1;

    if (a.data.start !== b.data.start) return b.data.start.localeCompare(a.data.start);

    const aEnd = a.data.end ?? '9999';
    const bEnd = b.data.end ?? '9999';
    return bEnd.localeCompare(aEnd);
  });
}

// Fixed names rather than toLocaleDateString, whose short months differ by runtime ("Sep" vs "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(iso: string): { year: number; month: string } {
  const [year, month] = iso.split('-').map(Number);
  return { year: year!, month: MONTHS[month! - 1]! };
}

const monthYear = (iso: string) => {
  const { year, month } = parts(iso);
  return `${month} ${year}`;
};

/**
 * Human date range for a role.
 *   no end                → "May 2026 – Present"
 *   end after today       → "Sep 2023 – Expected Apr 2027"
 *   same year             → "May – Aug 2025"
 *   same month            → "May 2025"
 *   otherwise             → "Dec 2024 – Feb 2025"
 * `today` is the build date by default.
 */
export function formatRoleDates(start: string, end?: string, today: Date = new Date()): string {
  if (!end) return `${monthYear(start)} – Present`;

  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (end.slice(0, 7) > thisMonth) return `${monthYear(start)} – Expected ${monthYear(end)}`;

  const s = parts(start);
  const e = parts(end);
  if (s.year === e.year && s.month === e.month) return monthYear(start);
  if (s.year === e.year) return `${s.month} – ${e.month} ${e.year}`;
  return `${monthYear(start)} – ${monthYear(end)}`;
}
