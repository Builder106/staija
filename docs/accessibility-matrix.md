# STAIJA accessibility evidence matrix

This matrix records the current accessibility audit scope for STAIJA. It is an engineering release gate, not a claim that STAIJA already conforms to WCAG 2.2 AAA. Manual evidence is `Not recorded` until a person completes the required review.

## Status vocabulary

Use only `Pass`, `Fail`, `Needs review`, or `N/A with rationale`. Every `Pass` needs evidence. Every `N/A with rationale` needs a reason. `Fail` and `Needs review` block the release gate.

## Route and state coverage

| Surface | State or role | Automated coverage | Manual status | Evidence |
| --- | --- | --- | --- | --- |
| `/` (Homepage) | Anonymous visitor; light/dark theme; 320/375/768/1440px | E2E and component suites | Needs review | Not recorded |
| `/programs`, `/stepup`, `/dynamerge` | Program information, criteria cards, application prompts | Public site QA tests | Needs review | Not recorded |
| `/apply` and `/apply/status` | Multi-step scholarship application, validation errors, file uploads | Application flow tests | Needs review | Not recorded |
| `/stay-connected` | Cold visitor, email notification form, refer-a-friend, mentor showcase | Stay connected E2E suite | Needs review | Not recorded |
| `/login`, `/signup`, `/auth/callback` | Firebase authentication, email link callback, error states | Auth view tests | Needs review | Not recorded |
| `/applicant/dashboard` | Applicant session, application status badges, edit drafts | Applicant portal tests | Needs review | Not recorded |
| `/learn` portal | Enrolled scholar session, course modules, lesson reader, quiz view | LMS learning suite | Needs review | Not recorded |
| `/mentor/dashboard` | Mentor session, session scheduling modal, mentee feedback form | Mentor portal tests | Needs review | Not recorded |
| `/alumni` and `/alumni/directory` | Public and alumni sessions, directory search, filter chips | Alumni view tests | Needs review | Not recorded |
| `/admin` portal | Admin session, applicant review table, user management | Admin dashboard tests | Needs review | Not recorded |
| Global shell | DefaultLayout, mobile drawer menu, avatar renderer, footer | Mobile shell tests | Needs review | Not recorded |
| Localization | English and Yoruba (`yo`) locale catalog and layout | Locale and font tests | Needs review | Not recorded |

## WCAG 2.2 success criteria

Each applicable criterion has its own row so that evidence and dispositions cannot be hidden in grouped ranges.

