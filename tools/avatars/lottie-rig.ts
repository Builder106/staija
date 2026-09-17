/** Build deterministic, self-contained multi-layer Lottie avatars. */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AVATAR_MANIFESTS } from './manifests.ts'
import { AVATAR_CANVAS_SIZE as CANVAS_SIZE, AVATAR_DURATION_FRAMES as TOTAL_FRAMES, AVATAR_SLOT_COUNT, type AvatarLayerSource as AvatarLayer, type AvatarSlotManifest as AvatarManifest } from './contracts.ts'
import { MOTION_CONFIGS, type MotionConfig } from './lottie-motions.ts'
import { validateLottieDocument } from './lottie-validate.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT_DIR = join(ROOT, 'src/assets/avatar-lotties')
const FORCE = process.argv.includes('--force')
const ALL = process.argv.includes('--all')
const slotIndex = process.argv.indexOf('--slot')
const SLOT = slotIndex >= 0 ? Number(process.argv[slotIndex + 1]) : null
const AVATAR_SLOTS = Array.from({ length: AVATAR_SLOT_COUNT }, (_, slot) => slot)

const scalar = (steps: readonly { frame: number; value: number }[]) => ({ a: 1, k: steps.map(({ frame, value }) => ({ t: frame, s: [value] })) })
const vector = (steps: readonly { frame: number; value: { x: number; y: number } }[]) => ({ a: 1, k: steps.map(({ frame, value }) => ({ t: frame, s: [value.x, value.y, 0] })) })
const visibility = (steps: readonly { frame: number; value: boolean }[]) => scalar(steps.map(({ frame, value }) => ({ frame, value: value ? 100 : 0 })))
function hash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }

function layerMotion(layer: AvatarLayer, motion: MotionConfig): Record<string, unknown> {
  const ks: Record<string, unknown> = {
    a: 0,
    k: [128 + layer.transform.x, 128 + layer.transform.y, 0],
    s: { a: 0, k: [layer.transform.scaleX * 100, layer.transform.scaleY * 100, 100] },
  }
  if (layer.role === 'eyes-open') ks.o = visibility(motion.blink.map((s) => ({ ...s, value: !s.value })))
  if (layer.role === 'eyes-closed') ks.o = visibility(motion.blink)
  if (layer.role === 'mouth-rest') ks.o = visibility(motion.mouth.map((s) => ({ ...s, value: !s.value })))
  if (layer.role === 'mouth-smile') ks.o = visibility(motion.mouth)
  if (layer.role === 'brows') ks.p = vector(motion.brows)
  if (layer.role === 'head') ks.r = scalar(motion.head)
  if (layer.role === 'body') ks.p = vector(motion.body)
  if (layer.role === 'hair-front' || layer.role === 'hair-back') ks.p = vector(motion.hair)
  if (layer.role === 'accessory') ks.r = scalar(motion.accessory)
  ks.p ??= { a: 0, k: [128 + layer.transform.x, 128 + layer.transform.y, 0] }
  ks.r ??= { a: 0, k: 0 }
  ks.o ??= { a: 0, k: layer.visible ? 100 : 0 }
  return ks
}

async function requireSource(
  manifest: AvatarManifest,
  repositoryRoot = ROOT,
): Promise<Array<{ layer: AvatarLayer; bytes: Uint8Array }>> {
  const result: Array<{ layer: AvatarLayer; bytes: Uint8Array }> = []
  for (const layer of [...manifest.layers].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))) {
    const path = resolve(repositoryRoot, layer.file)
    if (!path.startsWith(join(repositoryRoot, 'tools/avatars/layers') + '/')) throw new Error(`Slot ${manifest.slot}: unsafe layer path ${layer.file}`)
    try { await access(path) } catch { throw new Error(`Slot ${manifest.slot}: missing source layer ${layer.file}; add source art before running the Lottie rigger`) }
    const bytes = await readFile(path)
    if (!bytes.length) throw new Error(`Slot ${manifest.slot}: source layer ${layer.file} is empty`)
    result.push({ layer, bytes })
  }
  return result
}

export async function buildLottieDocumentForManifest(
  manifest: AvatarManifest,
  repositoryRoot = ROOT,
): Promise<Record<string, unknown>> {
  const slot = manifest.slot
  const motion = MOTION_CONFIGS[slot]
  if (!manifest || !motion) throw new Error(`No manifest and motion configuration exists for slot ${slot}`)
  const sources = await requireSource(manifest, repositoryRoot)
  const assets = sources.map(({ layer, bytes }) => ({ id: `slot-${slot}-${layer.id}`, w: CANVAS_SIZE, h: CANVAS_SIZE, u: '', p: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`, e: 1 }))
  const layers = sources.map(({ layer }, index) => ({ ddd: 0, ind: index + 1, ty: 2, nm: layer.id, refId: `slot-${slot}-${layer.id}`, sr: 1, ks: layerMotion(layer, motion), ip: 0, op: TOTAL_FRAMES, st: 0, bm: 0 }))
  const sourceHash = hash(Buffer.concat(sources.map(({ bytes }) => Buffer.from(bytes))))
  return { v: '5.7.4', fr: 60, ip: 0, op: TOTAL_FRAMES, w: CANVAS_SIZE, h: CANVAS_SIZE, nm: `staija-avatar-slot-${slot}`, ddd: 0, assets, layers, meta: { schemaVersion: 1, generator: 'staija-avatar-rig', slot, motion: motion.label, sourceHash } }
}

export async function buildLottieDocument(slot: number): Promise<Record<string, unknown>> {
  const manifest = AVATAR_MANIFESTS[slot]
  if (!manifest) throw new Error(`No manifest exists for slot ${slot}`)
  return buildLottieDocumentForManifest(manifest)
}

async function rigSlot(slot: number): Promise<void> {
  const outPath = join(OUT_DIR, `slot-${slot}.json`)
  if (!FORCE) { try { await access(outPath); console.log(`✓ slot-${slot}.json exists; use --force to overwrite`); return } catch {} }
  const document = await buildLottieDocument(slot)
  const result = validateLottieDocument(document, { slot, manifest: AVATAR_MANIFESTS[slot] })
  if (!result.valid) throw new Error(`Slot ${slot}: generated Lottie failed validation: ${result.errors.join('; ')}`)
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(outPath, JSON.stringify(document))
  console.log(`✓ slot-${slot}.json (${(JSON.stringify(document).length / 1024).toFixed(1)} KB)`)
}

async function main(): Promise<void> {
  const slots = ALL ? AVATAR_SLOTS : SLOT === null ? [] : [SLOT]
  if (!slots.length || slots.some((slot) => !Number.isInteger(slot) || !AVATAR_SLOTS.includes(slot))) throw new Error('Usage: tsx tools/avatars/lottie-rig.ts --slot <0-9> [--force] OR --all')
  for (const slot of slots) await rigSlot(slot)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
