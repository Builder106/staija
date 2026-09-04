# STAIJA Roadmap

High-level roadmap and feature development goals for STAIJA.

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
