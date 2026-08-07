<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import mermaid from 'mermaid'
import { Icon } from '@iconify/vue'

const props = defineProps<{
  code: string
}>()

const container = ref<HTMLElement | null>(null)
const svgContent = ref('')
const error = ref<string | null>(null)
const rendering = ref(false)

// Generate unique ID per instance
const diagramId = `mermaid-${Math.random().toString(36).substring(2, 9)}`

// Initialize mermaid config
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
})

async function renderDiagram() {
  if (!props.code || !props.code.trim()) return

  rendering.value = true
  error.value = null

  try {
    const cleanCode = props.code.trim()
    const { svg } = await mermaid.render(diagramId, cleanCode)
    svgContent.value = svg
  } catch (err: unknown) {
    console.warn('Mermaid render error:', err)
    error.value = 'Could not render interactive diagram. Raw code shown below.'
  } finally {
    rendering.value = false
  }
}

onMounted(() => {
  renderDiagram()
})

watch(() => props.code, () => {
  nextTick(renderDiagram)
})
</script>

<template>
  <div class="my-4 rounded-xl border border-brand-violet/20 bg-ink/90 p-4 text-white overflow-hidden shadow-inner">
    <div class="flex items-center justify-between border-b border-white/10 pb-2 mb-3 text-xs font-semibold text-brand-light font-mono">
      <span class="flex items-center gap-1.5">
        <Icon icon="lucide:network" width="14" class="text-brand-violet" />
        Interactive Concept Map
      </span>
    </div>

    <div v-if="rendering" class="py-8 text-center text-xs text-ink/40 flex items-center justify-center gap-2">
      <Icon icon="lucide:loader-2" width="16" class="animate-spin text-brand-violet" />
      Rendering diagram...
    </div>

    <div v-else-if="error" class="p-3 bg-red-950/40 border border-red-500/20 rounded text-xs text-red-300">
      <p class="font-medium mb-1">{{ error }}</p>
      <pre class="bg-black/50 p-2 rounded overflow-x-auto text-[11px] font-mono text-ink/70">{{ code }}</pre>
    </div>

    <div
      v-else
      ref="container"
      class="mermaid-svg-wrapper flex justify-center items-center overflow-x-auto p-2 min-h-[120px]"
      v-html="svgContent"
    />
  </div>
</template>

<style scoped>
.mermaid-svg-wrapper :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
