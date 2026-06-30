import { useState, useEffect } from 'react'
import { ExternalLink, Search, MapPin } from 'lucide-react'
import { MOON_LAYERS } from '../../config/tileLayers'
import PlanetMap from './PlanetMap'
import { searchKaguyaTC, type STACFeature } from '../../utils/geocoding'
import { useAppStore } from '../../stores/appStore'

export default function MoonViewer() {
  const { hoveredCoords } = useAppStore()
  const allLayers = MOON_LAYERS.flatMap((g) => g.layers)
  const [activeLayer, setActiveLayer] = useState(allLayers[0]?.id || 'moon_wac_mosaic')
  const [results, setResults] = useState<STACFeature[]>([])
  const [loading, setLoading] = useState(false)
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [pinnedCoords, setPinnedCoords] = useState<{ lat: number; lng: number } | null>(null)

  // Retain last hovered position even when mouse leaves the map
  useEffect(() => {
    if (hoveredCoords) setLastCoords(hoveredCoords)
  }, [hoveredCoords])

  const displayCoords = pinnedCoords ?? lastCoords

  const handleMapClick = (lat: number, lng: number) => {
    setPinnedCoords({ lat, lng })
    setLastCoords({ lat, lng })
  }

  const searchHighRes = async () => {
    if (!displayCoords) return
    setPinnedCoords(displayCoords)
    setLoading(true)
    const r = await searchKaguyaTC(displayCoords.lat, displayCoords.lng, 3)
    setResults(r)
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PlanetMap body="moon" layerId={activeLayer} onMapClick={handleMapClick} />
      </div>

      <div style={{ width: '220px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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

        {/* High-res search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div className="label" style={{ display: 'block', marginBottom: '6px' }}>High-Res Search (5m)</div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
            Click a spot on the map, then search for Kaguya TC images (~5m/px) in that area.
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

          <button
            type="button"
            onClick={searchHighRes}
            disabled={!displayCoords || loading}
            className="btn"
            style={{ justifyContent: 'center' }}
          >
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
            return (
              <div key={item.id} className="result-card" style={{ marginBottom: '8px' }}>
                {thumb && (
                  <a href={fullImg || thumb} target="_blank" rel="noreferrer">
                    <img
                      src={thumb}
                      alt={item.id}
                      style={{ width: '100%', borderRadius: '3px', display: 'block', marginBottom: '5px', maxHeight: '90px', objectFit: 'cover' }}
                    />
                  </a>
                )}
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: '2px' }}>{item.id}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  {gsd != null && (
                    <span style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>{gsd.toFixed(1)}m/px</span>
                  )}
                  {date && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                {fullImg && (
                  <a href={fullImg} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '4px', fontSize: '10px', color: 'var(--accent)', textDecoration: 'none' }}>
                    <ExternalLink size={9} /> Full image (TIF)
                  </a>
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
