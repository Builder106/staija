# LMS screenshot harness

Captures every screen in the LMS — public, admin, student, mentor — to
`tools/screenshot-lms/out/`.

## One-time prep

1. **Dev server running** at `http://localhost:5190` (`npm run dev`). If
   another process is on 5190, set `STAIJA_URL=http://localhost:<port>`
   when running the harness.
2. **Demo content seeded** in Contentful and mirrored to Firestore:

   ```bash
   npm run lms:seed
   ```

   You should now see `cms_courses`, `cms_modules`, `cms_lessons`, and
   `cms_assignmentSpecs` documents in the Firestore console (env =
   `staging` per `.env.local`).
3. **An `admin` account.** The harness elevates demo accounts to
   `student`/`mentor` via `/admin/users`, and only an `admin` can assign
   the `student` role. If your only account is `staff`, you'll need to
   either (a) temporarily set `role: "admin"` on your user doc in
   Firestore, or (b) use a separate admin account.

## Running

```bash
# Optional: skip the manual sign-in popup by exporting email/password creds
# (admin or staff role). They stay in your shell — never written to disk
# beyond the resulting storageState. Required scope: `manage_users`.
export STAIJA_ADMIN_EMAIL='admin@example.com'
export STAIJA_ADMIN_PASSWORD='…'

# First time:
#   - With env vars set: fully headless.
#   - Without: opens a window for you to sign in (Google or otherwise).
node tools/screenshot-lms/capture.cjs auth

# Once auth states are saved, run the rest non-interactively:
node tools/screenshot-lms/capture.cjs roles
node tools/screenshot-lms/capture.cjs cohort
node tools/screenshot-lms/capture.cjs extras
node tools/screenshot-lms/capture.cjs capture

# Or do it all in one shot (still pauses for the manual Google sign-in):
node tools/screenshot-lms/capture.cjs all
```

Each phase is independently re-runnable. `auth` skips accounts whose
`storageState` already exists; `roles` skips users already at the target
role; `cohort` skips creation if a cohort named "Demo cohort —
screenshot harness" exists.

## What gets created

| Account | Email | Role | Use |
| --- | --- | --- | --- |
| Staff | (your Google account) | admin temporarily | All `/admin/*` |
| Demo applicant | `staija.demo.applicant@example.com` | applicant | `/applicant/*`, role-modal screenshot |
| Demo student | `staija.demo.student@example.com` | student | `/student/*`, `/learn/*` |
| Demo mentor | `staija.demo.mentor@example.com` | mentor | `/mentor/*`, `/learn/mentor/*` |

Plus a cohort, an enrollment, a submission, and a scheduled session so
all `:id` routes have real data to render.

## Output

```text
tools/screenshot-lms/out/
├── public/        13 screens (home, blog, login, signup, 404, …)
├── admin/         15+ screens including content/* edit pages and modals
├── applicant/     5 screens
├── student/       5 screens
├── learn/         module / lesson / assignment / submission / session
└── mentor/        dashboard, schedule, student detail, submission review, feedback
```

## Resetting

Delete `tools/screenshot-lms/.auth/` and `tools/screenshot-lms/.state/`
to start clean. The demo Firebase accounts persist across runs — to wipe
them, do it in the Firebase console.

## Known gaps

- **Alumni routes** (`/alumni/*`) aren't captured — staff role can't
  promote a clean account to `alumni → mentor → student → alumni` cleanly,
  and creating a fourth demo account is more work than it's worth for
  four routes. Add manually if needed.
- The harness uses heuristic CSS selectors for the cohort form; if the
  form changes, those selectors might need updating — `cohort` is the
  most fragile phase.
- 404 capture uses a route that doesn't exist. The router catch-all
  renders `/views/NotFound.vue`.
