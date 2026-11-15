# Content to fill in

Placeholders left in the site. Tick each one off as you go (`- [ ]` → `- [x]`).
Run `grep -rn "TODO" src/content src/data` to see what's still left.

## 1. Fix first: these show "TODO" on the live site

Role bullets are printed as written, so the Experience page shows "TODO" under these roles.
Replace each `- 'TODO'` with one or more real bullets, e.g. `- 'Built …'`.

- [ ] `src/content/roles/freelance.md` (line 15): bullets
- [ ] `src/content/roles/mrc-research-assistant.md` (line 15): bullets (keep the "Supervisor: Prof. Irene Cheng." bullet; only the `'TODO'` line goes)
- [ ] `src/content/roles/instant-systems.md` (line 13): bullets
- [ ] `src/content/roles/teach-for-india.md` (line 13): bullets

## 2. Visible, but as a placeholder

- [x] `src/data/site.ts`: `description`, the one line search engines and link previews show (done in step 9)
- [ ] `src/content/pages/about.md` (line 8): your photo. Put the image next to the file, then uncomment `photo:` and `photoAlt:`. Until then About shows a dashed "[Photo]" box.
- [ ] Project covers (optional): desktop cards show a dashed "[Cover image]" strip until a project has `cover:` and `coverAlt:` (see section 3)

## 3. Hidden until filled in (the site hides these cleanly meanwhile)

### USA_FIELDS: `src/content/projects/usa-fields.md`

- [ ] line 7: real rough location of the data (the pin is a placeholder at 41.88, -93.10)
- [ ] line 11: `role`
- [ ] line 12: `dates`
- [ ] line 13: confirm `status: ongoing`, then delete the `# TODO` comment
- [ ] line 19: `links` (GitHub / report), only if you'll publish them
- [ ] lines 21–23: lifecycle `data`, `model`, `training` (no `results` stage: results aren't published)
- [ ] line 26: the mission-file write-up (the text below the `---`)

### Computer Vision Coursework: `src/content/projects/cv-coursework.md`

- [ ] line 11: `dates`
- [ ] lines 23–24: `cover` / `coverAlt` (optional)

### EDSS Navigator: `src/content/projects/edss-navigator.md`

- [ ] line 10: `dates`
- [ ] line 19: `links`
- [ ] lines 20–21: `cover` / `coverAlt` (optional)

### pLUCK: `src/content/projects/pluck.md`

- [ ] line 10: `dates`
- [ ] line 18: `links`
- [ ] lines 19–20: `cover` / `coverAlt` (optional)

### Other builds (a row without a link just isn't clickable)

- [ ] `src/content/projects/ray-tracer.md` (line 9): `links` (GitHub)
- [ ] `src/content/projects/ai-crypto-trading-assistant.md` (line 10): `links` (GitHub / demo)

### Contact: `src/content/pages/contact.md`

- [ ] line 7: add when you're available to the intro text (e.g. "Available from May 2027."), then delete the comment

## 4. Also before launch

- [ ] `public/cv.pdf`: replace with your current CV
- [ ] Make the CMPUT 328 repo public (the Computer Vision Coursework page links to it)
- [x] Domain name: www.anantgupta.org (set as `SITE_URL` in `astro.config.mjs`)

## Adding images (photo, covers)

Put the image in a folder next to its Markdown file and use a `./` path, e.g.
`cover: ./pluck/cover.png` for a file at `src/content/projects/pluck/cover.png`.
Don't put these in `public/`: Astro only finds and compresses images next to the Markdown
(a 700 KB PNG becomes 10–30 KB WebP files). `public/` is only for files linked directly, like `cv.pdf`.

## If the domain changes again

- [ ] Change `SITE_URL` at the top of `astro.config.mjs` (it feeds canonical links, share previews, the sitemap and robots.txt), then `npm run build`
- [ ] Update the live link in `README.md`
- [ ] Per-page search text lives in `src/content/pages/about.md` and `contact.md` (`description:`), and in `src/data/site.ts` for Projects and Experience

## After editing

- **Changed a location** (USA_FIELDS' pin, or `location:` in `about.md`)? The still images show those pins, so run `npm run globe:stills`, then `npm run build`.
- Before committing, run `npm run check` and `npm run build`; both must pass.

## Not content: leave these

- `src/globe/Globe.ts` (line ~350): an optional future idea (terrain height on the globe)
- The "TODO" mentions in `src/lib/projects.ts` and `src/pages/projects/[slug].astro`: that's the code that hides TODO fields
