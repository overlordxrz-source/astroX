import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useAppStore } from '../../stores/appStore'
import { MOON_LAYERS, MARS_LAYERS, PLANET_CONFIGS } from '../../config/tileLayers'
import type { TileLayer } from '../../types'

interface PlanetMapProps {
  body: 'moon' | 'mars' | string
  layerId?: string
}


export default function PlanetMap({ body, layerId }: PlanetMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const currentTileRef = useRef<L.TileLayer | null>(null)

  const { setHoveredCoords, setMapZoom } = useAppStore()

  function getLayerConfig(): TileLayer | null {
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const layerConfig = getLayerConfig()

    const map = L.map(containerRef.current, {
      crs: L.CRS.EPSG4326,
      center: [0, 0],
      zoom: 1,
      minZoom: 0,
      maxZoom: layerConfig?.maxZoom ?? 7,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: false,
      maxBounds: [[-90, -180], [90, 180]],
      maxBoundsViscosity: 1.0,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    if (layerConfig) {
      const tl = L.tileLayer(layerConfig.url, {
        minZoom: layerConfig.minZoom ?? 0,
        maxZoom: layerConfig.maxZoom ?? 7,
        attribution: layerConfig.attribution,
        tms: false,
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      })
      tl.addTo(map)
      currentTileRef.current = tl
    }

    map.on('mousemove', (e) => setHoveredCoords({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.on('mouseout', () => setHoveredCoords(null))
    map.on('zoomend', () => setMapZoom(map.getZoom()))

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [body]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-base)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="crosshair" />
    </div>
  )
}
