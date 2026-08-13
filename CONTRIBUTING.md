# Contributing

Thanks for your interest. STAIJA is a small nonprofit project — most contributions are coordinated with the maintainer before code is written, so the fastest path is opening an issue first and aligning on scope.

## Scope and direction

[`docs/PRD.md`](./docs/PRD.md) is the source of truth for what's in scope, what milestone it belongs to, and how it should behave. Per-milestone integration checklists live alongside it ([`docs/M*-CHECKLIST.md`](./docs/)). Read the relevant section before starting on a substantial change — it'll save us both time.

Out-of-scope ideas are welcome as issues, but please don't open a PR for one without discussion.

## Local setup

```bash

# 1. Install

npm install

# 2. Environment

#    .env is gitignored. Ask the maintainer for development values, or

#    follow docs/INFRASTRUCTURE.md for the full secret inventory

# 3. Dev server (http://localhost:5190)

npm run dev
```

Cloud Functions live in [`functions/`](./functions) with their own `package.json`. Functions secrets are stored in Firebase Secret Manager — see the README for the rotation commands.

## Tests

```bash
npm test             # vitest run, single pass
npm run test:watch   # watch mode
```

A few conventions:

- Prefer accessible selectors (`getByRole`, `getByLabel`, `getByText`) over CSS or `data-testid`. If you need a test id, the element is probably under-labeled.
- Service-layer tests mock Firebase. Don't reach for real network in unit tests.
- Component tests use `@vue/test-utils`with`happy-dom`. The localStorage shim in [`tests/setup.ts`](./tests/setup.ts) is required — vitest 4 + happy-dom 20 ships a non-functional native impl.

## Commits

- One concern per commit. If you're touching two unrelated things, split them.
- Title: short, sentence-case, imperative mood. Match the existing `git log --oneline` style.
- Body: explain the *why*. The diff already shows the *what*. If a commit fixes a non-obvious bug or makes a counter-intuitive choice, the body is where future-you finds out why.
- No `Co-Authored-By:` trailers attributing work to AI tools. Authorship goes to the human contributor.

## Pull requests

- Branch from `main`. Target `main`. Rebase rather than merge for personal branches; we don't squash on landing.
- If the PR is WIP, open it as a draft. CI runs on draft PRs too.
- Link the relevant milestone checklist line or PRD section. If neither applies, explain in the description why this is in scope.
- Vercel will publish a preview URL on every push. Verify the change in the preview before requesting review — type checking and tests verify code correctness, not feature correctness.

## Style

- TypeScript is strict. Prefer typed components over loose `any`.
- Vue SFCs use `<script setup lang="ts">` and the Composition API. Don't introduce Options API code.
- Tailwind tokens (`bg-paper`, `bg-surface`, `text-ink`, etc.) are theme-aware — use them instead of literal colors. The `*-static` variants opt out of dark-mode flipping for surfaces that should stay locked (footer, locale popover).
- Comments earn their place. Document the *why* and any non-obvious constraint; skip restating what the code already says.

## Reporting issues

Bugs, security concerns, and feature requests all go through GitHub Issues. For anything sensitive (secrets exposure, auth bypass, applicant data), email the maintainer directly rather than filing a public issue.

## License

By contributing, you agree that your contributions will be licensed under the MIT License — see [`LICENSE`](./LICENSE).
