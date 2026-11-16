// Harbour scene: parallax on scroll and pointer, and travel between berths without a page reload.
(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Parallax: feeds scroll position and pointer offset to CSS (see .layer in dock.css) ----
  if (!reducedMotion) {
    let pointerTarget = 0;
    let pointer = 0;
    let frame = 0;

    const render = () => {
      frame = 0;
      pointer += (pointerTarget - pointer) * 0.08;
      // Nothing to move once the hero has scrolled out of view.
      hero.style.setProperty('--scroll', Math.min(scrollY, hero.offsetHeight));
      hero.style.setProperty('--pointer', pointer.toFixed(4));
      if (Math.abs(pointerTarget - pointer) > 0.001) schedule();
    };
    const schedule = () => { frame ||= requestAnimationFrame(render); };

    addEventListener('scroll', schedule, { passive: true });
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      addEventListener('pointermove', (event) => {
        pointerTarget = (event.clientX / innerWidth) * 2 - 1;
        schedule();
      });
    }
    schedule();
  }

  // ---- Navigation between berths ----
  // Every page is a complete HTML file (search engines and direct visits get the real thing).
  // A click on a [data-nav] link fetches the target page, moves the camera to its berth and
  // swaps the [data-swap] regions, so the scene never reloads. Regions marked [data-swap-lang]
  // (berth list, signs, footer) only differ between languages and are swapped when it changes.
  if (location.protocol === 'file:') return;   // fetch() is blocked for local files: links load normally

  const pages = new Map();
  const load = (url) => {
    if (!pages.has(url)) {
      const page = fetch(url)
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error(response.status))))
        .then((html) => new DOMParser().parseFromString(html, 'text/html'));
      page.catch(() => pages.delete(url));
      pages.set(url, page);
    }
    return pages.get(url);
  };

  let latestVisit = 0;
  const visit = async (url, push) => {
    const visitId = ++latestVisit;
    let next;
    try {
      next = await load(url);
    } catch {
      location.assign(url);
      return;
    }
    if (visitId !== latestVisit) return;   // a newer click won

    const berth = next.body.dataset.berth;
    // Nav links and the icon are relative; resolve them before the address changes.
    document.querySelectorAll('a[data-nav], link[rel="icon"]').forEach((link) => { link.href = link.href; });
    if (push) history.pushState(null, '', url);
    if (scrollY > 0) scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });

    hero.style.setProperty('--cam', berth);
    document.body.classList.add('is-swapping');
    await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : 250));
    if (visitId !== latestVisit) return;

    const swap = (attribute) => document.querySelectorAll(`[${attribute}]`).forEach((region) => {
      const source = next.querySelector(`[${attribute}="${region.getAttribute(attribute)}"]`);
      if (source) region.replaceChildren(...document.importNode(source, true).childNodes);
    });
    swap('data-swap');
    if (next.documentElement.lang !== document.documentElement.lang) swap('data-swap-lang');

    document.title = next.title;
    document.documentElement.lang = next.documentElement.lang;   // also hoists the other flag (dock.css)
    document.body.dataset.berth = berth;
    // The mast stays in place so its flags can move; only its target changes with the page.
    const mast = document.querySelector('.lang');
    const nextMast = next.querySelector('.lang');
    if (mast && nextMast) {
      mast.href = new URL(nextMast.getAttribute('href'), url).href;
      mast.hreflang = nextMast.hreflang;
      mast.setAttribute('aria-label', nextMast.getAttribute('aria-label'));
    }
    document.querySelectorAll('.berth').forEach((card) => {
      if (card.dataset.berth === berth) card.setAttribute('aria-current', 'page');
      else card.removeAttribute('aria-current');
    });
    document.body.classList.remove('is-swapping');
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-nav]');
    const plainClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!link || !plainClick) return;
    event.preventDefault();
    if (link.href !== location.href) visit(link.href, true);
  });
  addEventListener('popstate', () => visit(location.href, false));
})();
