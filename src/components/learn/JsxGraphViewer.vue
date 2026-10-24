<script setup lang="ts">
import JXG from 'jsxgraph';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { compileSafeMath } from '../../services/safeMathParser';
import { validateGeometrySpec, type GeometrySpec, type RawJsonValue } from '../../types/geometry';

const props = defineProps<{
  spec: string | GeometrySpec;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const containerId = ref(`jxg_${Math.random().toString(36).substring(2, 9)}`);
const error = ref<string | null>(null);
const board = ref<JXG.Board | null>(null);
let resizeObserver: ResizeObserver | null = null;

const parsedSpec = computed<{ valid: true; data: GeometrySpec } | { valid: false; error: string }>(
  () => {
    try {
      let raw: RawJsonValue | GeometrySpec = props.spec;
      if (typeof props.spec === 'string') {
        const trimmed = props.spec.trim();
        // Remove code fence if present
        const jsonStr = trimmed
          .replace(/^```(?:geometry|jsxgraph|json)?\s*/i, '')
          .replace(/\s*```$/, '');
        raw = JSON.parse(jsonStr);
      }
      const validation = validateGeometrySpec(raw);
      if (!validation.valid) {
        return { valid: false, error: validation.error };
      }
      return { valid: true, data: validation.spec };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Invalid geometry JSON specification',
      };
    }
  },
);

const accessibleSummary = computed(() => {
  if (!parsedSpec.value.valid) return 'Interactive STEM geometry diagram (invalid specification)';
  const s = parsedSpec.value.data;
  const parts: string[] = [];
  if (s.title) parts.push(`Title: ${s.title}.`);
  if (s.description) parts.push(s.description);
  parts.push(
    `Contains ${s.elements.length} elements: ${s.elements.map((e) => ('name' in e && e.name ? e.name : e.kind)).join(', ')}.`,
  );
  return parts.join(' ');
});

