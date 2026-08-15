<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import LmsOnboarding from '../../../components/admin/LmsOnboarding.vue';
import Body from '../../../components/ui/Body.vue';
import Container from '../../../components/ui/Container.vue';
import Eyebrow from '../../../components/ui/Eyebrow.vue';
import Heading from '../../../components/ui/Heading.vue';
import Section from '../../../components/ui/Section.vue';
import UiButton from '../../../components/ui/UiButton.vue';
import { useAdminBase } from '../../../composables/useAdminBase';
import {
  createEntry,
  deleteEntry,
  listEntries,
  normalizeSlug,
  publishEntry,
  unpublishEntry,
  updateEntry,
  type EntrySummary,
} from '../../../services/lmsContent';

const router = useRouter();
const { adminBase } = useAdminBase();

const loading = ref(true);
const error = ref<string | null>(null);

// Raw entries by id — indexed once on load so child resolution is O(1).
const courses = ref<EntrySummary[]>([]);
const modulesById = ref<Map<string, EntrySummary>>(new Map());
const lessonsById = ref<Map<string, EntrySummary>>(new Map());
const assignmentsById = ref<Map<string, EntrySummary>>(new Map());
const quizzes = ref<EntrySummary[]>([]);

// IDs that appeared in some parent's reference list. Anything in the
// full list but not referenced is an "orphan" — surfaced separately so
// editors can find content they've created but not yet attached.
const referencedModuleIds = ref<Set<string>>(new Set());
const referencedLessonIds = ref<Set<string>>(new Set());
const referencedAssignmentIds = ref<Set<string>>(new Set());

// Per-id expanded state. Defaults to collapsed; we expand the first
// course automatically after load so the tree isn't empty-looking.
const expanded = ref<Record<string, boolean>>({});

// Search query — when non-empty, the tree filters to nodes (title or
// slug) that match and auto-expands their ancestors so matches are
// visible without click-through.
const searchQuery = ref('');
const searchActive = computed(() => searchQuery.value.trim().length > 0);
const searchNeedle = computed(() => searchQuery.value.trim().toLowerCase());

function entryMatches(entry: EntrySummary): boolean {
  if (!searchActive.value) return true;
  const t = entryTitle(entry).toLowerCase();
  const s = entrySlug(entry).toLowerCase();
  return t.includes(searchNeedle.value) || s.includes(searchNeedle.value);
}

// id currently being added-to (so we can show a spinner on the right
// button). Null when idle.
const pendingParent = ref<string | null>(null);

// id currently being publish-all'd (course or module). Distinct from
// pendingParent so the two spinners can run independently. Unpublish
// has its own pair so a user can theoretically queue an unpublish on
// one branch while a publish runs on another — UX-wise we just don't
// show both buttons in the same in-flight state.
const publishingId = ref<string | null>(null);
const publishProgress = ref<{ done: number; total: number } | null>(null);
const unpublishingId = ref<string | null>(null);
const unpublishProgress = ref<{ done: number; total: number } | null>(null);

// Drag-and-drop reorder state. Reordering is scoped to a single parent
// + reference field (modules within a course, lessons within a module,
// assignments within a module) — no cross-parent moves in this pass.
type DragField = 'modules' | 'lessons' | 'assignments';
interface DragState {
  parentId: string;
  parentType: 'course' | 'module';
  field: DragField;
  childId: string;
  fromIndex: number;
  /** Insertion target — null when over an invalid drop zone. */
  overIndex: number | null;
}
const drag = ref<DragState | null>(null);

function onDragStart(
  e: DragEvent,
  parent: EntrySummary,
  field: DragField,
  childId: string,
  fromIndex: number
) {
  drag.value = {
    parentId: parent.id,
    parentType: parent.contentType === 'course' ? 'course' : 'module',
    field,
    childId,
    fromIndex,
    overIndex: null,
  };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // Firefox refuses to start a drag without some data set.
    e.dataTransfer.setData('text/plain', childId);
  }
}

function onDragOver(e: DragEvent, parentId: string, field: DragField, slotIndex: number) {
  if (!drag.value) return;
  if (drag.value.parentId !== parentId || drag.value.field !== field) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  drag.value.overIndex = slotIndex;
}

async function onDrop(e: DragEvent, parentId: string, field: DragField, slotIndex: number) {
  if (!drag.value) return;
  if (drag.value.parentId !== parentId || drag.value.field !== field) return;
  e.preventDefault();
  const from = drag.value.fromIndex;
  // slotIndex is the destination INSERTION point. If we're removing
  // from an earlier position, every later index shifts down by one —
  // adjust so dropping "after" the original slot lands where the user
  // visually expects.
  let to = slotIndex;
  if (to > from) to -= 1;
  drag.value = null;
  if (from === to) return;

  const parent =
    field === 'modules'
      ? courses.value.find(c => c.id === parentId)
      : modulesById.value.get(parentId);
  if (!parent) return;

  const order = extractRefIds(readField(parent, field));
  const [moved] = order.splice(from, 1);
  if (!moved) return;
  order.splice(to, 0, moved);

  try {
    if (parent.contentType === 'course') {
      await updateEntry(parent.id, {
        type: 'course',
        fields: {
          slug: entrySlug(parent),
          title: entryTitle(parent),
          program:
            readField<'stepup_scholars' | 'dynamerge'>(parent, 'program') ?? 'stepup_scholars',
          version: readField<string>(parent, 'version') ?? '',
          modules: order,
        },
      });
    } else {
      const payload: { slug: string; title: string; lessons?: string[]; assignments?: string[] } = {
        slug: entrySlug(parent),
        title: entryTitle(parent),
      };
      if (field === 'lessons') payload.lessons = order;
      else if (field === 'assignments') payload.assignments = order;
      await updateEntry(parent.id, { type: 'module', fields: payload });
    }
    await load();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Reorder failed.';
  }
}

function onDragEnd() {
  drag.value = null;
}

function dropIndicatorClass(parentId: string, field: DragField, slotIndex: number): string {
  if (!drag.value) return '';
  if (drag.value.overIndex !== slotIndex) return '';
  if (drag.value.parentId !== parentId || drag.value.field !== field) return '';
  return 'shadow-[inset_0_2px_0_0_var(--color-brand-violet,#8b55ff)]';
}

function endDropIndicatorClass(parentId: string, field: DragField, slotIndex: number): string {
  if (!drag.value) return '';
  if (drag.value.overIndex !== slotIndex) return '';
  if (drag.value.parentId !== parentId || drag.value.field !== field) return '';
  return 'border-brand-violet bg-brand-violet/5';
}

