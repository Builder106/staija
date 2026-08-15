<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import EntryReferencePicker from '../../../components/admin/EntryReferencePicker.vue';
import Container from '../../../components/ui/Container.vue';
import Eyebrow from '../../../components/ui/Eyebrow.vue';
import Heading from '../../../components/ui/Heading.vue';
import Section from '../../../components/ui/Section.vue';
import UiButton from '../../../components/ui/UiButton.vue';
import UiCard from '../../../components/ui/UiCard.vue';
import UiSelect from '../../../components/ui/UiSelect.vue';
import { useAdminBase } from '../../../composables/useAdminBase';
import { useFormDirty } from '../../../composables/useFormDirty';
import {
  createEntry,
  getEntry,
  normalizeSlug,
  publishEntry,
  updateEntry,
  type ModuleFields,
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

const form = ref<ModuleFields>({
  slug: '',
  title: '',
  summary: '',
  lessons: [],
  assignments: [],
  unlockRule: 'sequential',
});
const { isDirty, markClean } = useFormDirty(form);

function extractRefIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => (v as { sys?: { id?: string } })?.sys?.id).filter((v): v is string => !!v);
}

async function load() {
  if (!id.value) return;
  loading.value = true;
  try {
    const entry = await getEntry(id.value);
    isPublished.value = entry.isPublished;
    const f = entry.fields;
    form.value = {
      slug: (f.slug as string) ?? '',
      title: (f.title as string) ?? '',
      summary: (f.summary as string) ?? '',
      lessons: extractRefIds(f.lessons),
      assignments: extractRefIds(f.assignments),
      unlockRule: (f.unlockRule as 'sequential' | 'open') ?? 'sequential',
    };
    markClean();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? 'Failed to load module.';
  } finally {
    loading.value = false;
  }
}

const canSave = computed(
  () => !!form.value.slug.trim() && !!form.value.title.trim() && !saving.value
);

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = null;
  try {
    if (id.value) {
      await updateEntry(id.value, { type: 'module', fields: form.value });
    } else {
      const created = await createEntry({ type: 'module', fields: form.value });
      id.value = created.id;
      router.replace({ path: `${adminBase.value}/content/modules/${created.id}` });
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
    if (entryId) {
      await updateEntry(entryId, { type: 'module', fields: form.value });
    } else {
      const created = await createEntry({ type: 'module', fields: form.value });
      entryId = created.id;
      id.value = created.id;
      router.replace({ path: `${adminBase.value}/content/modules/${created.id}` });
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

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-10 !pb-6 border-b hairline-ink">
      <Container class="max-w-3xl">
        <RouterLink
          :to="`${adminBase}/content/modules`"
          class="text-xs text-ink/60 hover:text-ink mb-3 inline-flex items-center gap-1"
        >
          <Icon icon="lucide:arrow-left" width="12" /> All modules
        </RouterLink>
        <Eyebrow class="text-brand-violet mb-2 block">Module</Eyebrow>
        <Heading :level="1" class="mb-2">
          {{ isNew ? 'New module' : form.title || 'Edit module' }}
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
            <div class="grid md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >Slug</label
                >
                <input
                  :value="form.slug"
                  type="text"
                  class="input font-mono"
                  @input="form.slug = ($event.target as HTMLInputElement).value.toLowerCase()"
                  @blur="form.slug = normalizeSlug(form.slug)"
                />
                <p class="text-[11px] text-ink/50">
                  Lowercase letters, numbers, and hyphens only. Anything else gets normalized on
                  save.
                </p>
              </div>
              <div class="flex flex-col gap-2">
                <label
                  for="module-unlock-rule"
                  class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                  >Unlock rule</label
                >
                <UiSelect
                  id="module-unlock-rule"
                  v-model="form.unlockRule"
                  :options="[
                    { value: 'sequential', label: 'Sequential', hint: 'Finish lessons in order' },
                    { value: 'open', label: 'Open', hint: 'Students can jump around' },
                  ]"
                />
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide">Title</label>
              <input v-model="form.title" type="text" class="input" />
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-xs font-semibold text-ink/70 uppercase tracking-wide"
                >Summary</label
              >
              <textarea v-model="form.summary" rows="3" class="input resize-none" />
            </div>
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <Heading :level="2" class="text-base mb-4">Lessons</Heading>
            <EntryReferencePicker v-model="form.lessons!" content-type="lesson" />
          </UiCard>

          <UiCard class="p-6 md:p-8 bg-surface">
            <Heading :level="2" class="text-base mb-4">Assignments</Heading>
            <EntryReferencePicker v-model="form.assignments!" content-type="assignmentSpec" />
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
