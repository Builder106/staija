const tl = window.__timelines.StaijaUiDemo;
for (const scene of document.querySelectorAll('.scene')) {
  const start = Number(scene.dataset.start);
  const duration = Number(scene.dataset.duration);
  tl.fromTo(scene, { opacity: 0 }, { opacity: 1, duration: 0.34, ease: 'power2.out' }, start)
    .to(scene, { opacity: 0, duration: 0.34, ease: 'power2.in' }, start + duration - 0.34)
    .fromTo(scene, { scale: 1.01 }, { scale: 1.035, duration, ease: 'none' }, start);
}
tl.to('#hook .signal', { rotation: 90, scale: 1.12, duration: 4.4, ease: 'none' }, 0)
  .from('#hook h1', { y: 38, duration: 0.65, ease: 'power3.out' }, 0.42)
  .from('#hook .wordmark', { y: -28, duration: 0.5, ease: 'power2.out' }, 0.2)
  .to('#home .browser img', { y: -280, duration: 5.4, ease: 'sine.inOut' }, 4.1)
  .to('#stepup .browser img', { y: -440, duration: 5.4, ease: 'sine.inOut' }, 9.3)
  .to('#dynamerge .browser img', { y: -400, duration: 5.4, ease: 'sine.inOut' }, 14.5)
  .from('#pathway article', { x: (i) => i % 2 ? 45 : -45, duration: 0.38, stagger: 0.18, ease: 'power3.out' }, 19.8)
  .from('#pathway h2', { y: 34, duration: 0.52, ease: 'power3.out' }, 20.45)
  .to('#end-mark', { y: -16, duration: 1.7, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 24.25);