function isDragging(childId: string): boolean {
  return drag.value?.childId === childId;
}

// ---- Side-drawer quick-edit -----------------------------------------
//
// Light-weight editing surface that handles the common cases (rename a
// node, fix a slug, toggle publish, delete) without leaving the tree.
// The deep work — rich-text body, video URL, AI media assist — still
// lives in the full editor pages; the drawer links there explicitly.

interface DrawerForm {
  slug: string;
  title: string;
}
const drawerEntry = ref<EntrySummary | null>(null);
const drawerForm = ref<DrawerForm>({ slug: '', title: '' });
const drawerSaving = ref(false);
const drawerActing = ref(false);
const drawerError = ref<string | null>(null);

// For modules/lessons/assignments we need the parent so delete can also
// patch the reference array. Computed off the open entry.
const drawerParent = computed<EntrySummary | null>(() => {
  const e = drawerEntry.value;
  if (!e) return null;
  if (e.contentType === 'module') {
    return courses.value.find(c => extractRefIds(readField(c, 'modules')).includes(e.id)) ?? null;
  }
  if (e.contentType === 'lesson') {
    for (const mod of modulesById.value.values()) {
      if (extractRefIds(readField(mod, 'lessons')).includes(e.id)) return mod;
    }
    return null;
  }
  if (e.contentType === 'assignmentSpec') {
    for (const mod of modulesById.value.values()) {
      if (extractRefIds(readField(mod, 'assignments')).includes(e.id)) return mod;
    }
    return null;
  }
  return null;
});

function openDrawer(entry: EntrySummary) {
  drawerEntry.value = entry;
  drawerForm.value = { slug: entrySlug(entry), title: entryTitle(entry) };
  drawerError.value = null;
}
function closeDrawer() {
  drawerEntry.value = null;
  drawerError.value = null;
}

const drawerEditPath = computed(() => {
  const e = drawerEntry.value;
  if (!e) return '';
  const base = `${adminBase.value}/content`;
  if (e.contentType === 'course') return `${base}/courses/${e.id}`;
  if (e.contentType === 'module') return `${base}/modules/${e.id}`;
  if (e.contentType === 'lesson') return `${base}/lessons/${e.id}`;
  if (e.contentType === 'quiz') return `${base}/quizzes/${e.id}`;
  return `${base}/assignments/${e.id}`;
});

function drawerTypeLabel(e: EntrySummary): string {
  if (e.contentType === 'course') return 'Course';
  if (e.contentType === 'module') return 'Module';
  if (e.contentType === 'lesson') return 'Lesson';
  if (e.contentType === 'quiz') return 'Quiz';
  return 'Assignment';
}

async function drawerSave() {
  const e = drawerEntry.value;
  if (!e) return;
  drawerSaving.value = true;
  drawerError.value = null;
  try {
    const slug = normalizeSlug(drawerForm.value.slug);
    const title = drawerForm.value.title.trim() || '(untitled)';
    if (e.contentType === 'course') {
      await updateEntry(e.id, {
        type: 'course',
        fields: {
          slug,
          title,
          program: readField<'stepup_scholars' | 'dynamerge'>(e, 'program') ?? 'stepup_scholars',
          version: readField<string>(e, 'version') ?? '',
        },
      });
    } else if (e.contentType === 'module') {
      await updateEntry(e.id, { type: 'module', fields: { slug, title } });
    } else if (e.contentType === 'lesson') {
      await updateEntry(e.id, { type: 'lesson', fields: { slug, title } });
    } else {
      await updateEntry(e.id, {
        type: 'assignmentSpec',
        fields: {
          slug,
          title,
          submissionType:
            readField<'text' | 'file' | 'link' | 'text_or_file'>(e, 'submissionType') ?? 'text',
        },
      });
    }
    await load();
    closeDrawer();
  } catch (err) {
    drawerError.value = (err as { message?: string }).message ?? 'Save failed.';
  } finally {
    drawerSaving.value = false;
  }
}

async function drawerTogglePublish() {
  const e = drawerEntry.value;
  if (!e) return;
  drawerActing.value = true;
  drawerError.value = null;
  try {
    if (e.isPublished) await unpublishEntry(e.id);
    else await publishEntry(e.id);
    await load();
    closeDrawer();
  } catch (err) {
    drawerError.value = (err as { message?: string }).message ?? 'Action failed.';
  } finally {
    drawerActing.value = false;
  }
}

async function drawerDelete() {
  const e = drawerEntry.value;
  if (!e) return;
  if (!confirm(`Delete "${entryTitle(e)}"? This can't be undone.`)) return;
  drawerActing.value = true;
  drawerError.value = null;
  try {
    const parent = drawerParent.value;
    if (parent) {
      const field: DragField =
        e.contentType === 'module'
          ? 'modules'
          : e.contentType === 'lesson'
            ? 'lessons'
            : 'assignments';
      const order = extractRefIds(readField(parent, field)).filter(id => id !== e.id);
      if (parent.contentType === 'course') {
        await updateEntry(parent.id, {
          type: 'course',
          fields: {
            slug: entrySlug(parent),
            title: entryTitle(parent),
            program:
              readField<'stepup_scholars' | 'dynamerge'>(parent, 'program') ?? 'stepup_scholars',
            version: readField<string>(parent, 'version') ?? '',
            modules: order,
          },
        });
      } else {
        const payload: { slug: string; title: string; lessons?: string[]; assignments?: string[] } =
          {
            slug: entrySlug(parent),
            title: entryTitle(parent),
          };
        if (field === 'lessons') payload.lessons = order;
        else if (field === 'assignments') payload.assignments = order;
        await updateEntry(parent.id, { type: 'module', fields: payload });
      }
    }
    await deleteEntry(e.id);
    await load();
    closeDrawer();
  } catch (err) {
    drawerError.value = (err as { message?: string }).message ?? 'Delete failed.';
  } finally {
    drawerActing.value = false;
  }
}

// ---- Field readers ---------------------------------------------------
//
// EntrySummary.fields holds the locale-stripped raw Contentful values:
// reference arrays look like [{ sys: { id, linkType: 'Entry' } }, ...].
// These helpers pull a clean string[] out.

function extractRefIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const id = (v as { sys?: { id?: string } } | null)?.sys?.id;
    if (typeof id === 'string' && id.length > 0) out.push(id);
  }
  return out;
}

