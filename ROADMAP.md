# STAIJA Roadmap

High-level roadmap and feature development goals for STAIJA.

## LMS production readiness

The LMS has course, lesson, assignment, session, quiz, and authoring code, but
the live learner flow is not ready to call complete. The client region and
Content Security Policy fixes are live on the staging site. The LMS Functions
and Firestore rules were deployed to staging on 2026-10-21. The AI authoring,
lesson media, and tutor callables were refreshed after the outliner smoke test
found a retired Groq model ID.
The `quiz` content type and lesson reference are published in staging
Contentful; production still lacks them. Production's two published courses
are demo content; a third course has its `published` field set to `false`.
On 2026-10-21, the authenticated staff content tree loaded in staging. All nine
`lmsContentAdmin` requests returned HTTP 200, and the page showed the QA draft
alongside the two published demo courses.
Staging now has dedicated student and mentor QA accounts. User management shows
the student role, and the student is enrolled in both planned demo cohorts.
The mentor accepted the email-restricted invite; the mentor portal shows both
assignments. The student can sign in, and the Security panel confirms the
student email is verified. Account Settings now confirms the mentor email is
verified; an earlier attempt to use its verification link reported that it
was expired or already used. The two existing staging course entries and 19
linked demo entries were republished: four modules, eleven lessons, and four
assignment specs. The learner page now lists five Dynamerge lessons, and the
"Hello, world!" lesson opens. The StepUp Lab Safety lesson body also opens
directly. Browser traces identified progress and quiz-attempt reads that
omitted owner filters required by Firestore rules. Commit
[`61fcd2d`](https://github.com/Builder106/staija/commit/61fcd2d63bb661e37229db9ec055e40fa65a440f)
adds the owner filters and supporting indexes. The commit is deployed to
staging, and the version endpoint reports that SHA. The learner course now
loads five lessons and displays `0 of 5` progress. The StepUp lesson opens
without a Firestore permissions error, but shows "Quiz details could not be
found." No quiz entry exists for that lesson, so quiz-attempt history and
completion remain unverified. Signed commit
[`73e0241`](https://github.com/Builder106/staija/commit/73e0241eabc254f79cdbe07fb44703a800906151)
adds a course chooser and carries the selected course into lesson links. The
commit is deployed to staging, and the version endpoint reports that SHA. The
signed-in student can switch between StepUp, with six lessons, and Dynamerge,
with five. The StepUp Lab Safety lesson returns to the StepUp course, but its
quiz panel still cannot find quiz details.
The published StepUp summary also contains the test text "Testing, testing".
Profile creation invokes the welcome-email trigger for each account, and each
cohort enrollment attempted another email to the student. Delivery is
unconfirmed. Signed commit
[`27bb46e`](https://github.com/Builder106/staija/commit/27bb46ee494b10fc3a8e251d6202d4ed9f314f81)
formats these dates in UTC. Component tests confirm May 1 through May 28 stays
unchanged in New York and Los Angeles. The commit is deployed to staging.
Production curriculum publication remains a release gate.

On 2026-10-22, signed merge `c45fc9a` was pushed to staging and its version
endpoint returned that SHA. GitHub CI passed. The signed-in QA student can open
both demo courses, see six StepUp lessons, and open Lab Safety without a
Firestore permission error. The lesson still has no quiz entry, so quiz
completion remains unverified. The StepUp summary still contains the
"Testing, testing" placeholder.

On 2026-10-22, the QA student completed "What is research methodology?" in
staging. `completeLesson` returned HTTP 200, and StepUp progress changed from
0 of 6 to 1 of 6. All 42 XHR/fetch requests on the StepUp course page returned
HTTP 200. Lab Safety still has no quiz entry, and the course summary still
contains the placeholder. A mailbox search found a Firebase verification
thread for the QA accounts but no welcome or enrollment message. Welcome-email
delivery remains unconfirmed. The browser still reports the blocked Vercel
feedback script, an unload policy violation, and a browser-blocked resource;
the LMS requests succeeded.

Mentor QA on 2026-10-22 showed both assigned cohorts, but opening an assigned
student's detail page returned `Missing or insufficient permissions.` The
page read profiles and submissions without the mentor scope required by
Firestore rules. The prepared staging change adds a callable that checks the
caller's role and, for mentors, active assignments before returning a
student's UID, name, and email. It also filters enrollment and submission
reads by mentor ID and adds the supporting composite index. The Functions
high-severity audit and build pass; two moderate UUID advisories remain
through `gaxios`. Deploy the callable and index before pushing the frontend,
then recheck the mentor page in staging.

- [x] Set the client Functions region to `africa-south1` and allow the production
  and staging Functions origins in the site's Content Security Policy.
- [x] Prepare the `quiz` schema migration for both Contentful environments.
  Keep quiz answer keys in server-only Firestore documents, exclude them from
  Contentful and the learner mirror, and check lesson and course membership
  before granting progress.
- [x] Apply and verify the `quiz` content type and `lesson.quiz` reference in
  staging Contentful. No curriculum entries were published.
- [x] Deploy the Functions, rules, and site changes to staging.
- [x] Deploy the AI callables and confirm a one-module outline creates only
  unpublished entries in staging Contentful.
- [x] Confirm the authenticated staff content tree loads without callable or
  schema errors.
- [ ] Apply the schema migration to production Contentful during the production
  release, after staging checks pass.
- [ ] Prepare reviewed curriculum and cohort assignments for production. Keep
  demo courses out of the production learner catalog. Curriculum publication
  is a release gate.
- [x] Register a staging-only student account and assign the student role
  through user management.
- [x] Register a staging-only mentor account, accept the restricted invite,
  and add the mentor to both QA cohorts.
- [x] Confirm the student email is verified in account settings.
- [x] Confirm the mentor email is verified in account settings.
- [x] Create planned QA cohorts from the published StepUp and Dynamerge demo
  courses, pinned to their current versions.
- [x] Enroll the test student in both QA cohorts.
- [ ] Confirm delivery status of the account and enrollment welcome emails.
- [x] Republish the two existing staging demo course entries.
- [x] Republish the linked staging demo modules, lessons, and assignments.
- [x] Add student/mentor owner filters to progress reads and student filters
  to quiz-attempt reads; define supporting Firestore indexes.
- [x] Deploy the owner-filter and index changes to staging; verify the
  learner course and progress reads.
- [x] Prepare mentor-scoped profile, enrollment, and submission reads and the
  supporting index. Staging deployment and authenticated browser verification
  remain open.
- [ ] Verify quiz-attempt reads and completion after reviewed StepUp quiz
  content is available.
- [ ] Prepare reviewed staging quiz content for StepUp Lab Safety; no matching
  quiz entry exists, so quiz completion cannot be tested yet.
- [x] Verify StepUp course selection in staging. The course chooser switches
  between the student's StepUp and Dynamerge enrollments, and StepUp lesson
  links retain the selected course. Quiz completion remains unverified until
  reviewed quiz content is available.
- [ ] Remove the "Testing, testing" placeholder from the StepUp demo summary
  before using it as learner-facing test content.
- [x] Format date-only cohort values in UTC and verify their display in New
  York and Los Angeles before production.
- [ ] Run authenticated staff, student, and mentor checks from authoring and
  publication through the Firestore mirror, enrollment, lesson unlock,
  assignment submission and grading, sessions and RSVPs, and quiz completion.
  Check App Check, browser console errors, and callable responses in staging
  before repeating the release checks in production.

Complete this before expanding the tutor in v1.3. The milestone is done when
those flows work with real course content and the staff content page loads
without the current callable or schema errors.

## v1.1 — Brand Asset Kit & Marketing Automation

- **Vectorized Brand Asset Pipeline**: Full integration of high-resolution SVGs, dark/light variations, and automated export workflows.
- **Micro-Interaction Polish**: Dynamic header transitions, particle micro-motion, and viewport-aware scroll interactions.
- **Mobile Responsive Performance**: Strict LCP < 1.2s optimization across responsive breakpoints.

## v1.2 — Interactive Studio & Showcase

- **Component Showcase**: Live demo playground for design tokens and interactive marketing components.
- **HyperFrames video production**: Maintain the Tier 2 social cut and Tier 3 trailer as HTML, CSS, and GSAP compositions.

## v1.3 — Full-History AI Tutor & Interactive Whiteboard

Build a clean-room STAIJA implementation inspired by ChatTutor's public interaction model: progressive tutoring responses, structured whiteboard pages, diagrams, notes, and teaching workflows. Do not copy ChatTutor source, prompts, tests, assets, or components. ChatTutor is AGPLv3-licensed; review the [ChatTutor license](https://github.com/HugeCatLab/ChatTutor/blob/main/LICENSE) and [AGPL section 13](https://www.gnu.org/licenses/agpl-3.0.en.html#section13) before implementation.

### Product scope

- **Streaming tutor**: Extend the existing `askLmsTutor` callable with Firebase callable streaming while retaining complete-response fallback. Use server `sendChunk()` and client `.stream()`; do not add ChatTutor's Elysia/WebSocket/PostgreSQL stack. See the [Firebase callable streaming documentation](https://firebase.google.com/docs/functions/callable).
- **Whiteboard pages**: Support Mermaid, structured interactive geometry, notes with KaTeX, and learner/mentor freehand drawing. AI-generated pages may contain only typed Mermaid source, allowlisted geometry JSON, or safe note content; freehand pages are user-authored.
- **Geometry engine**: Use JSXGraph under its MIT licensing option after dependency review. It provides interactive geometry and function plotting; do not use GeoGebra. See the [JSXGraph repository and licensing](https://github.com/jsxgraph/jsxgraph) and [getting-started documentation](https://www.jsxgraph.org/home/start/gettingstarted/).
- **Full history**: Archive account-wide tutor sessions, messages, pages, annotations, and page revisions. Keep cross-lesson memory enabled by default through a bounded server-generated summary, never by sending the complete raw archive to the model. Provide a learner setting to disable memory use without deleting the archive.
- **Mentor access**: Assigned mentors can read their learners' tutor history and add immediately visible annotations. Learner and AI page revisions remain immutable; mentors cannot overwrite learner-authored content. Live co-editing is out of scope.

### Implementation contract

Keep the existing `askLmsTutor` callable name and add dual-mode behavior:

```ts
type AskLmsTutorInput = {
  sessionId?: string;
  lessonId: string;
  studentQuestion: string;
  clientMessageId: string;
  questionContext?: {
    questionId?: string;
    questionText?: string;
    studentAnswer?: string;
    correctAnswer?: string;
    explanation?: string;
  };
};

type TutorPageKind = "mermaid" | "geometry" | "notes" | "freehand";

type TutorStreamEvent =
  | { type: "message-start"; sessionId: string; messageId: string }
  | { type: "text-delta"; messageId: string; text: string }
  | { type: "page-start"; pageId: string; kind: TutorPageKind }
  | { type: "page-complete"; page: TutorPageSnapshot }
  | { type: "suggestions"; items: string[] }
  | { type: "done"; sessionId: string; messageId: string }
  | { type: "error"; code: string; retryable: boolean };
```

Each stream chunk must include protocol version and sequence number. The parser must preserve state across arbitrary chunk boundaries, reject malformed or unsupported blocks, and never pass executable model output to the browser.

The server must load authoritative lesson, course, enrollment, and assignment context from Firebase rather than trusting client-submitted lesson body text. Validate all inputs with Zod, require authentication and App Check, enforce bounded history/page sizes and per-user usage limits, support cancellation/timeouts, and make retries idempotent through `clientMessageId`. Align the client Functions region with the deployed `africa-south1` region.

Persist tutor data under:

- `tutor_sessions/{sessionId}`
- `tutor_sessions/{sessionId}/messages/{messageId}`
- `tutor_sessions/{sessionId}/pages/{pageId}`
- `tutor_sessions/{sessionId}/pages/{pageId}/revisions/{revisionId}`
- `tutor_sessions/{sessionId}/pages/{pageId}/annotations/{annotationId}`
- `tutor_memory/{uid}`

Expose these callable operations:

- `askLmsTutor`
- `listTutorSessions`
- `getTutorSession`
- `saveTutorPage`
- `saveTutorAnnotation`
- `deleteTutorSession`
- `setTutorMemoryPreference`

Update account export and deletion to include tutor sessions, revisions, annotations, and generated memory. Recheck the active mentor assignment on every mentor read or annotation mutation.

### Subagent delivery plan

Use isolated worktrees with disjoint file ownership and merge in this order:

1. **Contract/backend subagent**: Freeze the protocol, add strict server schemas, implement Groq streaming and fallback responses, write the chunk parser, persist complete/interrupted messages, and add backend unit tests.
2. **Persistence/security subagent**: Add Firestore collections, indexes, callable history/page/annotation APIs, assignment authorization, memory summaries, security rules, export, and account-deletion handling.
3. **Whiteboard subagent**: Implement typed page components, strict Mermaid rendering, KaTeX-safe notes, JSXGraph geometry JSON, and an SVG-based freehand editor with normalized strokes, undo/redo, and revision snapshots.
4. **Tutor UI subagent**: Replace the current drawer flow with a streaming composable, history browser, responsive page navigator, stop/retry handling, auto-scroll preservation, mentor annotation views, focus management, Escape/backdrop behavior, safe-area handling, live status announcements, and reduced-motion support.
5. **Verification subagent**: Perform a read-only security, accessibility, license, and regression audit after integration. The coordinator owns shared files, package-lock changes, function exports, and the final `JOURNAL.md` decision entry.

### Security and rendering requirements

- Remove unrestricted model-generated HTML and replace it with an allowlisted renderer. Sanitize any remaining HTML and Mermaid SVG output.
- Set Mermaid to strict security mode.
- Render geometry only from validated JSXGraph construction data; prohibit `eval`, arbitrary JavaScript, remote scripts, and unrestricted SVG.
- Provide readable fallback text and accessible labels for KaTeX, diagrams, and freehand pages.
- Do not log message contents. Record only request IDs, latency, token/usage totals, parser failures, cancellation, and error categories.
- Run a dependency/SBOM license check covering both the web app and `functions/`; reject AGPL/GPL transitive dependencies unless separately approved.

### Tests and release gates

This feature adds unit, integration, and E2E CI coverage:

- **Unit/property**: Protocol schemas, arbitrary chunk boundaries, malformed blocks, event ordering, retry idempotency, memory bounds, geometry allowlists, and freehand serialization.
- **Integration**: Streaming and fallback callable paths, authentication, App Check, active mentor assignment checks, Firestore persistence, cancellation, export, deletion, and region configuration.
- **Component**: Drawer accessibility, progressive messages, page lifecycle, Mermaid failure fallback, KaTeX fallback, freehand controls, annotations, keyboard behavior, and reduced motion.
- **E2E**: Open tutor, stream text, render a page, stop and retry, recover from a network failure, preserve scroll position, reject unsafe output, persist/reload history, toggle cross-lesson memory, annotate as a mentor, and verify mobile/keyboard behavior.

Run the complete frontend and Functions typecheck, lint, format, unit test, build, Firestore rules, dependency, license, and E2E matrix on the designated Linux ARM64 verification environment. Release behind a `fullWhiteboardTutor` feature flag with the current tutor as fallback. Existing tutor usage needs no data migration; only new sessions use the archive model.

## Out of Scope

- Heavy third-party tracking libraries
- Generic non-responsive layout templates

---
For technical implementation specifications, see [`docs/specs/`](docs/specs/).
