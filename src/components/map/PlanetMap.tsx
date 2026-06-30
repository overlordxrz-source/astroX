import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useAppStore } from '../../stores/appStore'
import { MOON_LAYERS, MARS_LAYERS, PLANET_CONFIGS } from '../../config/tileLayers'
import type { TileLayer } from '../../types'

interface PlanetMapProps {
  body: 'moon' | 'mars' | string
  layerId?: string
}

function buildLeafletLayer(layerConfig: TileLayer): L.TileLayer | L.TileLayer.WMS {
  if (layerConfig.type === 'wms') {
    return L.tileLayer.wms(layerConfig.url, {
      layers: layerConfig.wmsLayers ?? '',
      format: layerConfig.format ?? 'image/jpeg',
      transparent: false,
      version: '1.1.1',
      attribution: layerConfig.attribution,
      maxZoom: layerConfig.maxZoom ?? 10,
      minZoom: layerConfig.minZoom ?? 0,
    })
  }
  return L.tileLayer(layerConfig.url, {
    maxZoom: layerConfig.maxZoom ?? 7,
    minZoom: layerConfig.minZoom ?? 0,
    attribution: layerConfig.attribution,
    tms: layerConfig.tms ?? false,
  })
}

function getLayerConfig(body: string, layerId?: string): TileLayer | null {
  if (body === 'moon') {
    const all = MOON_LAYERS.flatMap((g) => g.layers)
    return (layerId ? all.find((l) => l.id === layerId) : null) ?? all[0] ?? null
  }
  if (body === 'mars') {
    const all = MARS_LAYERS.flatMap((g) => g.layers)
    return (layerId ? all.find((l) => l.id === layerId) : null) ?? all[0] ?? null
  }
  const config = PLANET_CONFIGS.find((p) => p.id === body)
  return config?.layer ?? null
}

export default function PlanetMap({ body, layerId }: PlanetMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const currentTileRef = useRef<L.TileLayer | L.TileLayer.WMS | null>(null)

  const { setHoveredCoords, setMapZoom } = useAppStore()

  // Init map once per body
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      crs: L.CRS.EPSG4326,
      center: [0, 0],
      zoom: 2,
      minZoom: 0,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: false,
      maxBounds: [[-90, -180], [90, 180]],
      maxBoundsViscosity: 1.0,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const layerConfig = getLayerConfig(body, layerId)
    if (layerConfig) {
      const tl = buildLeafletLayer(layerConfig)
      tl.addTo(map)
      currentTileRef.current = tl
    }

    map.on('mousemove', (e) => setHoveredCoords({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.on('mouseout', () => setHoveredCoords(null))
    map.on('zoomend', () => setMapZoom(map.getZoom()))

    mapRef.current = map

    // Give the browser time to finish flex layout before Leaflet measures the container
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 150)

    return () => {
      clearTimeout(t)
      map.remove()
      mapRef.current = null
      currentTileRef.current = null
    }
  }, [body]) // eslint-disable-line react-hooks/exhaustive-deps

  // Swap tile layer when layerId changes (without destroying the map)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layerConfig = getLayerConfig(body, layerId)
    if (!layerConfig) return

    if (currentTileRef.current) {
      map.removeLayer(currentTileRef.current)
    }
    const tl = buildLeafletLayer(layerConfig)
    tl.addTo(map)
    currentTileRef.current = tl
  }, [layerId, body])

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="crosshair" />
    </div>
  )
}
