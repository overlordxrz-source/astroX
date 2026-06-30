export type ViewMode = 'earth' | 'moon' | 'mars' | 'planets' | 'deepspace'

export type Planet = 'mercury' | 'venus' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'

export interface TileLayer {
  id: string
  name: string
  url: string
  attribution: string
  resolution: string
  updateFrequency: string
  source: string
  classification: 'OPEN' | 'FREE' | 'RESTRICTED'
  minZoom?: number
  maxZoom?: number
  tms?: boolean
  opacity?: number
  type?: 'wms' | 'xyz' | 'wmts'
  wmsLayers?: string
  format?: string
  requiresKey?: boolean
  keyName?: string
  signupUrl?: string
}

export interface LayerGroup {
  id: string
  label: string
  layers: TileLayer[]
}

export interface GeoPoint {
  lat: number
  lng: number
  name?: string
  address?: string
}

export interface SearchResult {
  lat: string
  lon: string
  display_name: string
  place_id: number
  type: string
}

export interface ApodData {
  title: string
  date: string
  explanation: string
  url: string
  hdurl?: string
  media_type: 'image' | 'video'
  copyright?: string
}

export interface ImagerySource {
  name: string
  url: string
  description: string
  resolution: string
  coverage: string
  updateFreq: string
  apiKey: boolean
  type: string
  notes?: string
}

export interface AppSettings {
  nasaApiKey: string
  anthropicApiKey: string
  planetApiKey: string
  showScanlines: boolean
  showGrid: boolean
  showCoords: boolean
  showClassification: boolean
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}
