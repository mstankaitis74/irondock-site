// Parallax for the harbour scene: feeds scroll position and pointer offset to CSS (see .layer in dock.css).
(() => {
  const hero = document.querySelector('.hero');
  if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
})();