function readField<T = string>(entry: EntrySummary, name: string): T | undefined {
  return (entry.fields as Record<string, unknown>)[name] as T | undefined;
}

function entryTitle(entry: EntrySummary): string {
  return readField<string>(entry, 'title') ?? '(untitled)';
}

function entrySlug(entry: EntrySummary): string {
  return readField<string>(entry, 'slug') ?? '';
}

function statusFor(e: EntrySummary): { label: string; cls: string } {
  if (e.isDraft) return { label: 'Draft', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
  if (e.isPublished)
    return { label: 'Published', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
  return { label: 'Changed', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' };
}

// ---- Load ------------------------------------------------------------

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [c, m, l, a, q] = await Promise.all([
      listEntries('course', { limit: 200 }),
      listEntries('module', { limit: 500 }),
      listEntries('lesson', { limit: 1000 }),
      listEntries('assignmentSpec', { limit: 500 }),
      listEntries('quiz', { limit: 500 }),
    ]);

    courses.value = c;
    modulesById.value = new Map(m.map(e => [e.id, e]));
    lessonsById.value = new Map(l.map(e => [e.id, e]));
    assignmentsById.value = new Map(a.map(e => [e.id, e]));
    quizzes.value = q;

    const refMods = new Set<string>();
    const refLessons = new Set<string>();
    const refAssigns = new Set<string>();
    for (const course of c) {
      for (const mid of extractRefIds(readField(course, 'modules'))) refMods.add(mid);
    }
    for (const mod of m) {
      for (const lid of extractRefIds(readField(mod, 'lessons'))) refLessons.add(lid);
      for (const aid of extractRefIds(readField(mod, 'assignments'))) refAssigns.add(aid);
    }
    referencedModuleIds.value = refMods;
    referencedLessonIds.value = refLessons;
    referencedAssignmentIds.value = refAssigns;

    if (c.length > 0) expanded.value[c[0].id] = true;
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load content tree.';
  } finally {
    loading.value = false;
  }
}

// ---- Tree resolution -------------------------------------------------

function modulesOf(course: EntrySummary): EntrySummary[] {
  return extractRefIds(readField(course, 'modules'))
    .map(id => modulesById.value.get(id))
    .filter((m): m is EntrySummary => !!m);
}

function lessonsOf(mod: EntrySummary): EntrySummary[] {
  return extractRefIds(readField(mod, 'lessons'))
    .map(id => lessonsById.value.get(id))
    .filter((l): l is EntrySummary => !!l);
}

function assignmentsOf(mod: EntrySummary): EntrySummary[] {
  return extractRefIds(readField(mod, 'assignments'))
    .map(id => assignmentsById.value.get(id))
    .filter((a): a is EntrySummary => !!a);
}

// Filtered tree views. Each list returns the entries the user should
// see right now: full set when search is inactive, otherwise only the
// nodes that match or that have a matching descendant.

function visibleLessons(mod: EntrySummary): EntrySummary[] {
  if (!searchActive.value) return lessonsOf(mod);
  return lessonsOf(mod).filter(entryMatches);
}
function visibleAssignments(mod: EntrySummary): EntrySummary[] {
  if (!searchActive.value) return assignmentsOf(mod);
  return assignmentsOf(mod).filter(entryMatches);
}
function moduleHasMatch(mod: EntrySummary): boolean {
  if (entryMatches(mod)) return true;
  return lessonsOf(mod).some(entryMatches) || assignmentsOf(mod).some(entryMatches);
}
function visibleModules(course: EntrySummary): EntrySummary[] {
  if (!searchActive.value) return modulesOf(course);
  return modulesOf(course).filter(moduleHasMatch);
}
function courseHasMatch(course: EntrySummary): boolean {
  if (entryMatches(course)) return true;
  return modulesOf(course).some(moduleHasMatch);
}
const visibleCourses = computed(() =>
  searchActive.value ? courses.value.filter(courseHasMatch) : courses.value
);

// When search is active we want ancestors of matches expanded
// automatically — separate from the user's manual expanded state so we
// don't clobber it when search is cleared.
function isOpen(nodeId: string): boolean {
  if (expanded.value[nodeId]) return true;
  return searchActive.value; // every visible non-leaf opens during search
}

const orphans = computed(() => ({
  modules: [...modulesById.value.values()].filter(e => !referencedModuleIds.value.has(e.id)),
  lessons: [...lessonsById.value.values()].filter(e => !referencedLessonIds.value.has(e.id)),
  assignments: [...assignmentsById.value.values()].filter(
    e => !referencedAssignmentIds.value.has(e.id)
  ),
}));

const hasAnyOrphans = computed(
  () =>
    orphans.value.modules.length > 0 ||
    orphans.value.lessons.length > 0 ||
    orphans.value.assignments.length > 0
);

// ---- Add-child flow --------------------------------------------------
//
// Creates a draft entry with auto-generated slug + placeholder title,
// links it onto the parent's reference list, then navigates to the
// editor so the staff member can fill in details. Pre-linking means
// the new entry shows up in the tree the next time the user hits Back.

function toggle(id: string) {
  expanded.value[id] = !expanded.value[id];
}

async function addModule(course: EntrySummary) {
  pendingParent.value = course.id;
  try {
    const courseSlug = entrySlug(course) || 'course';
    const existing = extractRefIds(readField(course, 'modules'));
    const n = existing.length + 1;
    const slug = `${courseSlug}-mod-${n}`.slice(0, 60);
    const created = await createEntry({
      type: 'module',
      fields: { slug, title: 'New module', unlockRule: 'sequential' },
    });
    await updateEntry(course.id, {
      type: 'course',
      fields: {
        slug: entrySlug(course),
        title: entryTitle(course),
        program: readField<'stepup_scholars' | 'dynamerge'>(course, 'program') ?? 'stepup_scholars',
        version: readField<string>(course, 'version') ?? '',
        modules: [...existing, created.id],
      },
    });
    router.push(`${adminBase.value}/content/modules/${created.id}`);
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Could not add module.';
  } finally {
    pendingParent.value = null;
  }
}

async function addLesson(mod: EntrySummary) {
  pendingParent.value = mod.id + ':l';
  try {
    const modSlug = entrySlug(mod) || 'module';
    const existing = extractRefIds(readField(mod, 'lessons'));
    const n = existing.length + 1;
    const slug = `${modSlug}-l-${n}`.slice(0, 64);
    const created = await createEntry({
      type: 'lesson',
      fields: { slug, title: 'New lesson', completionCriteria: 'viewed' },
    });
    await updateEntry(mod.id, {
      type: 'module',
      fields: {
        slug: entrySlug(mod),
        title: entryTitle(mod),
        lessons: [...existing, created.id],
      },
    });
    router.push(`${adminBase.value}/content/lessons/${created.id}`);
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Could not add lesson.';
  } finally {
    pendingParent.value = null;
  }
}

// ---- Publish whole subtree ------------------------------------------
//
// Walks the subtree, collects every entry that's a draft or has
// unpublished changes, and publishes them leaf-first so the parent's
// reference chain always points at a published child. Contentful does
// not actually require this order — references work across statuses —
// but leaf-first means a viewer who lands mid-publish never sees a
// "Published" parent linking to a "Draft" child.

function entriesNeedingPublish(start: EntrySummary): EntrySummary[] {
  const queue: EntrySummary[] = [start];
  const out: EntrySummary[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    // Drafts (isDraft) and Changed (!isPublished && !isDraft) both have
    // isPublished === false. Already-published entries skip.
    if (!node.isPublished) out.push(node);
    // Descend.
    if (node.contentType === 'course') {
      for (const mid of extractRefIds(readField(node, 'modules'))) {
        const m = modulesById.value.get(mid);
        if (m) queue.push(m);
      }
    } else if (node.contentType === 'module') {
      for (const lid of extractRefIds(readField(node, 'lessons'))) {
        const l = lessonsById.value.get(lid);
        if (l) queue.push(l);
      }
      for (const aid of extractRefIds(readField(node, 'assignments'))) {
        const a = assignmentsById.value.get(aid);
        if (a) queue.push(a);
      }
    }
  }
  // Reverse so leaves publish first.
  return out.reverse();
}

async function publishSubtree(start: EntrySummary) {
  if (publishingId.value) return;
  publishingId.value = start.id;
  error.value = null;
  try {
    const targets = entriesNeedingPublish(start);
    if (targets.length === 0) {
      // Already fully published — refresh anyway in case the view is stale.
      await load();
      return;
    }
    publishProgress.value = { done: 0, total: targets.length };
    for (const t of targets) {
      try {
        await publishEntry(t.id);
      } catch (err) {
        // Surface the first failure, keep going for the rest so a single
        // broken entry doesn't halt the batch.
        const msg = (err as { message?: string }).message ?? 'publish failed';
        error.value = `Couldn't publish ${entryTitle(t)}: ${msg}`;
      }
      publishProgress.value = { done: publishProgress.value!.done + 1, total: targets.length };
    }
    await load();
  } finally {
    publishingId.value = null;
    publishProgress.value = null;
  }
}

function subtreeDraftCount(start: EntrySummary): number {
  return entriesNeedingPublish(start).length;
}

// ---- Unpublish whole subtree ----------------------------------------
//
// Mirror of the publish flow but for tearing content down. Unlike
// publish, we walk root-first: unpublishing the parent before its
// children means no viewer ever sees a "Published parent → Unpublished
// child" intermediate state.

function entriesNeedingUnpublish(start: EntrySummary): EntrySummary[] {
  const queue: EntrySummary[] = [start];
  const out: EntrySummary[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    if (node.isPublished) out.push(node);
    if (node.contentType === 'course') {
      for (const mid of extractRefIds(readField(node, 'modules'))) {
        const m = modulesById.value.get(mid);
        if (m) queue.push(m);
      }
    } else if (node.contentType === 'module') {
      for (const lid of extractRefIds(readField(node, 'lessons'))) {
        const l = lessonsById.value.get(lid);
        if (l) queue.push(l);
      }
      for (const aid of extractRefIds(readField(node, 'assignments'))) {
        const a = assignmentsById.value.get(aid);
        if (a) queue.push(a);
      }
    }
  }
  return out;
}

async function unpublishSubtree(start: EntrySummary) {
  if (unpublishingId.value) return;
  const targets = entriesNeedingUnpublish(start);
  if (targets.length === 0) return;
  // Real confirm — pulling content out from under students is a
  // big-deal action, especially when it cascades to lessons they may be
  // mid-way through.
  if (
    !confirm(
      `Unpublish "${entryTitle(start)}" and ${targets.length - 1} child entr${
        targets.length - 1 === 1 ? 'y' : 'ies'
      }? Students won't see this content until you republish.`
    )
  ) {
    return;
  }
  unpublishingId.value = start.id;
  error.value = null;
  try {
    unpublishProgress.value = { done: 0, total: targets.length };
    for (const t of targets) {
      try {
        await unpublishEntry(t.id);
      } catch (err) {
        const msg = (err as { message?: string }).message ?? 'unpublish failed';
        error.value = `Couldn't unpublish ${entryTitle(t)}: ${msg}`;
      }
      unpublishProgress.value = {
        done: unpublishProgress.value!.done + 1,
        total: targets.length,
      };
    }
    await load();
  } finally {
    unpublishingId.value = null;
    unpublishProgress.value = null;
  }
}

function subtreePublishedCount(start: EntrySummary): number {
  return entriesNeedingUnpublish(start).length;
}

async function addAssignment(mod: EntrySummary) {
  pendingParent.value = mod.id + ':a';
  try {
    const modSlug = entrySlug(mod) || 'module';
    const existing = extractRefIds(readField(mod, 'assignments'));
    const n = existing.length + 1;
    const slug = `${modSlug}-a-${n}`.slice(0, 64);
    const created = await createEntry({
      type: 'assignmentSpec',
      fields: { slug, title: 'New assignment', submissionType: 'text', dueOffsetDays: 7 },
    });
    await updateEntry(mod.id, {
      type: 'module',
      fields: {
        slug: entrySlug(mod),
        title: entryTitle(mod),
        assignments: [...existing, created.id],
      },
    });
    router.push(`${adminBase.value}/content/assignments/${created.id}`);
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Could not add assignment.';
  } finally {
    pendingParent.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container>
        <Eyebrow class="text-brand-violet mb-3 block">Admin</Eyebrow>
        <Heading :level="1" class="mb-3">Course content.</Heading>
        <Body class="text-ink/70 max-w-2xl">
          Author and publish course material top-down — start a course, add modules inside it, and
          lessons inside those. All edits save through to Contentful; publishing mirrors them into
          Firestore for the student portal.
        </Body>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="flex flex-col gap-8 max-w-4xl">
        <LmsOnboarding />

        <RouterLink
          :to="`${adminBase}/content/outline`"
          class="flex items-start gap-4 p-5 rounded-2xl border hairline-ink hover:border-brand-violet/60 hover:bg-brand-violet/5 transition-colors focus-ring-brand bg-gradient-to-br from-brand-violet/5 to-brand-sky/5"
        >
          <div
            class="w-10 h-10 rounded-xl bg-brand-violet/15 flex items-center justify-center shrink-0"
          >
            <Icon icon="lucide:wand-2" width="20" class="text-brand-violet" />
          </div>
          <div class="flex flex-col gap-0.5 min-w-0 flex-1">
            <span class="font-semibold text-base text-ink">Outline a course with AI</span>
            <span class="text-sm text-ink/60">
              Sketch a topic; generate a full draft tree of modules, lessons, and assignments.
            </span>
          </div>
          <Icon icon="lucide:arrow-right" width="18" class="text-ink/40 mt-1.5 shrink-0" />
        </RouterLink>

        <!-- Tree -->
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <h2 class="font-display text-lg font-semibold text-ink m-0">Your courses</h2>
            <div class="flex items-center gap-2">
              <UiButton variant="secondary" :to="`${adminBase}/content/quizzes/new`">
                <span class="flex items-center gap-1.5">
                  <Icon icon="lucide:help-circle" width="14" />
                  New quiz
                </span>
              </UiButton>
              <UiButton variant="primary" :to="`${adminBase}/content/courses/new`">
                <span class="flex items-center gap-1.5">
                  <Icon icon="lucide:plus" width="14" />
                  New course
                </span>
              </UiButton>
            </div>
          </div>

          <!-- Search across the whole tree. Matches expand their ancestors
               automatically so users don't have to click into every level. -->
          <div class="relative">
            <Icon
              icon="lucide:search"
              width="14"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none"
            />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search by title or slug across the whole tree…"
              class="w-full pl-9 pr-9 py-2 rounded-lg border hairline-ink bg-surface text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:ring-2 focus:ring-brand-violet"
            />
            <button
              v-if="searchActive"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink p-1"
              aria-label="Clear search"
              @click="searchQuery = ''"
            >
              <Icon icon="lucide:x" width="14" />
            </button>
          </div>

          <p v-if="error" role="alert" class="text-sm text-red-700 m-0">{{ error }}</p>

          <div v-if="loading" class="rounded-2xl border hairline-ink bg-surface p-10 text-center">
            <Icon
              icon="lucide:loader-2"
              width="22"
              class="animate-spin text-brand-violet mx-auto"
            />
          </div>

          <div
            v-else-if="courses.length === 0"
            class="rounded-2xl border hairline-ink bg-surface p-8 text-center"
          >
            <Body class="text-ink/60 text-sm">
              No courses yet. Start with "New course" above, or generate a full draft with the AI
              outliner.
            </Body>
          </div>

          <div
            v-else-if="searchActive && visibleCourses.length === 0"
            class="rounded-2xl border hairline-ink bg-surface p-6 text-center"
          >
            <Body class="text-ink/60 text-sm">
              No matches for "{{ searchQuery }}". Try a different query, or clear the search to see
              the full tree.
            </Body>
          </div>

          <ul v-else class="flex flex-col gap-2">
            <li
              v-for="course in visibleCourses"
              :key="course.id"
              class="rounded-xl border hairline-ink bg-surface overflow-hidden"
            >
              <!-- Course row -->
              <div class="flex items-center gap-2 px-3 py-2.5 hover:bg-ink/[0.015]">
                <button
                  type="button"
                  class="w-6 h-6 rounded-md inline-flex items-center justify-center text-ink/50 hover:bg-ink/5 hover:text-ink shrink-0"
                  :aria-label="isOpen(course.id) ? 'Collapse' : 'Expand'"
                  @click="toggle(course.id)"
                >
                  <Icon
                    icon="lucide:chevron-right"
                    width="14"
                    class="transition-transform"
                    :class="isOpen(course.id) ? 'rotate-90' : ''"
                  />
                </button>
                <Icon icon="lucide:book-open" width="14" class="text-brand-violet shrink-0" />
                <RouterLink
                  :to="`${adminBase}/content/courses/${course.id}`"
                  class="flex-1 min-w-0 text-sm font-medium text-ink hover:text-brand-violet truncate"
                >
                  {{ entryTitle(course) }}
                </RouterLink>
                <span
                  class="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                  :class="statusFor(course).cls"
                >
                  {{ statusFor(course).label }}
                </span>
                <button
                  type="button"
                  class="text-ink/40 hover:text-brand-violet p-1 rounded-md hover:bg-ink/5 shrink-0"
                  aria-label="Quick edit"
                  @click="openDrawer(course)"
                >
                  <Icon icon="lucide:more-horizontal" width="14" />
                </button>
                <button
                  v-if="subtreeDraftCount(course) > 0"
                  type="button"
                  class="text-xs font-semibold text-emerald-700 hover:underline underline-offset-2 inline-flex items-center gap-1 px-2"
                  :disabled="publishingId === course.id || unpublishingId === course.id"
                  :title="`Publish this course and ${subtreeDraftCount(course) - 1} child entries with pending changes`"
                  @click="publishSubtree(course)"
                >
                  <Icon
                    :icon="publishingId === course.id ? 'lucide:loader-2' : 'lucide:upload-cloud'"
                    width="12"
                    :class="publishingId === course.id ? 'animate-spin' : ''"
                  />
                  <template v-if="publishingId === course.id && publishProgress">
                    {{ publishProgress.done }}/{{ publishProgress.total }}
                  </template>
                  <template v-else> Publish all ({{ subtreeDraftCount(course) }}) </template>
                </button>
                <button
                  v-if="subtreePublishedCount(course) > 0"
                  type="button"
                  class="text-xs font-semibold text-amber-700 hover:underline underline-offset-2 inline-flex items-center gap-1 px-2"
                  :disabled="publishingId === course.id || unpublishingId === course.id"
                  :title="`Unpublish this course and ${subtreePublishedCount(course) - 1} published child entries`"
                  @click="unpublishSubtree(course)"
                >
                  <Icon
                    :icon="unpublishingId === course.id ? 'lucide:loader-2' : 'lucide:eye-off'"
                    width="12"
                    :class="unpublishingId === course.id ? 'animate-spin' : ''"
                  />
                  <template v-if="unpublishingId === course.id && unpublishProgress">
                    {{ unpublishProgress.done }}/{{ unpublishProgress.total }}
                  </template>
                  <template v-else> Unpublish all ({{ subtreePublishedCount(course) }}) </template>
                </button>
                <button
                  type="button"
                  class="text-xs font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1 px-2"
                  :disabled="pendingParent === course.id"
                  @click="addModule(course)"
                >
                  <Icon
                    :icon="pendingParent === course.id ? 'lucide:loader-2' : 'lucide:plus'"
                    width="12"
                    :class="pendingParent === course.id ? 'animate-spin' : ''"
                  />
                  Module
                </button>
              </div>

              <!-- Modules -->
              <ul v-if="isOpen(course.id)" class="border-t hairline-ink bg-ink/[0.01]">
                <li
                  v-for="(mod, mIdx) in visibleModules(course)"
                  :key="mod.id"
                  class="border-b hairline-ink last:border-b-0 transition-shadow"
                  :class="[
                    isDragging(mod.id) ? 'opacity-40' : '',
                    dropIndicatorClass(course.id, 'modules', mIdx),
                  ]"
                  :draggable="!searchActive"
                  @dragstart="onDragStart($event, course, 'modules', mod.id, mIdx)"
                  @dragover="onDragOver($event, course.id, 'modules', mIdx)"
                  @drop="onDrop($event, course.id, 'modules', mIdx)"
                  @dragend="onDragEnd"
                >
                  <div class="group flex items-center gap-2 pl-2 pr-3 py-2 hover:bg-ink/[0.02]">
                    <Icon
                      v-if="!searchActive"
                      icon="lucide:grip-vertical"
                      width="12"
                      class="text-ink/40 group-hover:text-ink/70 cursor-grab shrink-0 select-none"
                      :title="'Drag to reorder'"
                    />
                    <span v-else class="w-3 shrink-0" />
                    <button
                      type="button"
                      class="w-6 h-6 rounded-md inline-flex items-center justify-center text-ink/50 hover:bg-ink/5 hover:text-ink shrink-0"
                      :aria-label="isOpen(mod.id) ? 'Collapse' : 'Expand'"
                      @click="toggle(mod.id)"
                    >
                      <Icon
                        icon="lucide:chevron-right"
                        width="12"
                        class="transition-transform"
                        :class="isOpen(mod.id) ? 'rotate-90' : ''"
                      />
                    </button>
                    <Icon icon="lucide:layers" width="13" class="text-ink/60 shrink-0" />
                    <RouterLink
                      :to="`${adminBase}/content/modules/${mod.id}`"
                      class="flex-1 min-w-0 text-sm text-ink hover:text-brand-violet truncate"
                    >
                      {{ entryTitle(mod) }}
                    </RouterLink>
                    <span
                      class="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                      :class="statusFor(mod).cls"
                    >
                      {{ statusFor(mod).label }}
                    </span>
                    <button
                      type="button"
                      class="text-ink/40 hover:text-brand-violet p-1 rounded-md hover:bg-ink/5 shrink-0"
                      aria-label="Quick edit"
                      @click="openDrawer(mod)"
                    >
                      <Icon icon="lucide:more-horizontal" width="12" />
                    </button>
                    <button
                      v-if="subtreeDraftCount(mod) > 0"
                      type="button"
                      class="text-xs font-semibold text-emerald-700 hover:underline underline-offset-2 inline-flex items-center gap-1 px-1.5"
                      :disabled="publishingId === mod.id || unpublishingId === mod.id"
                      :title="`Publish this module and any unpublished lessons/assignments below`"
                      @click="publishSubtree(mod)"
                    >
                      <Icon
                        :icon="publishingId === mod.id ? 'lucide:loader-2' : 'lucide:upload-cloud'"
                        width="11"
                        :class="publishingId === mod.id ? 'animate-spin' : ''"
                      />
                      <template v-if="publishingId === mod.id && publishProgress">
                        {{ publishProgress.done }}/{{ publishProgress.total }}
                      </template>
                      <template v-else> Publish ({{ subtreeDraftCount(mod) }}) </template>
                    </button>
                    <button
                      v-if="subtreePublishedCount(mod) > 0"
                      type="button"
                      class="text-xs font-semibold text-amber-700 hover:underline underline-offset-2 inline-flex items-center gap-1 px-1.5"
                      :disabled="publishingId === mod.id || unpublishingId === mod.id"
                      :title="`Unpublish this module and its published lessons/assignments`"
                      @click="unpublishSubtree(mod)"
                    >
                      <Icon
                        :icon="unpublishingId === mod.id ? 'lucide:loader-2' : 'lucide:eye-off'"
                        width="11"
                        :class="unpublishingId === mod.id ? 'animate-spin' : ''"
                      />
                      <template v-if="unpublishingId === mod.id && unpublishProgress">
                        {{ unpublishProgress.done }}/{{ unpublishProgress.total }}
                      </template>
                      <template v-else> Unpublish ({{ subtreePublishedCount(mod) }}) </template>
                    </button>
                    <button
                      type="button"
                      class="text-xs font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1 px-1.5"
                      :disabled="pendingParent === mod.id + ':l'"
                      @click="addLesson(mod)"
                    >
                      <Icon
                        :icon="pendingParent === mod.id + ':l' ? 'lucide:loader-2' : 'lucide:plus'"
                        width="11"
                        :class="pendingParent === mod.id + ':l' ? 'animate-spin' : ''"
                      />
                      Lesson
                    </button>
                    <button
                      type="button"
                      class="text-xs font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1 px-1.5"
                      :disabled="pendingParent === mod.id + ':a'"
                      @click="addAssignment(mod)"
                    >
                      <Icon
                        :icon="pendingParent === mod.id + ':a' ? 'lucide:loader-2' : 'lucide:plus'"
                        width="11"
                        :class="pendingParent === mod.id + ':a' ? 'animate-spin' : ''"
                      />
                      Assignment
                    </button>
                  </div>

                  <!-- Lessons + assignments under this module -->
                  <ul v-if="isOpen(mod.id)" class="border-t hairline-ink bg-ink/[0.02]">
                    <li
                      v-for="(lesson, lIdx) in visibleLessons(mod)"
                      :key="lesson.id"
                      class="group flex items-center gap-2 pl-9 pr-3 py-1.5 hover:bg-ink/[0.03] border-b hairline-ink last:border-b-0 transition-shadow"
                      :class="[
                        isDragging(lesson.id) ? 'opacity-40' : '',
                        dropIndicatorClass(mod.id, 'lessons', lIdx),
                      ]"
                      :draggable="!searchActive"
                      @dragstart="onDragStart($event, mod, 'lessons', lesson.id, lIdx)"
                      @dragover="onDragOver($event, mod.id, 'lessons', lIdx)"
                      @drop="onDrop($event, mod.id, 'lessons', lIdx)"
                      @dragend="onDragEnd"
                    >
                      <Icon
                        v-if="!searchActive"
                        icon="lucide:grip-vertical"
                        width="11"
                        class="text-ink/40 group-hover:text-ink/70 cursor-grab shrink-0 select-none"
                      />
                      <span v-else class="w-2.5 shrink-0" />
                      <Icon icon="lucide:file-text" width="12" class="text-ink/50 shrink-0" />
                      <RouterLink
                        :to="`${adminBase}/content/lessons/${lesson.id}`"
                        class="flex-1 min-w-0 text-sm text-ink/85 hover:text-brand-violet truncate"
                      >
                        {{ entryTitle(lesson) }}
                      </RouterLink>
                      <span
                        class="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                        :class="statusFor(lesson).cls"
                      >
                        {{ statusFor(lesson).label }}
                      </span>
                      <button
                        type="button"
                        class="text-ink/50 hover:text-brand-violet p-1 rounded-md hover:bg-ink/5 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Quick edit"
                        @click="openDrawer(lesson)"
                      >
                        <Icon icon="lucide:more-horizontal" width="12" />
                      </button>
                    </li>
                    <li
                      v-if="
                        drag?.parentId === mod.id &&
                        drag?.field === 'lessons' &&
                        visibleLessons(mod).length > 0
                      "
                      class="h-6 mx-2 my-1 border-2 border-dashed rounded-md transition-colors"
                      :class="
                        endDropIndicatorClass(mod.id, 'lessons', visibleLessons(mod).length) ||
                        'border-ink/15'
                      "
                      @dragover="onDragOver($event, mod.id, 'lessons', visibleLessons(mod).length)"
                      @drop="onDrop($event, mod.id, 'lessons', visibleLessons(mod).length)"
                    />
                    <li
                      v-for="(assign, aIdx) in visibleAssignments(mod)"
                      :key="assign.id"
                      class="group flex items-center gap-2 pl-9 pr-3 py-1.5 hover:bg-ink/[0.03] border-b hairline-ink last:border-b-0 transition-shadow"
                      :class="[
                        isDragging(assign.id) ? 'opacity-40' : '',
                        dropIndicatorClass(mod.id, 'assignments', aIdx),
                      ]"
                      :draggable="!searchActive"
                      @dragstart="onDragStart($event, mod, 'assignments', assign.id, aIdx)"
                      @dragover="onDragOver($event, mod.id, 'assignments', aIdx)"
                      @drop="onDrop($event, mod.id, 'assignments', aIdx)"
                      @dragend="onDragEnd"
                    >
                      <Icon
                        v-if="!searchActive"
                        icon="lucide:grip-vertical"
                        width="11"
                        class="text-ink/40 group-hover:text-ink/70 cursor-grab shrink-0 select-none"
                      />
                      <span v-else class="w-2.5 shrink-0" />
                      <Icon icon="lucide:clipboard-edit" width="12" class="text-ink/50 shrink-0" />
                      <RouterLink
                        :to="`${adminBase}/content/assignments/${assign.id}`"
                        class="flex-1 min-w-0 text-sm text-ink/85 hover:text-brand-violet truncate"
                      >
                        {{ entryTitle(assign) }}
                      </RouterLink>
                      <span
                        class="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                        :class="statusFor(assign).cls"
                      >
                        {{ statusFor(assign).label }}
                      </span>
                      <button
                        type="button"
                        class="text-ink/50 hover:text-brand-violet p-1 rounded-md hover:bg-ink/5 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Quick edit"
                        @click="openDrawer(assign)"
                      >
                        <Icon icon="lucide:more-horizontal" width="12" />
                      </button>
                    </li>
                    <li
                      v-if="
                        drag?.parentId === mod.id &&
                        drag?.field === 'assignments' &&
                        visibleAssignments(mod).length > 0
                      "
                      class="h-6 mx-2 my-1 border-2 border-dashed rounded-md transition-colors"
                      :class="
                        endDropIndicatorClass(
                          mod.id,
                          'assignments',
                          visibleAssignments(mod).length
                        ) || 'border-ink/15'
                      "
                      @dragover="
                        onDragOver($event, mod.id, 'assignments', visibleAssignments(mod).length)
                      "
                      @drop="onDrop($event, mod.id, 'assignments', visibleAssignments(mod).length)"
                    />
                    <li
                      v-if="
                        !searchActive &&
                        lessonsOf(mod).length === 0 &&
                        assignmentsOf(mod).length === 0
                      "
                      class="pl-14 pr-3 py-2 text-xs text-ink/50 italic"
                    >
                      Empty module — use + Lesson or + Assignment above to add.
                    </li>
                  </ul>
                </li>
                <li
                  v-if="
                    drag?.parentId === course.id &&
                    drag?.field === 'modules' &&
                    visibleModules(course).length > 0
                  "
                  class="h-7 mx-2 my-1 border-2 border-dashed rounded-md transition-colors"
                  :class="
                    endDropIndicatorClass(course.id, 'modules', visibleModules(course).length) ||
                    'border-ink/15'
                  "
                  @dragover="
                    onDragOver($event, course.id, 'modules', visibleModules(course).length)
                  "
                  @drop="onDrop($event, course.id, 'modules', visibleModules(course).length)"
                />
                <li
                  v-if="!searchActive && modulesOf(course).length === 0"
                  class="pl-8 pr-3 py-3 text-xs text-ink/50 italic"
                >
                  No modules yet — use + Module above to add the first one.
                </li>
              </ul>
            </li>
          </ul>
        </div>

        <!-- Orphans — content that exists but isn't wired up. -->
        <details v-if="hasAnyOrphans" class="rounded-2xl border hairline-ink bg-surface px-5 py-4">
          <summary
            class="cursor-pointer text-sm font-semibold text-ink/70 inline-flex items-center gap-2 select-none"
          >
            <Icon icon="lucide:unlink" width="14" class="text-amber-700" />
            Unlinked entries
            <span class="font-normal text-ink/50">
              ({{ orphans.modules.length + orphans.lessons.length + orphans.assignments.length }}
              not attached to a parent)
            </span>
          </summary>
          <div class="mt-3 flex flex-col gap-3 text-xs">
            <div v-if="orphans.modules.length" class="flex flex-col gap-1">
              <Eyebrow class="text-ink/50 block">Modules</Eyebrow>
              <RouterLink
                v-for="m in orphans.modules"
                :key="m.id"
                :to="`${adminBase}/content/modules/${m.id}`"
                class="text-ink/80 hover:text-brand-violet underline-offset-2 hover:underline"
              >
                {{ entryTitle(m) }}
                <span class="text-ink/40">| {{ entrySlug(m) }}</span>
              </RouterLink>
            </div>
            <div v-if="orphans.lessons.length" class="flex flex-col gap-1">
              <Eyebrow class="text-ink/50 block">Lessons</Eyebrow>
              <RouterLink
                v-for="l in orphans.lessons"
                :key="l.id"
                :to="`${adminBase}/content/lessons/${l.id}`"
                class="text-ink/80 hover:text-brand-violet underline-offset-2 hover:underline"
              >
                {{ entryTitle(l) }}
                <span class="text-ink/40">| {{ entrySlug(l) }}</span>
              </RouterLink>
            </div>
            <div v-if="orphans.assignments.length" class="flex flex-col gap-1">
              <Eyebrow class="text-ink/50 block">Assignments</Eyebrow>
              <RouterLink
                v-for="a in orphans.assignments"
                :key="a.id"
                :to="`${adminBase}/content/assignments/${a.id}`"
                class="text-ink/80 hover:text-brand-violet underline-offset-2 hover:underline"
              >
                {{ entryTitle(a) }}
                <span class="text-ink/40">| {{ entrySlug(a) }}</span>
              </RouterLink>
            </div>
          </div>
        </details>
      </Container>
    </Section>

    <!-- Quick-edit drawer. Teleported to <body> so it overlays the
         whole admin shell, including the site header. -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="drawerEntry"
          class="fixed inset-0 z-[100] bg-ink/40 backdrop-blur-sm"
          @click.self="closeDrawer"
        >
          <Transition
            enter-active-class="transition transform duration-200 ease-out"
            enter-from-class="translate-x-full"
            enter-to-class="translate-x-0"
            leave-active-class="transition transform duration-150 ease-in"
            leave-from-class="translate-x-0"
            leave-to-class="translate-x-full"
            appear
          >
            <aside
              class="absolute right-0 top-0 h-full w-full max-w-md bg-surface shadow-2xl overflow-y-auto flex flex-col"
            >
              <header class="flex items-center gap-3 px-6 py-4 border-b hairline-ink">
                <div
                  class="w-9 h-9 rounded-lg bg-brand-violet/10 text-brand-violet flex items-center justify-center shrink-0"
                >
                  <Icon
                    :icon="
                      drawerEntry.contentType === 'course'
                        ? 'lucide:book-open'
                        : drawerEntry.contentType === 'module'
                          ? 'lucide:layers'
                          : drawerEntry.contentType === 'lesson'
                            ? 'lucide:file-text'
                            : 'lucide:clipboard-edit'
                    "
                    width="16"
                  />
                </div>
                <div class="flex flex-col flex-1 min-w-0">
                  <span class="text-[10px] font-semibold text-ink/50 uppercase tracking-wide">
                    {{ drawerTypeLabel(drawerEntry) }}
                  </span>
                  <span class="text-sm font-semibold text-ink truncate">
                    {{ entryTitle(drawerEntry) }}
                  </span>
                </div>
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0"
                  :class="statusFor(drawerEntry).cls"
                >
                  {{ statusFor(drawerEntry).label }}
                </span>
                <button
                  type="button"
                  class="text-ink/40 hover:text-ink p-1 -m-1"
                  aria-label="Close"
                  @click="closeDrawer"
                >
                  <Icon icon="lucide:x" width="16" />
                </button>
              </header>

              <div class="flex-1 px-6 py-5 flex flex-col gap-5">
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                    >Slug</label
                  >
                  <input
                    v-model="drawerForm.slug"
                    type="text"
                    class="px-3 py-2 rounded-md border hairline-ink bg-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-violet"
                    @blur="drawerForm.slug = normalizeSlug(drawerForm.slug)"
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                    >Title</label
                  >
                  <input
                    v-model="drawerForm.title"
                    type="text"
                    class="px-3 py-2 rounded-md border hairline-ink bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-violet"
                  />
                </div>

                <p
                  v-if="drawerError"
                  role="alert"
                  class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 m-0"
                >
                  {{ drawerError }}
                </p>

                <RouterLink
                  :to="drawerEditPath"
                  class="text-xs font-semibold text-brand-violet hover:underline underline-offset-2 inline-flex items-center gap-1.5"
                  @click="closeDrawer"
                >
                  <Icon icon="lucide:external-link" width="12" />
                  Open full editor (body, video, attachments)
                </RouterLink>
              </div>

              <footer
                class="flex items-center justify-between gap-2 px-6 py-4 border-t hairline-ink bg-ink/[0.02] flex-wrap"
              >
                <button
                  type="button"
                  class="text-xs font-semibold text-rose-700 hover:underline underline-offset-2 inline-flex items-center gap-1"
                  :disabled="drawerActing || drawerSaving"
                  @click="drawerDelete"
                >
                  <Icon
                    :icon="drawerActing ? 'lucide:loader-2' : 'lucide:trash-2'"
                    width="12"
                    :class="drawerActing ? 'animate-spin' : ''"
                  />
                  Delete
                </button>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="text-xs font-semibold text-ink/70 hover:text-ink hover:underline underline-offset-2 inline-flex items-center gap-1 px-2 py-1"
                    :disabled="drawerActing || drawerSaving"
                    @click="drawerTogglePublish"
                  >
                    <Icon
                      :icon="drawerEntry.isPublished ? 'lucide:eye-off' : 'lucide:upload-cloud'"
                      width="12"
                    />
                    {{ drawerEntry.isPublished ? 'Unpublish' : 'Publish' }}
                  </button>
                  <UiButton
                    variant="primary"
                    :disabled="drawerSaving || drawerActing"
                    @click="drawerSave"
                  >
                    <Icon
                      v-if="drawerSaving"
                      icon="lucide:loader-2"
                      width="14"
                      class="animate-spin"
                    />
                    <Icon v-else icon="lucide:check" width="14" />
                    {{ drawerSaving ? 'Saving…' : 'Save' }}
                  </UiButton>
                </div>
              </footer>
            </aside>
          </Transition>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
