// The hidden game under the water: steer a fish past the other fish for up to two minutes.
// dock.js fetches this file only when the game is found (five quick clicks on a buoy or on one spot under the
// water, or the word "fish" typed anywhere) and calls dive(). The styles are in dock.css (.dive).

const WORDS = {
  en: {
    name: 'A game under the water',
    hint: 'Move the mouse or use the arrow keys. Keep away from the other fish.',
    touch: 'Drag to swim. Keep away from the other fish.',
    score: 'Score', best: 'Best', newBest: 'New best!',
    caught: 'Caught!', through: 'You made it through!',
    again: 'Again', leave: 'Leave', close: 'Leave the game (Esc)',
  },
  lt: {
    name: 'Žaidimas po vandeniu',
    hint: 'Judink pelę arba spausk rodykles. Laikykis atokiau nuo kitų žuvų.',
    touch: 'Vesk pirštu ir plauk. Laikykis atokiau nuo kitų žuvų.',
    score: 'Taškai', best: 'Rekordas', newBest: 'Naujas rekordas!',
    caught: 'Pagavo!', through: 'Išplaukei iki galo!',
    again: 'Dar kartą', leave: 'Išeiti', close: 'Išeiti iš žaidimo (Esc)',
  },
};
const LENGTH = 120;        // seconds: the longest a game lasts; it gets harder all the way
const BEST = 'dive-best';  // the best score of this browser tab (sessionStorage)

const random = (from, to) => from + Math.random() * (to - from);
const clamp = (value, least, most) => Math.min(Math.max(value, least), most);
const mix = (from, to, part) => from + (to - from) * part;

