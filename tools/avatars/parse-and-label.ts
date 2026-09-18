/**
 * Replace color-traced SVGs (which lump same-color features into one
 * path) with **semantically-labelled SVGs** where each face feature
 * is its own named group: `<g id="left_eye">`, `<g id="glasses">`, etc.
 *
 * Pipeline:
 *
 *   raw/portrait-X.png
 *      │
 *      ▼  HuggingFace face-parsing model (CelebAMask-HQ classes)
 *   per-class binary masks (one per: skin, hair, eyes, glasses, etc.)
 *      │
 *      ▼  potrace (per-mask raster→SVG vectorization)
 *      ▼  + per-mask mean color sampled from the source PNG
 *   <g id="left_eye" fill="rgb(...)"><path d="..."/></g>  ×N
 *      │
 *      ▼  wrap in viewBox-correct <svg>
 *   traced/portrait-X.svg  (replaces the chromatic trace)
 *
 * Why this matters: the prior color-traced output merged "iris" and
 * "upper eyelid" into a single path because they shared a fill colour.
 * That made feature-level animation impossible. Face parsing
 * separates by SEMANTIC class, not by colour, so animation can
 * isolate eye-from-eyelid, glasses-from-frame, etc.
 *
 * Usage:
 *   npm run avatars:label -- --slot 6
 *   npm run avatars:label -- --all
 *   npm run avatars:label -- --slot 6 --force
 */

import 'dotenv/config'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { InferenceClient } from '@huggingface/inference'
import { Jimp } from 'jimp'
// @ts-expect-error — potrace ships JS without TS types
import potraceMod from 'potrace'

const HERE = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = join(HERE, 'raw')
const TRACED_DIR = join(HERE, 'traced')

const argv = process.argv.slice(2)
const FORCE = argv.includes('--force')
const ALL = argv.includes('--all')
const slotIdx = argv.indexOf('--slot')
const SLOT =
  slotIdx >= 0 && argv[slotIdx + 1]
    ? Number.parseInt(argv[slotIdx + 1], 10)
    : null

// Map of HF face-parsing class labels → readable group IDs we'll
// expose on the resulting SVG. Animation code targets these IDs, so
// keep them stable across portraits. Classes the model emits but
// aren't mapped here fall through with the original label.
const CLASS_MAP: Record<string, string> = {
  background: 'background',
  skin: 'skin',
  l_brow: 'left_eyebrow',
  r_brow: 'right_eyebrow',
  l_eye: 'left_eye',
  r_eye: 'right_eye',
  eye_g: 'glasses',
  l_ear: 'left_ear',
  r_ear: 'right_ear',
  ear_r: 'earring',
  nose: 'nose',
  mouth: 'mouth',
  u_lip: 'upper_lip',
  l_lip: 'lower_lip',
  neck: 'neck',
  neck_l: 'necklace',
  cloth: 'clothing',
  hair: 'hair',
  hat: 'hat',
}

const MODEL = 'jonathandinu/face-parsing'

interface PotraceCallback {
  (err: Error | null, svg: string): void
}
interface PotraceModule {
  trace: (
    buffer: Buffer,
    options: Record<string, unknown>,
    cb: PotraceCallback,
  ) => void
}
const traceAsync = promisify(
  (potraceMod as PotraceModule).trace.bind(potraceMod),
) as (buffer: Buffer, options: Record<string, unknown>) => Promise<string>

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

interface Segment {
  label: string
  score: number
  mask: string // base64 PNG
}

function isSegment(value: unknown): value is Segment {
  if (!value || typeof value !== 'object') return false
  const segment = value as { label?: unknown; score?: unknown; mask?: unknown }
  return typeof segment.label === 'string' && typeof segment.score === 'number' && typeof segment.mask === 'string'
}

