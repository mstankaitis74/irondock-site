// Harbour scene: time of day, parallax on scroll and pointer, and travel between berths without a page reload.
(() => {
  const script = document.currentScript;
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
      playSound();
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
  const setPaused = (paused) => {
    root.classList.toggle('is-paused', paused);
    labelPauseButton();
    holdSound(paused);
  };
  pauseButton?.addEventListener('click', () => setPaused(!root.classList.contains('is-paused')));

  // ---- Sound: quiet sea sounds for the time of day, on unless the visitor has turned them off ----
  // Each file in sound/ is one loop with half a second of its own neighbouring loop on either side.
  // The player repeats only the part in between, so the join never falls on the padding an MP3 carries
  // at its ends, and the last sample of the loop runs straight into the first.
  const LOOP_START = 0.5;
  const LOOP_LENGTH = 27.5;
  const soundButton = window.AudioContext ? hero.querySelector('.sound') : null;
  const volumeSlider = hero.querySelector('.volume');
  const soundFolder = new URL('sound/', script.src);
  const sounds = new Map();
  const files = new Map();
  const EFFECTS = ['plop', 'bell', 'bubbles', 'gull', 'chime'];
  let audio = null;
  let soundOn = false;
  let playing = null;
  let gameLoop = null;   // the loop the game under the water plays in place of the sea, while it is open

  // The slider goes from 0 to 100 and starts at 10. Loudness is heard on a curve, so the gain rises faster
  // than the slider: 10 is a quiet background, about 65 plays the files as they are, 100 is twice that.
  const volume = () => (volumeSlider ? (volumeSlider.value / 100) ** 1.5 * 2 : 0.06);
  try {
    const saved = localStorage.getItem('sea-volume');
    if (volumeSlider && saved !== null && saved >= 0 && saved <= 100) volumeSlider.value = saved;
  } catch {
    // Storage is blocked: the slider starts at 10 every time.
  }
  volumeSlider?.addEventListener('input', () => {
    try {
      localStorage.setItem('sea-volume', volumeSlider.value);
    } catch {
      // Not remembered for the next visit.
    }
    if (!playing) return;
    playing.gain.gain.cancelScheduledValues(audio.currentTime);
    playing.gain.gain.setTargetAtTime(volume(), audio.currentTime, 0.04);
  });

  // A file can be fetched before there is an audio context; it is decoded once there is one to play it.
  const fetchSound = (name) => {
    if (!files.has(name)) {
      const file = fetch(new URL(`${name}.mp3`, soundFolder))
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.status))));
      file.catch(() => files.delete(name));
      files.set(name, file);
    }
    return files.get(name);
  };
  const loadSound = (name) => {
    if (!sounds.has(name)) {
      const sound = fetchSound(name).then((file) => audio.decodeAudioData(file));
      sound.catch(() => {
        sounds.delete(name);
        files.delete(name);
      });
      sounds.set(name, sound);
    }
    return sounds.get(name);
  };
  const fadeOut = (seconds) => {
    if (!playing) return;
    const { source, gain } = playing;
    playing = null;
    gain.gain.cancelScheduledValues(audio.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, audio.currentTime);
    gain.gain.linearRampToValueAtTime(0, audio.currentTime + seconds);
    source.stop(audio.currentTime + seconds + 0.05);
  };
  // Starts the loop for the current time of day; when the sky changes, the old loop fades into the new one.
  // While the game under the water is open, its loop plays instead (swapSea).
  const skyPhase = () => (phases.includes(root.dataset.sky) ? root.dataset.sky : 'night');
  const loopName = () => gameLoop ?? skyPhase();
  async function playSound() {
    const name = loopName();
    if (!audio || !soundOn || playing?.name === name) return;
    let buffer;
    try {
      buffer = await loadSound(name);
    } catch {
      return;   // no sound this time; the page works without it
    }
    if (!soundOn || playing?.name === name || loopName() !== name) return;
    fadeOut(2);
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = LOOP_START;
    source.loopEnd = LOOP_START + LOOP_LENGTH;
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(volume(), audio.currentTime + 2);
    source.connect(gain).connect(audio.destination);
    source.start(0, LOOP_START);
    playing = { name, source, gain };
  }
  // The pause button silences the sea together with the scene: a short fade, then the audio clock stops,
  // so the loop carries on from the same wave when the scene runs again.
  let holding = 0;
  function holdSound(hold) {
    if (!audio) return;
    clearTimeout(holding);
    const level = playing?.gain.gain;
    level?.cancelScheduledValues(audio.currentTime);
    if (hold) {
      level?.setTargetAtTime(0, audio.currentTime, 0.08);
      holding = setTimeout(() => audio.suspend(), 400);
    } else if (soundOn && !document.hidden) {
      audio.resume();
      level?.setTargetAtTime(volume(), audio.currentTime, 0.15);
    }
  }
  const labelSoundButton = () => {
    if (!soundButton) return;
    const label = soundButton.dataset[soundOn ? 'off' : 'on'];
    soundButton.setAttribute('aria-label', label);
    soundButton.title = label;
  };
  // A browser lets sound start only after the visitor's first tap, click or key press on the page, and
  // warns in the console about an audio context made any earlier. Firefox says when a site may play at once.
  const canStart = () => navigator.userActivation?.hasBeenActive
    || navigator.getAutoplayPolicy?.('audiocontext') === 'allowed';
  const startAudio = () => {
    audio ??= new AudioContext();
    audio.resume();
    playSound();
    // The short sounds that answer a click are decoded now, so the first of them is not late.
    (window.requestIdleCallback ?? setTimeout)(() => {
      for (const name of EFFECTS) loadSound(name).catch(() => {});
    });
  };
  const setSound = (on, byGesture = false) => {
    soundOn = on;
    root.classList.toggle('has-sound', on);
    labelSoundButton();
    try {
      localStorage.setItem('sound', on ? 'on' : 'off');
    } catch {
      // Not remembered for the next visit.
    }
    if (on) {
      // Turning the sound on while everything is paused sets the scene going again as well.
      if (root.classList.contains('is-paused')) setPaused(false);
      if (audio || byGesture || canStart()) startAudio();
      // Not allowed to play yet: the files are fetched meanwhile, so the first gesture starts the sea at once.
      else for (const name of [skyPhase(), ...EFFECTS]) fetchSound(name).catch(() => {});
    } else {
      fadeOut(0.6);
    }
  };
  if (soundButton) {
    // The sound is switched on when the page opens, and every gesture wakes the audio until it is really
    // running. audibleBefore tells the sound button's click whether the sea was heard before the gesture began.
    let audibleBefore = false;
    const wake = (event) => {
      if (event.type === 'pointerdown' || event.type === 'keydown') audibleBefore = audio?.state === 'running';
      if (!soundOn || audio?.state === 'running' || root.classList.contains('is-paused')) return;
      if (audio) audio.resume();
      // A finger going down is not yet a gesture the browser counts; its lifting is.
      else if (navigator.userActivation?.isActive ?? true) startAudio();
    };
    for (const gesture of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
      addEventListener(gesture, wake, { capture: true, passive: true });
    }
    soundButton.addEventListener('click', () => {
      // On, but not heard before this click: the click starts the sea instead of switching it off.
      if (soundOn && !audibleBefore && !root.classList.contains('is-paused')) startAudio();
      else setSound(!soundOn, true);
    });
    document.addEventListener('visibilitychange', () => {
      if (!audio) return;
      if (document.hidden) audio.suspend();
      else if (soundOn && !root.classList.contains('is-paused')) audio.resume();
    });
    let wanted = !navigator.connection?.saveData;
    try {
      if (localStorage.getItem('sound') === 'off') wanted = false;
    } catch {
      // Storage is blocked: the sound starts on.
    }
    if (wanted) (window.requestIdleCallback ?? setTimeout)(() => setSound(true));

    // The volume slider shows while the pointer or the keyboard focus is on the sound button or on the
    // slider, and for two seconds after it has left both (dock.css: .show-volume).
    let hiding = 0;
    const showVolume = (stay) => {
      clearTimeout(hiding);
      hero.classList.add('show-volume');
      if (!stay) hiding = setTimeout(() => hero.classList.remove('show-volume'), 2000);
    };
    for (const control of [soundButton, volumeSlider]) {
      control?.addEventListener('pointerenter', () => showVolume(true));
      control?.addEventListener('focus', () => showVolume(true));
      control?.addEventListener('pointerleave', () => showVolume(false));
      control?.addEventListener('blur', () => showVolume(false));
    }
  } else {
    hero.querySelector('.sound')?.remove();
    volumeSlider?.remove();
  }

  // One of the short sounds, a little different in pitch every time and placed left or right with the click.
  // The game under the water plays its own the same way, each lower or higher and softer or louder as it asks.
  const playEffect = async (name, clientX, { pitch = 1, level = 1 } = {}) => {
    if (!soundOn || audio?.state !== 'running') return;
    let buffer;
    try {
      buffer = await loadSound(name);
    } catch {
      return;
    }
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pitch * (0.93 + Math.random() * 0.14);
    gain.gain.value = volume() * level;
    let output = source.connect(gain);
    if (audio.createStereoPanner) {
      const panner = audio.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, (clientX / innerWidth) * 2 - 1)) * 0.6;
      output = output.connect(panner);
    }
    output.connect(audio.destination);
    source.start();
  };
  // The game under the water has sounds of its own (sound/dive/), and the sea is not heard down there: while
  // the game is open its loop plays in place of the sea's, and the sea comes back when the game closes.
  const swapSea = (name = null) => {
    gameLoop = name;
    fadeOut(0.6);
    playSound();
  };
  // The game's short sounds are fetched and decoded as it opens, so that the first of each is not late.
  const loadSounds = (names) => {
    if (soundOn && audio) for (const name of names) loadSound(name).catch(() => {});
  };

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
        if (event.target.closest?.('.dive')) return;   // the game under the water covers the scene: nothing to shift
        targetX = (event.clientX / innerWidth) * 2 - 1;
        targetY = Math.min((event.clientY + scrollY) / heroHeight, 1) * 2 - 1;
        if (heroVisible) schedule();
      });
    }
    schedule();
  }

  // ---- Small answers to a click ----
  // Water makes rings and throws a few drops, a buoy rocks and rings its bell, the night sky drops a star,
  // the day sky startles a gull, the pier's nearest lamp flares, and below the surface bubbles rise.
  // Everything is a throwaway element with one animation (dock.css: .fx), removed when it ends.
  const layerShift = (name) => hero.querySelector(`.layer--${name} > .shift`);
  const surf = layerShift('surf');
  const heroFx = document.createElement('div');
  heroFx.className = 'fx';
  hero.insertBefore(heroFx, hero.querySelector('.hero-text'));
  const depths = document.querySelector('.depths');
  const depthsFx = document.createElement('div');
  depthsFx.className = 'fx';
  depths?.prepend(depthsFx);
  // What happens on the water lives in the water. Each row of waves has a box of its own that moves with the
  // row and is clipped at its wave line (dock.css: .fx--sea). The pier stands between the far row and the two
  // nearer ones, so it covers what is behind it and nothing on the water is drawn over it.
  const seaFx = ['swell', 'water', 'surf'].map((name) => {
    const box = document.createElement('div');
    box.className = 'fx fx--sea';
    layerShift(name).append(box);
    return box;
  });
  // The boxes for a point on the water: the row it is on and every row behind that one, so whatever reaches
  // past the row's edge shows on the water further back. A row's wave line sits a little below its layer's top.
  const seaAt = (clientY) => {
    const em = hero.offsetHeight / 100;
    const line = (name, below) => layerShift(name).getBoundingClientRect().top + below * em;
    return seaFx.slice(0, clientY >= line('surf', 2.05) ? 3 : clientY >= line('water', 1.4) ? 2 : 1);
  };

  // One buoy every 140em of the nearest wave row, as many as its width needs (dock.css: .buoy). A screen
  // narrower than that plus a buoy would show none at some berths, so there they stand one to a berth instead.
  const placeBuoys = () => {
    const narrow = hero.offsetWidth < hero.offsetHeight * 1.48;
    hero.classList.toggle('is-narrow', narrow);
    const wanted = narrow ? Number(hero.style.getPropertyValue('--stations')) + 1 : Math.ceil(surf.offsetWidth / (hero.offsetHeight * 1.4));
    for (let k = surf.querySelectorAll('.buoy').length; k < wanted; k++) {
      const buoy = document.createElement('i');
      buoy.className = 'buoy';
      buoy.style.setProperty('--k', k);
      surf.prepend(buoy);
    }
  };
  placeBuoys();
  addEventListener('resize', placeBuoys);

  const random = (from, to) => from + Math.random() * (to - from);
  const spawn = (box, className, x, y, size, frames, timing) => {
    if (box.childElementCount > 80) return null;   // a storm of clicks stays cheap
    const piece = document.createElement('i');
    piece.className = className;
    piece.style.cssText = `--x: ${x.toFixed(1)}px; --y: ${y.toFixed(1)}px; --s: ${size}`;
    box.append(piece);
    const done = () => piece.remove();
    piece.animate(frames, { fill: 'forwards', ...timing }).finished.then(done, done);
    return piece;
  };
  // The same piece in several boxes, at one place on the screen: each box shows the part that falls inside it.
  const spawnIn = (boxes, className, clientX, clientY, size, frames, timing) => boxes.map((box) => {
    const place = box.getBoundingClientRect();
    return spawn(box, className, clientX - place.left, clientY - place.top, size, frames, timing);
  });
  const ripple = (clientX, clientY, size) => {
    const boxes = seaAt(clientY);
    for (let ring = 0; ring < 3; ring++) {
      spawnIn(boxes, 'fx-ring', clientX, clientY, size, [{ scale: 0.12, opacity: 0.9 }, { scale: 1, opacity: 0 }],
        { duration: 1500, delay: ring * 230, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' });
    }
  };
  const splash = (clientX, clientY, size) => {
    const em = hero.offsetHeight / 100;
    const boxes = seaAt(clientY);
    ripple(clientX, clientY, size);
    for (let drop = 0; drop < 6; drop++) {
      const reach = random(-3.4, 3.4) * em * size;
      const height = random(3, 7) * em * size;
      spawnIn(boxes, 'fx-drop', clientX, clientY, size, [
        { translate: '0 0', opacity: 1, easing: 'cubic-bezier(0.2, 0.7, 0.5, 1)' },
        { translate: `${reach * 0.6}px ${-height}px`, opacity: 1, offset: 0.45, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
        { translate: `${reach}px ${em}px`, opacity: 0 },
      ], { duration: random(650, 950) });
    }
  };
  const fallingStar = (clickX, clickY) => {
    const em = hero.offsetHeight / 100;
    // Each star starts a little away from the click, so quick clicks on one spot scatter over that part of the sky.
    const x = clickX + random(-9, 9) * em;
    const y = Math.max(clickY + random(-6, 6) * em, 2 * em);
    const left = Math.random() < 0.5;
    const streak = spawn(heroFx, 'fx-streak', x, y, 1, [
      { translate: '0 0', opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { translate: `${(left ? -34 : 34) * em}px ${15 * em}px`, opacity: 0 },
    ], { duration: 900, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' });
    if (streak) streak.style.rotate = left ? '156deg' : '24deg';
    for (let spark = 0; spark < 5; spark++) {
      spawn(heroFx, 'fx-spark', x + random(-3, 3) * em, y + random(-3, 3) * em, 1,
        [{ scale: 0, opacity: 0 }, { scale: random(1, 2.2), opacity: 1 }, { scale: 0, opacity: 0 }],
        { duration: random(500, 900), delay: random(0, 250) });
    }
  };
  // At night a star falls by itself now and then: one every one to five minutes, anywhere in the sky, without
  // a sound. It skips its turn while nobody can see it: the tab is hidden, the scene is scrolled away or paused.
  const waitForStar = () => setTimeout(() => {
    const unseen = document.hidden || !heroVisible || root.classList.contains('is-paused');
    if (!reducedMotion && !unseen && ['night', undefined].includes(root.dataset.sky)) {
      fallingStar(random(0.1, 0.9) * hero.offsetWidth, random(8, 34) * hero.offsetHeight / 100);
    }
    waitForStar();
  }, random(1, 5) * 60000);
  waitForStar();

  const startledGull = (x, y) => {
    const em = hero.offsetHeight / 100;
    const gull = spawn(heroFx, 'fx-gull', x, y, 1.1, [
      { translate: '0 0', opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { translate: `${(Math.random() < 0.5 ? -1 : 1) * random(18, 30) * em}px ${-random(16, 24) * em}px`, opacity: 0 },
    ], { duration: 2600, easing: 'cubic-bezier(0.3, 0.4, 0.4, 1)' });
    gull?.animate([{ scale: '1 1' }, { scale: '1 -0.55' }, { scale: '1 1' }], { duration: 380, iterations: 7 });
  };
  // Bubbles rise from a click under the water. The nearest wave of the scene is the front edge of the water's
  // surface, and the surface itself lies behind it, up to the horizon. While that edge is in view and within
  // reach, the bubbles go all the way up and break through somewhere on the surface, each in its own place;
  // otherwise they fade on the way.
  // The water under the scene and the rows of waves in it are boxes that each clip their own content, so a
  // bubble whose path crosses from the one into the others is drawn in all of them, and each shows its own part.
  const bubbles = (clientX, clientY) => {
    const scene = heroFx.getBoundingClientRect();
    const em = scene.height / 100;
    const edge = layerShift('surf').getBoundingClientRect().top + 2.2 * em;
    const horizon = layerShift('swell').getBoundingClientRect().top + 2 * em;
    const surfacing = edge > 0 && clientY - edge < 1000;
    for (let bubble = 0; bubble < 7; bubble++) {
      const x = clientX + random(-14, 14);
      const y = clientY + random(-8, 8);
      const size = random(6, 18);
      const drift = random(-26, 26);
      // How far behind the edge it comes up: the further back, the higher on the screen.
      const back = surfacing ? random(0.15, 0.9) * Math.max(0, Math.min(8 * em, edge - horizon - em)) : 0;
      const rise = surfacing ? y - edge + back : random(130, 260);
      const inFront = surfacing ? (y - edge) / rise : 0;   // the part of the way that is in the water in front
      const turn = Math.min(0.25, inFront / 2);
      const frames = surfacing ? [
        { translate: '0 0', opacity: 0, scale: 0.4 },
        { translate: `${drift}px ${-rise * turn}px`, opacity: 0.9, scale: 1, offset: turn },
        { translate: `${-drift * 0.6}px ${-rise * Math.min(inFront * 0.98, 0.9)}px`, opacity: 0.85, scale: 1, offset: Math.min(inFront * 0.98, 0.9) },
        // Behind the edge it is seen through the surface, fainter and smaller, until it breaks through.
        { translate: `${drift * 0.4}px ${-rise * 0.97}px`, opacity: back ? 0.4 : 0.85, scale: back ? 0.7 : 1, offset: 0.97 },
        { translate: `${drift * 0.4}px ${-rise}px`, opacity: 0, scale: 1.7 },
      ] : [
        { translate: '0 0', opacity: 0, scale: 0.4 },
        { translate: `${drift}px ${-rise * 0.35}px`, opacity: 0.9, scale: 1, offset: 0.3 },
        { translate: `${-drift * 0.6}px ${-rise * 0.7}px`, opacity: 0.7, offset: 0.7 },
        { translate: `${drift * 0.4}px ${-rise}px`, opacity: 0 },
      ];
      const timing = surfacing
        ? { duration: Math.max(800, rise / random(0.12, 0.19)), delay: random(0, 280) }
        : { duration: random(1500, 2500), delay: random(0, 280), easing: 'ease-out' };
      const boxes = y - rise - size < scene.bottom ? [depthsFx, ...seaFx] : [depthsFx];
      const piece = spawnIn(boxes, 'fx-bubble', x, y, `${size.toFixed(0)}px`, frames, timing).find(Boolean);
      // Where it breaks through, the surface answers with a ring and a couple of drops: smaller the further back.
      if (surfacing) {
        piece?.getAnimations()[0]?.finished.then(() => {
          // The page may have been scrolled since the click: the place is kept relative to the scene.
          const now = heroFx.getBoundingClientRect();
          const left = x + drift * 0.4 - scene.left + now.left;
          const top = y - rise - scene.top + now.top;
          const near = 1 - 0.04 * back / em;
          const rows = seaAt(top);
          spawnIn(rows, 'fx-ring', left, top, (0.26 + size / 50) * near,
            [{ scale: 0.12, opacity: 0.9 }, { scale: 1, opacity: 0 }], { duration: 1000, easing: 'ease-out' });
          for (let drop = 0; drop < 2; drop++) {
            const reach = random(-1.4, 1.4) * em * near;
            spawnIn(rows, 'fx-drop', left, top, 1, [
              { translate: '0 0', opacity: 1, easing: 'cubic-bezier(0.2, 0.7, 0.5, 1)' },
              { translate: `${reach * 0.6}px ${-random(1.2, 2.6) * em * near}px`, opacity: 1, offset: 0.45, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
              { translate: `${reach}px ${0.3 * em}px`, opacity: 0 },
            ], { duration: random(450, 700) });
          }
        }, () => {});
      }
    }
  };

  // ---- The hidden game ----
  // Five clicks within four seconds on a buoy or on one spot under the water, or the word "fish" typed anywhere,
  // take the view down under the water, where dive.js runs a short game. Nothing on the page points to it, and the
  // file is fetched only then.
  let game = null;
  const dive = () => {
    game ??= import(new URL(`dive.js${new URL(script.src).search}`, script.src));
    game.then((module) => module.dive({ playEffect, swapSea, loadSounds, reducedMotion }), () => { game = null; });
  };
  let bells = [];   // when the latest clicks on a buoy came
  let taps = [];    // when and where the latest clicks under the water came
  let typed = '';
  addEventListener('keydown', (event) => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, textarea')) return;
    typed = (typed + event.key.toLowerCase()).slice(-5);
    if (['fish', 'zuvis', 'žuvis'].some((word) => typed.endsWith(word))) {
      typed = '';
      dive();
    }
  });

  // The gull whose middle is within reach of a click, flying by or just startled; the nearest, if there are several.
  // A startled gull darts off, so it counts from twice as far: quick clicks on one spot startle one gull, not a flock.
  const gullNear = (clientX, clientY, reach) => {
    let nearest = null;
    for (const gull of hero.querySelectorAll('.gull, .fx-gull')) {
      const place = gull.getBoundingClientRect();
      const distance = Math.hypot(place.left + place.width / 2 - clientX, place.top + place.height / 2 - clientY)
        / (gull.matches('.fx-gull') ? 2 : 1);
      if (place.width && distance < reach) [nearest, reach] = [gull, distance];
    }
    return nearest;
  };

  // The buoy whose middle is within reach of a tap; the nearest, if there are several.
  const buoyNear = (clientX, clientY, reach) => {
    let nearest = null;
    for (const buoy of surf.querySelectorAll('.buoy')) {
      const place = buoy.getBoundingClientRect();
      const distance = Math.hypot(place.left + place.width / 2 - clientX, place.top + place.height / 2 - clientY);
      if (distance < reach) [nearest, reach] = [buoy, distance];
    }
    return nearest;
  };

  // Safari on a phone makes a click only where something below the document listens for one. The scene and the
  // water under it do, so that the handlers on the document get every tap.
  for (const part of [hero, document.querySelector('.depths')]) part?.addEventListener('click', () => {});

  // A press that turns into a drag (a swipe, a text selection, the slider) is not a click on the scene. A
  // finger is allowed more than a mouse: it rolls as it taps, and a real drag of a finger makes no click at all.
  let pressedAt = null;
  let byFinger = false;
  addEventListener('pointerdown', (event) => {
    pressedAt = [event.clientX, event.clientY];
    byFinger = event.pointerType === 'touch';
  }, { capture: true, passive: true });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (root.classList.contains('is-paused') || !target.closest || target.closest('a, button, input')) return;
    if (pressedAt && Math.hypot(event.clientX - pressedAt[0], event.clientY - pressedAt[1]) > (byFinger ? 30 : 8)) return;
    if (String(getSelection())) return;
    const { clientX, clientY } = event;

    if (target.closest('.depths')) {
      if (!reducedMotion) bubbles(clientX, clientY);
      playEffect('bubbles', clientX);
      taps = [...taps.filter(([at, x, y]) => event.timeStamp - at < 4000 && Math.hypot(x - clientX, y - clientY) < (byFinger ? 120 : 90)),
        [event.timeStamp, clientX, clientY]];
      if (taps.length >= 5) {
        taps = [];
        dive();
      }
      return;
    }
    if (!target.closest('.hero')) return;
    const box = heroFx.getBoundingClientRect();
    const em = box.height / 100;
    const x = clientX - box.left;
    const y = clientY - box.top;

    // A finger need not land right on a buoy: one is small under it, and it rocks.
    const buoy = target.closest('.buoy') ?? (byFinger ? buoyNear(clientX, clientY, Math.max(9 * em, 52)) : null);
    if (buoy) {
      const place = buoy.getBoundingClientRect();
      if (!reducedMotion) {
        buoy.animate([{ rotate: '0deg' }, { rotate: '-11deg' }, { rotate: '8deg' }, { rotate: '-5deg' }, { rotate: '3deg' }, { rotate: '-1.5deg' }, { rotate: '0deg' }],
          { duration: 2200, easing: 'ease-out' });
        ripple(place.left + place.width / 2, place.top + place.height * 0.86, 1.1);
      }
      playEffect('bell', clientX);
      bells = [...bells.filter((at) => event.timeStamp - at < 4000), event.timeStamp];
      if (bells.length >= 5) {
        bells = [];
        dive();
      }
      return;
    }
    const callGull = (gull) => {
      // A gull flying by beats its wings; one that was just startled is beating them already.
      if (!reducedMotion && gull.matches('.gull')) {
        gull.animate([{ scale: '1 1' }, { scale: '1 -0.6' }, { scale: '1 1' }], { duration: 300, iterations: 5 });
      }
      playEffect('gull', clientX);
    };
    const gull = target.closest('.gull');
    if (gull) {
      callGull(gull);
      return;
    }
    const waterline = layerShift('swell').getBoundingClientRect().top + em;
    if (clientY > waterline) {
      // Nearer water is lower on the screen, so its rings are larger.
      if (!reducedMotion) splash(clientX, clientY, 0.55 + 1.1 * (clientY - waterline) / Math.max(box.bottom - waterline, 1));
      playEffect('plop', clientX);
    } else if (clientY < layerShift('dock').getBoundingClientRect().top + em) {
      // A click that lands close to a gull is meant for that gull: it calls, and nothing new appears in the sky.
      const near = gullNear(clientX, clientY, Math.max(9 * em, 56));
      const starry = ['night', 'dusk', undefined].includes(root.dataset.sky);
      if (near) callGull(near);
      else {
        if (!reducedMotion) (starry ? fallingStar : startledGull)(x, y);
        playEffect(starry ? 'chime' : 'gull', clientX);
      }
    } else if (!reducedMotion) {
      // The pier: its nearest lamp flares for a moment.
      const lamps = [...hero.querySelectorAll('.lamp')];
      const nearest = lamps.reduce((best, lamp) => {
        const distance = Math.abs(lamp.getBoundingClientRect().left - clientX);
        return distance < best.distance ? { lamp, distance } : best;
      }, { lamp: null, distance: Infinity }).lamp;
      nearest?.animate([{ opacity: 1, offset: 0.25 }], { duration: 900, pseudoElement: '::after', easing: 'ease-out' });
    }
  });

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
      for (const name of ['aria-label', 'title', 'hreflang', 'data-pause', 'data-play', 'data-on', 'data-off']) {
        if (source.hasAttribute(name)) control.setAttribute(name, source.getAttribute(name));
      }
      if (source.hasAttribute('href')) control.href = new URL(source.getAttribute('href'), url).href;
    });
    labelPauseButton();
    labelSoundButton();
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
    // A finger on the volume slider is moving the slider, not the scene.
    if (event.pointerType === 'mouse' || !event.isPrimary || event.target.closest('.volume')) return;
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
    // The scene stops at the first and the last berth: the layers end there, and a finger that pulls
    // further would drag their edges into view.
    follow(Math.min(Math.max(drag.from + drag.moved, 0), lastBerth));
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
