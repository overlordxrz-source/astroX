import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import { useAppStore } from '../../stores/appStore'
import { EARTH_LAYERS } from '../../config/tileLayers'
import { mapController } from '../../utils/mapController'

// Fix default icon paths broken by Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function EarthMap() {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const layerMapRef = useRef<Record<string, L.TileLayer>>({})
  const markerRef = useRef<L.Marker | null>(null)

  const {
    selectedEarthLayers,
    mapCenter,
    mapZoom,
    setMapCenter,
    setMapZoom,
    setHoveredCoords,
    clickedPoint,
    setClickedPoint,
    settings,
  } = useAppStore()

  const allLayers = EARTH_LAYERS.flatMap((g) => g.layers)

  const initMap = useCallback(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: mapCenter,
      zoom: mapZoom,
      zoomControl: false,
      attributionControl: true,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Add scale control
    L.control.scale({
      position: 'bottomleft',
      metric: true,
      imperial: false,
      maxWidth: 120,
    }).addTo(map)

    map.on('mousemove', (e) => {
      setHoveredCoords({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    map.on('mouseout', () => setHoveredCoords(null))
    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      setClickedPoint({ lat, lng })
    })
    map.on('moveend', () => {
      const c = map.getCenter()
      setMapCenter([c.lat, c.lng])
      setMapZoom(map.getZoom())
    })

    // Build all tile layers (not added to map yet)
    allLayers.forEach((layer) => {
      // Inject API key for layers that require one
      let url = layer.url
      if (layer.requiresKey && layer.keyName === 'planetApiKey') {
        url = url.replace('{PLANET_API_KEY}', settings.planetApiKey || 'no-key')
      }
      const tl = L.tileLayer(url, {
        maxZoom: layer.maxZoom ?? 19,
        minZoom: layer.minZoom ?? 0,
        attribution: layer.attribution,
        tms: layer.tms,
        opacity: 1,
      })
      layerMapRef.current[layer.id] = tl
    })

    mapRef.current = map
    mapController.register(map)

    // Give flex layout time to compute before Leaflet measures the container
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 150)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Init
  useEffect(() => {
    const cleanup = initMap()
    return () => {
      cleanup?.()
      mapController.unregister()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [initMap])

  // Sync active layers
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    allLayers.forEach((layer) => {
      const tl = layerMapRef.current[layer.id]
      if (!tl) return
      const shouldShow = selectedEarthLayers.includes(layer.id)
      if (shouldShow && !map.hasLayer(tl)) {
        map.addLayer(tl)
      } else if (!shouldShow && map.hasLayer(tl)) {
        map.removeLayer(tl)
      }
    })

    // If nothing selected, add OSM as fallback
    if (selectedEarthLayers.length === 0) {
      const osm = layerMapRef.current['osm']
      if (osm && !map.hasLayer(osm)) map.addLayer(osm)
    }
  }, [selectedEarthLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to clicked point
  useEffect(() => {
    if (!mapRef.current || !clickedPoint) return
    const map = mapRef.current

    if (markerRef.current) {
      markerRef.current.remove()
    }

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width: 12px; height: 12px;
        border: 1.5px solid #3b82f6;
        background: rgba(59,130,246,0.2);
        border-radius: 50%;
        position: relative;
      ">
        <div style="
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 4px; height: 4px;
          background: #3b82f6;
          border-radius: 50%;
        "></div>
      </div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    })

    markerRef.current = L.marker([clickedPoint.lat, clickedPoint.lng], { icon })
      .addTo(map)
      .bindPopup(
        `<div style="background:#111113;border:1px solid rgba(255,255,255,0.1);color:#fafafa;font-family:'Inter',system-ui,sans-serif;font-size:11px;padding:8px 10px;min-width:170px;border-radius:4px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#52525b;margin-bottom:4px">Coordinates</div>
          <div style="font-family:'JetBrains Mono',monospace">${clickedPoint.lat.toFixed(6)}°, ${clickedPoint.lng.toFixed(6)}°</div>
          ${clickedPoint.name ? `<div style="margin-top:4px;color:#a1a1aa">${clickedPoint.name}</div>` : ''}
        </div>`,
        { closeButton: false, className: 'custom-popup' }
      )
  }, [clickedPoint])

    return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div className="crosshair" />
    </div>
  )
}
