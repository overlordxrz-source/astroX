import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, MapPin, Download, Layers, X, Eye, EyeOff, ChevronRight, ChevronLeft, Loader } from 'lucide-react'
import L from 'leaflet'
import { MOON_LAYERS } from '../../config/tileLayers'
import PlanetMap from './PlanetMap'
import { searchKaguyaTC, searchKaguyaStereo, type STACFeature } from '../../utils/geocoding'
import { useAppStore } from '../../stores/appStore'
import { renderCOGFromUrl, addCOGOverlay, downloadFile } from '../../utils/cogLoader'

interface OverlayLayer {
  id: string
  label: string
  overlay: L.ImageOverlay
  visible: boolean
  type: 'thumbnail' | 'cog'
}

interface COGLoadState {
  id: string
  progress: string
  done: boolean
  error?: string
}

export default function MoonViewer() {
  const { hoveredCoords } = useAppStore()
  const allLayers = MOON_LAYERS.flatMap((g) => g.layers)
  const [activeLayer, setActiveLayer] = useState(allLayers[0]?.id || 'moon_wac_mosaic')
  const [results, setResults] = useState<STACFeature[]>([])
  const [loading, setLoading] = useState(false)
  const [collection, setCollection] = useState<'kaguya_mono' | 'kaguya_stereo'>('kaguya_mono')
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [pinnedCoords, setPinnedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [overlayLayers, setOverlayLayers] = useState<OverlayLayer[]>([])
  const [cogStates, setCogStates] = useState<Record<string, COGLoadState>>({})
  const [downloadStates, setDownloadStates] = useState<Record<string, number>>({}) // id → 0-100
  const [layerPanelOpen, setLayerPanelOpen] = useState(true)
  const [searchPanelOpen, setSearchPanelOpen] = useState(false)
  const mapInstanceRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (hoveredCoords) setLastCoords(hoveredCoords)
  }, [hoveredCoords])

  const displayCoords = pinnedCoords ?? lastCoords

  const handleMapClick = (lat: number, lng: number) => {
    setPinnedCoords({ lat, lng })
    setLastCoords({ lat, lng })
    if (!searchPanelOpen) setSearchPanelOpen(true)
  }

  const handleMapReady = useCallback((map: L.Map) => {
    mapInstanceRef.current = map
  }, [])

  const searchHighRes = async () => {
    if (!displayCoords) return
    setPinnedCoords(displayCoords)
    setLoading(true)
    const r = collection === 'kaguya_stereo'
      ? await searchKaguyaStereo(displayCoords.lat, displayCoords.lng)
      : await searchKaguyaTC(displayCoords.lat, displayCoords.lng)
    setResults(r)
    setLoading(false)
  }

  /** Stream the COG overview from URL and overlay it on the map */
  const viewAsLayer = async (item: STACFeature) => {
    const map = mapInstanceRef.current
    const tifUrl = item.assets?.image?.href
    if (!map || !tifUrl || !item.bbox) return

    setCogStates((p) => ({ ...p, [item.id]: { id: item.id, progress: 'Connecting…', done: false } }))
    try {
      const cogResult = await renderCOGFromUrl(tifUrl, 1024, (msg) =>
        setCogStates((p) => ({ ...p, [item.id]: { id: item.id, progress: msg, done: false } }))
      )

      // Remove existing overlay for same item
      setOverlayLayers((prev) => {
        const existing = prev.find((ol) => ol.id === item.id)
        if (existing) map.removeLayer(existing.overlay)
        return prev.filter((ol) => ol.id !== item.id)
      })

      const bbox = item.bbox as [number, number, number, number]
      const overlay = addCOGOverlay(map, cogResult.dataUrl, bbox, 0.9, cogResult.intrinsicBounds)

      const label = item.id.length > 24 ? item.id.slice(0, 24) + '…' : item.id
      setOverlayLayers((prev) => [...prev, { id: item.id, label, overlay, visible: true, type: 'cog' }])
      setCogStates((p) => ({ ...p, [item.id]: { id: item.id, progress: '', done: true } }))
      setTimeout(() => setCogStates((p) => { const n = { ...p }; delete n[item.id]; return n }), 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Load failed'
      setCogStates((p) => ({ ...p, [item.id]: { id: item.id, progress: '', done: false, error: msg } }))
      setTimeout(() => setCogStates((p) => { const n = { ...p }; delete n[item.id]; return n }), 4000)
    }
  }

  /** Download the full TIF — uses File System Access API for large files */
  const downloadTIF = async (item: STACFeature) => {
    const tifUrl = item.assets?.image?.href
    if (!tifUrl) return
    const filename = tifUrl.split('/').pop() ?? `${item.id}.tif`
    setDownloadStates((p) => ({ ...p, [item.id]: 0 }))
    try {
      await downloadFile(tifUrl, filename, (pct) =>
        setDownloadStates((p) => ({ ...p, [item.id]: pct }))
      )
      setTimeout(() => setDownloadStates((p) => { const n = { ...p }; delete n[item.id]; return n }), 3000)
    } catch (err) {
      if ((err as Error).name !== 'AbortError')
        setDownloadStates((p) => { const n = { ...p }; delete n[item.id]; return n })
      else setDownloadStates((p) => { const n = { ...p }; delete n[item.id]; return n })
    }
  }

  const toggleOverlay = (id: string) => {
    setOverlayLayers((prev) =>
      prev.map((ol) => {
        if (ol.id !== id) return ol
        ol.visible ? ol.overlay.setOpacity(0) : ol.overlay.setOpacity(0.9)
        return { ...ol, visible: !ol.visible }
      })
    )
  }

  const removeOverlay = (id: string) => {
    setOverlayLayers((prev) => {
      const t = prev.find((ol) => ol.id === id)
      if (t) mapInstanceRef.current?.removeLayer(t.overlay)
      return prev.filter((ol) => ol.id !== id)
    })
  }

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0, display: 'flex' }}>
      {/* Full-screen map */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <PlanetMap body="moon" layerId={activeLayer} onMapClick={handleMapClick} onMapReady={handleMapReady} />
      </div>

      {/* ── Layer panel (left, floating) ──────────────────────── */}
      <div
        className="glass-panel floating-panel animate-slide-in"
        style={{ left: layerPanelOpen ? '10px' : '-220px', top: '10px', width: '210px', transition: 'left 0.25s ease' }}
      >
        <div className="floating-panel-header">
          <Layers size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span className="label" style={{ flex: 1 }}>Basemap</span>
          <button type="button" onClick={() => setLayerPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}>
            <X size={11} />
          </button>
        </div>
        <div className="floating-panel-body" style={{ padding: '6px' }}>
          {allLayers.map((l) => {
            const active = activeLayer === l.id
            return (
              <div key={l.id} className={`layer-item ${active ? 'active' : ''}`} onClick={() => setActiveLayer(l.id)}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-md)'}`, background: active ? 'var(--accent-dim)' : 'transparent', flexShrink: 0, marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {active && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)' }} />}
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: active ? 600 : 400, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{l.name}</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{l.resolution}</div>
                </div>
              </div>
            )
          })}

          {/* Overlay layers */}
          {overlayLayers.length > 0 && (
            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
              <div className="label" style={{ padding: '0 8px 4px' }}>Overlays</div>
              {overlayLayers.map((ol) => (
                <div key={ol.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 8px', fontSize: '10px' }}>
                  <button type="button" onClick={() => toggleOverlay(ol.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: ol.visible ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>
                    {ol.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                  </button>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>{ol.label}</span>
                  <span style={{ fontSize: '8px', color: ol.type === 'cog' ? 'var(--accent)' : 'var(--text-muted)', letterSpacing: '0.05em', flexShrink: 0 }}>{ol.type.toUpperCase()}</span>
                  <button type="button" onClick={() => removeOverlay(ol.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', flexShrink: 0 }}>
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Layer panel toggle (when closed) */}
      {!layerPanelOpen && (
        <button type="button" onClick={() => setLayerPanelOpen(true)} className="glass-panel"
          style={{ position: 'absolute', left: '10px', top: '10px', zIndex: 800, padding: '7px 8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent)', fontSize: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
          <Layers size={11} /> <ChevronRight size={10} />
        </button>
      )}

      {/* ── Search panel (right, floating) ──────────────────────── */}
      <div
        className="glass-panel floating-panel animate-slide-right"
        style={{ right: searchPanelOpen ? '10px' : '-270px', top: '10px', width: '260px', transition: 'right 0.25s ease' }}
      >
        <div className="floating-panel-header">
          <Search size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span className="label" style={{ flex: 1 }}>High-Res Search</span>
          <button type="button" onClick={() => setSearchPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}>
            <X size={11} />
          </button>
        </div>

        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--glass-border)' }}>
          {/* Collection selector */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {(['kaguya_mono', 'kaguya_stereo'] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCollection(c)}
                className={collection === c ? 'btn-primary btn' : 'btn'}
                style={{ flex: 1, justifyContent: 'center', fontSize: '9px', letterSpacing: '0.05em' }}>
                {c === 'kaguya_mono' ? 'TC Mono · 5m' : 'TC Stereo · 5m'}
              </button>
            ))}
          </div>

          {displayCoords ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '7px', padding: '4px 8px', background: 'rgba(13,204,136,0.05)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)' }}>
              <MapPin size={9} style={{ color: pinnedCoords ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: pinnedCoords ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>
                {displayCoords.lat.toFixed(4)}°, {displayCoords.lng.toFixed(4)}°
              </span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{pinnedCoords ? 'PIN' : 'LIVE'}</span>
            </div>
          ) : (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '7px', textAlign: 'center' }}>Click map to pin a location</div>
          )}

          <button type="button" onClick={searchHighRes} disabled={!displayCoords || loading} className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: '10px' }}>
            {loading ? <><Loader size={10} className="animate-spin" /> Searching…</> : <><Search size={10} /> Find Images</>}
          </button>
        </div>

        {/* Results */}
        <div className="floating-panel-body" style={{ padding: '8px' }}>
          {results.length === 0 && !loading && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>No results yet</div>
          )}
          {results.map((item) => {
            const thumb = item.assets?.thumbnail?.href
            const fullImg = item.assets?.image?.href
            const gsd = item.properties?.gsd
            const date = item.properties?.datetime
            const cog = cogStates[item.id]
            const dlPct = downloadStates[item.id]
            return (
              <div key={item.id} className="result-card" style={{ marginBottom: '6px' }}>
                {/* Thumbnail */}
                {thumb && (
                  <div style={{ position: 'relative', marginBottom: '6px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border)' }}
                    onClick={() => {
                      const map = mapInstanceRef.current; if (!map || !item.bbox) return
                      const [w,s,e,n] = item.bbox
                      const existing = overlayLayers.find(ol => ol.id === item.id)
                      if (existing) { map.removeLayer(existing.overlay); setOverlayLayers(p => p.filter(ol => ol.id !== item.id)); return }
                      const ov = L.imageOverlay(thumb, [[s,w],[n,e]], { opacity: 0.9 }); ov.addTo(map); map.fitBounds([[s,w],[n,e]], { padding: [20,20] })
                      const label = item.id.length > 24 ? item.id.slice(0,24)+'…' : item.id
                      setOverlayLayers(p => [...p, { id: item.id, label, overlay: ov, visible: true, type: 'thumbnail' }])
                    }}>
                    <img src={thumb} alt={item.id} style={{ width: '100%', display: 'block', maxHeight: '80px', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: '3px', right: '3px', background: 'rgba(0,0,0,0.6)', borderRadius: '2px', padding: '1px 5px', fontSize: '8px', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                      Preview
                    </div>
                  </div>
                )}
                <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '4px', wordBreak: 'break-all' }}>{item.id}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '6px' }}>
                  {gsd != null && <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{gsd.toFixed(1)}m/px</span>}
                  {date && <span style={{ color: 'var(--text-muted)' }}>{new Date(date).toLocaleDateString('en-US', { year: '2-digit', month: 'short' })}</span>}
                </div>

                {/* COG progress */}
                {cog && !cog.done && !cog.error && (
                  <div style={{ marginBottom: '5px', fontSize: '9px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Loader size={9} className="animate-spin" /> {cog.progress}
                  </div>
                )}
                {cog?.error && <div style={{ fontSize: '9px', color: 'var(--danger)', marginBottom: '4px' }}>{cog.error}</div>}
                {cog?.done && <div style={{ fontSize: '9px', color: 'var(--accent)', marginBottom: '4px' }}>Layer added ✓</div>}

                {/* Download progress */}
                {dlPct != null && (
                  <div style={{ marginBottom: '5px' }}>
                    <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px', overflow: 'hidden', marginBottom: '2px' }}>
                      <div style={{ height: '100%', width: `${dlPct}%`, background: dlPct === 100 ? 'var(--success)' : 'var(--accent)', transition: 'width 0.2s', borderRadius: '1px' }} />
                    </div>
                    <span style={{ fontSize: '9px', color: dlPct === 100 ? 'var(--success)' : 'var(--accent)' }}>{dlPct === 100 ? 'Saved ✓' : `${dlPct}%`}</span>
                  </div>
                )}

                {/* Action buttons */}
                {fullImg && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="button" onClick={() => viewAsLayer(item)}
                      disabled={!!cog && !cog.done && !cog.error}
                      className="cog-btn" style={{ flex: 1, justifyContent: 'center' }}>
                      <Eye size={9} /> View Layer
                    </button>
                    <button type="button" onClick={() => downloadTIF(item)}
                      disabled={dlPct != null} title="Download full TIF (may be large)"
                      className="btn" style={{ fontSize: '9px', padding: '3px 7px', flexShrink: 0 }}>
                      <Download size={9} /> TIF
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Resolution reference */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[['Kaguya TC Mono', '5m/px'], ['Kaguya TC Stereo', '5m/px'], ['LROC WAC', '100m/px']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{l}</span><span style={{ color: 'var(--text-secondary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search panel toggle (when closed) */}
      {!searchPanelOpen && (
        <button type="button" onClick={() => setSearchPanelOpen(true)} className="glass-panel"
          style={{ position: 'absolute', right: '10px', top: '10px', zIndex: 800, padding: '7px 8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent)', fontSize: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
          <ChevronLeft size={10} /> <Search size={11} />
        </button>
      )}
    </div>
  )
}
