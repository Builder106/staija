const tl = window.__timelines.StaijaTrailer;
for (const scene of document.querySelectorAll('.scene')) {
  const start = Number(scene.dataset.start);
  const duration = Number(scene.dataset.duration);
  tl.fromTo(scene, { opacity: 0 }, { opacity: 1, duration: 0.42, ease: 'power2.out' }, start)
    .to(scene, { opacity: 0, duration: 0.42, ease: 'power2.in' }, start + duration - 0.42)
    .fromTo(scene, { scale: 1.01 }, { scale: 1.03, duration, ease: 'none' }, start);
}
tl.to('#hook .orb-one', { rotation: 100, scale: 1.12, duration: 6.2, ease: 'none' }, 0)
  .to('#hook .orb-two', { rotation: -60, duration: 6.2, ease: 'none' }, 0)
  .from('#hook h1', { y: 44, duration: 0.75, ease: 'power3.out' }, 0.35)
  .from('#mission h2', { y: 35, duration: 0.65, ease: 'power3.out' }, 5.95)
  .from('#mission strong', { y: 25, duration: 0.5, ease: 'power2.out' }, 6.75)
  .from('#phone .device', { y: 90, rotation: -7, duration: 0.8, ease: 'power3.out' }, 12.05)
  .from('#phone .float-card', { scale: 0.7, duration: 0.5, stagger: 0.32, ease: 'back.out(1.6)' }, 12.7)
  .to('#phone .device', { y: -18, duration: 3.5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 12.8)
  .from('#programs article', { y: 90, duration: 0.7, stagger: 0.22, ease: 'power3.out' }, 19.25)
  .to('#programs article:first-child img', { y: -130, duration: 6.8, ease: 'sine.inOut' }, 19.25)
  .to('#programs article:nth-child(2) img', { y: -112, duration: 6.8, ease: 'sine.inOut' }, 19.25)
  .to('#impact .orbit', { rotation: 360, duration: 5.8, ease: 'none' }, 26.1)
  .from('#impact h2', { scale: 0.75, duration: 0.65, ease: 'back.out(1.3)' }, 26.45)
  .to('#end .brand-mark', { y: -14, duration: 1.8, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 31.45);
