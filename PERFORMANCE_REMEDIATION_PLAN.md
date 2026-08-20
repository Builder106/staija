# STAIJA Performance Remediation Plan

**Based on Lighthouse Audit (2026-08-18):** Performance 4/100 | CLS 0.902 | LCP 12.4s | TBT 1,950ms

---

## Executive Summary

| Metric                        | Current       | Target   | Gap      |
| ----------------------------- | ------------- | -------- | -------- |
| **Performance Score**   | 4             | 90+      | Critical |
| **LCP**                 | 12.4s         | ≤ 2.5s  | 10s+     |
| **CLS**                 | 0.902         | ≤ 0.1   | 9×      |
| **TBT**                 | 1,950ms       | ≤ 200ms | 10×     |
| **TTI**                 | 16.7s         | ≤ 3.8s  | 13s+     |
| **Unused JS**           | 5.45s savings | —       | —       |
| **Render-blocking CSS** | 404ms         | —       | —       |

**Root Causes (in priority order):**

1. **Font loading** — 6 font families, ~48 font files, 6 preloads competing for bandwidth
2. **Initial JS bundle** — ~400KB main chunk + large vendor chunk blocking main thread
3. **Hero Lottie** — `lottie-web` (~50KB gz) + hero.json (~200KB) loaded eagerly
4. **CSS delivery** — 404ms of render-blocking CSS (Tailwind + custom + fonts.css)
5. **CMS content shifts** — Async Contentful data with mismatched skeleton sizes
6. **Main thread work** — motion-v animations, cursor system, hydration overhead

---

## Phase 1: Quick Wins (Week 1) — Target: Performance 30+

### 1.1 Reduce Font Preloads to Critical Only

**File:** `index.html:13-18`
**Effort:** 30 min | **Impact:** High (LCP, CLS)

```html
<!-- KEEP: Only the font used in above-the-fold text (hero headline + header nav) -->
<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/IBM_Plex_Sans/IBM_Plex_Sans-latin-wght-normal-400.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/IBM_Plex_Sans/IBM_Plex_Sans-latin-wght-normal-600.woff2">

<!-- REMOVE: Inter, Madimi One, Ojuju, Agu Display, STAIJA Tac Mono preloads -->
<!-- These load via @font-face in fonts.css when actually used -->
```

**Why:** 6 preloads = 6 concurrent connections competing with hero Lottie + main JS. Only IBM Plex Sans (body text) is needed above fold.

### 1.2 Add `font-display: optional` to All @font-face

**File:** `src/styles/fonts.css` (all 48+ @font-face rules)
**Effort:** 1 hour | **Impact:** High (LCP, CLS)

```css
/* Change from: */
font-display: swap;

/* To: */
font-display: optional;
```

**Why:** `swap` causes layout shift when web font loads. `optional` lets browser skip font if slow, using fallback instantly — eliminates font-related CLS. Trade-off: may show fallback on slow 3G, but no layout shift.

### 1.3 Subset Fonts to Latin-Only (or Used Characters)

**Files:** `src/styles/fonts.css`, `public/fonts/`
**Effort:** 2 hours | **Impact:** Medium (LCP, bundle size)

- Current: Full unicode ranges (latin, latin-ext, cyrillic, greek, vietnamese)
- Action: Use `pyftsubset` or Font Squirrel to create latin-only subsets
- Expected: 40-60% reduction in font file sizes

### 1.4 Defer Non-Critical CSS

**File:** `index.html:20-22`
**Effort:** 30 min | **Impact:** Medium (render-blocking CSS)

```html
<!-- Change from: -->
<link rel="stylesheet" href="/src/styles/fonts.css">

<!-- To: -->
<link rel="preload" href="/src/styles/fonts.css" as="style" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/src/styles/fonts.css"></noscript>
```

**Why:** fonts.css is large (~48 @font-face rules) and blocks render. Preload + onload pattern makes it non-blocking.

---

## Phase 2: Bundle Optimization (Week 2) — Target: Performance 50+

### 2.1 Further Code-Split Heavy Dependencies

**File:** `vite.config.ts:18-30`
**Effort:** 1 hour | **Impact:** High (TBT, unused JS)

Current manualChunks only splits Tiptap. Add:

```typescript
manualChunks: {
  // Existing
  tiptap: ['@tiptap/vue-3', '@tiptap/extension-code-block-lowlight', ...],
  
  // NEW: Split these heavy deps
  'lottie-web': ['lottie-web'],
  'motion-v': ['motion-v'],
  'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
  'contentful': ['contentful'],
  'vue-router': ['vue-router'],
  'pinia': ['pinia'],
  'markdown-it': ['markdown-it'],
  'lowlight': ['lowlight'],
}
```

