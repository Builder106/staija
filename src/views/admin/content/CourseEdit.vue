<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import EntryReferencePicker from '../../../components/admin/EntryReferencePicker.vue';
import Container from '../../../components/ui/Container.vue';
import Eyebrow from '../../../components/ui/Eyebrow.vue';
import FileUpload from '../../../components/ui/FileUpload.vue';
import Heading from '../../../components/ui/Heading.vue';
import Section from '../../../components/ui/Section.vue';
import UiButton from '../../../components/ui/UiButton.vue';
import UiCard from '../../../components/ui/UiCard.vue';
import UiSelect from '../../../components/ui/UiSelect.vue';
import { useAdminBase } from '../../../composables/useAdminBase';
import { useFormDirty } from '../../../composables/useFormDirty';
import {
  buildDuplicateCourseFields,
  computeCourseEstimatedHours,
  type ComputedHours,
  type CourseFields,
  createEntry,
  currentTermVersion,
  getEntry,
  listTracksForProgram,
  normalizeSlug,
  normalizeVersion,
  publishEntry,
  slugify,
  updateEntry,
  uploadAsset,
} from '../../../services/lmsContent';

const route = useRoute();
const router = useRouter();
const { adminBase } = useAdminBase();

const isNew = computed(() => route.params.id === 'new' || !route.params.id);
const id = ref<string | null>(isNew.value ? null : (route.params.id as string));
const loading = ref(!isNew.value);
const saving = ref(false);
const publishing = ref(false);
const error = ref<string | null>(null);
const isPublished = ref(false);

// `slugTouched` flips true the moment the editor types into the slug
// field directly OR when we pre-fill the slug from a duplicate source.
// While false, the slug auto-derives from the title via slugify().
const slugTouched = ref(false);

const form = ref<CourseFields>({
  slug: '',
  title: '',
  program: 'stepup_scholars',
  summary: '',
  modules: [],
  estimatedHours: undefined,
  track: '',
  published: false,
  // Pre-fill version with the current term so a fresh new-course form
  // has a sensible default — editors can still edit it freely.
  version: isNew.value ? currentTermVersion() : '',
  coverImage: undefined,
});
const { isDirty, markClean } = useFormDirty(form);

// Cover-image preview URL — populated after a successful upload. On
// reload we only know the asset ID (from form.coverImage), not the URL
// — fetching it would need an asset-aware callable. For now the UI
// shows "image set" if there's an ID but no URL yet, and the editor
// can re-upload to replace.
const coverImageUrl = ref<string | null>(null);
const coverUploading = ref(false);
const coverError = ref<string | null>(null);

async function onCoverImagePick(file: File | null) {
  if (!file) return;
  coverUploading.value = true;
  coverError.value = null;
  try {
    const asset = await uploadAsset(file, form.value.title || file.name);
    form.value.coverImage = asset.id;
    coverImageUrl.value = asset.url;
  } catch (err) {
    coverError.value = (err as { message?: string }).message ?? 'Upload failed.';
  } finally {
    coverUploading.value = false;
  }
}

function removeCoverImage() {
  form.value.coverImage = undefined;
  coverImageUrl.value = null;
}

async function load() {
  // Duplicate flow: /admin/content/courses/new?from=<sourceId>
  if (isNew.value && route.query.from && typeof route.query.from === 'string') {
    loading.value = true;
    try {
      form.value = await buildDuplicateCourseFields(route.query.from);
      // Slug was set from `${source}-copy`, so don't auto-clobber it
      // when the editor edits the title afterwards.
      slugTouched.value = !!form.value.slug;
    } catch (err) {
      error.value = (err as { message?: string }).message ?? 'Failed to load source course.';
    } finally {
      loading.value = false;
    }
    return;
  }
  if (!id.value) return;
  loading.value = true;
  try {
    const entry = await getEntry(id.value);
    isPublished.value = entry.isPublished;
    const f = entry.fields;
    form.value = {
      slug: (f.slug as string) ?? '',
      title: (f.title as string) ?? '',
      program: (f.program as 'stepup_scholars' | 'dynamerge') ?? 'stepup_scholars',
      summary: (f.summary as string) ?? '',
      modules: extractRefIds(f.modules) ?? [],
      estimatedHours: f.estimatedHours as number | undefined,
      track: (f.track as string) ?? '',
      published: (f.published as boolean) ?? false,
      version: (f.version as string) ?? '',
      coverImage: extractRefId(f.coverImage),
    };
    // Existing courses always carry a slug — never auto-rewrite it
    // when the editor changes the title (would break links/imports).
    slugTouched.value = true;
    markClean();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load course.';
  } finally {
    loading.value = false;
  }
}

function extractRefIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => (v as { sys?: { id?: string } })?.sys?.id).filter((v): v is string => !!v);
}
function extractRefId(value: unknown): string | undefined {
  return (value as { sys?: { id?: string } })?.sys?.id;
}

// Auto-derive slug from title for new courses until the editor types
// into the slug field directly. Existing courses keep their slug
// stable regardless of title edits (load() sets slugTouched=true).
watch(
  () => form.value.title,
  newTitle => {
    if (slugTouched.value) return;
    form.value.slug = slugify(newTitle ?? '');
  }
);

function onVersionBlur() {
  form.value.version = normalizeVersion(form.value.version);
}

// ---- Computed estimated hours ----

const computedHours = ref<ComputedHours | null>(null);
const computingHours = ref(false);

watch(
  () => form.value.modules?.slice(),
  async modules => {
    if (!modules || modules.length === 0) {
      computedHours.value = null;
      return;
    }
    computingHours.value = true;
    try {
      computedHours.value = await computeCourseEstimatedHours(modules);
    } catch {
      computedHours.value = null;
    } finally {
      computingHours.value = false;
    }
  },
  { immediate: true, deep: true }
);

const showComputedHours = computed(
  () => !!computedHours.value && computedHours.value.lessonCount > 0
);

// ---- Track chip-autocomplete ----

const availableTracks = ref<string[]>([]);

async function loadTracks() {
  try {
    availableTracks.value = await listTracksForProgram(form.value.program);
  } catch {
    availableTracks.value = [];
  }
}

// Reload track suggestions when the editor switches programs — e.g.
// flipping from StepUp Scholars to Dynamerge should swap the
// suggested chips, not show the wrong program's tracks.
watch(() => form.value.program, loadTracks);

const canSave = computed(
  () =>
    !!form.value.slug.trim() &&
    !!form.value.title.trim() &&
    !!form.value.version.trim() &&
    !saving.value
);

function buildPayload(): { type: 'course'; fields: CourseFields } {
  // When we have a computed hour total from real lesson data, persist
  // it so readers (student LMS, course cards) don't have to re-walk
  // the module graph. Editor-typed values stay untouched when no
  // lessons exist yet.
  const fields: CourseFields = { ...form.value };
  if (showComputedHours.value && computedHours.value) {
    fields.estimatedHours = computedHours.value.hours;
  }
  return { type: 'course', fields };
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = null;
  try {
    const payload = buildPayload();
    if (id.value) {
      await updateEntry(id.value, payload);
    } else {
      const created = await createEntry(payload);
      id.value = created.id;
      router.replace({ path: `${adminBase.value}/content/courses/${created.id}` });
    }
    markClean();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Save failed.';
  } finally {
    saving.value = false;
  }
}

async function saveAndPublish() {
  if (!canSave.value) return;
  publishing.value = true;
  error.value = null;
  try {
    let entryId = id.value;
    const payload = buildPayload();
    if (entryId) {
      await updateEntry(entryId, payload);
    } else {
      const created = await createEntry(payload);
      entryId = created.id;
      id.value = created.id;
      router.replace({ path: `${adminBase.value}/content/courses/${created.id}` });
    }
    await publishEntry(entryId!);
    isPublished.value = true;
    markClean();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Publish failed.';
  } finally {
    publishing.value = false;
  }
}

