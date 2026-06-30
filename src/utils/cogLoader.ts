import { fromUrl } from 'geotiff'
import L from 'leaflet'

export interface COGResult {
  canvas: HTMLCanvasElement
  dataUrl: string
  width: number
  height: number
  /** Geographic bounds [west,south,east,north] extracted from the file's own geotransform, or null */
  intrinsicBounds: [number, number, number, number] | null
}

/**
 * Sample a band at ~10 000 evenly-spaced pixels and return 2nd/98th percentile
 * values for linear contrast stretch.  Ignores NaN, ±Infinity, and the nodata
 * sentinel.  Falls back to (0, 255) if fewer than 2 valid samples exist.
 */
function samplePercentiles(
  band: ArrayLike<number>,
  nodata?: number,
  lo = 2,
  hi = 98,
): { min: number; max: number } {
  const step = Math.max(1, Math.floor(band.length / 10000))
  const sample: number[] = []
  for (let i = 0; i < band.length; i += step) {
    const v = band[i]
    if (!isFinite(v)) continue
    if (nodata !== undefined && v === nodata) continue
    sample.push(v)
  }
  if (sample.length < 2) return { min: 0, max: 255 }
  sample.sort((a, b) => a - b)
  return {
    min: sample[Math.max(0, Math.floor(sample.length * lo / 100))],
    max: sample[Math.min(sample.length - 1, Math.floor(sample.length * hi / 100))],
  }
}

/** Stretch a value from [min,max] → [0,255] */
function stretch(v: number, min: number, max: number): number {
  if (max <= min) return 128
  return Math.min(255, Math.max(0, Math.round(((v - min) / (max - min)) * 255)))
}

/**
 * Load a COG from a remote URL using HTTP range requests (no full download),
 * pick the smallest internal overview, render it to a canvas, and return a
 * data-URL suitable for L.imageOverlay.
 */
export async function renderCOGFromUrl(
  url: string,
  maxEdge = 1024,
  onProgress?: (msg: string) => void,
): Promise<COGResult> {
  onProgress?.('Opening COG…')
  const tiff = await fromUrl(url, { allowFullFile: false })

  const imageCount = await tiff.getImageCount()
  // Prefer a mid-level overview (not lowest quality, not full res)
  const overviewIdx = Math.max(0, imageCount - 2)
  onProgress?.(`Reading overview ${overviewIdx + 1}/${imageCount}…`)
  const image = await tiff.getImage(overviewIdx)

  const origW = image.getWidth()
  const origH = image.getHeight()
  const scale = Math.min(1, maxEdge / Math.max(origW, origH))
  const w = Math.max(1, Math.round(origW * scale))
  const h = Math.max(1, Math.round(origH * scale))

  onProgress?.(`Fetching tiles (${w}×${h})…`)
  const rasters = await image.readRasters({ width: w, height: h, interleave: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fd = image.fileDirectory as Record<string, any>
  const nodataRaw = fd['GDAL_NODATA']
  const nodata: number | undefined = nodataRaw != null ? parseFloat(String(nodataRaw)) : undefined

  const nBands = (rasters as unknown[]).length
  const bands = rasters as unknown as (Uint8Array | Uint16Array | Int16Array | Float32Array)[]

  onProgress?.('Stretching histogram…')
  // Per-band percentile stretch (handles 8-bit, 16-bit uint/int, float32)
  const stretches = bands.map(b => samplePercentiles(b, nodata))

  onProgress?.('Rendering…')
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(w, h)
  const pixels = w * h

  if (nBands >= 3) {
    const s0 = stretches[0], s1 = stretches[1], s2 = stretches[2]
    for (let i = 0; i < pixels; i++) {
      const v0 = bands[0][i], v1 = bands[1][i], v2 = bands[2][i]
      const isNodata = nodata !== undefined && (v0 === nodata || v1 === nodata || v2 === nodata)
      imgData.data[i * 4]     = stretch(v0, s0.min, s0.max)
      imgData.data[i * 4 + 1] = stretch(v1, s1.min, s1.max)
      imgData.data[i * 4 + 2] = stretch(v2, s2.min, s2.max)
      imgData.data[i * 4 + 3] = isNodata ? 0 : 255
    }
  } else {
    // Greyscale / single band (panchromatic — Kaguya TC, HiRISE, CTX, etc.)
    const s = stretches[0]
    for (let i = 0; i < pixels; i++) {
      const v = bands[0][i]
      const isNodata = nodata !== undefined && v === nodata
      const g = stretch(v, s.min, s.max)
      imgData.data[i * 4]     = g
      imgData.data[i * 4 + 1] = g
      imgData.data[i * 4 + 2] = g
      imgData.data[i * 4 + 3] = isNodata ? 0 : 255
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')

  // Try to extract geographic bounds from the GeoTIFF's own georeferencing
  // getBoundingBox returns [west, south, east, north] in the file's CRS
  let intrinsicBounds: [number, number, number, number] | null = null
  try {
    const bb = image.getBoundingBox() // [minX, minY, maxX, maxY]
    if (bb && bb.length === 4) {
      const [minX, minY, maxX, maxY] = bb
      // Validate: plausible geographic range (lat -90..90, lng -180..180)
      if (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90 &&
          maxX > minX && maxY > minY) {
        intrinsicBounds = [minX, minY, maxX, maxY]
      }
    }
  } catch { /* no georeferencing in file */ }

  return { canvas, dataUrl, width: w, height: h, intrinsicBounds }
}

/**
 * Add a rendered COG as a Leaflet ImageOverlay using the STAC bbox.
 * Returns the overlay so callers can manage it.
 */
/**
 * Smart download for potentially large files.
 * - Uses File System Access API (stream to disk, no memory limit) when available.
 * - Falls back to fetch+Blob for small files, or direct link for very large ones.
 * Calls onProgress(0-100) during download.
 */
export async function downloadFile(
  url: string,
  suggestedName: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  // Get file size first
  let fileSize = 0
  try {
    const head = await fetch(url, { method: 'HEAD' })
    fileSize = parseInt(head.headers.get('content-length') ?? '0', 10)
  } catch { /* ignore */ }

  const sizeMB = fileSize / (1024 * 1024)

  // File System Access API — true streaming to disk, works for any size
  if ('showSaveFilePicker' in window) {
    try {
      // @ts-expect-error — showSaveFilePicker is a newer API, not in all TS defs
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'GeoTIFF', accept: { 'image/tiff': ['.tif', '.tiff'] } }],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writable = await (handle as any).createWritable()
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body!.getReader()
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          await writable.write(value)
          received += value.length
          if (fileSize > 0) onProgress(Math.round((received / fileSize) * 100))
        }
      }
      await writable.close()
      onProgress(100)
      return
    } catch (err) {
      // User cancelled dialog or API unavailable — fall through
      if ((err as Error).name === 'AbortError') throw err
    }
  }

  // For files > 250 MB without FSAPI: open URL in browser (browser handles it)
  if (sizeMB > 250) {
    const a = document.createElement('a')
    a.href = url; a.download = suggestedName
    a.target = '_blank'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    onProgress(100)
    return
  }

  // Fetch + Blob for files under 250 MB
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []; let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value); received += value.length
      if (fileSize > 0) onProgress(Math.round((received / fileSize) * 100))
    }
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const merged = new Uint8Array(total)
  let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length }
  const blob = new Blob([merged], { type: 'image/tiff' })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl; a.download = suggestedName; a.click()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
  onProgress(100)
}