| Criterion | Level | Surface or state | Method | Evidence | Status | Reviewer | Date | Rationale or issue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | All routes, program imagery, scholar avatars | Axe and screen reader | Not recorded | Needs review | | | |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | Recorded mentor sessions and intro videos | Manual media review | Not recorded | Needs review | | | |
| 1.2.2 Captions (Prerecorded) | A | Course video lessons | Manual media review | Not recorded | Needs review | | | |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A | Course videos and program media | Manual media review | Not recorded | Needs review | | | |
| 1.2.4 Captions (Live) | AA | Live mentorship sessions, if applicable | Manual media review | Not recorded | N/A with rationale | | | Live mentorship relies on external meeting platforms |
| 1.2.5 Audio Description (Prerecorded) | AA | Course video materials | Manual media review | Not recorded | Needs review | | | |
| 1.3.1 Info and Relationships | A | All tables, forms, and LMS outlines | Axe and accessibility tree | Not recorded | Needs review | | | |
| 1.3.2 Meaningful Sequence | A | Multi-step application and lesson reader | Keyboard and screen reader | Not recorded | Needs review | | | |
| 1.3.3 Sensory Characteristics | A | Form error cues and status instructions | Visual and content review | Not recorded | Needs review | | | |
| 1.3.4 Orientation | AA | Responsive layouts, mobile and tablet views | Viewport review | Not recorded | Needs review | | | |
| 1.3.5 Identify Input Purpose | AA | Applicant personal info and auth inputs | Axe and accessibility tree | Not recorded | Needs review | | | |
| 1.3.6 Identify Purpose | AAA | Navigation icons, LMS controls, form actions | Accessibility tree and content review | Not recorded | Needs review | | | |
| 1.4.1 Use of Color | A | Status chips, application indicators, links | Visual review | Not recorded | Needs review | | | |
| 1.4.2 Audio Control | A | AudioRecorder feedback and media players | Audio review | Not recorded | N/A with rationale | | | No auto-playing background audio present |
| 1.4.3 Contrast (Minimum) | AA | Light and dark themes across all surfaces | Axe and visual review | Not recorded | Needs review | | | |
| 1.4.4 Resize Text | AA | 200% and 400% zoom across learning content | Zoom and reflow review | Not recorded | Needs review | | | |
| 1.4.5 Images of Text | AA | Hero banners, program graphics, badges | Visual review | Not recorded | Needs review | | | |
| 1.4.6 Contrast (Enhanced) | AAA | Educational text, lesson body, form labels | Axe and visual review | Not recorded | Needs review | | | |
| 1.4.10 Reflow | AA | 320px mobile viewport, drawer navigation | Responsive review | Not recorded | Needs review | | | |
| 1.4.11 Non-text Contrast | AA | Focus rings, form borders, chip outlines | Axe and visual review | Not recorded | Needs review | | | |
| 1.4.12 Text Spacing | AA | Rich text lesson articles and long-form copy | Text-spacing review | Not recorded | Needs review | | | |
| 1.4.13 Content on Hover or Focus | AA | Mentor preview tooltips and action popovers | Keyboard and pointer review | Not recorded | Needs review | | | |
| 2.1.1 Keyboard | A | All application steps, quizzes, navigation | Keyboard review | Not recorded | Needs review | | | |
| 2.1.2 No Keyboard Trap | A | Mobile drawer, dialogs, scheduling modals | Keyboard review | Not recorded | Needs review | | | |
| 2.1.4 Character Key Shortcuts | A | Platform shortcuts, if applicable | Keyboard review | Not recorded | N/A with rationale | | | No single-character shortcuts enabled |
| 2.2.1 Timing Adjustable | A | Quiz timer and application autosave | Timing review | Not recorded | Needs review | | | |
| 2.2.2 Pause, Stop, Hide | A | Avatar animations, hero banner motions | Motion review | Not recorded | Needs review | | | |
| 2.3.1 Three Flashes or Below Threshold | A | Application UI and video materials | Motion review | Not recorded | Needs review | | | |
| 2.4.1 Bypass Blocks | A | Skip link in DefaultLayout | Axe and keyboard | Not recorded | Needs review | | | |
| 2.4.2 Page Titled | A | Route-specific document titles | Axe and document review | Not recorded | Needs review | | | |
| 2.4.3 Focus Order | A | Multi-step application tabs and modals | Keyboard review | Not recorded | Needs review | | | |
| 2.4.4 Link Purpose (In Context) | A | Program cards, alumni spotlights, articles | Axe and screen reader | Not recorded | Needs review | | | |
| 2.4.5 Multiple Ways | AA | Program directory, search, header navigation | Navigation review | Not recorded | Needs review | | | |
| 2.4.6 Headings and Labels | AA | Form field labels and semantic heading hierarchy | Axe and accessibility tree | Not recorded | Needs review | | | |
| 2.4.7 Focus Visible | AA | All interactive controls, inputs, buttons | Keyboard and visual review | Not recorded | Needs review | | | |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Sticky headers, floating actions, modals | Keyboard and viewport review | Not recorded | Needs review | | | |
| 2.4.12 Focus Not Obscured (Enhanced) | AAA | Sticky navigation and mobile drawer | Keyboard and viewport review | Not recorded | Needs review | | | |
| 2.4.13 Focus Appearance | AAA | Interactive buttons, inputs, links | Visual review | Not recorded | Needs review | | | |
| 2.5.1 Pointer Gestures | A | Carousel navigation and swipeable cards | Touch review | Not recorded | Needs review | | | |
| 2.5.2 Pointer Cancellation | A | Application submission and button actions | Pointer review | Not recorded | Needs review | | | |
| 2.5.3 Label in Name | A | Icon buttons and accessible action names | Accessibility tree | Not recorded | Needs review | | | |
| 2.5.4 Motion Actuation | A | Avatar motion and gesture interactions | Motion review | Not recorded | N/A with rationale | | | No motion-actuated device controls |
| 2.5.5 Target Size (Enhanced) | AAA | Mobile drawer items, primary form buttons | Touch and visual review | Not recorded | Needs review | | | |
| 2.5.7 Dragging Movements | AA | File drag-and-drop upload | Touch and keyboard review | Not recorded | N/A with rationale | | | File upload supports native file picker alternative |
| 2.5.8 Target Size (Minimum) | AA | Form controls, chips, pagination buttons | Touch and visual review | Not recorded | Needs review | | | |
| 3.1.1 Language of Page | A | HTML lang attribute for English and Yoruba | DOM and screen reader | Not recorded | Needs review | | | |
| 3.1.2 Language of Parts | AA | Multi-language Yoruba terms and passages | DOM and content review | Not recorded | Needs review | | | |
| 3.1.3 Unusual Words | AAA | STEM academic terminology and glossaries | Content review | Not recorded | Needs review | | | |
| 3.2.1 On Focus | A | Form fields and navigation controls | Keyboard review | Not recorded | Needs review | | | |
| 3.2.2 On Input | A | Dynamic form steps and select filters | Keyboard review | Not recorded | Needs review | | | |
| 3.2.3 Consistent Navigation | AA | Application header, mobile drawer, footer | Cross-route review | Not recorded | Needs review | | | |
| 3.2.4 Consistent Identification | AA | Program badges, status chips, action icons | Cross-route review | Not recorded | Needs review | | | |
| 3.3.1 Error Identification | A | Scholarship application validation errors | Form and screen-reader review | Not recorded | Needs review | | | |
| 3.3.2 Labels or Instructions | A | Form inputs, document upload guidelines | Accessibility tree | Not recorded | Needs review | | | |
| 3.3.3 Error Suggestion | AA | Application form correction guidance | Form review | Not recorded | Needs review | | | |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Scholarship application final submission | Form review | Not recorded | Needs review | | | |
| 3.3.5 Help | AAA | Contextual help icons and application FAQs | Content review | Not recorded | Needs review | | | |
| 3.3.6 Error Prevention (All) | AAA | All form submissions and application reviews | Form review | Not recorded | Needs review | | | |
| 4.1.2 Name, Role, Value | A | Custom Vue UI components (select, dialog) | Axe and accessibility tree | Not recorded | Needs review | | | |
| 4.1.3 Status Messages | AA | Toast notifications and autosave updates | Screen reader review | Not recorded | Needs review | | | |

