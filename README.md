# globe-portfolio

My personal portfolio: computer vision and geospatial ML, presented as a mission-control globe. Every page is pinned to a place on Earth, and moving around the site flies a 3D dot globe there.

**Live:** [your-domain.com](https://your-domain.com) <!-- TODO: replace once deployed -->

![Screenshot of the landing page](./docs/screenshot.png) <!-- TODO: add a screenshot -->

## Features

- **Interactive 3D globe** built with Three.js and a custom points shader; it turns to each page's location and spins as you scroll.
- **Mission-file project pages** with key stats, a satellite-vs-prediction compare slider, and a data → model → training → results breakdown.
- **Page transitions**: zoom into the pin from the landing page, and the clicked word becomes the page title between pages (Astro view transitions).
- **Accessible and fast**: works without JavaScript or WebGL (static fallback), full keyboard support, respects reduced-motion settings, and targets Lighthouse 90+.
- **Content in Markdown**: each project and role is one file in a typed content collection.

## Tech stack

- [Astro](https://astro.build) + TypeScript
- [Three.js](https://threejs.org) for the globe
- Plain CSS with design tokens (custom properties)
- Astro content collections and MDX
- Deployed on [Vercel](https://vercel.com)

## Getting started

Requires Node.js 20 or later.

```bash
npm install          # install dependencies
npm run dev          # start the dev server at http://localhost:4321
npm run build        # build the production site into dist/
npm run preview      # preview the production build
npm run astro check  # type and template checks
```

## Project structure

```
public/          fonts, globe textures and fallback images, cv.pdf
src/
  styles/        design tokens and global CSS
  layouts/       BaseLayout (header, footer, globe, page transitions)
  components/    UI components
  globe/         Three.js scene, shaders, pin coordinates
  content/       projects and roles as Markdown
  pages/         routes
docs/            build spec and design references
```

## Adding content

- **A project:** add a Markdown file to `src/content/projects/` with its title, location (lat/lon), stats and stack in the frontmatter. Set `featured: true` to show it as a card.
- **A role:** add a Markdown file to `src/content/roles/` with its dates, location and bullets.

The frontmatter fields are defined in `src/content/config.ts`.

## Credits

- Globe points technique adapted from [vertex-earth](https://github.com/bobbyroe/vertex-earth) by Bobby Roe (MIT).
- Display font: [TeX Gyre Adventor](https://www.gust.org.pl/projects/e-foundry/tex-gyre) by GUST e-foundry (GUST Font License; see `public/fonts/GUST-FONT-LICENSE.txt`).
- Body font: [Inter](https://rsms.me/inter/) (SIL Open Font License). Mono font: [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (SIL Open Font License).
- Colour palette inspired by EnduroSat's site design.

## License

The source code is released under the [MIT License](./LICENSE). The site's content (text, photos, CV, project images and research results) is © 2026 Anant Gupta, all rights reserved, and is not covered by the MIT License.
