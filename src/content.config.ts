/**
 * Content collections: the schemas every project and role file must match.
 * Astro validates each file's frontmatter against these on dev, build and check.
 * Spec: docs/SPEC.md → "Content model".
 *
 * Each entry's id comes from its filename (usa-fields.md → "usa-fields"),
 * which is also its URL slug and what `reference()` fields point to.
 */
import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** A pin on the globe. */
const location = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  label: z.string(), // human-readable, e.g. "Noida, India"
});

/** ISO date: YYYY-MM or YYYY-MM-DD. Kept as a string so month-only dates stay month-only. */
const isoDate = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, 'Use an ISO date: YYYY-MM or YYYY-MM-DD');

/** Where a project without its own pin sits on the globe: Point Nemo, the most remote spot in the ocean. */
const POINT_NEMO = { lat: -48.88, lon: -123.39, label: 'Point Nemo' };

/** One number for a card or the StatGrid, e.g. { value: "0.896", label: "test mIoU" }. */
const stat = z.object({ value: z.string(), label: z.string() });

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        order: z.number().int(), // sort order (1 = first), for featured cards and for "Other builds"
        featured: z.boolean(), // featured → card; otherwise → "Other builds"
        summary: z.string(), // one line for cards
        // Every project has a pin. Leave it out of the file and it defaults to Point Nemo.
        location: location.default(POINT_NEMO),
        role: z.string().optional(),
        dates: z.string().optional(), // display text, e.g. "Jan 2025 – present"
        status: z.enum(['ongoing', 'complete']).optional(),
        // Optional for small builds; featured projects must have at least one (see below).
        stats: z.array(stat).min(1).max(4).optional(),
        stack: z.array(z.string()),
        links: z
          .object({
            github: z.url().optional(),
            report: z.string().optional(), // URL or a path in /public
            demo: z.url().optional(),
          })
          .optional(),
        // Card image (about 800×400), path relative to the Markdown file.
        cover: image().optional(),
        coverAlt: z.string().optional(),
        // Satellite tile and predicted mask for the CompareSlider.
        // Paths are relative to the Markdown file; Astro optimises the images.
        compare: z.object({ before: image(), after: image() }).optional(),
        lifecycle: z
          .object({
            data: z.string(),
            model: z.string(),
            training: z.string(),
            results: z.string(),
          })
          .optional(),
      })
      // Rules that compare fields with each other. Each failure stops the build with this message.
      .superRefine((p, ctx) => {
        if (p.featured && !p.stats) {
          ctx.addIssue({ code: 'custom', path: ['stats'], message: 'Featured projects need at least one stat' });
        }
        if (p.cover && !p.coverAlt) {
          ctx.addIssue({ code: 'custom', path: ['coverAlt'], message: 'Add coverAlt to describe the cover image' });
        }
      }),
});

const roles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/roles' }),
  schema: z.object({
    title: z.string(),
    org: z.string(),
    start: isoDate,
    end: isoDate.optional(), // leave out for "present"
    location,
    kind: z.enum(['research', 'work', 'freelance', 'volunteer', 'education']),
    bullets: z.array(z.string()),
    project: reference('projects').optional(), // links the role to a project by its id
  }),
});

export const collections = { projects, roles };
