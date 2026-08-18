<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { httpsCallable } from 'firebase/functions';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import Body from '../../components/ui/Body.vue';
import Container from '../../components/ui/Container.vue';
import Eyebrow from '../../components/ui/Eyebrow.vue';
import FileUpload from '../../components/ui/FileUpload.vue';
import Heading from '../../components/ui/Heading.vue';
import Section from '../../components/ui/Section.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiCard from '../../components/ui/UiCard.vue';
import { functions, getAppCheckToken } from '../../config/firebase';
import { getAppConfig } from '../../utils/env';

interface ReferenceContext {
  applicantName: string;
  program: string;
  referenceName: string | null;
  relationship: string | null;
  institution: string | null;
  alreadyReceived: boolean;
}

const route = useRoute();
const token = ref<string>(route.params.token as string);

const loading = ref(true);
const context = ref<ReferenceContext | null>(null);
const tokenError = ref<string | null>(null);
const file = ref<File | null>(null);
const fileError = ref<string | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const success = ref(false);

async function load() {
  loading.value = true;
  tokenError.value = null;
  try {
    const callable = httpsCallable<{ token: string }, ReferenceContext>(
      functions,
      'validateReferenceToken',
    );
    const result = await callable({ token: token.value });
    context.value = result.data;
    if (context.value.alreadyReceived) {
      success.value = true;
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = (err as { message?: string }).message ?? "Couldn't validate this link.";
    if (code === 'permission-denied') {
      tokenError.value =
        'This link is invalid or has expired. Please ask the applicant to send you a fresh one.';
    } else if (code === 'not-found') {
      tokenError.value = "We couldn't find this application. The applicant may have withdrawn it.";
    } else {
      tokenError.value = message;
    }
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  if (!file.value || !context.value) return;
  submitting.value = true;
  submitError.value = null;

  const endpoint = getAppConfig().referenceUploadEndpoint;

  if (!endpoint) {
    submitError.value =
      'Upload endpoint not configured. Email contact@staija.org with the letter attached.';
    submitting.value = false;
    return;
  }

  try {
    const appCheckToken = await getAppCheckToken();
    if (!appCheckToken) {
      throw new Error('App verification failed. Refresh the page and try again.');
    }

    const formData = new FormData();
    formData.append('letter', file.value, file.value.name);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-Reference-Token': token.value,
        'X-Firebase-AppCheck': appCheckToken,
      },
      body: formData,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Upload failed (${res.status})`);
    }
    success.value = true;
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Upload failed. Try again.';
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section class="!pt-12 !pb-8 wash-violet-6 border-b hairline-ink">
      <Container class="max-w-2xl">
        <Eyebrow class="text-brand-violet mb-3 block">Reference upload</Eyebrow>
        <Heading :level="1" class="mb-3">
          Recommend a STAIJA <span class="text-brand-violet">applicant</span>.
        </Heading>
        <Body class="text-ink/70">
          Thanks for being someone's reference. Upload a short letter or note — whatever you'd send
          for any other program is fine.
        </Body>
      </Container>
    </Section>

    <Section class="!py-12">
      <Container class="max-w-2xl">
        <UiCard class="p-6 md:p-10 bg-surface">
          <div v-if="loading" class="flex flex-col gap-4">
            <div class="h-6 w-48 bg-ink/5 rounded animate-pulse" />
            <div class="h-4 w-full bg-ink/5 rounded animate-pulse" />
            <div class="h-4 w-5/6 bg-ink/5 rounded animate-pulse" />
            <div class="h-32 w-full bg-ink/5 rounded-xl animate-pulse mt-4" />
          </div>

          <div v-else-if="tokenError" role="alert" class="flex flex-col items-start gap-4">
            <div
              class="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center"
            >
              <Icon icon="lucide:link-2-off" width="24" />
            </div>
            <Heading :level="3">Link not usable</Heading>
            <Body class="text-ink/70 m-0">{{ tokenError }}</Body>
            <UiButton variant="secondary" href="mailto:contact@staija.org"> Email STAIJA </UiButton>
          </div>

          <div v-else-if="success" role="status" class="flex flex-col items-start gap-4">
            <div
              class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center"
            >
              <Icon icon="lucide:check-circle-2" width="24" />
            </div>
            <Heading :level="3">Letter received</Heading>
            <Body class="text-ink/70 m-0">
              Thanks — STAIJA has your recommendation
              <template v-if="context?.applicantName"
                >for <strong>{{ context.applicantName }}</strong></template
              >. You can close this tab.
            </Body>
          </div>

          <div v-else-if="context" class="flex flex-col gap-6">
            <div class="border hairline-ink rounded-xl p-5 bg-paper/50">
              <div class="text-xs uppercase tracking-wider font-semibold text-ink/50 mb-2">
                You're recommending
              </div>
              <div class="font-display text-2xl text-ink m-0">{{ context.applicantName }}</div>
              <div class="text-sm text-ink/60 mt-1">
                Applying to {{ context.program }}
                <template v-if="context.relationship">
                  | listed you as {{ context.relationship }}</template
                >
                <template v-if="context.institution"> at {{ context.institution }}</template
                >.
              </div>
            </div>

            <div>
              <Heading :level="3" class="!text-xl mb-2">Upload your letter</Heading>
              <Body class="text-ink/70 mb-4">
                A short, candid letter is more useful than a long generic one — focus on what you've
                actually seen them do. PDF or image is fine. Up to 5MB.
              </Body>
              <FileUpload
                label="Recommendation letter"
                accept="image/*,application/pdf"
                :max-size-bytes="5 * 1024 * 1024"
                @update:file="(f) => (file = f)"
                @error="(m) => (fileError = m)"
              />
              <p v-if="fileError" role="alert" class="mt-3 text-sm text-red-600 m-0">
                {{ fileError }}
              </p>
            </div>

            <p
              v-if="submitError"
              role="alert"
              class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 m-0"
            >
              {{ submitError }}
            </p>

            <UiButton
              variant="gradient"
              :disabled="!file || submitting"
              class="self-start"
              @click="handleSubmit"
            >
              <span v-if="submitting">Uploading…</span>
              <span v-else class="flex items-center gap-2">
                Submit letter
                <Icon icon="lucide:arrow-right" width="16" />
              </span>
            </UiButton>

            <p class="text-xs text-ink/40 m-0">
              You don't need a STAIJA account to submit. The applicant won't see your letter — only
              program reviewers do.
            </p>
          </div>
        </UiCard>
      </Container>
    </Section>
  </div>
</template>
