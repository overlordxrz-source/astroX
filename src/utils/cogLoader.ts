import { fromUrl } from 'geotiff'
import L from 'leaflet'

export interface COGResult {
  canvas: HTMLCanvasElement
  dataUrl: string
  width: number
  height: number
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

  return { canvas, dataUrl, width: w, height: h }
}

/**
 * Add a rendered COG as a Leaflet ImageOverlay using the STAC bbox.
 * Returns the overlay so callers can manage it.
 */
export function addCOGOverlay(
  map: L.Map,
  dataUrl: string,
  bbox: [number, number, number, number],
  opacity = 0.9,
): L.ImageOverlay {
  const [west, south, east, north] = bbox
  const bounds: L.LatLngBoundsExpression = [[south, west], [north, east]]
  const overlay = L.imageOverlay(dataUrl, bounds, { opacity })
  overlay.addTo(map)
  map.fitBounds(bounds, { padding: [20, 20] })
  return overlay
}
