# LMS demo seeder

Populate the LMS with editable demo courses so you can iterate on the
admin UI and the learner views without writing curriculum from scratch.

## What it creates

Two demo courses, one per program:

- **Research Foundations** (StepUp Scholars, `2026-spring`) — 2 modules,

  6 lessons, 2 assignment specs.

- **Dynamerge Bootcamp — Week 1** (Dynamerge, `2026-summer`) — 2 modules,

  5 lessons, 2 assignment specs.

Every entry's Contentful `sys.id`and`slug`is prefixed with`demo-`,
so the cleanup command can find and remove them without touching real
content.

## Run it

```sh

# Create (or update) demo entries

npm run lms:seed

# Preview what would be deleted

npm run lms:clear -- --dry-run

# Actually delete every entry whose ID starts with `demo-`

npm run lms:clear
```

Re-running `lms:seed` is safe — entries are upserted by deterministic ID,
so a second run just patches the existing demos.

## Environment isolation

The seeder writes to whichever Contentful environment your env config
points at. To keep demo content out of production:

- `.env` holds the shared defaults (`VITE_CONTENTFUL_ENV_ID=master`).
- `.env.local` (gitignored) overrides per-machine. The default committed

  setup points it at the `staging` environment so seeds and edits never
  touch master.

- The seeder loads both files in order, so the override always wins.

A safety guard refuses to seed or clear against `master` unless you
pass `--force`. If you've removed `.env.local`and your`.env` still
says `master`, you'll see:

```text
Refusing to seed against the 'master' Contentful environment.
Set VITE_CONTENTFUL_ENV_ID=staging in .env.local … or pass --force.
```

### One-time setup on a new machine

Create `.env.local` with:

```dotenv
VITE_CONTENTFUL_ENV_ID=staging
```

The space ID, delivery/preview/management tokens stay in `.env` — only
the environment differs.

### Webhook setup gotchas

The seed pipeline only works end-to-end if the Contentful webhook fires
correctly. Setting it up the first time hit four traps worth knowing:

1. **`invoker: 'public'`** — v2 Cloud Run functions reject unauthenticated

   calls by default. Webhooks can't sign IAM tokens, so the function
   must opt into public invocation. See
   [functions/src/contentful.ts](../../functions/src/contentful.ts).

2. **Body parser** — Contentful sends `Content-Type:

   application/vnd.contentful.management.v1+json`, which the default
   Express parser ignores. The function falls back to`req.rawBody` and
   parses JSON manually.

3. **Default environment scope is master only** — despite Contentful's

   docs implying "no filter = all environments", a webhook with no
   filter only fires for master. To listen on staging *and* master you
   need an explicit filter:
   `{ in: [{ doc: 'sys.environment.sys.id' }, ['master', 'staging']] }`.
   `tools/lms-seed/repair-webhook.ts` recreates the webhook from
   scratch with the right config if you ever lose it.

4. **Don't use unpublish-then-publish to fire mirror events.** Two

   webhook events for one entry race in flight; the delete can arrive
   after the publish and leave the mirror doc missing. The `republish`
   command uses `update + publish` so each entry produces a single
   event.

### Webhook isolation

The webhook fires for both `master`and`staging`, mirroring into the
same Firestore project. The `demo-` slug prefix prevents demo and real
content from colliding in `cms_*`collections.`npm run lms:clear`
removes demo entries from both sides via the unpublish/delete event.

## How the data flows

The script writes via the Contentful Management API. When each entry is
published, the [contentfulWebhook](../../functions/src/contentful.ts)
Cloud Function mirrors the entry into Firestore — the same path as a
human creating content in the admin UI. From there:

- `/admin/content/courses` lists the demo courses for editing.
- The learner view (`/learn/...`) loads them from the Firestore mirror.

If your webhook isn't deployed (e.g. fresh local stack), the entries
will exist in Contentful but not in Firestore. Open each one in the
admin UI and republish to fire the webhook, or deploy the function.

## Editing the demo content

Open `seed.ts`and edit the`COURSES`array. Re-run`npm run lms:seed`
to apply changes. Field shapes match
[lmsContent.ts](../../src/services/lmsContent.ts):

- Lesson `body`and assignment`instructions` are Contentful RichText

  documents. The `richTextDoc()` helper takes plain paragraphs; if you
  need headings or formatting, build the document by hand.

- Module `unlockRule`is`'sequential'`or`'open'`.
- Lesson `completionCriteria`is`'viewed' | 'assignment_submitted' |

  'quiz_passed'`.
