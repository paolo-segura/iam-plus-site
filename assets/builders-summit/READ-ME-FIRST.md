# Builders Summit — asset drop folder

Drop files here and I'll wire them into `/builders-summit`. Nothing is
auto-detected — tell me when you've dropped something and I'll add it.

## Folders

| Folder | What goes in | Notes |
|---|---|---|
| `photos/` | Hero + section photography from past Summits (Batch 1 Jun 19, Batch 2 Jul 17) | Real event shots only. Wide room shots, people mid-conversation, the LED wall lit up. **No AI-generated faces.** |
| `gallery/` | The "what the room looks like" strip | 6–12 landscape shots. I'll convert to WebP and lazy-load. |
| `speakers/` | Coach Migs + any Batch 3 speaker headshots | Square-ish, ideally 800×800+. Name the file after the person: `migs-flores.jpg`. |
| `video/` | `Builders Summit SDE.1.mp4` (the Same Day Edit) | 101 MB raw — I'll compress to a web-safe MP4 + WebM and generate a poster frame. Do NOT commit the raw file. |
| `fonts/` | The Seasons (`.otf` / `.ttf` / `.woff2`) | **Only if I AM+ holds a license.** See note below. |

## Naming

Lowercase, hyphens, no spaces: `summit-batch2-room-wide.jpg`, not `IMG 4821 (1).JPG`.
Spaces break the nginx/Vercel static paths.

## Sizes I want

- **Hero** — 2400px wide minimum, landscape
- **Gallery** — 1600px wide
- **Speakers** — 800×800 minimum, square crop
- **OG image** — I'll generate this at 1200×630 from the hero

## Font licensing note

The wordmark face is **The Seasons** (Cadina Studio, commercial license).
Default plan is to export the locked-up wordmark as an SVG/PNG from the Canva
LED wall deck — that's covered by Canva's export license and gives exact pixels
with zero exposure.

Only drop a font file in `fonts/` if I AM+ has actually bought a **webfont**
license (a desktop license does NOT cover `@font-face` on a public site).
Free-download mirrors are not a license.
