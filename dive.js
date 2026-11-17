// The hidden game under the water. A fish swims for as long as it can. Bigger fish cross the water, turn on
// it when it comes close and swallow it; small fry only knock it aside; junk sinks from above; now and then a
// hook comes down from the pier and hangs for a while; a current pushes now and then; the edges push back.
// All of it gets worse until something gets the fish: nobody wins, the score is what counts. What falls in
// alive is worth eating: a firefly for its points; once in a while a beetle, which also keeps the fish safe
// for a few seconds; and a caterpillar, worth the most, after which the fish is so small for a while that
// even the small fry swallow it.
// It is steered with the mouse (the fish goes where the pointer is), the arrow keys, or a finger: a stick comes
// up wherever the finger is put down, so the hand need not be where the fish is. Which of them it is shows in
// each event; nothing has to guess what kind of device this is.
// dock.js fetches this file only when the game is found (five clicks within four seconds on a buoy or on one
// spot under the water, or the word "fish" typed anywhere) and calls dive(). The styles are in dock.css (.dive).

const WORDS = {
  en: {
    name: 'A game under the water',
    hint: 'Steer with the mouse or the arrow keys. Keep clear of bigger fish, junk and hooks; eat the bugs that fall in.',
    touch: 'Hold a finger down and drag: the fish swims that way. Keep clear of bigger fish, junk and hooks; eat the bugs.',
    score: 'Score', best: 'Best', newBest: 'New best!', died: 'You died',
    again: 'Again', leave: 'Leave', close: 'Leave the game (Esc)',
    shield: 'Bubble', small: 'Tiny',
  },
  lt: {
    name: 'Žaidimas po vandeniu',
    hint: 'Valdyk pele arba rodyklėmis. Saugokis didesnių žuvų, šiukšlių ir kabliukų, o įkritusius vabalus valgyk.',
    touch: 'Laikyk pirštą ir tempk: žuvis plauks ta kryptimi. Saugokis didesnių žuvų, šiukšlių ir kabliukų, o vabalus valgyk.',
    score: 'Taškai', best: 'Rekordas', newBest: 'Naujas rekordas!', died: 'Tu žuvai',
    again: 'Dar kartą', leave: 'Išeiti', close: 'Išeiti iš žaidimo (Esc)',
    shield: 'Burbulas', small: 'Mažytė',
  },
};
const RAMP = 120;          // seconds from easy to nearly impossible; after that it only gets worse faster
const BEST = 'dive-best';  // the best score of this browser tab (sessionStorage)
const TAU = Math.PI * 2;
// What falls in alive, and what the fish gets for eating it. Every one gives points. A beetle also puts a
// bubble round the fish that nothing gets through. A caterpillar is a gamble: it makes the fish smaller than
// the small fry, which can then swallow it too.
const BUGS = {
  firefly: { points: 100 },
  beetle: { points: 50, power: 'shield' },
  caterpillar: { points: 200, power: 'small' },
};
// For how many seconds each of those lasts, and the colour of the ring that runs down with it.
const POWERS = {
  shield: { colour: '#bfe6ff', seconds: 5 },
  small: { colour: '#6fdc8c', seconds: 15 },
};
const SMALL = 0.4;   // the size of the fish after a caterpillar: the smallest fry is 0.45
// The junk that falls in: its size in lengths of the player's fish, how fast it sinks and turns beside the
// rest, and how much of its size hits.
const JUNK = {
  anchor: { size: [1.6, 2.1], sink: 1.6, turn: 0.12, hit: 0.36 },
  barrel: { size: [1.6, 2], sink: 1.1, turn: 0.5, hit: 0.42 },
  tyre: { size: [1.5, 2], sink: 0.9, turn: 0.7, hit: 0.46 },
  boot: { size: [1.3, 1.6], sink: 0.75, turn: 1, hit: 0.38 },
  can: { size: [0.9, 1.2], sink: 0.6, turn: 1.4, hit: 0.36 },
  bottle: { size: [1.4, 1.7], sink: 0.5, turn: 0.9, hit: 0.3 },
};

const random = (from, to) => from + Math.random() * (to - from);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (value, least, most) => Math.min(Math.max(value, least), most);
const mix = (from, to, part) => from + (to - from) * part;