function initBoard() {
  if (!containerRef.value) return;

  if (board.value) {
    try {
      JXG.JSXGraph.freeBoard(board.value);
    } catch {
      // ignore cleanup errors
    }
    board.value = null;
  }

  error.value = null;

  if (!parsedSpec.value.valid) {
    error.value = parsedSpec.value.error;
    return;
  }

  const spec = parsedSpec.value.data;
  const boundingBox = spec.boundingBox || [-5, 5, 5, -5];

  try {
    const createdBoard = JXG.JSXGraph.initBoard(containerId.value, {
      boundingbox: boundingBox,
      axis: spec.axis !== false,
      grid: spec.grid !== false,
      showNavigation: spec.showNavigation || false,
      showCopyright: false,
      keepaspectratio: spec.keepAspectRatio || false,
    });

    const elementMap = new Map<string, JXG.GeometryElement>();
    const sliders = new Map<string, JXG.Slider>();

    // Helper: resolve point reference (either coordinate [x, y] or ID of existing point)
    function resolvePoint(ref: string | [number, number]): [number, number] | JXG.GeometryElement {
      if (typeof ref === 'string') {
        const found = elementMap.get(ref);
        if (found) return found;
        throw new Error(`Referenced point '${ref}' was not found`);
      }
      return ref;
    }

    // 1. First pass: Sliders and Points
    for (const el of spec.elements) {
      if (el.kind === 'slider') {
        const s = createdBoard.create('slider', [el.point1, el.point2, el.range], {
          name: el.name,
          visible: el.visible !== false,
        });
        if (el.id) elementMap.set(el.id, s);
        elementMap.set(el.name, s);
        sliders.set(el.name, s);
      } else if (el.kind === 'point') {
        const p = createdBoard.create('point', el.coords, {
          name: el.name || '',
          fixed: !!el.fixed,
          size: el.size || 3,
          color: el.color || '#4f46e5',
          visible: el.visible !== false,
        });
        if (el.id) elementMap.set(el.id, p);
        if (el.name) elementMap.set(el.name, p);
      }
    }

    // 2. Second pass: Lines, Circles, Polygons, Vectors, Curves, Functions, Text
    for (const el of spec.elements) {
      if (el.kind === 'slider' || el.kind === 'point') continue;

      switch (el.kind) {
        case 'line':
        case 'segment': {
          const p1 = resolvePoint(el.point1);
          const p2 = resolvePoint(el.point2);
          const line =
            el.kind === 'segment'
              ? createdBoard.create('segment', [p1, p2], {
                  name: el.name || '',
                  strokeColor: el.color || '#4f46e5',
                  strokeWidth: el.strokeWidth || 2,
                  dash: el.dash || 0,
                  visible: el.visible !== false,
                })
              : createdBoard.create('line', [p1, p2], {
                  name: el.name || '',
                  strokeColor: el.color || '#4f46e5',
                  strokeWidth: el.strokeWidth || 2,
                  dash: el.dash || 0,
                  visible: el.visible !== false,
                });
          if (el.id) elementMap.set(el.id, line);
          break;
        }

        case 'circle': {
          const center = resolvePoint(el.center);
          let circle: JXG.Circle | null = null;
          if (el.radius !== undefined) {
            circle = createdBoard.create('circle', [center, el.radius], {
              name: el.name || '',
              strokeColor: el.color || '#6366f1',
              fillColor: el.fillColor || '#a5b4fc',
              fillOpacity: el.fillOpacity ?? 0.2,
              strokeWidth: el.strokeWidth || 2,
              visible: el.visible !== false,
            });
          } else if (el.pointOnCircle) {
            const poc = resolvePoint(el.pointOnCircle);
            circle = createdBoard.create('circle', [center, poc], {
              name: el.name || '',
              strokeColor: el.color || '#6366f1',
              fillColor: el.fillColor || '#a5b4fc',
              fillOpacity: el.fillOpacity ?? 0.2,
              strokeWidth: el.strokeWidth || 2,
              visible: el.visible !== false,
            });
          }
          if (circle && el.id) elementMap.set(el.id, circle);
          break;
        }

        case 'polygon': {
          const resolvedVertices = el.vertices.map((v) => resolvePoint(v));
          const poly = createdBoard.create('polygon', resolvedVertices, {
            name: el.name || '',
            fillColor: el.fillColor || '#818cf8',
            fillOpacity: el.fillOpacity ?? 0.25,
            borders: {
              strokeColor: el.color || '#4f46e5',
              strokeWidth: el.strokeWidth || 2,
            },
            visible: el.visible !== false,
          });
          if (el.id) elementMap.set(el.id, poly);
          break;
        }

        case 'vector': {
          const p1 = resolvePoint(el.point1);
          const p2 = resolvePoint(el.point2);
          const arrow = createdBoard.create('arrow', [p1, p2], {
            name: el.name || '',
            strokeColor: el.color || '#ec4899',
            strokeWidth: el.strokeWidth || 2.5,
            visible: el.visible !== false,
          });
          if (el.id) elementMap.set(el.id, arrow);
          break;
        }

        case 'functiongraph': {
          const compiledFn = compileSafeMath(el.fn);
          const fnWrapper = (x: number) => {
            const params: Record<string, number> = {};
            for (const [name, sObj] of sliders.entries()) {
              if (sObj && typeof sObj.Value === 'function') {
                params[name] = sObj.Value();
              }
            }
            return compiledFn(x, params);
          };

          const curve = createdBoard.create('functiongraph', [fnWrapper, el.min, el.max], {
            name: el.name || el.fn,
            strokeColor: el.color || '#0284c7',
            strokeWidth: el.strokeWidth || 2.5,
            dash: el.dash || 0,
            visible: el.visible !== false,
          });
          if (el.id) elementMap.set(el.id, curve);
          break;
        }

        case 'curve': {
          const curve = createdBoard.create('curve', [el.dataX, el.dataY], {
            name: el.name || '',
            strokeColor: el.color || '#0d9488',
            strokeWidth: el.strokeWidth || 2,
            dash: el.dash || 0,
            visible: el.visible !== false,
          });
          if (el.id) elementMap.set(el.id, curve);
          break;
        }

        case 'text': {
          const txt = createdBoard.create('text', [el.coords[0], el.coords[1], el.text], {
            fontSize: el.fontSize || 12,
            strokeColor: el.color || '#1e293b',
            visible: el.visible !== false,
          });
          if (el.id) elementMap.set(el.id, txt);
          break;
        }
      }
    }

    board.value = createdBoard;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Error rendering JSXGraph construction';
  }
}

