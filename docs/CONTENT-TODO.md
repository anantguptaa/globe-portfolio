# Content to fill in

Tick each item off as you go (`- [ ]` → `- [x]`).
Run `grep -rn "TODO" src/content src/data` to see what's still marked in the content files.

## 1. Still to do

Nothing here shows the word "TODO" on the live site: the site hides a field that's missing or starts with `TODO`.

- [x] `src/content/projects/cv-coursework.md` (line 11): `dates`, currently `'TODO: e.g. Jan – Apr 2025'`
- [x] `src/content/projects/usa-fields.md` (lines 22–24): lifecycle `data`, `model` and `training`, currently `TODO`. Until you fill them, the lifecycle section is hidden on that page. Leave `results` out: results aren't published.

## 2. Optional

- [ ] `src/content/projects/cv-coursework.md`: a write-up below the `---` (the page has stats, stack and a GitHub link, but no text)
- [ ] `src/content/pages/about.md` (line 4): uncomment `location:` and set where you are now (currently the North Pole). If you change it, run `npm run globe:stills` and `npm run build` (see "After editing").
- [x] `src/content/pages/contact.md`: add a full stop after "Available from May 2028"
- [x] A longer `summary` for pLUCK in `src/content/projects/pluck.md` (it's only 50 characters, and it's what the page's search and share preview shows)
- [ ] Better card crops: the EDSS logo and the pLUCK phone screen are cropped to the wide strip on desktop. Ask for two small settings (`coverFit`, `coverPosition`) if you want the whole logo or the top of the screen shown.

## 3. Before and at launch

- [x] `public/cv.pdf`: replace with your current CV, if it has changed
- [x] Make the CMPUT 328 repo public (the Computer Vision Coursework page and card link to `github.com/anantguptaa/cmput328_coursework`)
- [x] Vercel: make `anantgupta.org` redirect to `www.anantgupta.org` (the canonical address), so each page has one address
- [ ] After deploying, submit `https://www.anantgupta.org/sitemap-index.xml` in Google Search Console

## 4. Done

- [x] Role bullets: Freelance, Research Assistant, ML Intern, Teach For India
- [x] About: photo and `photoAlt`
- [x] Covers: USA_FIELDS, Computer Vision Coursework, EDSS Navigator and pLUCK (so no "[Cover image]" placeholder is left on the Projects page)
- [x] Project dates: EDSS Navigator, pLUCK; USA_FIELDS role, dates and status
- [x] USA_FIELDS: location (now 36.78°N 119.42°W) and the note about results
- [x] Links: pLUCK, Ray Tracer, AI Crypto Trading Assistant, Twitter CLI Clone, Computer Vision Coursework. EDSS Navigator and USA_FIELDS have none on purpose (private repo, unpublished research). The pLUCK link had wrong syntax and wasn't showing; it's fixed.
- [x] Contact: availability added to the intro text
- [x] Site description (`src/data/site.ts`) and the About and Contact search descriptions
- [x] Domain: www.anantgupta.org (`SITE_URL` in `astro.config.mjs`)
- [x] Share image, sitemap, robots.txt and the 404 page

## Adding images (photo, covers)

Put the image in a folder next to its Markdown file and use a `./` path, e.g.
`cover: ./pluck/cover.png` for a file at `src/content/projects/pluck/cover.png`.
Don't put these in `public/`: Astro only finds and compresses images next to the Markdown
(a 700 KB PNG becomes 10–30 KB WebP files). `public/` is only for files linked directly, like `cv.pdf`.
If the dev server shows `ImageNotFound` or `LocalImageUsedWrongly` for a correct path, restart it with `npm run dev -- --force`.

Links in a project go on separate lines, not in braces:

```yaml
links:
  github: https://github.com/you/repo
```

## If the domain changes again

- [ ] Change `SITE_URL` at the top of `astro.config.mjs` (it feeds canonical links, share previews, the sitemap and robots.txt), then `npm run build`
- [ ] Update the live link in `README.md`

## After editing

- **Changed a location** (USA_FIELDS' pin, or `location:` in `about.md`)? The still images and the share image show those pins, so run `npm run globe:stills`, then `npm run og:build`, then `npm run build`.
- Before committing, run `npm run check` and `npm run build`; both must pass.

## Not content: leave these

- `src/globe/Globe.ts` (line ~339): an optional future idea (terrain height on the globe)
- The "TODO" mentions in `src/lib/projects.ts` and `src/pages/projects/[slug].astro`: that's the code that hides TODO fields
