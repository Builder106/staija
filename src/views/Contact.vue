<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Motion } from 'motion-v';
import { ref } from 'vue';
import ScrollReveal from '../components/motion/ScrollReveal.vue';
import Body from '../components/ui/Body.vue';
import Container from '../components/ui/Container.vue';
import Eyebrow from '../components/ui/Eyebrow.vue';
import Heading from '../components/ui/Heading.vue';
import Section from '../components/ui/Section.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiCard from '../components/ui/UiCard.vue';
import UiSelect from '../components/ui/UiSelect.vue';
import { trackInquirySubmit } from '../services/analytics';

const submitted = ref(false);
// Local model for the subject UiSelect — the form is wired through
// analytics-only today (no backend POST), so a local ref is enough.
const subject = ref('');

function handleSubmit(e: Event) {
  e.preventDefault();
  trackInquirySubmit({ type: 'contact' });
  submitted.value = true;
}
</script>

<template>
  <div class="flex flex-col bg-paper min-h-screen">
    <Section>
      <Container>
        <div class="max-w-2xl mb-16">
          <Eyebrow class="text-brand-violet mb-4 block">Contact Us</Eyebrow>
          <Heading :level="1" class="mb-6"
            >We'd love to <span class="text-brand-violet">hear from you</span>.</Heading
          >
          <Body large>
            Whether you have a question about our programs, want to explore a partnership, or just
            want to say hello, our inbox is always open.
          </Body>
        </div>

        <div class="grid lg:grid-cols-12 gap-16 items-start">
          <ScrollReveal class="lg:col-span-7">
            <UiCard class="p-8 md:p-10 bg-surface">
              <Motion
                v-if="submitted"
                :initial="{ opacity: 0, scale: 0.95 }"
                :animate="{ opacity: 1, scale: 1 }"
                class="flex flex-col items-center text-center py-12 gap-4"
              >
                <div
                  class="w-20 h-20 bg-brand-violet/10 text-brand-violet rounded-full flex items-center justify-center mb-4"
                >
                  <Icon icon="lucide:send" width="32" class="ml-1" />
                </div>
                <Heading :level="2">Message sent!</Heading>
                <Body
                  >Thank you for reaching out. A member of our team will get back to you within
                  24-48 hours.</Body
                >
                <UiButton variant="secondary" class="mt-6" @click="submitted = false">
                  Send another message
                </UiButton>
              </Motion>

              <form v-else class="flex flex-col gap-6" @submit="handleSubmit">
                <div class="grid md:grid-cols-2 gap-6 min-w-0">
                  <div class="flex flex-col gap-2 min-w-0">
                    <label class="text-sm font-semibold text-ink/80">Full Name</label>
                    <input
                      type="text"
                      required
                      class="w-full min-w-0 border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                      placeholder="Amina Yusuf"
                    />
                  </div>
                  <div class="flex flex-col gap-2 min-w-0">
                    <label class="text-sm font-semibold text-ink/80">Email Address</label>
                    <input
                      type="email"
                      required
                      class="w-full min-w-0 border hairline-ink rounded-xl px-4 py-3 focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                      placeholder="amina@example.com"
                    />
                  </div>
                </div>

                <div class="flex flex-col gap-2 min-w-0">
                  <label class="text-sm font-semibold text-ink/80">Subject</label>
                  <UiSelect
                    v-model="subject"
                    placeholder="Select a topic"
                    :options="[
                      { value: 'programs', label: 'Program Inquiry (StepUp / Dynamerge)' },
                      { value: 'partnership', label: 'Partnership or Sponsorship' },
                      { value: 'media', label: 'Press or Media' },
                      { value: 'other', label: 'Other' },
                    ]"
                  />
                </div>

                <div class="flex flex-col gap-2 min-w-0">
                  <label class="text-sm font-semibold text-ink/80">Message</label>
                  <textarea
                    required
                    class="w-full min-w-0 border hairline-ink rounded-xl px-4 py-3 min-h-[160px] resize-y focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet transition-all text-sm bg-surface"
                    placeholder="How can we help you?"
                  />
                </div>

                <UiButton
                  variant="primary"
                  type="submit"
                  class="w-full md:w-auto !h-12 text-base mt-2 group"
                >
                  <span class="flex items-center gap-2">
                    Send Message
                    <Icon
                      icon="lucide:send"
                      width="16"
                      class="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"
                    />
                  </span>
                </UiButton>
              </form>
            </UiCard>
          </ScrollReveal>

          <ScrollReveal :delay="0.12" class="lg:col-span-5 flex flex-col gap-12">
            <div>
              <Heading :level="3" class="mb-6">Contact Information</Heading>
              <div class="flex flex-col gap-6">
                <a
                  href="mailto:contact@staija.org"
                  class="flex items-start gap-4 p-4 rounded-xl hover:bg-surface border border-transparent hover:border-ink/10 transition-all group"
                >
                  <div
                    class="w-10 h-10 rounded-full bg-brand-violet/10 text-brand-violet flex items-center justify-center shrink-0 mt-1"
                  >
                    <Icon icon="lucide:mail" width="20" />
                  </div>
                  <div>
                    <h4
                      class="font-semibold text-ink mb-1 group-hover:text-brand-violet transition-colors m-0"
                    >
                      Email Us
                    </h4>
                    <p class="text-sm text-ink/60 m-0">contact@staija.org</p>
                    <p class="text-xs text-ink/40 mt-1 m-0">We aim to respond within 24 hours.</p>
                  </div>
                </a>

                <div class="flex items-start gap-4 p-4 rounded-xl border border-transparent">
                  <div
                    class="w-10 h-10 rounded-full bg-brand-sky/10 text-brand-sky flex items-center justify-center shrink-0 mt-1"
                  >
                    <Icon icon="lucide:map-pin" width="20" />
                  </div>
                  <div>
                    <h4 class="font-semibold text-ink mb-1 m-0">Lagos Office</h4>
                    <p class="text-sm text-ink/60 leading-relaxed max-w-[200px] m-0">
                      14 Innovation Drive,<br />
                      Yaba, Lagos 101212,<br />
                      Nigeria
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              class="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-ink/5 border hairline-ink relative flex items-center justify-center"
            >
              <div
                class="absolute inset-0 bg-cover bg-center opacity-30 grayscale"
                style="
                  background-image: url('https://images.unsplash.com/photo-1524661135-423995f22d0b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080');
                "
              />
              <div class="bg-surface p-3 rounded-full shadow-lg z-10 flex items-center gap-2">
                <Icon icon="lucide:map-pin" width="20" class="text-brand-violet" />
                <span class="font-semibold text-sm pr-2">STAIJA HQ</span>
              </div>
            </div>

            <div>
              <Heading :level="3" class="mb-4 !text-lg">Follow Us</Heading>
              <div class="flex flex-wrap gap-4">
                <a
                  v-for="social in ['Twitter', 'LinkedIn', 'Instagram']"
                  :key="social"
                  href="#"
                  class="px-4 py-2 rounded-full border hairline-ink text-sm font-semibold hover:!border-brand-violet hover:!text-brand-violet transition-colors bg-surface"
                >
                  {{ social }}
                </a>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </Container>
    </Section>
  </div>
</template>
