import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

gsap.registerPlugin(ScrollTrigger, SplitText);

// Every ease, duration, and scroll range the two program pages use. Tune
// motion here, not in the components.
export const MOTION = {
  ease: 'power2.out',
  // A drawing changing between schedule stages.
  stage: { duration: 0.6, stagger: 0.05, rise: 10 },
  // SVG lines that draw themselves (plot axes, fit line, team links).
  draw: { duration: 0.9 },
  // Map dots recoloring between weeks; spread over this many seconds.
  dots: { duration: 0.5, spread: 0.8 },
  // Statement words fill from this opacity as the statement scrolls
  // through the viewport.
  fill: { from: 0.18, start: 'top 85%', end: 'bottom 40%' },
  // A schedule step takes over once its top passes this line of the viewport.
  step: { start: 'top 60%' },
} as const;

const NO_PREFERENCE = '(prefers-reduced-motion: no-preference)';

/**
 * Scroll behavior shared by both program pages, scoped to `root`:
 * - `[data-fill]` text fills in word by word, scrubbed to scroll. Under
 *   reduced motion it stays fully visible.
 * - `stage` counts the `[data-step]` blocks whose top has passed the step
 *   line: 0 above the first step, the last step's number below it. It is
 *   computed from the scroll position on every update, so a jump (anchor
 *   link, End key, restored scroll) lands on the right stage.
 */
export function useScheduleScroll(root: Ref<HTMLElement | null>) {
  const stage = ref(0);
  let ctx: gsap.Context | undefined;
  let mm: gsap.MatchMedia | undefined;

  onMounted(() => {
    if (!root.value) return;
    ctx = gsap.context(() => {
      const marks = gsap.utils
        .toArray<HTMLElement>('[data-step]')
        .map((el) => ScrollTrigger.create({ trigger: el, start: MOTION.step.start }));
      const sync = (self: ScrollTrigger) => {
        const y = self.scroll();
        stage.value = marks.filter((m) => y >= m.start).length;
      };
      ScrollTrigger.create({
        trigger: root.value,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: sync,
        onRefresh: sync,
      });
    }, root.value);

    mm = gsap.matchMedia(root.value);
    mm.add(NO_PREFERENCE, () => {
      gsap.utils.toArray<HTMLElement>('[data-fill]').forEach((el) => {
        SplitText.create(el, {
          type: 'words',
          onSplit: (self) =>
            gsap.fromTo(
              self.words,
              { opacity: MOTION.fill.from },
              {
                opacity: 1,
                ease: 'none',
                stagger: 0.1,
                scrollTrigger: {
                  trigger: el,
                  start: MOTION.fill.start,
                  end: MOTION.fill.end,
                  scrub: true,
                },
              },
            ),
        });
      });
    });
  });

  onUnmounted(() => {
    mm?.revert();
    ctx?.revert();
  });

  return { stage };
}

/**
 * Shows the parts of a drawing whose `data-stage` is at or below `stage`.
 * Parts marked `data-draw` are SVG strokes that draw along their length;
 * the rest fade and rise into place. Changes apply instantly under reduced
 * motion and on first render.
 */
export function useStageReveal(root: Ref<Element | null>, stage: Ref<number>) {
  const reduced = ref(false);
  let media: MediaQueryList | undefined;
  const onChange = () => {
    reduced.value = !!media?.matches;
  };

  function apply(instant: boolean) {
    if (!root.value) return;
    let turningOn = 0;
    root.value.querySelectorAll<SVGGeometryElement | HTMLElement>('[data-stage]').forEach((el) => {
      const on = Number(el.dataset.stage) <= stage.value;
      const delay = on && !instant ? turningOn++ * MOTION.stage.stagger : 0;
      if ('getTotalLength' in el && el.hasAttribute('data-draw')) {
        const length = el.getTotalLength();
        gsap.set(el, { strokeDasharray: length });
        gsap.to(el, {
          strokeDashoffset: on ? 0 : length,
          duration: instant ? 0 : MOTION.draw.duration,
          delay,
          ease: MOTION.ease,
          overwrite: true,
        });
        return;
      }
      gsap.to(el, {
        autoAlpha: on ? 1 : 0,
        y: on ? 0 : MOTION.stage.rise,
        duration: instant ? 0 : MOTION.stage.duration,
        delay,
        ease: MOTION.ease,
        overwrite: true,
      });
    });
  }

  onMounted(() => {
    media = window.matchMedia('(prefers-reduced-motion: reduce)');
    onChange();
    media.addEventListener('change', onChange);
    apply(true);
  });
  onUnmounted(() => {
    media?.removeEventListener('change', onChange);
    if (root.value) gsap.killTweensOf(root.value.querySelectorAll('[data-stage]'));
  });
  watch(stage, () => apply(reduced.value));

  return { reduced };
}

export { gsap, ScrollTrigger };