**Why:** Lighthouse reports 5.45s savings from unused JS. Each chunk loads only when its route is visited.

### 2.2 Lazy-Load HeroLottie Component

**File:** `src/views/Home.vue:40-50`
**Effort:** 30 min | **Impact:** High (LCP, TBT)

```vue
<!-- Change from: -->
<HeroLottie v-if="!isMobile" class="hero-lottie" />

<!-- To: -->
<HeroLottie v-if="!isMobile && lottieLoaded" class="hero-lottie" />
```

```typescript
// In script setup:
const lottieLoaded = ref(false)
onMounted(() => {
  // Defer until after initial paint
  requestIdleCallback(() => { lottieLoaded.value = true })
})
```

**Why:** Hero Lottie is below fold on mobile, and on desktop it competes with LCP. Defer to idle callback.

### 2.3 Remove Unused Dependencies

**File:** `package.json`
**Effort:** 30 min | **Impact:** Low-Medium

Audit these:

- `pixi.js` — Is it used? (Only if WebGL canvas features)
- `chart.js` + `vue-chartjs` — Any charts in production?
- `date-fns` — Only used for date formatting? Consider `Intl.DateTimeFormat`
- `zod` — Only for forms? Consider lighter validation

---

## Phase 3: CLS Elimination (Week 2-3) — Target: CLS ≤ 0.1

### 3.1 Fix Skeleton-to-Content Size Mismatch

**Files:** `src/views/Home.vue`, `src/components/*` (all CMS-driven sections)
**Effort:** 2 hours | **Impact:** Critical (CLS 0.902 → 0.1)

**Problem:** Skeletons in `ImpactStrip.vue`, `ProgramsSection.vue`, `FeaturedStory.vue`, `EventsSection.vue` have fixed heights that don't match Contentful content.

**Solution:** Use aspect-ratio boxes or min-height based on design system:

```vue
<!-- Example fix for ImpactStrip skeleton -->
<div class="skeleton impact-strip" style="aspect-ratio: 16/9; min-height: 200px;">
```

Better: Calculate skeleton height from design tokens, not hardcoded pixels.

### 3.2 Reserve Space for CMS Images

**Files:** All components using Contentful images
**Effort:** 1 hour | **Impact:** High (CLS)

```vue
<!-- Add explicit dimensions or aspect-ratio -->
<img 
  :src="imageUrl" 
  width="800" 
  height="450" 
  style="aspect-ratio: 16/9;"
  loading="lazy"
/>
```

### 3.3 Fix Font Fallback Metrics

**File:** `src/styles/fonts.css`
**Effort:** 1 hour | **Impact:** Medium (CLS)

Current fallbacks use `size-adjust`, `ascent-override`, etc. but may not match perfectly.

```css
/* Verify these match exactly for each font */
@font-face {
  font-family: 'IBM Plex Sans Fallback';
  src: local('Arial');
  size-adjust: 93.5%;        /* Must match IBM Plex Sans exactly */
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
}
```

Test: Disable web fonts in DevTools → measure CLS. Should be near zero.

### 3.4 Add `min-height` to Hero Section

**File:** `src/views/Home.vue:40-50`
**Effort:** 15 min | **Impact:** Medium (CLS)

```vue
<section class="hero" style="min-height: 600px;"> <!-- Match design height -->
  <HeroLottie v-if="!isMobile && lottieLoaded" />
  <div v-else class="hero-static-placeholder" style="height: 600px;" />
</section>
```

---

## Phase 4: LCP Optimization (Week 3) — Target: LCP ≤ 2.5s

### 4.1 Replace Hero Lottie with Static Image + Progressive Enhancement

**Files:** `src/components/HeroLottie.vue`, `src/views/Home.vue`
**Effort:** 2 hours | **Impact:** Critical (LCP 12.4s → <2.5s)

**Current:** Lottie loads hero.json (~200KB) + lottie-web (~50KB gz) → parses + renders animation
**Proposed:**

```vue
<!-- HeroLottie.vue -->
<picture>
  <!-- Static WebP/AVIF fallback - loads instantly -->
  <source type="image/avif" srcset="/images/hero.avif">
  <source type="image/webp" srcset="/images/hero.webp">
  <img 
    src="/images/hero.jpg" 
    alt="STAIJA hero illustration"
    width="1200" 
    height="600"
    fetchpriority="high"
    decoding="async"
  >
</picture>

<!-- Progressive: Load Lottie on interaction or idle -->
<script setup>
const showLottie = ref(false)
onMounted(() => {
  requestIdleCallback(async () => {
    const lottie = await import('lottie-web')
    // Swap image for animation
  })
})
</script>
```

**Why:** LCP element is the hero. Static image = instant LCP. Lottie loads after.

