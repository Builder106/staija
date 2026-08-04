# STAIJA Design System

Companion to `design-tokens.json` (W3C DTCG format). The JSON holds values; this file holds intent — read both before generating or reviewing UI.

## Brand posture

STAIJA reads as a research/scientific product, not an editorial or fashion one. The gradient hero, nav, and footer (`gradient.hero`, `gradient.brand`) are a deliberate, settled choice — do not propose swapping them for a flat or neutral treatment unless explicitly asked to redesign.

Headings use `typography.font-display` (IBM Plex Sans) specifically because it reads as quiet authority. An earlier Playfair Display pass was rejected for reading as fashion-mag.

## Theming model

Light/dark is driven by `[data-theme="dark"]` on `<html>`, not a class — this keeps the three-state model (light/dark/system) explicit and lets the pre-mount init script in `index.html` set it before Vue mounts.

- Themed tokens (`color.paper`, `color.ink`, `color.surface`) flip between light/dark values automatically — components consuming them (`bg-paper`, `text-ink`, `border-ink/10`) need no per-call-site dark variant.
- `*-static` tokens (`color.paper-static`, `color.ink-static`) never flip. Use them only for surfaces that are intentionally dark or light regardless of theme — e.g. the ProgramDetailView-family heroes, SiteFooter, LocaleSwitcher popover.
- `color.surface` is the "elevated card" token. Use it, not literal white, on neutral cards — but keep literal white on gradient overlays and buttons that must stay white regardless of theme.

## Typography

| Token | Face | Use |
| --- | --- | --- |
| `font-display` | IBM Plex Sans | Headings only |
| `font-sans` | Inter | Body |
| `font-mono` | IBM Plex Mono | Data labels, slugs |
| `font-accent-african` | Madimi One | Program wordmarks (Dynamerge hero) — one weight (400) |
| `font-accent-african-secondary` | Ojuju | Short labels only (eyebrows, stat callouts) at wght=500 — too heavy at hero/headline scale |
| `font-accent-african-tertiary` | Agu Display | Single-word wordmark-scale accents only — currently the homepage hero's lead word ("Africa's" in `home.hero.headline`). Instanced at a single static weight even though the source ships a variable axis, so treat it as fixed-weight — don't reach for it outside a standalone word at display size |
| `font-mono-african` | STAIJA Tac Mono | In-house re-metriced Tac One variant; treat as the house mono face wherever `font-mono` would otherwise go on African-program surfaces |

Full derivation and OFL compliance notes for the two African-designed faces live in `docs/TYPOGRAPHY-SYSTEM.md`.

## Decorative hover-swap interactions

The homepage hero's "Africa's" and "scientist-leaders" pop out on hover/focus and are replaced by a matching graphic (an Africa-continent silhouette masked from the public-domain BlankMap-Africa.svg; a row of lucide science icons) that pops in with a slight overshoot bounce. Two rules for reusing this pattern elsewhere:

- **Gate to real hover devices**: wrap the trigger rules in `@media (hover: hover) and (pointer: fine)`. Touch browsers often fake `:hover` on the first tap without clearing it until the user taps elsewhere — for a `tabindex`-focusable decorative swap, that can pop text to `opacity: 0` and leave it stuck invisible. There's no touch equivalent worth building for a flourish like this, so touch devices should just render the plain static text.
- **Size pop-in graphics in `em`, not `%`**, when absolutely positioning inside an inline text wrapper. The wrapper's height is `auto` (just the line-height of the text), and percentage heights resolve to `0` against an auto-height containing block — silently producing a zero-size, invisible element.

## Detail view architecture

Program detail pages are split by content shape, not shared through one generic template: `StepUpDetailView` (sprint format) and `DynamergeDetailView` (research-journal format) are separate components. When adding a new program type, decide which shape it follows — don't force it into either existing view or resurrect a shared `ProgramDetailView`.

Every detail view's `<style scoped>` block opens with a one-line stamp recording its allegiance to this file, e.g. `/* design-system: DESIGN.md · detail-view: sprint register (see note vs. StepUpDetailView) */`. This is what lets an audit (or another contributor) tell at a glance whether a page is intentionally following the system rather than having drifted from it — add the stamp to any new detail view, and update it if the view's register changes.

## Rules (apply these without being asked)

- **No live/status indicators.** No pulsing dots, "live" badges, or other real-time-status affordances. State the fact in plain text (e.g. "Applications open" as text, not a green ping dot next to it).
- **No middle-dot (`·`) separators** between short UI labels (e.g. ~~"Pan-African · 4 weeks · Fully funded"~~). For a rendered divider between sibling elements, use a real thin vertical-rule element, not a punctuation glyph. For plain-text joins in data/computed labels, use `|`.
- **No left accent rail on cards** — no colored vertical stripe down a card's left edge standing in for a real border/background. Use a full border, a background tint, a top rule, or nothing.
- **No pill-shaped stat badges** — stat rows use plain typographic hierarchy, not pills.

## Semantic color usage

- `color.brand.violet` / `color.brand.sky`: brand gradient anchors — nav, hero, footer, focus rings, hairline stripes, and `UiButton`'s `gradient` variant (the established primary-submit-CTA pattern: Donate, Sign Up, Sign In, Apply, Invite Accept). Not for arbitrary one-off accents outside these.
- `color.ink` at reduced opacity (`opacity.wash-ink-6`, `opacity.hairline-ink`) for dividers and subtle washes — never a hardcoded gray literal.
- Focus rings: `opacity.focus-ring-brand` (violet) on paper/light surfaces, `opacity.focus-ring-inverse` (white) on gradient/dark surfaces — pick by surface, not by component type.
- Placeholders inside `.brand-surface` inputs/textareas: `color.ink` at `opacity.placeholder-ink` (45%), not the browser default gray, which reads near-invisible in dark mode.

## Accessibility

- Dark-mode `ink` (#F0F4F8) was chosen over a slightly dimmer candidate (#E5EAF0) specifically to keep `text-ink/50` at ~5.0:1 (AA) instead of ~4.4:1 (AA-borderline). Don't dim this token further without re-checking contrast at the /50 and /60 opacity steps, which are used for faded text throughout.
- `prefers-reduced-motion: reduce` collapses all `.brand-surface` animations/transitions to ~0 — any new animated component under `.brand-surface` inherits this for free; don't bypass it with an inline style or a component-scoped transition outside that selector.

## Radii

`radius.xl` (12px) and `radius.2xl` (16px) cover standard card/button rounding. `radius.full` (9999px) is for pills and the scrollbar thumb only — not for the stat-badge pattern disallowed above.
