# Portfolio Build Spec

Nov 12, 2026 · @Anant Gupta

## Overview

A personal portfolio built in Astro, themed as a mission-control globe: every page is pinned to a place on Earth, and navigation flies the globe there.

- **Audience:** MSc admissions committees and professors in computer vision first; recruiters for ML and software roles second. Both skim, often on phones.
- **Goal:** show within 30 seconds that Anant does real computer-vision research, through numbers and visuals rather than adjectives.
- **Signature moments:** a 3D dot globe that turns to each page's location, a colour-wipe hover on the landing menu, and a zoom into the pin when opening a page.
- **Source of truth for the look:** the [design canvas](https://claude.ai/artifact/3g5Yq4pVn3H7Zrxv1CNr9S) (desktop pages 01 and 03–07, transitions T1 and T2, mobile M1–M6). Where this spec and the canvas disagree, this spec wins.

## Tech stack

Astro with TypeScript renders static pages; only the globe and a few interactions ship JavaScript.

| Layer           | Choice                                                                               | Notes                                                 |
| --------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Framework       | Astro + TypeScript (strict)                                                          | Static output; no server                              |
| Package manager | npm                                                                                  | npm run dev / build / astro check                     |
| Content         | Astro content collections, Markdown / MDX                                            | One file per project, role and post                   |
| MDX             | `@astrojs/mdx`                                                                       | Interactive components inside posts and mission files |
| Styling         | Plain CSS, custom properties, scoped `<style>` in components                         | Tokens in `src/styles/tokens.css`                     |
| Fonts           | Self-hosted: TeX Gyre Adventor Bold (woff2), Inter and JetBrains Mono via Fontsource | No Google Fonts request                               |
| Globe           | Three.js from npm, custom points shader                                              | Technique from bobbyroe/vertex-earth (MIT), rebuilt   |
| Globe data      | Earth elevation and land-mask textures, resized and recoloured                       | Ship 1k or 2k JPG/WebP only                           |
| Transitions     | Astro view transitions, `<ClientRouter />`                                           | Globe persists across pages                           |
| Animation       | CSS transitions + Web Animations API                                                 | Add GSAP only if needed                               |
| Images          | `astro:assets`                                                                       | Auto resize and compress tiles and screenshots        |
| Icons           | Inline SVG components                                                                | Email, GitHub, LinkedIn, CV                           |
| SEO             | `@astrojs/sitemap`, Open Graph meta, one share image                                 | Good previews on LinkedIn                             |
| Quality         | Prettier + `prettier-plugin-astro`, `astro check`                                    | Run before each deploy                                |
| Hosting         | Vercel free tier                                                                     | Preview URL per branch                                |
| Later (blog)    | `@astrojs/rss`, giscus comments                                                      | Only if a blog is added                               |

Deliberately out: React, Tailwind, a database or server.

## Project structure

One layout wraps every page; the globe lives in that layout so it survives page changes.

```
portfolio/
├─ public/
│  ├─ fonts/TeXGyreAdventor-Bold.woff2
│  ├─ globe/elevation.webp, landmask.webp
│  ├─ globe/still-*.webp        # fallback stills, one per page pin
│  └─ cv.pdf
├─ src/
│  ├─ styles/tokens.css, global.css
│  ├─ layouts/BaseLayout.astro  # head, header, footer, globe, cursor, ClientRouter
│  ├─ components/
│  │  ├─ Header.astro, Footer.astro, SocialIcon.astro
│  │  ├─ MenuRow.astro          # landing row with colour wipe
│  │  ├─ ProjectCard.astro, StatGrid.astro, CompareSlider.astro
│  │  ├─ Lifecycle.astro, Accordion.astro, RoleEntry.astro
│  │  └─ Cursor.astro
│  ├─ globe/
│  │  ├─ Globe.ts               # Three.js scene, pins, labels, camera moves
│  │  ├─ shaders.ts             # points vertex/fragment shaders
│  │  └─ pins.ts                # page and item coordinates
│  ├─ content.config.ts         # collection schemas (Astro 5+ location)
│  ├─ content/
│  │  ├─ projects/*.md(x)
│  │  ├─ roles/*.md
│  │  └─ posts/*.mdx            # later
│  └─ pages/
│     ├─ index.astro, about.astro, experience.astro, contact.astro
│     └─ projects/index.astro, projects/[slug].astro
└─ astro.config.mjs
```

## Design tokens

The palette is EnduroSat's: navy-black surfaces, cool greys and one electric-blue accent. Blue is the only interface colour; the multicolour segmentation masks are data, not UI.

| Token                    | Value                              | Use                                      |
| ------------------------ | ---------------------------------- | ---------------------------------------- |
| `--bg`                   | #050911                            | Page background                          |
| `--surface`              | #090D12                            | Cards, panels                            |
| `--border`               | #1C232A                            | Dividers, card borders, globe rim        |
| `--border-strong`        | #30343D                            | Buttons, dashed placeholders, icon rings |
| `--text`                 | #F2F3F5                            | Main text, land dots                     |
| `--text-muted`           | #A7B2BF                            | Secondary text, labels, ocean dots       |
| `--accent`               | #00A1FF                            | Pins, links, active states, wipe, cursor |
| `--ok`                   | #31C48D                            | Contact "standing by" dot only           |
| `--mask-1` to `--mask-4` | #FF7A1A, #2EC4B6, #F2C14E, #5B8DEF | Segmentation masks only                  |

| Type role                | Font                   | Size (desktop / mobile)         | Weight, spacing                |
| ------------------------ | ---------------------- | ------------------------------- | ------------------------------ |
| Landing menu rows        | TeX Gyre Adventor Bold | clamp(44px, 8vw, 120px) / 40px  | 700, -0.03em, uppercase        |
| Page title               | TeX Gyre Adventor Bold | 56px / 40px                     | 700, -0.03em, uppercase        |
| Name in header           | TeX Gyre Adventor Bold | 32px landing, 20px pages / 18px | 700                            |
| Card and section titles  | TeX Gyre Adventor Bold | 24–26px / 19–20px               | 700                            |
| Big stats                | TeX Gyre Adventor Bold | 56px / 32px                     | 700                            |
| Body                     | Inter                  | 16–18px / 15–16px               | 400, line-height 1.5           |
| Labels, coordinates, nav | JetBrains Mono         | 12–15px / 11–13px               | 400–500, 0.06–0.1em, uppercase |

- **Spacing:** 4px base; common steps 8, 12, 16, 24, 32, 48, 64, 96. Page side padding 6vw.
- **Radii:** 6px cards and images, 4px buttons, 50% icons and cursor.
- **Motion:** fast 0.2s (cursor, colour), base 0.45–0.55s (wipe, icon fill), page 0.8–1.2s (transitions). Easing: `cubic-bezier(0.65,0,0.35,1)` for moves, `cubic-bezier(0.7,0,0.84,0)` for the zoom in, `cubic-bezier(0.16,1,0.3,1)` for the settle.

## Layout and breakpoints

Two layouts: desktop at 768px and wider, mobile below it. Design and test at 1440px and 390px.

|               | Mobile (< 768px)                                    | Desktop (≥ 768px)                                 |
| ------------- | --------------------------------------------------- | ------------------------------------------------- |
| Content width | Full width, 6vw sides                               | Max 1100–1280px, centred                          |
| Header        | Name, then 4 links on one line                      | Name left, 4 links right                          |
| Globe         | 250px strip under the header, faded at its bottom   | Large, beside the page title, fading into content |
| Lists         | Tap-to-expand rows (roles, lifecycle, other builds) | Everything open                                   |
| Hover effects | Replaced by tap states                              | Colour wipe, card highlight, icon fill            |
| Cursor        | System default                                      | Blue dot cursor                                   |
| Footer        | Centred icons + one text line                       | Copyright, icons, updated date, back to orbit     |

- Touch targets at least 44 × 44px everywhere.
- Nothing scrolls sideways at 320px wide.
- Use `@media (pointer: fine)` for cursor and hover-only effects, not screen width.

## Components

Each component is one Astro file with scoped styles; only Cursor, CompareSlider and Accordion need scripts.

| Component     | Behaviour                                                                                                                                             | Notes                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Header        | Name links home; current page link in accent                                                                                                          | `aria-current="page"` on the active link                      |
| Footer        | Desktop: © + coordinates, social icons, "Last updated", "Back to orbit ↑". Mobile: icons centred, one line under                                      | Contact page has no icons (its rows already link)             |
| SocialIcon    | 44px circle, `--border-strong` ring. Hover/focus: blue fills from bottom (0.45s), icon flips `rotateY(360deg)` (0.6s) and turns `--bg`                | Inline SVG: Email, GitHub, LinkedIn, CV                       |
| Cursor        | 28px blue dot follows the pointer. Over links: 56px at 55% opacity                                                                                    | `pointer: fine` only; hidden on touch; `pointer-events: none` |
| MenuRow       | Full-width row, hairline dividers. Hover/focus: blue wipes left to right through the letters (0.55s), number turns blue, globe turns to the row's pin | Text uses `background-clip: text`; still a real link          |
| ProjectCard   | Coordinates line, title, one line, key stat, stack, link. Hover/focus or tap: border turns blue, globe flies to the card's pin                        | Whole card is not a link; the CTA is                          |
| StatGrid      | Big numbers with mono labels. Desktop row of 3, mobile 2 × 2                                                                                          |                                                               |
| CompareSlider | Satellite tile vs predicted mask, clipped at a draggable split                                                                                        | Real `<input type="range">` with a label                      |
| Lifecycle     | Data → Model → Training → Results. Desktop: 4 columns. Mobile: accordion                                                                              |                                                               |
| Accordion     | `<button aria-expanded>` row, +/− sign, content shown on tap                                                                                          | Mobile roles, lifecycle, other builds                         |
| RoleEntry     | Dates + coordinates, title, organisation, bullets. Hover or tap: title turns blue, globe turns to its pin                                             |                                                               |

## Pages

Six routes, each with its own globe pin. Canvas artboards are the reference for each.

| Route                   | Canvas         | Globe pin                                                                                                                      | Contents                                                                                                               |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `/`                     | 01 Landing, M1 | About: North Pole (90.00°N) · Projects: 41.88°N 93.10°W · Experience: 53.52°N 113.53°W · Contact: Point Nemo, 48.88°S 123.39°W | Name + tagline, CV link, 4 menu rows, footer. Pin label floats above the pin. Mobile: first tap aims, second tap opens |
| `/about`                | 03, M2         | Current location (North Pole until set)                                                                                        | Photo, bio, looking for, interests                                                                                     |
| `/projects`             | 04, M3         | Each card's data location                                                                                                      | Title, intro, 4 featured cards, "Other builds" list                                                                    |
| `/projects/[slug]`      | 05, M4         | The project's data location                                                                                                    | Header facts, StatGrid, CompareSlider, Lifecycle, stack, links                                                         |
| `/experience`           | 06, M5         | Each role's location                                                                                                           | Role entries newest first, education last, CV button                                                                   |
| `/contact`              | 07, M6         | Point Nemo                                                                                                                     | "Open a channel.", 4 channel rows. Desktop: hovering a row sends a signal arc from the pin                             |
| `/blog`, `/blog/[slug]` | not designed   | none                                                                                                                           | Later: post list + post layout in mission-file style                                                                   |

All page titles are uppercase so the menu word can become the title during transitions.

## Globe

One Three.js points globe, created once in the base layout and kept alive across navigation; each page tells it where to point and where to sit.

**Rendering**

- Points on an `IcosahedronGeometry`: detail \~80 on desktop, \~40 on mobile (vertex-earth uses 120, about 145k points, too heavy).
- Custom shader: hide ocean points with the land mask (or draw them dim at `--text-muted`, low alpha); land points at `--text`; lift land by elevation **along the surface normal**, not toward the camera.
- Faint rim circle in `--border`. No starfield.
- Renderer: transparent background, `antialias`, pixel ratio capped at 2.

**Pins and labels**

- Pin = small blue disc plus a pulsing ring (1.8s loop). Other pins on the same page draw at 55% opacity.
- Label = HTML element positioned from the pin's projected screen point: coordinates and place name, mono 13px, dark backing, a short blue line down to the pin. It fades in only once the globe has settled.

**Motion**

- `flyTo(lat, lon)`: rotate by the shortest path, eased (about 0.07 per frame, or a 0.9s tween); retarget smoothly mid-flight.
- Scroll spin: extra longitude = page scroll × 0.25°, eased; pins stay correct.
- Idle: no auto-spin, so it stays still when nobody is interacting.

**Performance tiers**

- Load Three.js after the page's text has painted (dynamic `import()`), never blocking it.
- Pause the render loop when the globe is off-screen (`IntersectionObserver`) or the tab is hidden.
- Mobile, data-saver or low-end devices: lower point count, and on low-end devices the still image only.

**Fallback**

- Each page ships a pre-rendered still (`/globe/still-<page>.webp`) of the globe aimed at its pin, shown immediately.
- The live globe fades in over the still when ready; if WebGL is missing or errors, the still stays.
- Without the live globe, hover crossfades between stills and the zoom becomes a crossfade. Coordinates and labels are normal HTML, so nothing important depends on WebGL.

## Transitions and motion

Entering the site from the landing page zooms into the pin; moving between inner pages morphs the clicked word into the title.

&#91;embedded content: navigation transitions · 3 moves\]

The zoom (accent) is the signature move and plays only when leaving the landing page.

| Move                | Canvas | Steps                                                                                                                                                                                                                     | Total      |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Landing → page      | T1     | Menu text fades (0.25s). Globe zooms ×9 into the pin, ease-in (0.62s). At the peak it fades, reappears in the page position at ×3 and settles to ×1 (0.6s, ease-out) while content fades in (0.45s)                       | about 1.2s |
| Page → page         | T2     | Clicked header word flies to the title position, scaling up and turning blue → white (0.8s). Globe turns to the new pin and moves to its new spot (0.9s). Old content fades out (0.25s), new fades in (0.45s, 0.3s delay) | about 0.9s |
| Page → landing      | none   | Globe glides back to its landing position (0.6s) while menu and footer fade in (0.3s)                                                                                                                                     | about 0.6s |
| Any, reduced motion | none   | Crossfade; globe jumps to its pin                                                                                                                                                                                         | 0.2s       |

**Implementation notes**

- `<ClientRouter />` in BaseLayout; the globe container uses `transition:persist` so one Three.js scene survives navigation.
- Header word and page title share a `transition:name` per page (`title-projects`, …) for the morph.
- The zoom runs in JS on the persisted globe around Astro's navigation events (`astro:before-preparation`, `astro:after-swap`); keep it under the 4s view-transition timeout.
- Direct visits and refreshes skip transitions and show the page settled.

## Content model

Content lives in Markdown files with typed frontmatter, so adding a project or role is one new file.

```ts
// src/content.config.ts (sketch)
projects: {
  title: string; order: number; featured: boolean;
  summary: string;                 // one line for cards
  location: { lat: number; lon: number; label: string };   // defaults to Point Nemo if left out
  role?: string; dates?: string; status?: 'ongoing' | 'complete';
  stats?: { value: string; label: string }[];  // 1–4; required when featured
  stack: string[];
  links?: { github?: string; report?: string; demo?: string };
  cover?: Image; coverAlt?: string;            // card image; coverAlt required with cover
  compare?: { before: Image; after: Image };   // tile + mask
  lifecycle?: { data: string; model: string; training: string; results: string };
}
roles: {
  title: string; org: string; start: string; end?: string;  // ISO dates, end empty = present
  location: { lat: number; lon: number; label: string };
  kind: 'research' | 'work' | 'freelance' | 'volunteer' | 'education';
  bullets: string[]; project?: reference('projects');
}
posts (later): { title: string; date: string; summary: string; tags: string[]; draft: boolean }
```

- Featured projects are `featured: true`, sorted by `order`; the rest go in "Other builds", also sorted by `order`.
- Every project has a globe pin. A file without `location` gets Point Nemo (48.88°S 123.39°W).
- Every featured project gets its own page at `/projects/[slug]`, and its card links there. "Other builds" rows link to GitHub, then a demo, otherwise no link.
- On a project page, any field that is missing or starts with `TODO` hides its section.
- Roles sort by `start`, newest first, with education last.
- An entry's id is its filename (`usa-fields.md` → `usa-fields`); it is the URL slug for `/projects/[slug]` and the value `reference()` fields use. There is no `slug` field.
- Role dates are `YYYY-MM` or `YYYY-MM-DD` and stay quoted in YAML, so they are read as strings, not dates.

## Accessibility and performance

The site must be fully usable with no JavaScript animations, by keyboard, and on a mid-range phone.

**Accessibility**

- Every hover effect also triggers on keyboard focus; visible focus ring in `--accent`.
- Text contrast at least 4.5:1 (all token pairs above pass on `--bg`).
- Globe canvas: `role="img"` with an `aria-label`; page coordinates repeated as text.
- `prefers-reduced-motion`: no zoom, wipe, spin or pulse; page changes crossfade in 0.2s; globe jumps straight to its pin.
- Dot cursor never replaces the system cursor on touch devices.

**Performance budgets (mobile, mid-range phone)**

| Metric                                  | Target                   |
| --------------------------------------- | ------------------------ |
| Largest Contentful Paint                | under 2.0s               |
| Cumulative Layout Shift                 | under 0.05               |
| JavaScript before the globe loads       | under 30 KB gzipped      |
| Globe bundle (Three.js + scene)         | loaded after first paint |
| Globe textures                          | under 300 KB total       |
| Lighthouse (performance, accessibility) | 90+ each                 |

## Build order

Ship a live site on day one, then add one layer at a time; each step ends deployed.

1. **Set-up:** Astro + TypeScript project, GitHub repo, Vercel deploy, Prettier, `astro check`.
2. **Foundations:** `tokens.css`, fonts, BaseLayout, Header, Footer with SocialIcon.
3. **Content model:** collection schemas, one sample project (USA\_FIELDS) and the five roles.
4. **Pages, no globe:** landing (menu rows with wipe), About, Projects, project page, Experience, Contact; desktop and mobile layouts.
5. **Globe:** Three.js scene with points shader, pins, labels, `flyTo`, scroll spin, still-image fallback.
6. **Hook pages to the globe:** hover and tap targets, per-page positions, persistence across navigation.
7. **Transitions:** zoom from the landing, word becomes title between pages, reduced-motion crossfade.
8. **Polish:** Cursor, contact signal arc, CompareSlider, accordions, performance pass against the budgets.
9. **Content and launch:** real text, images and tiles; other mission files; domain; share image; a final pass at 390px and 1440px.

Target for reading week: steps 1–5.

## Open items

Placeholders and decisions still to fill; none block the build.

- [ ] Bio in your own voice, and a photo
- [ ] Your real location for About (currently North Pole)
- [ ] Start dates for the research assistant and freelance roles; freelance client location
- [ ] Rough location of the USA\_FIELDS tiles (pin is a placeholder at 41.88°N 93.10°W)
- [ ] Real NAIP tile and predicted mask for the compare slider
- [ ] Mission files for EDSS Navigator, pLUCK and Computer Vision Coursework
- [ ] Prof. Cheng's OK to publish USA\_FIELDS numbers and imagery
- [ ] Make the CMPUT 328 repo public
- [ ] CV PDF
- [ ] Domain name
- [ ] Later: mask reveal when opening a project; blog