/**
 * Download a file, save it to disk, AND return a URL pointing to the same
 * data for in-app COG rendering (so no second network fetch is needed).
 *
 * - Files ≤ 500 MB: downloaded into a Uint8Array, saved to disk via FSAPI
 *   (or <a> fallback), and a blob: URL over the same buffer is returned.
 * - Files > 500 MB: streamed directly to disk (FSAPI) or via <a>; the
 *   original remote URL is returned so the viewer can still range-request
 *   the overview.
 */
export async function downloadAndGetRenderUrl(
  url: string,
  suggestedName: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  let fileSize = 0
  try {
    const head = await fetch(url, { method: 'HEAD' })
    fileSize = parseInt(head.headers.get('content-length') ?? '0', 10)
  } catch { /* ignore */ }
  const sizeMB = fileSize / (1024 * 1024)

  if (sizeMB > 500) {
    // Too large to buffer — stream to disk, return remote URL for display
    await downloadFile(url, suggestedName, onProgress)
    return url
  }

  // Buffer the response in memory (progress reported up to 90%)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.length
      if (fileSize > 0) onProgress(Math.round((received / fileSize) * 90))
    }
  }

  const total = chunks.reduce((s, c) => s + c.length, 0)
  const merged = new Uint8Array(total)
  let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length }
  const blob = new Blob([merged], { type: 'image/tiff' })
  const renderUrl = URL.createObjectURL(blob)
  onProgress(95)

  // Save to disk — FSAPI preferred, <a> fallback
  if ('showSaveFilePicker' in window) {
    try {
      // @ts-expect-error — newer browser API
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'GeoTIFF', accept: { 'image/tiff': ['.tif', '.tiff'] } }],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writable = await (handle as any).createWritable()
      await writable.write(blob)
      await writable.close()
    } catch (err) {
      if ((err as Error).name === 'AbortError') { URL.revokeObjectURL(renderUrl); throw err }
      // FSAPI failed — fall back to <a> but still return the blob URL for display
      const a = document.createElement('a')
      a.href = renderUrl; a.download = suggestedName; a.click()
    }
  } else {
    const a = document.createElement('a')
    a.href = renderUrl; a.download = suggestedName; a.click()
  }

  onProgress(100)
  return renderUrl
}

export function addCOGOverlay(
  map: L.Map,
  dataUrl: string,
  /** Fallback bounds [west,south,east,north] from STAC item bbox */
  stacBbox: [number, number, number, number],
  opacity = 0.9,
  /** Preferred bounds extracted from GeoTIFF geotransform — more accurate */
  intrinsicBounds?: [number, number, number, number] | null,
): L.ImageOverlay {
  const [west, south, east, north] = intrinsicBounds ?? stacBbox
  const bounds: L.LatLngBoundsExpression = [[south, west], [north, east]]
  const overlay = L.imageOverlay(dataUrl, bounds, { opacity })
  overlay.addTo(map)
  map.fitBounds(bounds, { padding: [20, 20] })
  return overlay
}
