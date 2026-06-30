import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, MapPin, Download, Layers, X, Eye } from 'lucide-react'
import L from 'leaflet'
import { MOON_LAYERS } from '../../config/tileLayers'
import PlanetMap from './PlanetMap'
import { searchKaguyaTC, type STACFeature } from '../../utils/geocoding'
import { useAppStore } from '../../stores/appStore'

interface OverlayLayer {
  id: string
  label: string
  overlay: L.ImageOverlay
  bounds: L.LatLngBoundsExpression
  visible: boolean
}

interface DownloadState {
  id: string
  progress: number
  done: boolean
}

export default function MoonViewer() {
  const { hoveredCoords } = useAppStore()
  const allLayers = MOON_LAYERS.flatMap((g) => g.layers)
  const [activeLayer, setActiveLayer] = useState(allLayers[0]?.id || 'moon_wac_mosaic')
  const [results, setResults] = useState<STACFeature[]>([])
  const [loading, setLoading] = useState(false)
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [pinnedCoords, setPinnedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [overlayLayers, setOverlayLayers] = useState<OverlayLayer[]>([])
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({})
  const mapInstanceRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (hoveredCoords) setLastCoords(hoveredCoords)
  }, [hoveredCoords])

  const displayCoords = pinnedCoords ?? lastCoords

  const handleMapClick = (lat: number, lng: number) => {
    setPinnedCoords({ lat, lng })
    setLastCoords({ lat, lng })
  }

  const handleMapReady = useCallback((map: L.Map) => {
    mapInstanceRef.current = map
  }, [])

  const searchHighRes = async () => {
    if (!displayCoords) return
    setPinnedCoords(displayCoords)
    setLoading(true)
    const r = await searchKaguyaTC(displayCoords.lat, displayCoords.lng, 6)
    setResults(r)
    setLoading(false)
  }

  // Overlay thumbnail on map at correct bbox position
  const overlayOnMap = (item: STACFeature) => {
    const map = mapInstanceRef.current
    if (!map) return
    const thumb = item.assets?.thumbnail?.href
    if (!thumb || !item.bbox) return

    const [west, south, east, north] = item.bbox
    const bounds: L.LatLngBoundsExpression = [[south, west], [north, east]]

    // Remove existing overlay for same item if any
    setOverlayLayers((prev) => {
      const existing = prev.find((ol) => ol.id === item.id)
      if (existing) {
        map.removeLayer(existing.overlay)
        return prev.filter((ol) => ol.id !== item.id)
      }
      return prev
    })

    const overlay = L.imageOverlay(thumb, bounds, { opacity: 0.9 })
    overlay.addTo(map)
    map.fitBounds(bounds, { padding: [30, 30] })

    const label = item.id.length > 22 ? item.id.slice(0, 22) + '…' : item.id
    setOverlayLayers((prev) => [...prev, { id: item.id, label, overlay, bounds, visible: true }])
  }

  const toggleOverlay = (id: string) => {
    setOverlayLayers((prev) =>
      prev.map((ol) => {
        if (ol.id !== id) return ol
        if (ol.visible) {
          ol.overlay.setOpacity(0)
          return { ...ol, visible: false }
        } else {
          ol.overlay.setOpacity(0.9)
          return { ...ol, visible: true }
        }
      })
    )
  }

  const removeOverlay = (id: string) => {
    const map = mapInstanceRef.current
    setOverlayLayers((prev) => {
      const target = prev.find((ol) => ol.id === id)
      if (target && map) map.removeLayer(target.overlay)
      return prev.filter((ol) => ol.id !== id)
    })
  }

  // Download TIF with progress, save to disk
  const downloadTIF = async (item: STACFeature) => {
    const tifUrl = item.assets?.image?.href
    if (!tifUrl) return

    setDownloads((prev) => ({ ...prev, [item.id]: { id: item.id, progress: 0, done: false } }))

    try {
      const res = await fetch(tifUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10)
      const reader = res.body!.getReader()
      const chunks: Uint8Array[] = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          if (contentLength > 0) {
            setDownloads((prev) => ({
              ...prev,
              [item.id]: { id: item.id, progress: Math.round((received / contentLength) * 100), done: false },
            }))
          }
        }
      }

      // Merge chunks
      const total = chunks.reduce((s, c) => s + c.length, 0)
      const merged = new Uint8Array(total)
      let off = 0
      for (const c of chunks) { merged.set(c, off); off += c.length }

      const blob = new Blob([merged], { type: 'image/tiff' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const filename = tifUrl.split('/').pop() ?? `${item.id}.tif`
      a.href = url; a.download = filename; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)

      setDownloads((prev) => ({ ...prev, [item.id]: { id: item.id, progress: 100, done: true } }))
      setTimeout(() => setDownloads((prev) => { const n = { ...prev }; delete n[item.id]; return n }), 3000)

      // Also overlay the thumbnail on the map as a layer
      overlayOnMap(item)
    } catch (err) {
      console.error('Download failed', err)
      setDownloads((prev) => { const n = { ...prev }; delete n[item.id]; return n })
    }
  }

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PlanetMap body="moon" layerId={activeLayer} onMapClick={handleMapClick} onMapReady={handleMapReady} />
      </div>

      <div style={{ width: '230px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Basemap selector */}
        <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
          <span className="label">Basemap</span>
        </div>
        <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
          {allLayers.map((l) => {
            const active = activeLayer === l.id
            return (
              <div
                key={l.id}
                className={`layer-item ${active ? 'active' : ''}`}
                onClick={() => setActiveLayer(l.id)}
                style={{ marginBottom: '2px' }}
              >
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-md)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: active ? 500 : 400, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{l.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{l.resolution}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Active overlays */}
        {overlayLayers.length > 0 && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
              <Layers size={10} style={{ color: 'var(--accent)' }} />
              <span className="label">Overlays ({overlayLayers.length})</span>
            </div>
            {overlayLayers.map((ol) => (
              <div key={ol.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px', fontSize: '10px' }}>
                <button type="button" onClick={() => toggleOverlay(ol.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: ol.visible ? 'var(--accent)' : 'var(--text-muted)' }}>
                  <Eye size={11} />
                </button>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{ol.label}</span>
                <button type="button" onClick={() => removeOverlay(ol.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* High-res search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div className="label" style={{ display: 'block', marginBottom: '6px' }}>High-Res Search (5m)</div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
            Click the map, then search for Kaguya TC imagery (~5m/px).
          </p>

          {displayCoords ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '7px' }}>
              <MapPin size={10} style={{ color: pinnedCoords ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: pinnedCoords ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {displayCoords.lat.toFixed(3)}°, {displayCoords.lng.toFixed(3)}°
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {pinnedCoords ? 'pinned' : 'live'}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '7px' }}>
              Move cursor over map
            </div>
          )}

          <button type="button" onClick={searchHighRes} disabled={!displayCoords || loading} className="btn" style={{ justifyContent: 'center' }}>
            <Search size={11} />
            {loading ? 'Searching…' : 'Find High-Res Images'}
          </button>
        </div>

        {/* Results */}
        <div className="scrollable" style={{ flex: 1, padding: '8px 10px' }}>
          {results.length === 0 && !loading && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 0' }}>
              No results yet. Click the map and search.
            </div>
          )}
          {results.map((item) => {
            const thumb = item.assets?.thumbnail?.href
            const fullImg = item.assets?.image?.href
            const gsd = item.properties?.gsd
            const date = item.properties?.datetime
            const dl = downloads[item.id]
            return (
              <div key={item.id} className="result-card" style={{ marginBottom: '8px' }}>
                {/* Thumbnail — click to overlay on map */}
                {thumb && (
                  <div
                    onClick={() => overlayOnMap(item)}
                    style={{ cursor: 'pointer', position: 'relative', marginBottom: '5px', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border)' }}
                    title="Click to overlay on map"
                  >
                    <img
                      src={thumb}
                      alt={item.id}
                      style={{ width: '100%', display: 'block', maxHeight: '90px', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                    >
                      <span style={{ fontSize: '10px', color: '#fff', fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>Overlay on map</span>
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: '3px' }}>{item.id}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '5px' }}>
                  {gsd != null && <span style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>{gsd.toFixed(1)}m/px</span>}
                  {date && <span style={{ color: 'var(--text-muted)' }}>{new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}</span>}
                </div>

                {/* Download progress bar */}
                {dl && (
                  <div style={{ marginBottom: '5px' }}>
                    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${dl.progress}%`, background: dl.done ? 'var(--success)' : 'var(--accent)', transition: 'width 0.2s', borderRadius: '2px' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: dl.done ? 'var(--success)' : 'var(--accent)', marginTop: '2px' }}>
                      {dl.done ? 'Saved ✓' : `${dl.progress}%`}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {fullImg && !dl && (
                  <button
                    type="button"
                    onClick={() => downloadTIF(item)}
                    className="btn"
                    style={{ fontSize: '10px', padding: '3px 7px', gap: '3px' }}
                  >
                    <Download size={9} />
                    Full TIF → Layer
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Resolution reference */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {[['LROC NAC', '0.5m'], ['Kaguya TC', '5m'], ['LROC WAC', '100m'], ['LOLA DEM', '256m']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
