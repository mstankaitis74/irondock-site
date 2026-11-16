// Harbour scene: parallax on scroll and pointer, and travel between berths without a page reload.
(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lamps stop pulsing and the parallax stops updating while the scene is scrolled out of view.
  let heroVisible = true;
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    hero.classList.toggle('is-offscreen', !heroVisible);
  }).observe(hero);

  // ---- Parallax: feeds scroll position and pointer offset to CSS (see .layer in dock.css) ----
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  // On touch devices dock.css moves the layers with a scroll-driven animation when the browser has one.
  const cssScrollParallax = matchMedia('(hover: none)').matches && CSS.supports('animation-timeline: scroll(root)');
  if (!reducedMotion && !(cssScrollParallax && !finePointer)) {
    let pointerTarget = 0;
    let pointer = 0;
    let frame = 0;
    let heroHeight = hero.offsetHeight;
    addEventListener('resize', () => { heroHeight = hero.offsetHeight; });

    const render = () => {
      frame = 0;
      pointer += (pointerTarget - pointer) * 0.08;
      if (!cssScrollParallax) hero.style.setProperty('--scroll', Math.min(scrollY, heroHeight));
      hero.style.setProperty('--pointer', pointer.toFixed(4));
      if (heroVisible && Math.abs(pointerTarget - pointer) > 0.001) schedule();
    };
    const schedule = () => { frame ||= requestAnimationFrame(render); };

    addEventListener('scroll', () => { if (heroVisible) schedule(); }, { passive: true });
    if (finePointer) {
      addEventListener('pointermove', (event) => {
        pointerTarget = (event.clientX / innerWidth) * 2 - 1;
        if (heroVisible) schedule();
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

  // Fetch a page as soon as a tap or hover shows the intent, and the other berths once the browser is idle,
  // so the click itself only has to move the camera.
  const prefetch = (event) => {
    const link = event.target.closest?.('a[data-nav]');
    if (link) load(link.href).catch(() => {});
  };
  document.addEventListener('pointerenter', prefetch, { capture: true, passive: true });
  document.addEventListener('touchstart', prefetch, { capture: true, passive: true });
  if (!navigator.connection?.saveData) {
    (window.requestIdleCallback ?? setTimeout)(() => {
      document.querySelectorAll('a.berth[data-nav], a.lang').forEach((link) => load(link.href).catch(() => {}));
    });
  }

  // ---- Swipe between berths on a touch screen ----
  // A sideways drag on the scene or the berth list moves the camera with the finger. Letting go past a
  // quarter of the way, or with a flick, travels to the neighbouring berth; otherwise the scene goes back.
  const lastBerth = Number(getComputedStyle(hero).getPropertyValue('--stations'));
  const mark = (berth) => hero.querySelector(`.mark[data-berth="${berth}"]`);
  let drag = null;
  let draggedAt = 0;

  const settle = (cam) => {
    hero.classList.remove('is-dragging');
    hero.classList.add('is-settling');
    hero.style.setProperty('--cam', cam);
    setTimeout(() => hero.classList.remove('is-settling'), 500);
  };

  const startDrag = (event) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    drag = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastTime: event.timeStamp,
      from: Number(document.body.dataset.berth), step: mark(1).offsetLeft - mark(0).offsetLeft, moved: 0, speed: 0, active: false,
    };
  };
  hero.addEventListener('pointerdown', startDrag);
  document.querySelector('.berths')?.addEventListener('pointerdown', startDrag);

  addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    if (!drag.active) {
      // Vertical movement is the page scrolling (touch-action: pan-y); only a sideways drag takes the scene.
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(event.clientY - drag.startY)) return;
      drag.active = true;
      hero.classList.add('is-dragging');
    }
    drag.speed = (event.clientX - drag.lastX) / Math.max(event.timeStamp - drag.lastTime, 1);   // px per ms
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    drag.moved = -dx / drag.step;   // in berths; positive = towards the next berth
    let cam = drag.from + drag.moved;
    // Past either end of the dock the scene resists: it follows at a third of the finger's travel.
    if (cam < 0) cam /= 3;
    if (cam > lastBerth) cam = lastBerth + (cam - lastBerth) / 3;
    hero.style.setProperty('--cam', cam.toFixed(4));
  });

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { active, from, moved, speed } = drag;
    drag = null;
    if (!active) return;
    draggedAt = event.timeStamp;
    const flick = Math.abs(speed) > 0.5 && Math.sign(-speed) === Math.sign(moved);
    const travel = event.type === 'pointerup' && (Math.abs(moved) > 0.25 || flick) ? Math.sign(moved) : 0;
    const target = Math.min(Math.max(from + travel, 0), lastBerth);
    settle(target);
    if (target !== from) visit(mark(target).href, true);
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-nav]');
    const plainClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!link || !plainClick) return;
    event.preventDefault();
    if (event.timeStamp - draggedAt < 400) return;   // the finger was lifted after a drag, not a tap
    if (link.href !== location.href) visit(link.href, true);
  });
  addEventListener('popstate', () => visit(location.href, false));
})();
