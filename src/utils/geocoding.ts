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

export async function searchHiRISE(lat: number, lng: number, radius = 1): Promise<unknown[]> {
  // ODE REST API for HiRISE imagery near a location
  const url = `https://oderest.rsl.wustl.edu/live2/?target=mars&ihid=mro&iid=hirise&pt=RDRV11&westlon=${lng - radius}&eastlon=${lng + radius}&minlat=${lat - radius}&maxlat=${lat + radius}&output=json&results=10`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data?.ODEResults?.Products?.Product || []
  } catch {
    return []
  }
}

export async function searchSTACHiRISE(lat: number, lng: number, radius = 2): Promise<unknown[]> {
  const bbox = [lng - radius, lat - radius, lng + radius, lat + radius]
  const url = `https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_uncontrolled_observations/items?bbox=${bbox.join(',')}&limit=8`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data.features || []
  } catch {
    return []
  }
}

export interface STACFeature {
  id: string
  bbox?: number[]
  properties: {
    datetime?: string
    gsd?: number
    [key: string]: unknown
  }
  assets: {
    thumbnail?: { href: string }
    image?: { href: string }
    [key: string]: { href: string } | undefined
  }
  links?: Array<{ href: string; rel: string; type?: string }>
}

/** Search Kaguya Terrain Camera monoscopic images (~5m) via USGS STAC */
export async function searchKaguyaTC(lat: number, lng: number, radius = 3): Promise<STACFeature[]> {
  const bbox = [lng - radius, lat - radius, lng + radius, lat + radius]
  const url = `https://stac.astrogeology.usgs.gov/api/search?collections=kaguya_terrain_camera_monoscopic_uncontrolled_observations&bbox=${bbox.join(',')}&limit=10&sortby=+properties.gsd`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.features || []) as STACFeature[]
  } catch {
    return []
  }
}
