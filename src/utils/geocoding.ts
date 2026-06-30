import type { SearchResult } from '../types'

export async function geocodeAddress(query: string): Promise<SearchResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'AstroX Intelligence Platform/1.0' },
  })
  if (!res.ok) throw new Error('Geocoding failed')
  return res.json()
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'AstroX Intelligence Platform/1.0' },
  })
  if (!res.ok) return 'Unknown location'
  const data = await res.json()
  return data.display_name || 'Unknown location'
}

export async function fetchNasaApod(apiKey: string, count = 1): Promise<unknown> {
  const url = count > 1
    ? `https://api.nasa.gov/planetary/apod?api_key=${apiKey}&count=${count}`
    : `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('APOD fetch failed')
  return res.json()
}

export interface STACFeature {
  id: string
  bbox?: number[]
  geometry?: unknown
  properties: {
    datetime?: string
    gsd?: number
    'eo:cloud_cover'?: number
    [key: string]: unknown
  }
  assets: {
    thumbnail?: { href: string; type?: string }
    image?: { href: string; type?: string }
    visual?: { href: string; type?: string }
    TCI?: { href: string; type?: string }
    [key: string]: { href: string; type?: string } | undefined
  }
  links?: Array<{ href: string; rel: string; type?: string }>
}

/** Build a STAC POST body using intersects:Point for exact-location matching */
function pointQuery(collections: string[], lat: number, lng: number, limit = 8) {
  return {
    collections,
    intersects: { type: 'Point', coordinates: [lng, lat] },
    limit,
    sortby: [{ field: 'properties.gsd', direction: 'asc' }],
  }
}

async function stacPost(url: string, body: object): Promise<STACFeature[]> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.features || []) as STACFeature[]
  } catch {
    return []
  }
}

const USGS_STAC = 'https://stac.astrogeology.usgs.gov/api/search'

/** HiRISE uncontrolled observations (25cm) */
export async function searchSTACHiRISE(lat: number, lng: number): Promise<STACFeature[]> {
  return stacPost(USGS_STAC, pointQuery(['mro_hirise_uncontrolled_observations'], lat, lng, 8))
}

/** MRO CTX controlled DTMs (6m) — combined with HiRISE for broader Mars coverage */
export async function searchCTX(lat: number, lng: number): Promise<STACFeature[]> {
  return stacPost(USGS_STAC, {
    ...pointQuery(['mro_ctx_controlled_usgs_dtms', 'mro_hirise_uncontrolled_observations'], lat, lng, 8),
    sortby: [{ field: 'properties.gsd', direction: 'asc' }],
  })
}

/** Kaguya TC Monoscopic (~5m) */
export async function searchKaguyaTC(lat: number, lng: number): Promise<STACFeature[]> {
  return stacPost(USGS_STAC, pointQuery(['kaguya_terrain_camera_monoscopic_uncontrolled_observations'], lat, lng, 8))
}

/** Kaguya TC Stereoscopic (~5m, better 3D coverage) */
export async function searchKaguyaStereo(lat: number, lng: number): Promise<STACFeature[]> {
  return stacPost(USGS_STAC, pointQuery(['kaguya_terrain_camera_stereoscopic_uncontrolled_observations'], lat, lng, 8))
}

/** Sentinel-2 L2A (10m) via AWS Element84 Earth Search — sorted by cloud cover ASC */
export async function searchSentinel2(lat: number, lng: number, maxCloud = 20): Promise<STACFeature[]> {
  const EARTH_SEARCH = 'https://earth-search.aws.element84.com/v1/search'
  try {
    const res = await fetch(EARTH_SEARCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: ['sentinel-2-l2a'],
        intersects: { type: 'Point', coordinates: [lng, lat] },
        limit: 8,
        query: { 'eo:cloud_cover': { lte: maxCloud } },
        sortby: [{ field: 'properties.eo:cloud_cover', direction: 'asc' }],
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.features || []) as STACFeature[]
  } catch {
    return []
  }
}

/** Maxar Open Data STAC (disaster response, free) — event-based catalog */
export async function searchMaxarOpenData(_lat: number, _lng: number): Promise<STACFeature[]> {
  // Maxar ODP is event-based (no point query); returns empty until a specific event is targeted
  return []
}