onMounted(async () => {
  await load();
  await loadTracks();
});
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container class="max-w-3xl">
        <RouterLink
          :to="`${adminBase}/content/courses`"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> All courses
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">
          Course<span v-if="isNew && route.query.from"> | duplicated draft</span>
        </Eyebrow>
        <Heading :level="1" class="mb-2">
          {{
            isNew
              ? route.query.from
                ? 'Duplicate course'
                : 'New course'
              : form.title || 'Edit course'
          }}
        </Heading>
        <span
          v-if="!isNew"
          class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold"
          :class="isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'"
        >
          {{ isPublished ? 'Published' : 'Draft' }}
        </span>
      </Container>
    </Section>

    <Section class="!py-10">
      <Container class="max-w-3xl flex flex-col gap-6">
        <UiCard v-if="loading" class="p-10 bg-surface text-center">
          <Icon icon="lucide:loader-2" width="24" class="animate-spin text-brand-violet mx-auto" />
        </UiCard>

        <template v-else>
          <UiCard class="p-6 md:p-8 bg-surface flex flex-col gap-5">
            <!-- Title comes first so the auto-derived slug below has
                 something to work from. -->
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Title</label>
              <input
                v-model="form.title"
                type="text"
                class="input"
                placeholder="Foundations of Statistics"
              />
            </div>

            <div class="grid md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <label
                  class="text-xs font-semibold text-ink/70 uppercase tracking-wide flex items-center gap-2"
                >
                  Slug
                  <span
                    v-if="isNew && !slugTouched && form.slug"
                    class="text-[10px] text-ink/50 normal-case font-medium"
                  >
                    auto from title
                  </span>
                </label>
                <input
                  :value="form.slug"
                  type="text"
                  class="input font-mono"
                  placeholder="stepup-foundations"
                  @input="
                    form.slug = ($event.target as HTMLInputElement).value.toLowerCase();
                    slugTouched = true;
                  "
                  @blur="form.slug = normalizeSlug(form.slug)"
                />
                <p class="text-[11px] text-ink/50">
                  Lowercase letters, numbers, and hyphens only. Anything else gets normalized on
                  save.
                </p>
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >Version</label
                >
                <input
                  v-model="form.version"
                  type="text"
                  class="input font-mono"
                  placeholder="2026-spring"
                  @blur="onVersionBlur"
                />
                <p class="text-[11px] text-ink/50">
                  Format: <span class="font-mono">YYYY-spring|summer|fall</span>. "Spring 2026"
                  auto-corrects.
                </p>
              </div>
            </div>

            <div class="grid md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <label
                  for="course-program"
                  class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >Program</label
                >
                <UiSelect
                  id="course-program"
                  v-model="form.program"
                  :options="[
                    { value: 'stepup_scholars', label: 'StepUp Scholars' },
                    { value: 'dynamerge', label: 'Dynamerge' },
                  ]"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >Estimated hours</label
                >
                <!-- When the course has lessons, the total is computed
                     from their estimatedMinutes — editor-typed values
                     would only go stale. Falls back to a numeric input
                     when no lessons exist yet. -->
                <div
                  v-if="showComputedHours"
                  class="input flex items-baseline gap-2 cursor-default bg-ink/[0.03]"
                >
                  <span class="font-semibold">{{ computedHours?.hours ?? 0 }}</span>
                  <span class="text-ink/60">hours</span>
                  <span class="text-[11px] text-ink/50 ml-auto">
                    sum of {{ computedHours?.lessonCount }} lesson{{
                      computedHours?.lessonCount === 1 ? '' : 's'
                    }}
                  </span>
                </div>
                <input
                  v-else
                  v-model.number="form.estimatedHours"
                  type="number"
                  min="0"
                  step="0.5"
                  class="input"
                  :placeholder="
                    form.modules && form.modules.length > 0
                      ? 'No lessons with durations yet'
                      : 'Will be computed once lessons exist'
                  "
                />
                <p
                  v-if="computingHours"
                  class="text-[11px] text-ink/50 inline-flex items-center gap-1"
                >
                  <Icon icon="lucide:loader-2" width="10" class="animate-spin" /> recalculating
                </p>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Summary</label
              >
              <textarea v-model="form.summary" rows="3" class="input resize-none" />
            </div>

            <div class="grid md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">
                  Track <span class="text-ink/40 normal-case">(optional)</span>
                </label>
                <input
                  v-model="form.track"
                  type="text"
                  class="input"
                  placeholder="e.g. core, leadership"
                  list="track-suggestions"
                />
                <datalist id="track-suggestions">
                  <option v-for="t in availableTracks" :key="t" :value="t" />
                </datalist>
                <!-- Visible chip suggestions: clicking fills the field.
                     Filters out the current value so the active chip
                     doesn't sit redundantly below its own input. -->
                <div v-if="availableTracks.length > 0" class="flex flex-wrap gap-1.5 mt-0.5">
                  <button
                    v-for="t in availableTracks.filter(x => x !== form.track)"
                    :key="t"
                    type="button"
                    class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink/5 text-ink/70 hover:bg-brand-violet/10 hover:text-brand-violet transition-colors"
                    @click="form.track = t"
                  >
                    {{ t }}
                  </button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >Published flag</label
                >
                <label class="flex items-center gap-2 text-sm text-ink mt-2">
                  <input v-model="form.published" type="checkbox" />
                  Visible to enrolled students
                </label>
              </div>
            </div>
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <Heading :level="2" class="text-base mb-1">Cover image</Heading>
            <p class="text-xs text-ink/60 m-0 mb-4">
              Shown on course cards in the student portal. PNG or JPG, up to 10&nbsp;MB.
            </p>
            <div v-if="coverImageUrl" class="flex flex-col gap-3">
              <img
                :src="coverImageUrl"
                alt="Cover preview"
                class="w-full max-w-md rounded-xl border hairline-ink object-cover aspect-[16/9]"
              />
              <button
                type="button"
                class="text-xs font-semibold text-rose-700 hover:underline underline-offset-2 self-start inline-flex items-center gap-1"
                @click="removeCoverImage"
              >
                <Icon icon="lucide:trash-2" width="12" />
                Remove
              </button>
            </div>
            <div v-else-if="form.coverImage" class="flex items-center gap-3 text-xs text-ink/70">
              <Icon icon="lucide:image" width="14" />
              <span
                >Cover image attached (asset <code class="font-mono">{{ form.coverImage }}</code
                >). Upload below to replace.</span
              >
              <button
                type="button"
                class="text-rose-700 hover:underline underline-offset-2 inline-flex items-center gap-1 ml-2"
                @click="removeCoverImage"
              >
                <Icon icon="lucide:trash-2" width="12" />
                Remove
              </button>
            </div>
            <FileUpload
              v-if="!coverImageUrl"
              accept="image/*"
              :max-size-bytes="10_000_000"
              label="Choose a cover image"
              @update:file="onCoverImagePick"
              @error="m => (coverError = m)"
            />
            <p
              v-if="coverUploading"
              class="text-[11px] text-ink/60 mt-2 inline-flex items-center gap-1"
            >
              <Icon icon="lucide:loader-2" width="11" class="animate-spin" />
              Uploading…
            </p>
            <p v-if="coverError" role="alert" class="text-xs text-rose-700 mt-2 m-0">
              {{ coverError }}
            </p>
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <Heading :level="2" class="text-base mb-4">Modules</Heading>
            <EntryReferencePicker
              v-model="form.modules!"
              content-type="module"
              :exclude-id="id ?? undefined"
            />
          </UiCard>

          <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

          <div class="flex flex-wrap gap-2">
            <UiButton variant="secondary" :disabled="!canSave || saving" @click="save">
              <Icon v-if="saving" icon="lucide:loader-2" width="14" class="animate-spin" />
              {{ saving ? 'Saving…' : 'Save draft' }}
            </UiButton>
            <UiButton
              variant="primary"
              :disabled="!canSave || publishing || (isPublished && !isDirty)"
              @click="saveAndPublish"
            >
              <Icon v-if="publishing" icon="lucide:loader-2" width="14" class="animate-spin" />
              <Icon v-else-if="isPublished && !isDirty" icon="lucide:check" width="14" />
              <template v-if="publishing">Publishing…</template>
              <template v-else-if="isPublished && !isDirty">Published</template>
              <template v-else>Save &amp; publish</template>
            </UiButton>
          </div>
        </template>
      </Container>
    </Section>
  </div>
</template>

<style scoped>
.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(14, 18, 23, 0.08);
  background: #fff;
  font-size: 0.875rem;
}
.input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(139, 85, 255, 0.5);
}
</style>
