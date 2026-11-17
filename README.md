# irondock-site

Irondock website, served by GitHub Pages at https://irondock.dev.

- `index.html` – home page: the whole dock
- `beatsy/`, `zalias-ket/`, `talkvault/` – one page per app (its berth). All pages share the same scene and berth list; they differ in `<head>`, `--cam`, the hero text and `<main>`
- `lt/` – the same four pages in Lithuanian; English is the default. The signal flags in the scene link each page to its other language
- `dock.css`, `dock.js` – shared styles, the harbour scene, parallax, and travel between berths without a page reload. The scene's artwork lives in `dock.css` (the `--art-*` values near the top: small SVGs written as data URIs), so the whole scene arrives with the stylesheet
- `dive.js` – a hidden game under the water: steer a fish for as long as it lasts. Bigger fish swallow it, junk sinks from above, a hook comes down to where the fish has been keeping, small fry only knock it aside, and currents and the edges push it; a rare glowing gift helps for a few seconds. Nobody wins: it gets harder until something gets the fish, and the best score is kept for the browser tab. It opens after five quick clicks on a buoy or on one spot under the water, or when the word `fish` is typed, and closes with Esc or its close button, which brings the view back up to the top of the page. `dock.js` fetches the file only then; its styles are in `dock.css` (`.dive`).
- `sound/` – quiet sea sounds, one seamless loop per time of day (made with ElevenLabs). The sound is on when the page opens, at a tenth of the volume slider (a browser lets it be heard from the visitor's first click, tap or key press); the sound button turns it off, and that choice is remembered. `plop`, `bell`, `bubbles`, `gull` and `chime` are the short sounds that answer a click on the water, a buoy, the page under the surface, the day sky and the night sky
- `robots.txt`, `sitemap.xml`, `og.png`, `favicon.svg` – search engines and link previews
- Visits are counted by Cloudflare Web Analytics (no cookies): its snippet is the last script on every page, and the numbers are in the Cloudflare dashboard under Web Analytics.
- `beatsy/privacy/index.html` – Beatsy privacy policy (copy of `C:\programming\beatsy\application\androidApp\src\main\assets\privacy-policy.html`; update both together)
- `CNAME` – custom domain for GitHub Pages
- `app-ads.txt` – add here once the AdMob account exists

## How the scene works

- Everything in the scene is measured in `em`, and `1em` is one hundredth of the hero's height, so the pier, lamps and signs scale together. A wider window only shows more of the pier.
- Time of day: the short script in each page's `<head>` sets `data-sky` on `<html>` to `dawn`, `day`, `dusk` or `night` from the visitor's clock. `dock.css` has one block of colours for each. Clicking the sun or moon moves on to the next one for that browser tab.
- Sound: each MP3 is one 27.5 s loop with half a second of its neighbouring loop on either side; `dock.js` repeats only the part in between (`LOOP_START`, `LOOP_LENGTH`), so the join is never audible. A new file must be built the same way.
- Pages load the shared files as `dock.css?v=N` and `dock.js?v=N`. Raise `N` in every page when a change to those files needs new HTML as well, so nobody gets a new page with an old cached stylesheet.

## Adding an app

1. Copy an app folder (and its `lt/` twin), change `<head>` including the `hreflang` links, `data-berth`, `--cam`, the hero text, the flags' link and `<main>`.
2. In every page of both languages add its nav card, its `.mark` (dock layer) and its `.reflection` (water layer) with the next `--n` and a `--berth` colour, and raise `--stations` on `.hero` to the new last berth number.
3. Add both URLs to `sitemap.xml`.

## Google Play links

The Beatsy and Žalias KET pages (both languages) start with a block that says the app is in development. When an app is published, replace the `<span class="button button--soon">` in that block with `<a class="button" href="https://play.google.com/store/apps/details?id=…">Get it on Google Play</a>` (`Atsisiųsti iš Google Play` on the Lithuanian page) and delete the paragraph under it; the comment in the block says the same.
