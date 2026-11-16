# irondock-site

Irondock website, served by GitHub Pages at https://irondock.dev.

- `index.html` – home page: the whole dock
- `beatsy/`, `zalias-ket/`, `talkvault/` – one page per app (its berth). All pages share the same scene and berth list; they differ in `<head>`, `--cam`, the hero text and `<main>`
- `lt/` – the same four pages in Lithuanian; English is the default. The flag mast in the scene links each page to its other language
- `dock.css`, `dock.js` – shared styles, parallax, and travel between berths without a page reload
- `scene/*.svg` – tiles of the harbour scene
- `robots.txt`, `sitemap.xml`, `og.png`, `favicon.svg` – search engines and link previews
- `beatsy/privacy/index.html` – Beatsy privacy policy (copy of `C:\programming\beatsy\application\androidApp\src\main\assets\privacy-policy.html`; update both together)
- `CNAME` – custom domain for GitHub Pages
- `app-ads.txt` – add here once the AdMob account exists

## Adding an app

1. Copy an app folder (and its `lt/` twin), change `<head>` including the `hreflang` links, `data-berth`, `--cam`, the hero text, the mast link and `<main>`.
2. In every page of both languages add its nav card, its `.mark` (dock layer) and its `.reflection` (water layer) with the next `--n` and a `--berth` colour.
3. Raise `--stations` in `dock.css` and the column count of `.berths` for app pages.
4. Add both URLs to `sitemap.xml`.