export function dive({ playEffect = () => {}, reducedMotion = false } = {}) {
  if (document.querySelector('.dive')) return;
  const words = WORDS[document.documentElement.lang === 'lt' ? 'lt' : 'en'];
  const hero = document.querySelector('.hero');
  const focusBefore = document.activeElement;

  const box = document.createElement('div');
  box.className = 'dive';
  box.tabIndex = -1;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', words.name);
  box.innerHTML = `<canvas></canvas>
<p class="dive-score">${words.score} <b>0</b></p>
<p class="dive-best">${words.best} <b>0</b></p>
<button class="dive-close" type="button" aria-label="${words.close}" title="${words.close}"></button>
<p class="dive-hint">${matchMedia('(hover: none)').matches ? words.touch : words.hint}</p>
<div class="dive-end" hidden>
  <strong>${words.died}</strong>
  <p></p>
  <button class="button" type="button" data-again>${words.again}</button>
  <button class="button dive-leave" type="button" data-leave>${words.leave}</button>
</div>`;
  document.body.append(box);
  const canvas = box.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreText = box.querySelector('.dive-score b');
  const bestText = box.querySelector('.dive-best b');
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

  // ---- Sizes: everything follows the window ----
  let width = 0;
  let height = 0;
  let reach = 0;       // the shorter side of the window
  let unit = 0;        // the length of the player's fish
  let floor = 0;       // where the seabed begins
  let rim = 0;         // how near an edge the fish may stay
  let hookSize = 0;    // the length of a hook
  let hookReach = 0;   // how near a hook the fish may come
  let flySize = 0;     // the length of a firefly
  let bugSize = 0;     // the length of a beetle; a caterpillar is nearly twice as long
  let stickReach = 0;  // how far the stick under a finger goes
  const resize = () => {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    width = box.clientWidth;
    height = box.clientHeight;
    reach = Math.min(width, height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    unit = clamp(reach * 0.07, 30, 58);
    floor = height - (parseFloat(getComputedStyle(box, '::after').height) || unit * 2) * 0.58;   // the seabed is drawn by dock.css
    rim = unit * 1.3;
    hookSize = Math.max(unit * 0.6, 24);
    hookReach = unit * 1.35;
    flySize = Math.max(unit * 0.3, 11);
    bugSize = Math.max(unit * 0.5, 17);
    stickReach = clamp(reach * 0.13, 40, 60);
  };
  resize();

  // ---- What there is in the water ----
  let state = 'play';   // 'play', then 'ending' while whatever got the fish finishes with it, then 'over'
  let time = 0;         // seconds played: how hard it is
  let clock = 0;        // seconds the water has moved: it runs on after the end, when `time` has stopped
  let score = 0;
  let ending = null;    // what got the fish, and how far that has gone
  let others = [];      // the bigger fish
  let fry = [];         // the small ones, which only bump the fish unless it is smaller still
  let junk = [];
  let bugs = [];        // fireflies, beetles and caterpillars that fell in
  let hooks = [];
  let pops = [];        // small bubbles that something just let out
  let notes = [];       // what a bug gave, floating up from where it was eaten
  let powers = {};      // seconds left of the bubble and of being small
  let current = null;   // the current that is pushing, if one is
  let trail = 0;        // how far it has swum since its last bubble
  let finger = null;    // the finger that steers: where its stick stands and where the finger is now
  let sinceFish = 0;
  let untilFry = 0;
  let untilJunk = 0;
  let untilFly = 0;
  let untilTreat = 0;   // until the next beetle or caterpillar
  let untilHook = 0;
  let untilCurrent = 0;
  const flow = { x: 0, y: 0, force: 0 };   // the current's direction and how strong it is right now
  const push = { x: 0, y: 0 };             // how far the current has carried the fish from where it is steered
  const knock = { x: 0, y: 0 };            // how far a bump has, for a moment
  const back = { x: 0, y: 0 };             // how far an edge or the seabed is pushing it back
  const me = { x: 0, y: 0, toX: 0, toY: 0, facing: 1, tilt: 0, size: 1, show: 1, spin: 0, mouth: 0, gulp: 0 };
  const keys = new Set();
  const bubbles = Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), size: random(3, 9), speed: random(0.02, 0.06) }));
  const streaks = Array.from({ length: 30 }, () => ({ x: Math.random(), y: Math.random(), long: random(0.06, 0.15), pace: random(0.9, 1.6) }));

  const reset = () => {
    state = 'play';
    time = 0;
    score = 0;
    ending = null;
    others = [];
    fry = [];
    junk = [];
    bugs = [];
    hooks = [];
    pops = [];
    notes = [];
    powers = { shield: 0, small: 0 };
    current = null;
    trail = 0;
    finger = null;
    sinceFish = -0.8;   // a moment of empty water before the first fish
    untilFry = 2;
    untilJunk = random(12, 17);
    untilFly = random(4, 8);
    untilTreat = random(20, 34);
    untilHook = random(30, 60);
    untilCurrent = random(14, 20);
    Object.assign(flow, { x: 0, y: 0, force: 0 });
    Object.assign(push, { x: 0, y: 0 });
    Object.assign(knock, { x: 0, y: 0 });
    Object.assign(back, { x: 0, y: 0 });
    Object.assign(me, { x: width * 0.25, y: floor * 0.5, toX: width * 0.25, toY: floor * 0.5, facing: 1, tilt: 0, size: 1, show: 1, spin: 0, mouth: 0, gulp: 0 });
    end.hidden = true;
    box.classList.remove('is-over');
    scoreText.textContent = 0;
  };

  // ---- Drawing ----
  // A fish pointing right (facing 1) or left (-1): nose at +50, tail at -52, in hundredths of its length.
  // `mouth` opens its jaws (0 to 1), `squash` makes it swallow, `tilt` points its nose down, `spin` turns all of it.
  const drawFish = (x, y, length, facing, fill, { tilt = 0, wag = 0, mouth = 0, squash = 0, spin = 0 } = {}) => {
    if (length <= 0.5) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.scale(facing * length / 100 * (1 + squash), length / 100 * (1 - squash));
    ctx.rotate(tilt);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(50, -15 * mouth);
    ctx.quadraticCurveTo(14, -34, -30, -4);
    ctx.lineTo(-30, 4);
    ctx.quadraticCurveTo(14, 34, 50, 15 * mouth);
    ctx.lineTo(50 - 32 * mouth, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-52, -20 + wag);
    ctx.lineTo(-43, 0);
    ctx.lineTo(-52, 20 + wag);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(26, -8 - 3 * mouth, 4.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  // Junk is drawn in a box of a hundred: a flat shape, lit from above whichever way it has turned, with a dark
  // edge that keeps it clear of light water as its own colour keeps it clear of dark water.
  const drawJunk = ({ kind, x, y, size, turn }) => {
    const lit = ctx.createLinearGradient(-50 * Math.sin(turn), -50 * Math.cos(turn), 50 * Math.sin(turn), 50 * Math.cos(turn));
    lit.addColorStop(0, '#bccaec');
    lit.addColorStop(0.6, '#6176b0');
    lit.addColorStop(1, '#3f528e');
    const edge = 300 / size;   // three pixels, half of them under the shape
    const solid = () => {
      ctx.strokeStyle = 'rgba(4,9,28,0.62)';
      ctx.lineWidth = edge;
      ctx.stroke();
      ctx.fill();
    };
    const marks = () => {
      ctx.strokeStyle = 'rgba(8,14,40,0.5)';
      ctx.lineWidth = 3.5;
      ctx.stroke();
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 100, size / 100);
    ctx.rotate(turn);
    ctx.fillStyle = lit;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'tyre') {
      ctx.arc(0, 0, 50, 0, TAU);
      ctx.moveTo(22, 0);
      ctx.arc(0, 0, 22, 0, TAU, true);
      solid();
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, TAU);
      for (let tread = 0; tread < 16; tread++) {
        const angle = tread / 16 * TAU;
        ctx.moveTo(Math.cos(angle) * 42, Math.sin(angle) * 42);
        ctx.lineTo(Math.cos(angle + 0.12) * 49, Math.sin(angle + 0.12) * 49);
      }
      marks();
    } else if (kind === 'barrel') {
      ctx.moveTo(-24, -46);
      ctx.lineTo(24, -46);
      ctx.quadraticCurveTo(44, 0, 24, 46);
      ctx.lineTo(-24, 46);
      ctx.quadraticCurveTo(-44, 0, -24, -46);
      ctx.closePath();
      solid();
      ctx.beginPath();
      ctx.moveTo(-31, -25);
      ctx.quadraticCurveTo(0, -20, 31, -25);
      ctx.moveTo(-31, 25);
      ctx.quadraticCurveTo(0, 30, 31, 25);
      marks();
    } else if (kind === 'can') {
      if (ctx.roundRect) ctx.roundRect(-26, -34, 52, 80, 6);
      else ctx.rect(-26, -34, 52, 80);   // an older browser draws its corners square
      solid();
      ctx.beginPath();
      ctx.ellipse(-6, -42, 28, 8, -0.3, 0, TAU);   // the lid, bent open
      solid();
      ctx.beginPath();
      ctx.moveTo(-26, -18);
      ctx.lineTo(26, -18);
      ctx.moveTo(-26, 32);
      ctx.lineTo(26, 32);
      marks();
    } else if (kind === 'boot') {
      ctx.moveTo(-24, -48);
      ctx.lineTo(8, -48);
      ctx.lineTo(8, 0);
      ctx.quadraticCurveTo(10, 13, 30, 16);
      ctx.quadraticCurveTo(50, 20, 48, 40);
      ctx.lineTo(48, 46);
      ctx.lineTo(8, 46);
      ctx.lineTo(4, 40);
      ctx.lineTo(-8, 40);
      ctx.lineTo(-12, 46);
      ctx.lineTo(-26, 46);
      ctx.lineTo(-26, 6);
      ctx.quadraticCurveTo(-22, -20, -24, -48);
      ctx.closePath();
      solid();
      ctx.beginPath();
      ctx.moveTo(-23, -36);
      ctx.lineTo(8, -36);
      ctx.moveTo(-26, 33);
      ctx.lineTo(47, 33);
      marks();
    } else if (kind === 'bottle') {
      ctx.moveTo(-7, -50);
      ctx.lineTo(7, -50);
      ctx.lineTo(7, -28);
      ctx.quadraticCurveTo(8, -15, 17, -9);
      ctx.lineTo(17, 43);
      ctx.quadraticCurveTo(17, 50, 10, 50);
      ctx.lineTo(-10, 50);
      ctx.quadraticCurveTo(-17, 50, -17, 43);
      ctx.lineTo(-17, -9);
      ctx.quadraticCurveTo(-8, -15, -7, -28);
      ctx.closePath();
      solid();
      ctx.beginPath();
      ctx.moveTo(-7, -42);
      ctx.lineTo(7, -42);
      ctx.moveTo(-17, 8);
      ctx.lineTo(17, 8);
      ctx.moveTo(-17, 30);
      ctx.lineTo(17, 30);
      marks();
    } else {
      // An anchor, in thick lines, with a ring on top and a fluke on each arm.
      const line = (thick) => {
        ctx.strokeStyle = 'rgba(4,9,28,0.62)';
        ctx.lineWidth = thick + edge;
        ctx.stroke();
        ctx.strokeStyle = lit;
        ctx.lineWidth = thick;
        ctx.stroke();
      };
      ctx.moveTo(-47, 22);
      ctx.lineTo(-37, 2);
      ctx.lineTo(-27, 22);
      ctx.closePath();
      ctx.moveTo(47, 22);
      ctx.lineTo(37, 2);
      ctx.lineTo(27, 22);
      ctx.closePath();
      solid();
      ctx.beginPath();
      ctx.arc(0, -39, 8, 0, TAU);
      line(6);
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(0, 44);
      ctx.moveTo(-18, -16);
      ctx.lineTo(18, -16);
      ctx.moveTo(-36, 14);
      ctx.quadraticCurveTo(-32, 44, 0, 44);
      ctx.quadraticCurveTo(32, 44, 36, 14);
      line(9);
    }
    ctx.restore();
  };

  // What the fish eats, each drawn about its middle and shrinking as it is eaten. A firefly has a dark body,
  // two wings that beat and a tail that glows and flickers until it reaches the seabed. A beetle has an amber
  // shell and six legs that paddle. A caterpillar is a row of green rings that wriggles.
  const drawBug = (bug) => {
    const body = '#1a2242';
    ctx.save();
    ctx.translate(bug.at, bug.y);
    if (bug.eaten !== undefined) {
      const left = clamp(1 - bug.eaten / 0.14, 0.15, 1);
      ctx.scale(left, left);
    }
    if (bug.kind === 'firefly') {
      const size = flySize;
      const lit = (0.72 + 0.28 * Math.sin(clock * 5 + bug.phase)) * clamp((floor - bug.y) / unit, 0, 1);
      const beat = Math.sin(clock * 34 + bug.phase) * 0.4;
      const glow = ctx.createRadialGradient(0, size * 0.3, 0, 0, size * 0.3, size * 3);
      glow.addColorStop(0, `rgba(234,255,140,${0.85 * lit})`);
      glow.addColorStop(0.3, `rgba(228,255,128,${0.34 * lit})`);
      glow.addColorStop(1, 'rgba(228,255,128,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, size * 0.3, size * 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * size * 0.5, -size * 0.3, size * 0.55, size * 0.22, side * (0.5 + beat), 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.28, size * 0.25, size * 0.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(238,255,150,${0.35 + 0.65 * lit})`;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.32, size * 0.27, size * 0.36, 0, 0, TAU);
      ctx.fill();
    } else if (bug.kind === 'beetle') {
      const size = bugSize;
      ctx.rotate(Math.sin(clock * 3 + bug.phase) * 0.3);   // it rocks as it sinks
      ctx.strokeStyle = body;
      ctx.lineWidth = Math.max(1.5, size * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const side of [-1, 1]) {
        for (const leg of [-1, 0, 1]) {
          ctx.moveTo(side * size * 0.28, leg * size * 0.24);
          ctx.lineTo(side * size * 0.64, leg * size * 0.34 + Math.sin(clock * 16 + bug.phase + leg * 2 + side) * size * 0.1);
        }
      }
      ctx.stroke();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -size * 0.42, size * 0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffc35a';
      ctx.beginPath();
      ctx.ellipse(0, size * 0.06, size * 0.38, size * 0.46, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(26,34,66,0.7)';
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.38);
      ctx.lineTo(0, size * 0.52);
      ctx.stroke();
      ctx.fillStyle = 'rgba(26,34,66,0.75)';
      for (const [x, y] of [[-0.18, -0.12], [0.18, -0.12], [-0.2, 0.22], [0.2, 0.22]]) {
        ctx.beginPath();
        ctx.arc(x * size, y * size, size * 0.07, 0, TAU);
        ctx.fill();
      }
    } else {
      const ring = bugSize * 0.2;
      const rise = (part) => Math.sin(clock * 6 + bug.phase - part * 0.9) * ring * 0.8;
      ctx.strokeStyle = 'rgba(10,30,45,0.4)';
      ctx.lineWidth = 1;
      for (let part = 5; part >= 0; part--) {   // the head is the first ring and is drawn last, on top
        ctx.fillStyle = part === 0 ? '#4fc474' : part % 2 ? '#86e59f' : '#6fdc8c';
        ctx.beginPath();
        ctx.arc((part - 2.5) * ring * 1.45, rise(part), part === 0 ? ring * 1.2 : ring, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(-2.5 * ring * 1.45 - ring * 0.4, rise(0) - ring * 0.3, ring * 0.24, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  };

  // A hook on its line. While it hangs, the water ripples round it as far as the fish must keep away: rings
  // going out from the hook, and a wavering edge where they end.
  const drawHook = (one) => {
    const size = hookSize;
    const hangs = one.wait > 0 && one.y >= one.toY;
    const x = one.x;
    const y = one.y + (hangs ? Math.sin(clock * 4 + one.x) * 2 : 0);
    if (one.armed > 0.01) {
      const radius = hookReach * one.armed;
      ctx.lineWidth = 1.5;
      for (let ring = 0; ring < 3; ring++) {
        const part = (clock * 0.55 + ring / 3) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${0.3 * (1 - part) * one.armed})`;
        ctx.beginPath();
        ctx.arc(x, y, radius * part, 0, TAU);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.36 * one.armed})`;
      ctx.fillStyle = `rgba(255,255,255,${0.05 * one.armed})`;
      ctx.beginPath();
      for (let point = 0; point <= 48; point++) {
        const angle = point / 48 * TAU;
        const far = radius * (1 + 0.02 * Math.sin(angle * 3 + clock * 2.2) + 0.014 * Math.sin(angle * 5 - clock * 3.1));
        ctx.lineTo(x + Math.cos(angle) * far, y + Math.sin(angle) * far);
      }
      ctx.fill();
      ctx.stroke();
    }
    const bend = size * 0.32;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + bend, 0);
    ctx.lineTo(x + bend, y - size);
    ctx.stroke();
    ctx.strokeStyle = '#dfe7fa';
    ctx.lineWidth = Math.max(2, size * 0.11);
    ctx.beginPath();
    ctx.arc(x + bend, y - size - size * 0.08, size * 0.08, 0, TAU);   // the eye the line is tied to
    ctx.moveTo(x + bend, y - size);
    ctx.lineTo(x + bend, y);
    ctx.arc(x, y, bend, 0, Math.PI);                                  // round the bend
    ctx.lineTo(x - bend, y - size * 0.32);                            // up to the point
    ctx.lineTo(x - bend * 0.45, y - size * 0.1);                      // and the barb
    ctx.stroke();
  };

  const pop = (x, y, count, spread, rise) => {
    for (let bubble = 0; bubble < count; bubble++) {
      pops.push({ x, y, vx: random(-spread, spread), vy: -random(rise * 0.4, rise), size: random(2.5, 6), life: random(0.5, 1) });
    }
  };

  // ---- What the water sends ----
  // The other fish are always bigger than the player's. They get bigger, faster and more numerous as the time
  // passes; later some weave up and down, and a few come from behind.
  const addFish = (hard) => {
    const length = Math.min(unit * random(1.35, 2 + 1.3 * Math.min(hard, 2)), reach * 0.36);
    const behind = hard > 0.4 && Math.random() < 0.25 * Math.min(hard, 1);
    const pace = width * Math.min(0.2 + 0.38 * hard, 1.5) * random(0.8, 1.25) * (behind ? 0.55 : 1);
    const y = random(unit * 0.8, floor - unit * 0.6);
    others.push({
      x: behind ? -length : width + length,
      y,
      at: y,   // where it is drawn: `y` and its weaving
      length,
      speed: behind ? pace : -pace,
      weave: hard > 0.2 && Math.random() < 0.35 ? random(0.4, 1.2) * unit : 0,
      beat: random(1.2, 2.2),
      phase: random(0, TAU),
      shade: random(0.45, 0.7),
      tilt: 0,
      mouth: 0,
    });
  };
  // Small fry come alone or three together, a little quicker than the big fish.
  const addFry = (hard) => {
    const fromLeft = Math.random() < 0.3;
    const pace = width * Math.min(0.26 + 0.3 * hard, 1.2) * random(0.9, 1.2) * (fromLeft ? 1 : -1);
    const y = random(unit, floor - unit);
    for (let one = 0, school = Math.random() < 0.35 ? 3 : 1; one < school; one++) {
      const length = unit * random(0.45, 0.75);
      fry.push({
        x: (fromLeft ? -length : width + length) - Math.sign(pace) * one * unit * 1.1,
        y: y + (one ? random(-0.7, 0.7) * unit : 0),
        length, vx: pace, vy: 0, phase: random(0, TAU), hush: 0, mouth: 0,
      });
    }
  };
  // Junk does not come often. The heavy pieces go down fast, the light ones take their time.
  const addJunk = (hard) => {
    const kind = pick(Object.keys(JUNK));
    const { size: [least, most], sink, turn } = JUNK[kind];
    const size = unit * random(least, most);
    junk.push({
      kind,
      size,
      x: random(size, width - size),
      y: -size,
      fall: height * 0.2 * sink * random(0.8, 1.25) * (1 + 0.3 * Math.min(hard, 1.5)),
      turn: kind === 'anchor' ? random(-0.3, 0.3) : random(0, TAU),
      spin: random(0.5, 1) * turn * pick([-1, 1]),
    });
  };
  // A hook comes down anywhere, well apart from another that is down, hangs there for ten to twenty seconds
  // and goes up again.
  const addHook = () => {
    const y = random(rim + unit, floor - unit * 1.2);
    let x = 0;
    let tries = 0;
    do x = random(rim, width - rim); while (++tries < 8 && hooks.some((one) => Math.abs(one.x - x) < hookReach * 3));
    hooks.push({ x, y: -hookSize * 2, toY: y, pace: (y + hookSize * 2) / 1.2, wait: random(10, 20), armed: 0 });
  };
  // A bug falls into the water and sinks slowly: a firefly still glowing, a beetle or a caterpillar a little faster.
  const addBug = (kind) => {
    const x = random(0.08, 0.92) * width;
    bugs.push({ kind, x, at: x, y: -bugSize, sink: reach * (kind === 'firefly' ? random(0.06, 0.1) : random(0.09, 0.14)), phase: random(0, TAU) });
  };
  // The fish eats a bug it reaches. What the bug gives comes at once; the bug itself goes into its mouth.
  const eat = (bug) => {
    const { points, power } = BUGS[bug.kind];
    bug.eaten = 0;   // seconds since
    score += points;
    if (power) {
      powers[power] = POWERS[power].seconds;
      pop(me.x, me.y, 8, 90, 120);
    }
    notes.push({ text: power ? `${words[power]} +${points}` : `+${points}`, x: bug.at, y: bug.y - unit * 0.6, life: power ? 1.5 : 1.1 });
    playEffect('chime', bug.at);
  };

  // ---- Meetings ----
  // The body of a big fish is close to an ellipse; the player's fish is taken as a small circle, which is forgiving.
  const meets = (other) => {
    const scale = other.length / 100;
    const body = unit * 0.13 * me.size;
    const dx = (me.x + me.facing * unit * 0.08 * me.size - (other.x + Math.sign(other.speed) * 8 * scale)) / (34 * scale + body);
    const dy = (me.y - other.at) / (13 * scale + body);
    return dx * dx + dy * dy < 1;
  };
  const near = (x, y, radius) => Math.hypot(me.x - x, me.y - y) < radius + unit * 0.2 * me.size;
  // The small ones are met as they look: nose to tail, not at the middle only.
  const brushes = (small) => {
    const dx = (me.x - small.x) / (unit * 0.42 * me.size + small.length * 0.4);
    const dy = (me.y - small.y) / (unit * 0.2 * me.size + small.length * 0.2);
    return dx * dx + dy * dy < 1;
  };
  // A small one that runs into the fish bounces off and knocks it aside; the bubble takes the knock instead.
  const bump = (small) => {
    const dx = me.x - small.x;
    const dy = me.y - small.y;
    const apart = Math.hypot(dx, dy) || 1;
    if (powers.shield <= 0) {
      knock.x += dx / apart * unit * 0.9 + Math.sign(small.vx) * unit * 0.5;
      knock.y += dy / apart * unit * 0.9;
    }
    small.vy = -dy / apart * Math.abs(small.vx) * 0.7;
    small.vx *= -0.75;
    small.hush = 0.6;
    pop((me.x + small.x) / 2, (me.y + small.y) / 2, 3, 60, 90);
  };

  // ---- The end ----
  // Something got the fish: a bigger fish swallows it, junk takes it down, a hook takes it up.
  const endBy = (kind, who) => {
    state = 'ending';
    keys.clear();
    finger = null;
    me.mouth = 0;
    box.classList.add('is-quiet');
    ending = { kind, who, age: 0, at: { x: me.x, y: me.y } };
    if (kind === 'fish') {
      who.y = who.at;
      who.weave = 0;
      who.shade = 0.9;
      Object.assign(ending, {
        face: Math.sign(me.x - who.x) || Math.sign(who.speed), was: Math.sign(who.speed), pace: Math.abs(who.speed),
        from: { x: who.x, y: who.y, length: who.length, tilt: who.tilt, mouth: who.mouth }, squash: 0, burst: false,
      });
    } else if (kind === 'hook') {
      who.wait = 0;
      Object.assign(ending, { hookY: who.y, lift: 0 });
    }
    playEffect('plop', me.x);
  };
  // Then whatever swims leaves in a hurry and the hooks go up: the water is empty for the last words.
  const scatter = () => {
    for (const other of others) other.speed = Math.sign(other.speed) * Math.max(Math.abs(other.speed) * 3, width * 1.1);
    for (const small of fry) small.vx = Math.sign(small.vx) * Math.max(Math.abs(small.vx) * 3, width * 1.1);
    for (const one of hooks) one.wait = 0;
    ending.left = 0;   // seconds since they set off
  };
  const finish = () => {
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
    end.querySelector('p').textContent = `${words.score}: ${points}. ${record ? words.newBest : `${words.best}: ${best}.`}`;
    end.hidden = false;
    box.classList.add('is-over');
    end.querySelector('[data-again]').focus({ preventScroll: true });
  };

  let last = 0;
  let frame = 0;
  const step = (now) => {
    frame = requestAnimationFrame(step);
    const dt = Math.min((now - last) / 1000 || 0, 0.05);   // a hidden tab or a slow frame does not jump the game ahead
    last = now;
    const hard = time / RAMP;
    clock += dt;

    if (state === 'play') {
      time += dt;
      score += dt * (10 + 25 * hard);
      for (const kind of Object.keys(powers)) powers[kind] = Math.max(0, powers[kind] - dt);

      // A current comes for a few seconds from one of the four sides.
      untilCurrent -= dt;
      if (!current && untilCurrent <= 0) {
        const [x, y] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        current = { age: 0, life: random(3.2, 4.6) };
        Object.assign(flow, { x, y });
        playEffect('bubbles', innerWidth / 2);
      }
      if (current) {
        current.age += dt;
        flow.force = clamp(Math.min(current.age, current.life - current.age) / 0.7, 0, 1);
        if (current.age >= current.life) {
          current = null;
          untilCurrent = random(13, 22);
        }
      }
      push.x += (flow.x * flow.force * reach * 0.28 - push.x) * Math.min(dt * 4, 1);
      push.y += (flow.y * flow.force * reach * 0.28 - push.y) * Math.min(dt * 4, 1);

      // A finger works a stick that stands where it was put down: the further it is pushed, the faster the fish
      // swims that way.
      const lean = finger ? Math.hypot(finger.x - finger.fromX, finger.y - finger.fromY) : 0;
      if (lean > stickReach * 0.1) {
        const pace = Math.min(lean / stickReach, 1) ** 1.3 * reach * 1.3 * dt / lean;
        me.toX += (finger.x - finger.fromX) * pace;
        me.toY += (finger.y - finger.fromY) * pace;
      }
      const swim = reach * 1.1 * dt;
      if (keys.has('left')) me.toX -= swim;
      if (keys.has('right')) me.toX += swim;
      if (keys.has('up')) me.toY -= swim;
      if (keys.has('down')) me.toY += swim;
      me.toX = clamp(me.toX, unit * 0.7, width - unit * 0.7);
      me.toY = clamp(me.toY, unit * 0.6, floor - unit * 0.3);
      knock.x *= Math.exp(-dt * 4.5);
      knock.y *= Math.exp(-dt * 4.5);
      // Where it is steered, carried and knocked to. The edges and the seabed push back from there: the fish
      // can lean into the last stretch before them, but not stay in it.
      const wantX = me.toX + push.x + knock.x;
      const wantY = me.toY + push.y + knock.y;
      back.x += (clamp(wantX, rim, width - rim) - wantX - back.x) * Math.min(dt * 3.5, 1);
      back.y += (clamp(wantY, rim, floor - unit * 0.9) - wantY - back.y) * Math.min(dt * 3.5, 1);
      const pull = Math.min(dt * 11, 1);
      const moveX = (clamp(wantX + back.x, unit * 0.7, width - unit * 0.7) - me.x) * pull;
      const moveY = (clamp(wantY + back.y, unit * 0.6, floor - unit * 0.3) - me.y) * pull;
      me.x += moveX;
      me.y += moveY;
      if (Math.abs(moveX) > 0.6) me.facing = Math.sign(moveX);
      me.tilt = mix(me.tilt, clamp(moveY / (dt || 1) / (unit * 15), -0.5, 0.5), 0.2);
      me.size = mix(me.size, powers.small > 0 ? SMALL : 1, Math.min(dt * 8, 1));

      // A fish that swims leaves a small bubble behind it now and then.
      trail += Math.hypot(moveX, moveY);
      if (trail > unit * 1.3) {
        trail = 0;
        pops.push({ x: me.x - me.facing * unit * 0.5 * me.size, y: me.y + random(-3, 3), vx: random(-6, 6), vy: -random(14, 30), size: random(1.3, 2.8), life: random(0.5, 0.9) });
      }

      // It opens its mouth for a bug that is close, and swallows after one.
      const snack = bugs.some((bug) => bug.eaten === undefined && Math.hypot(bug.at - me.x, bug.y - me.y) < unit * 1.6);
      me.mouth += ((snack ? 0.8 : 0) - me.mouth) * Math.min(dt * 16, 1);
      me.gulp = Math.max(0, me.gulp - dt);

      // A hook comes down every half a minute to a minute, and sometimes two together: more often two as the
      // time passes, never more than two in the water.
      untilHook -= dt;
      if (untilHook <= 0) {
        untilHook = random(30, 60);
        for (let more = Math.random() < 0.25 + 0.35 * Math.min(hard, 1) ? 2 : 1; more > 0 && hooks.length < 2; more--) addHook();
      }

      // More of everything as the time passes, and much more once the ramp is over. The taller the water is
      // beside the fish, the more fish it takes to fill it as well.
      const late = Math.max(0, hard - 1);
      sinceFish += dt;
      if (sinceFish > mix(0.5, 0.17, Math.min(hard, 1) ** 0.8) / (1 + late * 6) * clamp(14 * unit / floor, 0.5, 1.5)) {
        sinceFish = 0;
        addFish(hard);
      }
      untilFry -= dt;
      if (untilFry <= 0) {
        untilFry = random(1.4, 3) / (1 + Math.min(hard, 2));
        addFry(hard);
      }
      untilJunk -= dt;
      if (untilJunk <= 0) {
        untilJunk = random(0.75, 1.3) * mix(12, 6, Math.min(hard, 1)) / (1 + late * 2);
        addJunk(hard);
      }
      untilFly -= dt;
      if (untilFly <= 0) {
        untilFly = random(7, 14);
        addBug('firefly');
      }
      untilTreat -= dt;
      if (untilTreat <= 0) {
        untilTreat = random(34, 58);
        addBug(pick(['beetle', 'caterpillar']));
      }
      scoreText.textContent = Math.floor(score);
    } else {
      flow.force = Math.max(0, flow.force - dt * 2);
    }

    // Everything keeps moving after the fish is gone; nothing new comes.
    const carryX = flow.x * flow.force * reach * 0.2 * dt;   // the current takes the light things with it
    const carryY = flow.y * flow.force * reach * 0.2 * dt;
    for (const other of others) {
      if (other !== ending?.who) {
        // A fish that has the player right in front of its nose turns on it and opens its mouth.
        const way = Math.sign(other.speed);
        const gap = Math.hypot(me.x - (other.x + way * other.length * 0.5), me.y - other.at);
        const hunts = state === 'play' && powers.shield <= 0 && way * (me.x - other.x) > 0 && gap < unit * 0.9 + other.length * 0.12;
        const climb = hunts ? clamp((me.y - other.at) / (unit * 0.5), -1, 1) * 0.5 : 0;   // as a share of its speed
        other.y += climb * Math.abs(other.speed) * dt;
        other.tilt += (Math.atan(climb) - other.tilt) * Math.min(dt * 10, 1);
        other.mouth += ((hunts ? 0.75 : 0) - other.mouth) * Math.min(dt * 14, 1);
      }
      other.x += other.speed * dt;
      other.at = other.y + Math.sin(clock * other.beat + other.phase) * other.weave;
    }
    for (const small of fry) {
      // While the fish is small enough for them, they open their mouths at it as the bigger fish do.
      const bites = state === 'play' && powers.small > 0 && powers.shield <= 0 && Math.hypot(small.x - me.x, small.y - me.y) < unit * 1.4;
      small.mouth += ((bites ? 0.7 : 0) - small.mouth) * Math.min(dt * 14, 1);
      small.x += small.vx * dt + carryX;
      small.y += small.vy * dt + carryY;
      small.vy *= Math.exp(-dt * 1.5);
      small.hush -= dt;
    }
    for (const item of junk) {
      if (item !== ending?.who) item.x += carryX;
      item.y += item.fall * dt + carryY;
      item.turn += item.spin * dt;
    }
    for (const bug of bugs) {
      if (bug.eaten === undefined) {
        bug.x += carryX;
        bug.y += bug.sink * dt + carryY;
        bug.at = bug.x + Math.sin(clock * 2.3 + bug.phase) * unit * 0.35;   // it struggles from side to side
      } else {
        bug.eaten += dt;
        bug.at += (me.x + me.facing * unit * me.size * 0.36 - bug.at) * Math.min(dt * 22, 1);
        bug.y += (me.y - bug.y) * Math.min(dt * 22, 1);
        if (bug.eaten >= 0.14 && !bug.gone) {
          bug.gone = true;
          me.gulp = 0.22;
        }
      }
    }
    for (const one of hooks) {
      if (one === ending?.who) continue;
      if (one.wait > 0 && one.y < one.toY) {
        one.y = Math.min(one.y + one.pace * dt, one.toY);
      } else if (one.wait > 0) {
        one.wait -= dt;
        one.armed = Math.min(1, one.armed + dt / 0.35);
      } else {
        one.y -= height * 0.9 * dt;
        one.armed = Math.max(0, one.armed - dt / 0.25);
      }
    }
    for (const bubble of pops) {
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;
      bubble.life -= dt;
    }
    for (const note of notes) {
      note.y -= 34 * dt;
      note.life -= dt;
    }

    if (state === 'play') {
      for (const bug of bugs) {
        if (bug.eaten === undefined && near(bug.at, bug.y, bug.kind === 'firefly' ? flySize : bugSize * 0.8)) eat(bug);
      }
      let eater = null;   // a small one that has reached the fish while the fish is smaller still
      for (const small of fry) {
        if (small.hush > 0 || !brushes(small)) continue;
        if (powers.small > 0 && powers.shield <= 0) eater ??= small;
        else bump(small);
      }
      if (eater) {
        // It swallows the fish as a bigger one would, so it joins them for what follows.
        const fish = { x: eater.x, y: eater.y, at: eater.y, length: eater.length, speed: eater.vx, weave: 0, beat: 1, phase: eater.phase, shade: 0.5, tilt: 0, mouth: eater.mouth };
        fry = fry.filter((small) => small !== eater);
        others.push(fish);
        endBy('fish', fish);
      } else if (powers.shield <= 0) {
        const fish = others.find(meets);
        const item = fish ? null : junk.find((thing) => near(thing.x, thing.y, thing.size * JUNK[thing.kind].hit));
        const caught = fish || item ? null : hooks.find((one) => one.armed > 0 && near(one.x, one.y, hookReach * one.armed));
        if (fish) endBy('fish', fish);
        else if (item) endBy('junk', item);
        else if (caught) endBy('hook', caught);
      }
    } else if (state === 'ending' && ending.left !== undefined) {
      ending.left += dt;
      if ((!others.length && !fry.length) || ending.left > 1.2) finish();
    } else if (state === 'ending' && ending.kind === 'fish') {
      // It turns to the fish and lunges with its mouth open, the fish slides in, the mouth shuts and it swallows.
      const { who, from, face, at } = ending;
      ending.age += dt;
      const lunge = 1 - (1 - clamp(ending.age / 0.26, 0, 1)) ** 3;
      const gulp = clamp((ending.age - 0.26) / 0.24, 0, 1);
      const settle = clamp((ending.age - 0.5) / 0.3, 0, 1);
      who.length = mix(from.length, Math.max(from.length * 1.12, unit * me.size * 1.9), lunge);
      who.x = mix(from.x, at.x + face * (unit * me.size * 0.1 - who.length * 0.5), lunge);
      who.y = mix(from.y, at.y, lunge);
      who.at = who.y;
      who.speed = face * 0.001;   // it stays where it is, facing the fish
      who.tilt = from.tilt * (1 - lunge);
      who.mouth = ending.age < 0.26 ? mix(from.mouth, 1, lunge) : 1 - gulp ** 2;
      ending.squash = Math.sin(settle * Math.PI) * 0.14;
      me.show = 1 - gulp;
      me.x = mix(at.x, who.x + face * who.length * 0.26, gulp);
      me.y = mix(at.y, who.y, gulp);
      me.spin += dt * 12 * gulp;
      if (settle > 0 && !ending.burst) {
        ending.burst = true;
        pop(who.x + face * who.length * 0.45, who.y, 8, 70, 150);
        playEffect('bubbles', who.x);
      }
      if (ending.age >= 0.8) {
        who.speed = face * Math.max(ending.pace, width * 0.2);
        scatter();
      }
    } else if (state === 'ending' && ending.kind === 'junk') {
      // The junk lands on the fish and takes it down into the seabed, turning, with a trail of bubbles.
      const item = ending.who;
      ending.age += dt;
      item.fall += height * 0.9 * dt;
      me.x += (item.x - me.x) * Math.min(dt * 12, 1);
      me.y += (item.y - me.y) * Math.min(dt * 16, 1);
      me.spin += dt * 7;
      me.tilt = 0;
      me.show = clamp((floor + unit * 0.4 - me.y) / (unit * 0.8), 0, 1);
      if (Math.floor(ending.age / 0.07) !== Math.floor((ending.age - dt) / 0.07)) pop(me.x, me.y, 1, 30, 140);
      if (me.show === 0 || ending.age >= 1.6) {
        me.show = 0;
        pop(item.x, floor, 7, 90, 70);
        scatter();
      }
    } else if (state === 'ending') {
      // The fish goes for the hook, the line jerks tight, and up it goes by the mouth, wriggling. The view stays.
      const one = ending.who;
      ending.age += dt;
      const bite = clamp(ending.age / 0.16, 0, 1);
      const hang = clamp((ending.age - 0.16) / 0.26, 0, 1);
      one.armed = Math.max(0, one.armed - dt * 5);
      if (ending.age < 0.5) {
        one.y = ending.hookY + (bite === 1 ? Math.sin((ending.age - 0.16) * 40) * 5 * (1 - hang * 0.6) : 0);
      } else {
        ending.lift += height * 3.4 * dt;
        one.y -= ending.lift * dt;
      }
      const angle = hang * Math.PI / 2;
      const half = unit * me.size * 0.5;
      me.spin = -me.facing * angle + Math.sin(ending.age * 30) * 0.2 * hang;
      me.tilt *= 1 - bite;
      me.x = mix(ending.at.x, one.x - me.facing * half * Math.cos(angle), bite);
      me.y = mix(ending.at.y, one.y + half * Math.sin(angle), bite);
      if (Math.floor(ending.age / 0.09) !== Math.floor((ending.age - dt) / 0.09)) pop(me.x, me.y, 1, 30, 100);
      if (one.y < -unit * 1.5) {
        me.show = 0;
        scatter();
      }
    }
    others = others.filter((other) => other.x > -other.length * 1.5 && other.x < width + other.length * 1.5);
    fry = fry.filter((small) => small.x > -unit * 5 && small.x < width + unit * 5 && small.y > -unit && small.y < height + unit);
    junk = junk.filter((item) => item.y < height + item.size * 1.5);
    bugs = bugs.filter((bug) => !bug.gone && bug.y < floor + unit * 0.3);
    hooks = hooks.filter((one) => one.wait > 0 || one.y > -hookSize * 3);
    pops = pops.filter((bubble) => bubble.life > 0);
    notes = notes.filter((note) => note.life > 0);

    // ---- The picture, back to front ----
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    if (flow.force > 0.01) {
      ctx.strokeStyle = `rgba(255,255,255,${0.34 * flow.force})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const streak of streaks) {
        streak.x = (streak.x + flow.x * streak.pace * dt * 1.5 + 1) % 1;
        streak.y = (streak.y + flow.y * streak.pace * dt * 1.5 + 1) % 1;
        ctx.moveTo(streak.x * width, streak.y * height);
        ctx.lineTo(streak.x * width - flow.x * streak.long * reach, streak.y * height - flow.y * streak.long * reach);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    for (const bubble of bubbles) {
      bubble.y -= bubble.speed * dt;
      bubble.x = (bubble.x + flow.x * flow.force * dt * 0.08 + 1) % 1;
      if (bubble.y < -0.05) Object.assign(bubble, { y: 1.05, x: Math.random() });
      ctx.beginPath();
      ctx.arc(bubble.x * width, bubble.y * height, bubble.size, 0, TAU);
      ctx.stroke();
    }

    const taker = ending?.kind === 'fish' ? ending.who : null;
    for (const small of fry) {
      drawFish(small.x, small.y, small.length, Math.sign(small.vx), 'rgba(255,255,255,0.5)',
        { wag: Math.sin(clock * 13 + small.phase) * 7, tilt: clamp(small.vy / (Math.abs(small.vx) || 1), -0.6, 0.6), mouth: small.mouth });
    }
    for (const other of others) {
      if (other === taker) continue;
      drawFish(other.x, other.at, other.length, Math.sign(other.speed), `rgba(255,255,255,${other.shade})`,
        { wag: Math.sin(clock * 9 + other.phase) * 5, tilt: other.tilt, mouth: other.mouth });
    }
    const drawMe = () => drawFish(me.x, me.y, unit * me.size * me.show, me.facing, mine,
      { tilt: me.tilt, wag: Math.sin(now / 70) * 6, spin: me.spin, mouth: me.mouth, squash: Math.sin(me.gulp / 0.22 * Math.PI) * 0.12 });
    // A tyre goes round the fish it has caught; the rest of the junk is behind it.
    const ringed = ending?.kind === 'junk' && ending.who.kind === 'tyre';
    if (ringed) drawMe();
    for (const item of junk) drawJunk(item);
    for (const bug of bugs) drawBug(bug);
    for (const one of hooks) drawHook(one);
    if (!ringed) drawMe();
    if (taker) {
      // It turns round first if the fish came at it from behind.
      drawFish(taker.x, taker.at, taker.length, mix(ending.was, ending.face, clamp(ending.age / 0.12, 0, 1)) || 0.01,
        `rgba(255,255,255,${taker.shade})`, { wag: Math.sin(now / 60) * 5, tilt: taker.tilt, mouth: taker.mouth, squash: ending.squash });
    }

    // What is helping right now: the bubble round the fish, and a ring for each help that runs down with it.
    if (state === 'play') {
      if (powers.shield > 0 && (powers.shield > 1.2 || Math.sin(now / 60) > 0)) {
        ctx.fillStyle = 'rgba(191,230,255,0.14)';
        ctx.strokeStyle = 'rgba(191,230,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(me.x, me.y, unit * 0.78 * me.size, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      let ring = 0;
      for (const [kind, left] of Object.entries(powers)) {
        if (left <= 0) continue;
        ctx.strokeStyle = POWERS[kind].colour;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(me.x, me.y, unit * (0.95 + 0.13 * ring++), -Math.PI / 2, -Math.PI / 2 + TAU * left / POWERS[kind].seconds);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1.2;
    for (const bubble of pops) {
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * clamp(bubble.life * 2, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.size, 0, TAU);
      ctx.stroke();
    }
    if (finger && state === 'play') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.arc(finger.fromX, finger.fromY, stickReach, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(finger.x, finger.y, stickReach * 0.42, 0, TAU);
      ctx.fill();
    }
    ctx.font = `700 ${Math.round(clamp(unit * 0.34, 13, 18))}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    for (const note of notes) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(note.life * 1.6, 0, 1)})`;
      ctx.fillText(note.text, clamp(note.x, 60, width - 60), note.y);
    }
  };

  // ---- Steering: the mouse (the fish goes where the pointer is), a finger (a stick where it is put down;
  //      the first finger only) or the keys ----
  const steer = (event) => {
    if (state !== 'play') return;
    const place = box.getBoundingClientRect();
    const x = event.clientX - place.left;
    const y = event.clientY - place.top;
    if (event.pointerType !== 'touch') {
      me.toX = x;
      me.toY = y;
    } else if (event.type === 'pointerdown') {
      if (!finger && !event.target.closest('button')) finger = { id: event.pointerId, fromX: x, fromY: y, x, y };
    } else if (finger?.id === event.pointerId) {
      // The stick comes along when the finger goes past its reach, so that turning back answers at once.
      const lean = Math.hypot(x - finger.fromX, y - finger.fromY);
      if (lean > stickReach) {
        finger.fromX = x - (x - finger.fromX) / lean * stickReach;
        finger.fromY = y - (y - finger.fromY) / lean * stickReach;
      }
      Object.assign(finger, { x, y });
    }
    box.classList.add('is-quiet');
  };
  const lift = (event) => {
    if (finger?.id === event.pointerId) finger = null;
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
      if (state === 'play') keys.add(way);
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

  // Leaving: the game's water clears and the view comes up to the surface, to the top of the page.
  let leaving = false;
  function leave() {
    if (leaving) return;
    leaving = true;
    cancelAnimationFrame(frame);
    removeEventListener('keydown', onKeyDown, true);
    removeEventListener('keyup', onKeyUp, true);
    removeEventListener('resize', resize);
    box.classList.remove('is-open');
    setTimeout(() => box.remove(), reducedMotion ? 0 : 650);
    hero?.classList.remove('is-offscreen');   // it is about to be in sight again
    scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    focusBefore?.focus?.({ preventScroll: true });
  }

  box.addEventListener('pointermove', steer);
  box.addEventListener('pointerdown', steer);
  box.addEventListener('pointerup', lift);
  box.addEventListener('pointercancel', lift);
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
  setTimeout(() => box.classList.add('is-quiet'), 6000);

  reset();
  frame = requestAnimationFrame(step);
}