function resetView() {
  if (board.value && parsedSpec.value.valid) {
    const bb = parsedSpec.value.data.boundingBox || [-5, 5, 5, -5];
    board.value.setBoundingBox(bb);
  }
}

onMounted(() => {
  nextTick(() => {
    initBoard();
    if (containerRef.value) {
      resizeObserver = new ResizeObserver(() => {
        if (board.value && containerRef.value) {
          const width = containerRef.value.clientWidth;
          const height = containerRef.value.clientHeight;
          if (width > 0 && height > 0) {
            board.value.resizeContainer(width, height);
          }
        }
      });
      resizeObserver.observe(containerRef.value);
    }
  });
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (board.value) {
    try {
      JXG.JSXGraph.freeBoard(board.value);
    } catch {
      // ignore cleanup
    }
    board.value = null;
  }
});

watch(
  () => props.spec,
  () => {
    nextTick(initBoard);
  },
  { deep: true },
);
</script>

<template>
  <div class="flex flex-col gap-2 w-full my-2">
    <!-- Header with Title & Reset View -->
    <div
      v-if="parsedSpec.valid && (parsedSpec.data.title || parsedSpec.data.description)"
      class="flex items-center justify-between gap-2 border-b border-ink/10 pb-2"
    >
      <div>
        <h5 v-if="parsedSpec.data.title" class="text-xs font-semibold text-brand-violet">
          {{ parsedSpec.data.title }}
        </h5>
        <p v-if="parsedSpec.data.description" class="text-[11px] text-ink/60">
          {{ parsedSpec.data.description }}
        </p>
      </div>

      <button
        type="button"
        class="text-[11px] text-ink/50 hover:text-ink px-2 py-0.5 rounded border border-ink/10 hover:bg-surface-raised transition-colors shrink-0"
        title="Reset zoom and coordinate bounding box"
        @click="resetView"
      >
        Reset view
      </button>
    </div>

    <!-- Error fallback -->
    <div
      v-if="error"
      class="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex flex-col gap-2"
    >
      <div class="font-semibold">Interactive Geometry Error</div>
      <div>{{ error }}</div>
      <pre class="bg-surface p-2 rounded text-[10px] overflow-x-auto text-ink/70">{{ spec }}</pre>
    </div>

    <!-- Canvas Container -->
    <div
      v-show="!error"
      :id="containerId"
      ref="containerRef"
      class="w-full h-72 sm:h-80 bg-surface rounded-xl border border-ink/10 overflow-hidden relative shadow-xs"
      :aria-label="accessibleSummary"
      role="region"
    />

    <!-- Screen-reader accessible summary -->
    <span class="sr-only">{{ accessibleSummary }}</span>
  </div>
</template>

<style>
/* JSXGraph styling and integration with design system */
.jxgbox {
  position: relative;
  overflow: hidden;
  background-color: transparent;
  margin: 0;
  touch-action: none;
}

.jxgbox svg text {
  cursor: default;
  user-select: none;
  font-family: inherit;
}

.JXGtext {
  background-color: transparent;
  padding: 0;
  margin: 0;
}

.JXGinfobox {
  border-style: none;
  border-width: 0;
}

.jxgbox :focus {
  outline-width: 1px;
  outline-style: dotted;
}

.JXG_navigation {
  position: absolute;
  right: 5px;
  bottom: 5px;
  z-index: 100;
  background-color: transparent;
  padding: 2px;
  font-size: 14px;
  cursor: pointer;
}

.JXG_navigation_button {
  color: #666;
}

.JXG_navigation_button:hover {
  border-radius: 2px;
  background: rgba(184, 184, 184, 0.5);
}
</style>