async function parseAndLabel(slot: number, name: string): Promise<void> {
  const inPath = join(RAW_DIR, `${name}.png`)
  const outPath = join(TRACED_DIR, `${name}.svg`)

  if (!FORCE && (await fileExists(outPath))) {
    console.log(`✓ ${name}.svg already exists, skipping (use --force)`)
    return
  }

  process.stdout.write(`→ slot ${slot} (${name}) ... `)

  const sourceBuffer = await readFile(inPath)
  const sourceImage = await Jimp.read(sourceBuffer)
  const W = sourceImage.bitmap.width
  const H = sourceImage.bitmap.height

  const token = process.env.HF_TOKEN
  if (!token) {
    throw new Error('HF_TOKEN missing in env. Add it to .env at the project root.')
  }
  const client = new InferenceClient(token)

  // Run face parsing. Returns an array of one entry per detected
  // class with a base64 binary mask the same size as the source.
  const response: unknown = await client.imageSegmentation({
    inputs: new Blob([sourceBuffer], { type: 'image/png' }),
    model: MODEL,
  })
  if (!Array.isArray(response) || !response.every(isSegment)) {
    throw new Error('Face-parsing response did not contain valid labelled segments')
  }
  const segments = response

  const groups: string[] = []
  let skipped = 0

  for (const seg of segments) {
    const id = CLASS_MAP[seg.label] ?? seg.label
    // Skip background — we want the resulting SVG to render
    // transparently behind a real card background, not paint a
    // beige rectangle of its own.
    if (id === 'background') {
      skipped++
      continue
    }

    // Decode mask: typically a PNG where the class pixels are white,
    // others black. Some HF endpoints return raw base64; others
    // return a data URI. Strip any "data:image/png;base64," prefix.
    const rawMask = seg.mask.startsWith('data:')
      ? seg.mask.split(',')[1]
      : seg.mask
    const maskBuffer = Buffer.from(rawMask, 'base64')
    const maskImage = await Jimp.read(maskBuffer)

    // Sample the mean color from the source PNG at every "on" pixel
    // of this mask. This becomes the flat fill for this feature group.
    let rSum = 0,
      gSum = 0,
      bSum = 0,
      count = 0
    const md = maskImage.bitmap.data
    const sd = sourceImage.bitmap.data
    if (md.length !== sd.length) {
      throw new Error(
        `Mask size (${maskImage.bitmap.width}×${maskImage.bitmap.height}) doesn't match source (${W}×${H}) for ${id}.`,
      )
    }
    for (let i = 0; i < md.length; i += 4) {
      if (md[i] > 128) {
        rSum += sd[i]
        gSum += sd[i + 1]
        bSum += sd[i + 2]
        count++
      }
    }
    if (count === 0) {
      skipped++
      continue
    }
    const fill = `rgb(${Math.round(rSum / count)},${Math.round(gSum / count)},${Math.round(bSum / count)})`

    // Vectorize the binary mask via potrace.
    // HF's face-parsing returns masks where WHITE pixels = the class
    // is present. potrace's default `blackOnWhite: true` would trace
    // the inverse (the not-class regions). Flip it.
    const svgFromTrace = await traceAsync(maskBuffer, {
      threshold: 128,
      turdSize: 8,
      optTolerance: 0.4,
      blackOnWhite: false,
    })

    // Pull out path data. potrace produces one or more <path d="..."/>
    // — concatenate them.
    const dMatches = [...svgFromTrace.matchAll(/<path[^>]+d="([^"]+)"/g)]
    if (dMatches.length === 0) {
      skipped++
      continue
    }
    const combinedD = dMatches.map((m) => m[1]).join(' ')
    groups.push(
      `  <g id="${id}" fill="${fill}"><path d="${combinedD}"/></g>`,
    )
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">\n` +
    groups.join('\n') +
    '\n</svg>\n'

  await writeFile(outPath, svg)

  const sizeKb = ((await readFile(outPath)).length / 1024).toFixed(1)
  console.log(
    `done — ${groups.length} labelled groups (${skipped} skipped), ${sizeKb} KB`,
  )
  console.log(
    `   groups: ${groups.map((g) => g.match(/id="([^"]+)"/)?.[1]).join(', ')}`,
  )
}

async function main() {
  await mkdir(TRACED_DIR, { recursive: true })

  const { PROMPTS } = await import('./prompts.ts')

  if (ALL) {
    for (let i = 0; i < PROMPTS.length; i++) {
      await parseAndLabel(i, PROMPTS[i].name)
    }
    return
  }

  if (SLOT === null || Number.isNaN(SLOT)) {
    console.error(
      'Usage: tsx tools/avatars/parse-and-label.ts --slot <N> [--force] OR --all',
    )
    process.exit(1)
  }

  const prompt = PROMPTS[SLOT]
  if (!prompt) {
    console.error(`Slot ${SLOT} out of range (0–${PROMPTS.length - 1})`)
    process.exit(1)
  }
  await parseAndLabel(SLOT, prompt.name)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