export function dive({ playEffect = () => {}, reducedMotion = false } = {}) {
  if (document.querySelector('.dive')) return;
  const words = WORDS[document.documentElement.lang === 'lt' ? 'lt' : 'en'];
  const hero = document.querySelector('.hero');
  const before = { scroll: scrollY, focus: document.activeElement };

  const box = document.createElement('div');
  box.className = 'dive';
  box.tabIndex = -1;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', words.name);
  box.innerHTML = `<canvas></canvas>
<p class="dive-score">${words.score} <b>0</b></p>
<p class="dive-best">${words.best} <b>0</b></p>
<div class="dive-time" aria-hidden="true"><i></i></div>
<button class="dive-close" type="button" aria-label="${words.close}" title="${words.close}"></button>
<p class="dive-hint">${matchMedia('(hover: none)').matches ? words.touch : words.hint}</p>
<div class="dive-end" hidden>
  <strong></strong>
  <p></p>
  <button class="button" type="button" data-again>${words.again}</button>
  <button class="button dive-leave" type="button" data-leave>${words.leave}</button>
</div>`;
  document.body.append(box);
  const canvas = box.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreText = box.querySelector('.dive-score b');
  const bestText = box.querySelector('.dive-best b');
  const timeBar = box.querySelector('.dive-time i');
  const end = box.querySelector('.dive-end');

  // The view goes down under the water, and the game's water closes over the page. The scene above rests
  // meanwhile, as it does whenever it is out of sight.
  if (hero) scrollTo({ top: hero.offsetTop + hero.offsetHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
  hero?.classList.add('is-offscreen');
  requestAnimationFrame(() => box.classList.add('is-open'));
  box.focus({ preventScroll: true });

  let best = 0;
  try {
    best = Number(sessionStorage.getItem(BEST)) || 0;
  } catch {
    // Storage is blocked: the best score lasts until the game is closed.
  }
  bestText.textContent = best;

  const colours = getComputedStyle(document.documentElement);
  const mine = colours.getPropertyValue('--accent').trim() || '#ff8a7a';
  const dark = colours.getPropertyValue('--deep-3').trim() || '#050b20';

  // Sizes follow the window. `unit` is the length of the player's fish.
  let width = 0;
  let height = 0;
  let unit = 0;
  const resize = () => {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    width = box.clientWidth;
    height = box.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    unit = clamp(Math.min(width, height) * 0.075, 34, 64);
  };
  resize();

  let state = 'play';   // 'play' | 'over'
  let time = 0;
  let score = 0;
  let sinceFish = 0;
  let others = [];
  const me = { x: 0, y: 0, toX: 0, toY: 0, facing: 1, tilt: 0 };
  const keys = new Set();
  const bubbles = Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), size: random(3, 9), speed: random(0.02, 0.06) }));

  const reset = () => {
    state = 'play';
    time = 0;
    score = 0;
    sinceFish = -1.2;   // a moment of empty water before the first fish
    others = [];
    Object.assign(me, { x: width * 0.25, y: height * 0.5, toX: width * 0.25, toY: height * 0.5, facing: 1, tilt: 0 });
    end.hidden = true;
    box.classList.remove('is-over');
    scoreText.textContent = 0;
  };

  // A fish pointing right (facing 1) or left (-1): nose at +50, tail at -52, in hundredths of its length.
  const drawFish = (x, y, length, facing, fill, tilt, wag) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing * length / 100, length / 100);
    ctx.rotate(tilt);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(50, 0);
    ctx.quadraticCurveTo(14, -34, -30, -4);
    ctx.lineTo(-30, 4);
    ctx.quadraticCurveTo(14, 34, 50, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-52, -20 + wag);
    ctx.lineTo(-43, 0);
    ctx.lineTo(-52, 20 + wag);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(28, -5, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Other fish get bigger, faster and more numerous as the two minutes pass; later some weave up and down,
  // and a few come from behind.
  const addFish = () => {
    const hard = time / LENGTH;
    const length = unit * random(0.8, 1.5 + 1.3 * hard);
    const behind = hard > 0.4 && Math.random() < 0.25 * hard;
    const pace = width * (0.2 + 0.38 * hard) * random(0.8, 1.25) * (behind ? 0.55 : 1);
    others.push({
      x: behind ? -length : width + length,
      y: random(unit * 0.6, height - unit * 0.6),
      length,
      speed: behind ? pace : -pace,
      weave: hard > 0.2 && Math.random() < 0.35 ? random(0.4, 1.2) * unit : 0,
      beat: random(1.2, 2.2),
      phase: random(0, 6.3),
      shade: random(0.45, 0.7),
    });
  };

  // The body of a fish is close to an ellipse; the player's is taken as a small circle, which is forgiving.
  const touches = (other, y) => {
    const scale = other.length / 100;
    const reach = unit * 0.13;
    const dx = (me.x + me.facing * unit * 0.08 - (other.x + Math.sign(other.speed) * 8 * scale)) / (34 * scale + reach);
    const dy = (me.y - y) / (13 * scale + reach);
    return dx * dx + dy * dy < 1;
  };

  const finish = (through) => {
    state = 'over';
    const points = Math.floor(score);
    const record = points > best;
    if (record) {
      best = points;
      try {
        sessionStorage.setItem(BEST, best);
      } catch {
        // Kept for this game only.
      }
    }
    bestText.textContent = best;
    end.querySelector('strong').textContent = through ? words.through : words.caught;
    end.querySelector('p').textContent = `${words.score}: ${points}. ${record ? words.newBest : `${words.best}: ${best}.`}`;
    end.hidden = false;
    box.classList.add('is-over', 'is-quiet');
    end.querySelector('[data-again]').focus({ preventScroll: true });
    playEffect(through ? 'chime' : 'plop', innerWidth / 2);
  };

  let last = 0;
  let frame = 0;
  const step = (now) => {
    frame = requestAnimationFrame(step);
    const dt = Math.min((now - last) / 1000 || 0, 0.05);   // a hidden tab or a slow frame does not jump the game ahead
    last = now;

    if (state === 'play') {
      time += dt;
      const hard = Math.min(time / LENGTH, 1);
      score += dt * (10 + 25 * hard);

      const swim = Math.min(width, height) * 1.1 * dt;
      if (keys.has('left')) me.toX -= swim;
      if (keys.has('right')) me.toX += swim;
      if (keys.has('up')) me.toY -= swim;
      if (keys.has('down')) me.toY += swim;
      me.toX = clamp(me.toX, unit * 0.6, width - unit * 0.6);
      me.toY = clamp(me.toY, unit * 0.5, height - unit * 0.5);
      const pull = Math.min(dt * 11, 1);
      const moveX = (me.toX - me.x) * pull;
      const moveY = (me.toY - me.y) * pull;
      me.x += moveX;
      me.y += moveY;
      if (Math.abs(moveX) > 0.6) me.facing = Math.sign(moveX);
      me.tilt = mix(me.tilt, clamp(moveY / (dt || 1) / 900, -0.5, 0.5) * me.facing, 0.2);

      sinceFish += dt;
      const gap = mix(0.85, 0.2, hard ** 0.8) * clamp(720 / height, 0.6, 1.6);
      if (sinceFish > gap) {
        sinceFish = 0;
        addFish();
      }
      scoreText.textContent = Math.floor(score);
      timeBar.style.scale = `${hard} 1`;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    for (const bubble of bubbles) {
      bubble.y -= bubble.speed * dt;
      if (bubble.y < -0.05) Object.assign(bubble, { y: 1.05, x: Math.random() });
      ctx.beginPath();
      ctx.arc(bubble.x * width, bubble.y * height, bubble.size, 0, Math.PI * 2);
      ctx.stroke();
    }

    let caught = false;
    for (const other of others) {
      if (state === 'play') other.x += other.speed * dt;
      const y = other.y + Math.sin(time * other.beat + other.phase) * other.weave;
      drawFish(other.x, y, other.length, Math.sign(other.speed), `rgba(255,255,255,${other.shade})`, 0,
        Math.sin(time * 9 + other.phase) * 5);
      if (state === 'play' && touches(other, y)) caught = true;
    }
    others = others.filter((other) => other.x > -other.length * 1.5 && other.x < width + other.length * 1.5);
    drawFish(me.x, me.y, unit, me.facing, mine, me.tilt, Math.sin(now / 70) * 6);

    if (state === 'play' && caught) finish(false);
    else if (state === 'play' && time >= LENGTH) finish(true);
  };

  // ---- Steering: the pointer, a finger (the fish swims a little above it, so it stays in sight) or the keys ----
  const steer = (event) => {
    if (state !== 'play') return;
    const place = box.getBoundingClientRect();
    me.toX = event.clientX - place.left;
    me.toY = event.clientY - place.top - (event.pointerType === 'touch' ? unit * 1.3 : 0);
    box.classList.add('is-quiet');
  };
  const KEYS = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down' };
  const SCROLLS = [' ', 'PageUp', 'PageDown', 'Home', 'End'];
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      leave();
      return;
    }
    const way = KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
    if (way) {
      keys.add(way);
      box.classList.add('is-quiet');
      event.preventDefault();
    } else if (SCROLLS.includes(event.key) && !event.target.closest?.('button')) {
      event.preventDefault();   // the page under the game stays where it is
    } else if (event.key === 'Tab') {
      // The focus stays inside the game.
      const stops = [...box.querySelectorAll('button')].filter((button) => button.offsetParent);
      const first = stops[0];
      const lastStop = stops.at(-1);
      if (event.shiftKey ? document.activeElement === first || document.activeElement === box : document.activeElement === lastStop) {
        event.preventDefault();
        (event.shiftKey ? lastStop : first)?.focus();
      }
    }
  };
  const onKeyUp = (event) => keys.delete(KEYS[event.key] ?? KEYS[event.key.toLowerCase()]);
  const onWheel = (event) => event.preventDefault();

  let leaving = false;
  function leave() {
    if (leaving) return;
    leaving = true;
    cancelAnimationFrame(frame);
    removeEventListener('keydown', onKeyDown, true);
    removeEventListener('keyup', onKeyUp, true);
    removeEventListener('resize', resize);
    box.classList.remove('is-open');
    setTimeout(() => box.remove(), reducedMotion ? 0 : 450);
    hero?.classList.toggle('is-offscreen', hero.getBoundingClientRect().bottom <= 0);
    scrollTo({ top: before.scroll, behavior: reducedMotion ? 'auto' : 'smooth' });
    before.focus?.focus?.({ preventScroll: true });
  }

  box.addEventListener('pointermove', steer);
  box.addEventListener('pointerdown', steer);
  box.addEventListener('wheel', onWheel, { passive: false });
  box.querySelector('.dive-close').addEventListener('click', leave);
  end.querySelector('[data-leave]').addEventListener('click', leave);
  end.querySelector('[data-again]').addEventListener('click', () => {
    reset();
    box.focus({ preventScroll: true });
  });
  addEventListener('keydown', onKeyDown, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('resize', resize);
  setTimeout(() => box.classList.add('is-quiet'), 5000);

  reset();
  frame = requestAnimationFrame(step);
}
