/**
 * Client-side file compression for application uploads (PRD §4.3).
 *
 * The audience is phone-first on patchy 3G, so reducing transcript /
 * ID-photo uploads from a 5MB stock-camera JPEG to ~500KB before they
 * even hit the network is a real improvement.
 *
 * Strategy:
 *   - Images: re-encode via canvas at progressively lower JPEG quality
 *     until the result is under `maxSizeBytes`, with a max-dimension
 *     ceiling so phone-camera-resolution uploads don't ship 4000px
 *     images of a passport scan.
 *   - PDFs and other types: pass through unchanged. PDF compression is
 *     too heavy to run client-side; the form should reject PDFs >2MB
 *     and ask the user to compress externally.
 *
 * No external dependencies — uses only built-in browser APIs.
 */

export interface CompressOptions {
  /** Target max bytes. Default 2_000_000 (2MB), per PRD §4.3. */
  maxSizeBytes?: number;
  /** Max width or height in pixels before downscaling. Default 2000. */
  maxDimension?: number;
  /** Initial JPEG quality. Decremented down to `minQuality` if needed. Default 0.85. */
  initialQuality?: number;
  /** Floor on JPEG quality. Below this we give up and return the smallest version we made. Default 0.5. */
  minQuality?: number;
}

export interface CompressResult {
  /** The compressed file (or the original if no compression was applied). */
  file: File;
  /** Whether the file was actually re-encoded. */
  compressed: boolean;
  /** Original size in bytes. */
  originalBytes: number;
  /** Output size in bytes. */
  outputBytes: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxSizeBytes: 2 * 1024 * 1024,
  maxDimension: 2000,
  initialQuality: 0.85,
  minQuality: 0.5,
};

export async function compressFile(
  file: File,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const opts = { ...DEFAULTS, ...options };
  const originalBytes = file.size;

  // Already small enough — pass through.
  if (file.size <= opts.maxSizeBytes) {
    return { file, compressed: false, originalBytes, outputBytes: file.size };
  }

  // Only compress images. Other types pass through and the form should
  // surface a "too large" validation error if needed.
  if (!file.type.startsWith('image/')) {
    return { file, compressed: false, originalBytes, outputBytes: file.size };
  }

  const imgSource = await loadImageSource(file);
  const dims = getImageDimensions(imgSource);
  const { width, height } = scaleDown(dims.width, dims.height, opts.maxDimension);

  let quality = opts.initialQuality;
  let blob: Blob | null = null;

  while (quality >= opts.minQuality) {
    blob = await drawToBlob(imgSource, width, height, quality);
    if (blob.size <= opts.maxSizeBytes) break;
    quality -= 0.1;
  }

  if ('close' in imgSource && typeof imgSource.close === 'function') {
    imgSource.close();
  }

  if (!blob) {
    return { file, compressed: false, originalBytes, outputBytes: file.size };
  }

  const outFile = new File([blob], renameToJpg(file.name), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });

  return { file: outFile, compressed: true, originalBytes, outputBytes: outFile.size };
}

type ScalableImageSource = ImageBitmap | HTMLImageElement;

function getImageDimensions(source: ScalableImageSource): { width: number; height: number } {
  if ('naturalWidth' in source) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return { width: source.width, height: source.height };
}

async function loadImageSource(file: File): Promise<ScalableImageSource> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  // Fallback for environments without ImageBitmap support. createImageBitmap
  // is in every modern browser, but jsdom and a few embedded WebViews lack it.
  const dataUrl = await readAsDataUrl(file);
  return loadHtmlImage(dataUrl);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = src;
  });
}

function scaleDown(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function drawToBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const ctx =
    (canvas as HTMLCanvasElement).getContext('2d') ?? (canvas as OffscreenCanvas).getContext('2d');
  if (!ctx) return Promise.reject(new Error('2D context unavailable'));
  (ctx as CanvasRenderingContext2D).drawImage(source, 0, 0, width, height);

  if (canvas instanceof HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob produced null'))),
        'image/jpeg',
        quality,
      );
    });
  }
  return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality });
}

function renameToJpg(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.jpg`;
  return `${name.slice(0, dot)}.jpg`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
