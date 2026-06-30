import { useState, useEffect } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { MARS_LAYERS } from '../../config/tileLayers'
import PlanetMap from './PlanetMap'
import { searchSTACHiRISE } from '../../utils/geocoding'
import { useAppStore } from '../../stores/appStore'

interface HiRISEFeature {
  id: string
  properties: Record<string, unknown>
  links?: Array<{ href: string; rel: string }>
}

export default function MarsEarthMap() {
  const { hoveredCoords } = useAppStore()
  const [activeLayer, setActiveLayer] = useState(MARS_LAYERS[0]?.layers[0]?.id ?? 'mars_viking_color')
  const [hirise, setHirise] = useState<HiRISEFeature[]>([])
  const [loading, setLoading] = useState(false)
  // Sticky coords: retains last hovered position even after mouse leaves map
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [pinnedCoords, setPinnedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const marsLayers = MARS_LAYERS.flatMap((g) => g.layers)

  // Update lastCoords whenever hovering over the map (retains value on mouseout)
  useEffect(() => {
    if (hoveredCoords) setLastCoords(hoveredCoords)
  }, [hoveredCoords])

  // displayCoords: pinned > last hovered (never null once user has hovered once)
  const displayCoords = pinnedCoords ?? lastCoords

  const searchNearby = async () => {
    if (!displayCoords) return
    setPinnedCoords(displayCoords)
    setLoading(true)
    const r = await searchSTACHiRISE(displayCoords.lat, displayCoords.lng, 2)
    setHirise(r as HiRISEFeature[])
    setLoading(false)
  }

  const handleMapClick = (lat: number, lng: number) => {
    setPinnedCoords({ lat, lng })
    setLastCoords({ lat, lng })
  }

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PlanetMap body="mars" layerId={activeLayer} onMapClick={handleMapClick} />
      </div>

      <div style={{ width: '220px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
        {/* Basemap selector */}
        <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
          <span className="label">Basemap</span>
        </div>
        <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
          {marsLayers.map((l) => {
            const active = activeLayer === l.id
            return (
              <div
                key={l.id}
                className={`layer-item ${active ? 'active' : ''}`}
                onClick={() => setActiveLayer(l.id)}
                style={{ marginBottom: '2px' }}
              >
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${active ? '#ea580c' : 'var(--border-md)'}`, background: active ? '#ea580c' : 'transparent', flexShrink: 0, marginTop: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

        {/* HiRISE search */}
        <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="label" style={{ display: 'block', marginBottom: '6px' }}>HiRISE Coverage (25cm)</div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
            Hover or click the map to pin a location, then search.
          </p>
          {displayCoords ? (
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '7px', color: pinnedCoords ? 'var(--accent)' : 'var(--text-secondary)' }}>
              {displayCoords.lat.toFixed(3)}°, {displayCoords.lng.toFixed(3)}°
              <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '5px' }}>{pinnedCoords ? '● pinned' : '○ live'}</span>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '7px' }}>Move cursor over map</div>
          )}
          <button
            type="button"
            onClick={searchNearby}
            disabled={!displayCoords || loading}
            className="btn"
            style={{ justifyContent: 'center', marginBottom: '8px' }}
          >
            <Search size={11} />
            {loading ? 'Searching…' : 'Find HiRISE'}
          </button>

          <div className="scrollable" style={{ flex: 1 }}>
            {hirise.length === 0 && !loading && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No results yet.</div>
            )}
            {hirise.map((item) => (
              <div key={item.id} className="result-card" style={{ marginBottom: '6px', fontSize: '11px' }}>
                <div style={{ color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: '3px' }}>{item.id}</div>
                {typeof item.properties?.datetime === 'string' && (
                  <div style={{ color: 'var(--text-muted)' }}>
                    {new Date(item.properties.datetime).toLocaleDateString()}
                  </div>
                )}
                {item.links?.find((l) => l.rel === 'thumbnail') && (
                  <a href={item.links.find((l) => l.rel === 'thumbnail')!.href} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '10px', color: 'var(--accent)', textDecoration: 'none' }}>
                    <ExternalLink size={9} /> Preview
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {[['HiRISE', '25cm'], ['CTX', '6m'], ['THEMIS', '18m'], ['MOLA DEM', '463m']].map(([l, v]) => (
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
