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

/** Normalise a raw sample value to 0-255 */
function toUint8(value: number, bitsPerSample: number, sampleFormat: number): number {
  if (bitsPerSample === 8) return Math.min(255, Math.max(0, value))
  if (bitsPerSample === 16) return Math.min(255, Math.max(0, Math.round((value / 65535) * 255)))
  if (bitsPerSample === 32 && sampleFormat === 3) {
    // Float32 — scale from 0-1 or clamp if larger
    return Math.min(255, Math.max(0, Math.round(value * 255)))
  }
  // Fallback: clamp to byte
  return Math.min(255, Math.max(0, value))
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
  const bitsRaw = fd['BitsPerSample']
  const fmtRaw  = fd['SampleFormat']
  const bitsPerSample: number = Array.isArray(bitsRaw) ? bitsRaw[0] : bitsRaw ?? 8
  const sampleFormat:  number = Array.isArray(fmtRaw)  ? fmtRaw[0]  : fmtRaw  ?? 1
  const nBands = (rasters as unknown[]).length

  onProgress?.('Rendering…')
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(w, h)
  const pixels = w * h

  const bands = rasters as unknown as (Uint8Array | Uint16Array | Int16Array | Float32Array)[]

  if (nBands >= 3) {
    for (let i = 0; i < pixels; i++) {
      imgData.data[i * 4]     = toUint8(bands[0][i], bitsPerSample, sampleFormat)
      imgData.data[i * 4 + 1] = toUint8(bands[1][i], bitsPerSample, sampleFormat)
      imgData.data[i * 4 + 2] = toUint8(bands[2][i], bitsPerSample, sampleFormat)
      imgData.data[i * 4 + 3] = 255
    }
  } else {
    // Greyscale or single band
    for (let i = 0; i < pixels; i++) {
      const v = toUint8(bands[0][i], bitsPerSample, sampleFormat)
      imgData.data[i * 4]     = v
      imgData.data[i * 4 + 1] = v
      imgData.data[i * 4 + 2] = v
      imgData.data[i * 4 + 3] = 255
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
