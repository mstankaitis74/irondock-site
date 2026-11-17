// Harbour scene: time of day, parallax on scroll and pointer, and travel between berths without a page reload.
(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');

  // ---- Time of day ----
  // The script in <head> has already picked dawn, day, dusk or night from the visitor's clock (window.skyNow).
  // A click on the sun or moon moves on to the next one and keeps it for this browser tab.
  const phases = ['dawn', 'day', 'dusk', 'night'];
  const themeColor = document.querySelector('meta[name="theme-color"]');
  let skyChosen = false;
  try {
    skyChosen = phases.includes(sessionStorage.getItem('sky'));
  } catch {
    // Storage is blocked: the scene simply follows the clock.
  }
  const paintThemeColor = () => {
    if (themeColor) themeColor.content = getComputedStyle(root).getPropertyValue('--sky-1').trim();
  };
  const setSky = (phase) => {
    const apply = () => {
      root.dataset.sky = phase;
      paintThemeColor();
    };
    if (document.startViewTransition && !reducedMotion) document.startViewTransition(apply);
    else apply();
  };
  hero.querySelector('.orb')?.addEventListener('click', () => {
    const next = phases[(phases.indexOf(root.dataset.sky) + 1) % phases.length];
    skyChosen = true;
    try {
      sessionStorage.setItem('sky', next);
    } catch {
      // Not remembered for the next page load, but still switched.
    }
    setSky(next);
  });
  setInterval(() => {
    const now = window.skyNow?.();
    if (!skyChosen && now && now !== root.dataset.sky) setSky(now);
  }, 300000);
  paintThemeColor();

  // ---- Pause button: stops everything that moves on its own (dock.css: .is-paused) ----
  const pauseButton = hero.querySelector('.pause');
  const labelPauseButton = () => {
    if (!pauseButton) return;
    const label = pauseButton.dataset[root.classList.contains('is-paused') ? 'play' : 'pause'];
    pauseButton.setAttribute('aria-label', label);
    pauseButton.title = label;
  };
  pauseButton?.addEventListener('click', () => {
    root.classList.toggle('is-paused');
    labelPauseButton();
  });

  // The scene rests and the parallax stops updating while it is scrolled out of view.
  let heroVisible = true;
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    hero.classList.toggle('is-offscreen', !heroVisible);
  }).observe(hero);

  // ---- Parallax ----
  // The pointer shifts every layer by its own reach (--reach, in the scene's em): the transform goes on the
  // layer's .shift, a plain box, so a frame costs next to nothing. Scroll parallax belongs to dock.css
  // (a scroll-driven animation on the layer); only a browser without those gets it from here.
  const layers = [...hero.querySelectorAll('.layer')].map((element) => {
    const style = getComputedStyle(element);
    return {
      element,
      shift: element.firstElementChild,
      depth: parseFloat(style.getPropertyValue('--depth')),
      reach: parseFloat(style.getPropertyValue('--reach')),
      pan: parseFloat(style.getPropertyValue('--f')),
      shifted: '',
    };
  });
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const cssScrollParallax = CSS.supports('(animation-timeline: view()) and (animation-range: entry)');
  if (!reducedMotion && (finePointer || !cssScrollParallax)) {
    const heroText = hero.querySelector('.hero-text');
    let targetX = 0;
    let targetY = 0;
    let pointerX = 0;
    let pointerY = 0;
    let frame = 0;
    let heroHeight = hero.offsetHeight;

    const render = () => {
      frame = 0;
      pointerX += (targetX - pointerX) * 0.08;
      pointerY += (targetY - pointerY) * 0.08;
      const em = heroHeight / 100;
      let moved = false;
      for (const layer of layers) {
        const shifted = `translate3d(${(-pointerX * layer.reach * em).toFixed(1)}px, ${(-pointerY * layer.reach * em * 0.22).toFixed(1)}px, 0)`;
        if (shifted === layer.shifted) continue;
        layer.shift.style.transform = layer.shifted = shifted;
        moved = true;
      }
      if (!cssScrollParallax) {
        const scroll = Math.min(scrollY, heroHeight);
        for (const layer of layers) layer.element.style.transform = `translate3d(0, ${(scroll * layer.depth).toFixed(1)}px, 0)`;
        heroText.style.transform = `translate3d(0, ${(scroll * 0.3).toFixed(1)}px, 0)`;
        heroText.style.opacity = Math.max(1 - (scroll / heroHeight) * 1.5, 0).toFixed(3);
      }
      // Keep going until the layers have caught up with the pointer.
      if (heroVisible && moved) schedule();
    };
    const schedule = () => { frame ||= requestAnimationFrame(render); };

    addEventListener('resize', () => {
      heroHeight = hero.offsetHeight;
      schedule();
    });
    if (!cssScrollParallax) addEventListener('scroll', () => { if (heroVisible) schedule(); }, { passive: true });
    if (finePointer) {
      addEventListener('pointermove', (event) => {
        targetX = (event.clientX / innerWidth) * 2 - 1;
        targetY = Math.min((event.clientY + scrollY) / heroHeight, 1) * 2 - 1;
        if (heroVisible) schedule();
      });
    }
    schedule();
  }

  // ---- Berth list ----
  // On an app page the list is one row; on a narrow screen the row scrolls, so the current app is brought to the middle.
  const centreCurrentBerth = (smooth) => {
    const list = document.querySelector('.berths');
    const current = list?.querySelector('[aria-current="page"]');
    if (!current || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({
      left: current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2,
      behavior: smooth && !reducedMotion ? 'smooth' : 'auto',
    });
  };
  centreCurrentBerth(false);

  // Pointing at an app's card or sign lights its lamp on the pier.
  const mark = (berth) => hero.querySelector(`.mark[data-berth="${berth}"]`);
  const light = (event, on) => {
    const link = event.target.closest?.('a[data-berth]');
    if (link) mark(link.dataset.berth)?.classList.toggle('is-hot', on);
  };
  document.addEventListener('pointerover', (event) => light(event, true), { passive: true });
  document.addEventListener('pointerout', (event) => light(event, false), { passive: true });

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

    // A longer trip along the pier takes a little longer, so the scene never becomes a blur.
    const distance = Math.abs(berth - hero.style.getPropertyValue('--cam'));
    hero.style.setProperty('--travel', `${Math.min(1.1 + 0.3 * distance, 2.6)}s`);
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
    // Controls marked [data-sync] stay in place (the flags move, the scene keeps running); only their
    // labels and targets follow the page.
    document.querySelectorAll('[data-sync]').forEach((control) => {
      const source = next.querySelector(`[data-sync="${control.dataset.sync}"]`);
      if (!source) return;
      for (const name of ['aria-label', 'title', 'hreflang', 'data-pause', 'data-play']) {
        if (source.hasAttribute(name)) control.setAttribute(name, source.getAttribute(name));
      }
      if (source.hasAttribute('href')) control.href = new URL(source.getAttribute('href'), url).href;
    });
    labelPauseButton();
    document.querySelectorAll('.berth, .mark').forEach((link) => {
      if (link.dataset.berth === berth) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.body.classList.remove('is-swapping');
    centreCurrentBerth(true);
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
  // A sideways drag on the scene moves the camera with the finger. Letting go past a quarter of the way,
  // or with a flick, travels to the neighbouring berth; otherwise the scene goes back.
  const lastBerth = Number(hero.style.getPropertyValue('--stations'));
  let drag = null;
  let draggedAt = 0;

  // While the finger is down each layer is moved directly; letting go hands the camera back to --cam,
  // and the layers glide from where the finger left them to the berth.
  const follow = (cam) => {
    for (const layer of layers) layer.element.style.translate = `${(-cam * layer.pan * drag.step).toFixed(1)}px 0`;
  };
  const settle = (cam) => {
    hero.classList.remove('is-dragging');
    hero.classList.add('is-settling');
    hero.style.setProperty('--cam', cam);
    for (const layer of layers) layer.element.style.translate = '';
    setTimeout(() => hero.classList.remove('is-settling'), 500);
  };

  hero.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    drag = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastTime: event.timeStamp,
      from: Number(document.body.dataset.berth), step: mark(1).offsetLeft - mark(0).offsetLeft, moved: 0, speed: 0, active: false,
    };
  });

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
    follow(cam);
  });

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { active, from, moved, speed } = drag;
    if (!active) {
      drag = null;
      return;
    }
    draggedAt = event.timeStamp;
    const flick = Math.abs(speed) > 0.5 && Math.sign(-speed) === Math.sign(moved);
    const travel = event.type === 'pointerup' && (Math.abs(moved) > 0.25 || flick) ? Math.sign(moved) : 0;
    const target = Math.min(Math.max(from + travel, 0), lastBerth);
    settle(target);
    drag = null;
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