## Manual sign-off

| Review environment | Reviewer | Date | Status | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| Keyboard only, Chromium | Accessibility team | 2026-09-26 | Needs review | Not recorded | Initial review scheduled |
| VoiceOver with Safari on macOS | Accessibility team | 2026-09-26 | Needs review | Not recorded | Initial review scheduled |
| NVDA with Firefox on Windows | Accessibility team | 2026-09-26 | Needs review | Not recorded | Initial review scheduled |
| 200% and 400% zoom, 320px reflow | Accessibility team | 2026-09-26 | Needs review | Not recorded | Initial review scheduled |
| Light, dark, reduced motion, and forced colors | Accessibility team | 2026-09-26 | Needs review | Not recorded | Initial review scheduled |

## Exceptions

Exceptions are scoped test dispositions, not accessibility waivers. Each exception requires documented impact, mitigation, ownership, follow-up, and evidence before release.

| Scope | Reason | User impact | Mitigation | Owner | Follow-up date | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Multi-layer avatar SVG generator | Layered SVG illustration components with transparent overlapping parts | Automated contrast scanners cannot classify layered avatar paths | Avatars are marked with accessible alt text or role="img" with name; non-essential decorative layers aria-hidden | Design team | 2026-10-15 | Visual contrast confirmed; accessible name verified |
| Rich text editor rendered HTML content `.tiptap-content` | User-authored rich text formatting in course lessons | Dynamic user-generated heading levels and inline markup | Editor enforces semantic tags (h2, h3, p, lists) and strips invalid styling | Frontend team | 2026-10-15 | Schema sanitization ensures valid semantic hierarchy |