### 4.2 Add `fetchpriority="high"` to LCP Image

**File:** `src/views/Home.vue` (hero image)
**Effort:** 5 min | **Impact:** High (LCP)

```html
<img fetchpriority="high" ... />
```

### 4.3 Preconnect to Contentful

**File:** `index.html`
**Effort:** 5 min | **Impact:** Medium (LCP for CMS images)

```html
<link rel="preconnect" href="https://images.ctfassets.net" crossorigin>
<link rel="preconnect" href="https://cdn.contentful.com" crossorigin>
```

### 4.4 Enable HTTP/2 Server Push or 103 Early Hints (Vercel)

**Platform:** Vercel config
**Effort:** 15 min | **Impact:** Medium

Vercel supports Early Hints. Add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Link", "value": "</src/styles/fonts.css>; rel=preload; as=style, </fonts/IBM_Plex_Sans/...>; rel=preload; as=font; crossorigin" }
      ]
    }
  ]
}
```

---

## Phase 5: Main Thread / TBT Reduction (Week 3-4) — Target: TBT ≤ 200ms

### 5.1 Reduce motion-v Initial Work

**Files:** `src/views/Home.vue`, `src/components/*.vue` (all motion-v usage)
**Effort:** 2 hours | **Impact:** High (TBT)

- `motion-v` uses `requestAnimationFrame` heavily
- Every `v-motion` directive creates observers
- **Action:** Audit all `v-motion` uses; remove from below-fold content; use `initial={false}` + `animate` on mount

### 5.2 Lazy-Load Below-Fold Sections

**File:** `src/views/Home.vue`
**Effort:** 1 hour | **Impact:** Medium (TBT, initial JS)

```vue
<!-- Wrap each section in Suspense + defineAsyncComponent -->
const ImpactStrip = defineAsyncComponent(() => import('./components/ImpactStrip.vue'))
const ProgramsSection = defineAsyncComponent(() => import('./components/ProgramsSection.vue'))
const FeaturedStory = defineAsyncComponent(() => import('./components/FeaturedStory.vue'))
const EventsSection = defineAsyncComponent(() => import('./components/EventsSection.vue'))
```

```vue
<Suspense>
  <template #default>
    <ImpactStrip />
    <ProgramsSection />
    <FeaturedStory />
    <EventsSection />
  </template>
  <template #fallback>
    <SectionSkeleton />
  </template>
</Suspense>
```

**Why:** Only hero + header needed for initial paint. Everything else streams in.

### 5.3 Optimize Cursor System

**File:** `src/layouts/DefaultLayout.vue`, `src/composables/useCursor.ts`
**Effort:** 1 hour | **Impact:** Medium (TBT)

Custom cursor creates `mousemove` listeners + RAF loop. Consider:

- Disable on mobile (already done via `isMobile`)
- Debounce/throttle mousemove
- Use CSS `cursor` property for simple cases instead of canvas

---

## Phase 6: Staging Audit & CI Integration (Week 4)

### 6.1 Staging Audit Options

**Problem:** staging.staija.org behind Vercel SSO

| Option                               | Effort  | Notes                                                             |
| ------------------------------------ | ------- | ----------------------------------------------------------------- |
| **Vercel Preview Deployments** | 30 min  | Enable "Preview Deployments" in Vercel → each PR gets public URL |
| **Password Protection Bypass** | 1 hour  | Add`x-vercel-protection-bypass` header in Lighthouse CI         |
| **Separate Staging Project**   | 2 hours | Duplicate Vercel project without SSO                              |

**Recommendation:** Option 1 (Preview Deployments) — zero infrastructure, built into Vercel.

### 6.2 Add Lighthouse CI to GitHub Actions

**File:** `.github/workflows/lighthouse.yml` (new)
**Effort:** 1 hour | **Impact:** Prevent regressions

```yaml
name: Lighthouse CI
on: [pull_request]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npx serve -s dist -l 4173 &
      - uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            http://localhost:4173
          budgetPath: ./lighthouse-budget.json
```

**Budget file:** `lighthouse-budget.json`

```json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.7 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["error", { "minScore": 0.9 }]
      }
    }
  }
}
```

---

## Dependency Audit: What Can Be Removed/Replaced

| Package                        | Size (gz) | Used?             | Replacement/Action              |
| ------------------------------ | --------- | ----------------- | ------------------------------- |
| `lottie-web`                 | ~50KB     | Hero only         | Static image + progressive load |
| `motion-v`                   | ~15KB     | Many components   | Keep, but audit usage           |
| `pixi.js`                    | ~180KB    | ?                 | **Remove if unused**      |
| `chart.js` + `vue-chartjs` | ~60KB     | ?                 | **Remove if unused**      |
| `date-fns`                   | ~20KB     | Date formatting   | `Intl.DateTimeFormat`         |
| `zod`                        | ~10KB     | Forms             | `valibot` (3KB) or native     |
| `lowlight`                   | ~40KB     | Code blocks       | Keep (needed for Tiptap)        |
| `markdown-it`                | ~30KB     | Content rendering | Keep                            |

Run `npm run build && npx vite-bundle-visualizer` to confirm.

---

## Implementation Priority Matrix

| Priority | Task                             | Phase | Effort | Expected Gain          |
| -------- | -------------------------------- | ----- | ------ | ---------------------- |
| P0       | Reduce font preloads to 2        | 1     | 30m    | LCP -2s, CLS -0.3      |
| P0       | font-display: optional           | 1     | 1h     | CLS -0.5               |
| P0       | Defer fonts.css                  | 1     | 30m    | Render-blocking -400ms |
| P0       | Lazy-load HeroLottie             | 2     | 30m    | LCP -3s, TBT -500ms    |
| P0       | Split vendor chunks              | 2     | 1h     | TBT -800ms             |
| P0       | Fix skeleton heights             | 3     | 2h     | CLS -0.4               |
| P1       | Subset fonts                     | 1     | 2h     | Font size -50%         |
| P1       | Static hero + progressive Lottie | 4     | 2h     | LCP -8s                |
| P1       | Lazy-load below-fold sections    | 5     | 1h     | TBT -600ms             |
| P1       | Preconnect Contentful            | 4     | 5m     | LCP -200ms             |
| P2       | Remove unused deps               | 2     | 30m    | Bundle -100KB          |
| P2       | Optimize cursor system           | 5     | 1h     | TBT -200ms             |
| P2       | Lighthouse CI                    | 6     | 1h     | Regression prevention  |

---

## Staging Audit Plan

**Immediate:**

1. Enable Vercel Preview Deployments for `staging` branch
2. Run Lighthouse on preview URL (public, no SSO)

**Validation Checklist for Staging:**

- [ ] Performance score ≥ 70
- [ ] CLS ≤ 0.1
- [ ] LCP ≤ 2.5s
- [ ] TBT ≤ 200ms
- [ ] No console errors
- [ ] All routes accessible (auth pages, CMS content)

---

## Success Criteria

| Milestone                  | Performance | CLS  | LCP  | TBT    |
| -------------------------- | ----------- | ---- | ---- | ------ |
| **Phase 1 (Week 1)** | 30+         | 0.3  | 6s   | 1000ms |
| **Phase 2 (Week 2)** | 50+         | 0.15 | 3.5s | 500ms  |
| **Phase 3 (Week 3)** | 70+         | 0.1  | 2.5s | 200ms  |
| **Phase 4 (Week 4)** | 90+         | 0.05 | 1.8s | 100ms  |

---

## Risk Mitigation

| Risk                                                          | Likelihood | Mitigation                                                |
| ------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| `font-display: optional` shows fallback on slow connections | Medium     | Test on throttled 3G; fallback fonts are metric-matched   |
| Lazy-loading sections breaks SSR/SEO                          | Low        | Use`Suspense` with skeleton fallbacks; Google crawls JS |
| Removing preloads hurts LCP for non-critical fonts            | Low        | Only IBM Plex Sans is above-fold; others load when needed |
| Lottie removal loses brand animation                          | Low        | Progressive enhancement keeps it for capable devices      |

---

## Appendix: Files to Modify

### Phase 1

- `index.html` — preloads, font.css defer
- `src/styles/fonts.css` — font-display: optional

### Phase 2

- `vite.config.ts` — manualChunks
- `src/views/Home.vue` — HeroLottie lazy load
- `package.json` — remove unused deps

### Phase 3

- `src/views/Home.vue` — hero min-height
- `src/components/ImpactStrip.vue` — skeleton aspect-ratio
- `src/components/ProgramsSection.vue` — skeleton aspect-ratio
- `src/components/FeaturedStory.vue` — skeleton aspect-ratio
- `src/components/EventsSection.vue` — skeleton aspect-ratio
- `src/styles/fonts.css` — verify fallback metrics

### Phase 4

- `src/components/HeroLottie.vue` — static image + progressive
- `src/views/Home.vue` — fetchpriority
- `index.html` — preconnect
- `vercel.json` — Early Hints

### Phase 5

- `src/views/Home.vue` — async components + Suspense
- `src/layouts/DefaultLayout.vue` — cursor optimization
- `src/composables/useCursor.ts` — throttle mousemove

### Phase 6

- `.github/workflows/lighthouse.yml` — CI
- `lighthouse-budget.json` — budgets
- Vercel dashboard — Preview Deployments
