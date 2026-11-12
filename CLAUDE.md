# Anant Gupta — Portfolio

Personal portfolio site, themed as a mission-control globe. Every page is pinned to a place on Earth, and navigation flies the globe there.

## Source of truth

- `docs/SPEC.md` is the build spec. Read the relevant section before writing code, and follow it. If the spec and the code disagree, the spec wins; if the spec seems wrong, say so and ask before deviating.
- `docs/mockups/` (if present) holds the design-canvas artboards as HTML. Use them for exact visual details (spacing, colours, hover and transition behaviour), not as code to copy wholesale.

## Stack

- Astro + TypeScript (strict). Static output, no server.
- Plain CSS with custom properties. Design tokens live in `src/styles/tokens.css`; components use scoped `<style>`.
- Three.js (from npm, never a CDN) for the globe, loaded only after the page text has painted.
- Content in Astro content collections (`src/content/`), Markdown/MDX.
- Astro view transitions via `<ClientRouter />`.
- Do NOT add React, Tailwind, a UI kit, or a database. Ask before adding any new dependency.

## Commands (npm)

- `npm install` — install dependencies
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — preview the build
- `npm run astro check` — type and template checks

Run `npm run astro check` and `npm run build` before saying a step is done. Both must pass with no errors.

## How we work

- Build one step of the spec's "Build order" at a time. Don't start the next step unless asked.
- Before building, give a short plan (files to create or change). Then build.
- I'm learning Astro: after each step, explain briefly what you did and why, especially any Astro concept that's new (layouts, collections, islands, client scripts, view transitions).
- Keep changes small and focused; don't refactor unrelated code.
- Suggest a commit message when a step is done.

## Rules that must always hold

- Colours, fonts and spacing come from tokens; no hard-coded hex values in components.
- Palette: bg #050911, surface #090D12, border #1C232A, border-strong #30343D, text #F2F3F5, muted #A7B2BF, accent #00A1FF. Blue is the only interface colour; mask colours are for segmentation images only.
- Display font: TeX Gyre Adventor Bold (self-hosted woff2). Body: Inter. Labels and coordinates: JetBrains Mono. All self-hosted, no Google Fonts requests.
- Every page works and is readable without JavaScript and without WebGL (show the still-image globe fallback).
- Every hover effect also works on keyboard focus, with a visible blue focus ring.
- Respect `prefers-reduced-motion`: no zoom, wipe, spin or pulse; page changes become a short crossfade.
- Hover-only and cursor effects go behind `@media (pointer: fine)`; touch targets are at least 44 × 44px.
- Text contrast at least 4.5:1. Images need meaningful `alt` text; decorative ones use `alt=""`.
- The globe is created once in the base layout and persists across page navigation; never create a second WebGL context.
- Pause the globe's render loop when it's off-screen or the tab is hidden; dispose Three.js resources if it's ever torn down.

## Project layout (see spec for detail)

- `src/styles/` tokens and global CSS
- `src/layouts/BaseLayout.astro` head, header, footer, globe, cursor, ClientRouter
- `src/components/` UI components
- `src/globe/` Three.js scene, shaders, pin coordinates
- `src/content/` collections: projects, roles (posts later)
- `src/pages/` routes
- `public/` fonts, globe textures and fallback stills, cv.pdf
