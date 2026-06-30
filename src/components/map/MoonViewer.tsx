import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, MapPin, Download, Layers, X, Eye, EyeOff, ChevronRight, ChevronLeft, Loader, Pin, MessageSquare } from 'lucide-react'
import L from 'leaflet'
import { MOON_LAYERS } from '../../config/tileLayers'
import PlanetMap from './PlanetMap'
import { searchKaguyaTC, searchKaguyaStereo, type STACFeature } from '../../utils/geocoding'
import { useAppStore } from '../../stores/appStore'
import type { SavedMapOverlay } from '../../stores/appStore'
import { renderCOGFromUrl, addCOGOverlay, downloadAndGetRenderUrl } from '../../utils/cogLoader'
import { useAnnotations, ANNO_COLORS, type Annotation } from '../../hooks/useAnnotations'

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
  const annoMarkersRef = useRef<Record<string, L.Marker>>({})
  const blobUrlsRef = useRef<Record<string, string>>({}) // item.id → blob URL to revoke on remove

  // Annotations
  const { annotations, addAnnotation, removeAnnotation } = useAnnotations('astrox-moon-annotations')
  const [annoMode, setAnnoMode] = useState(false)
  const [pendingAnno, setPendingAnno] = useState<{ lat: number; lng: number } | null>(null)
  const [annoInput, setAnnoInput] = useState('')
  const [annoColor, setAnnoColor] = useState(ANNO_COLORS[0])

  useEffect(() => {
    if (hoveredCoords) setLastCoords(hoveredCoords)
  }, [hoveredCoords])

  const displayCoords = pinnedCoords ?? lastCoords

  const handleMapClick = (lat: number, lng: number) => {
    if (annoMode) { setPendingAnno({ lat, lng }); return }
    setPinnedCoords({ lat, lng })
    setLastCoords({ lat, lng })
    if (!searchPanelOpen) setSearchPanelOpen(true)
  }

  // Sync annotation markers to map
  useEffect(() => {
    const map = mapInstanceRef.current; if (!map) return
    Object.values(annoMarkersRef.current).forEach(m => m.remove())
    annoMarkersRef.current = {}
    annotations.forEach((ann: Annotation) => {
      const icon = L.divIcon({ className: '', html: `<div style="width:12px;height:12px;border:2px solid ${ann.color};border-radius:50%;background:${ann.color}33;box-shadow:0 0 8px ${ann.color}77"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] })
      const m = L.marker([ann.lat, ann.lng], { icon }).addTo(map).bindPopup(`<div style="background:#0c1014;border:1px solid rgba(255,255,255,0.1);color:#d4e0eb;font-family:Inter,sans-serif;font-size:11px;padding:8px 10px;border-radius:4px"><b>${ann.title}</b><br/><span style="font-size:9px;color:#5a6a7a">${ann.lat.toFixed(4)}, ${ann.lng.toFixed(4)}</span></div>`, { closeButton: false, className: 'custom-popup' })
      annoMarkersRef.current[ann.id] = m
    })
  }, [annotations, mapInstanceRef.current]) // eslint-disable-line

  const handleMapReady = useCallback((map: L.Map) => {
    mapInstanceRef.current = map
    // Restore any overlays that were rendered before the last tab switch
    const { mapOverlays } = useAppStore.getState()
    const moonOverlays = mapOverlays.filter((o) => o.body === 'moon')
    if (moonOverlays.length > 0) {
      const restored: OverlayLayer[] = moonOverlays.map((saved) => {
        const [w, s, e, n] = saved.intrinsicBounds ?? saved.bbox
        const overlay = L.imageOverlay(saved.dataUrl, [[s, w], [n, e]], {
          opacity: saved.visible ? 0.9 : 0,
        })
        overlay.addTo(map)
        return { id: saved.id, label: saved.label, overlay, visible: saved.visible, type: 'cog' as const }
      })
      setOverlayLayers(restored)
    }
  }, []) // eslint-disable-line

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

  /** Stream the COG overview from a URL and overlay it on the map.
   *  Pass a pre-loaded blob: URL (from downloadAndGetRenderUrl) to skip the
   *  network fetch entirely and render from in-memory data. */
  const viewAsLayer = async (item: STACFeature, renderUrl?: string) => {
    const map = mapInstanceRef.current
    const tifUrl = renderUrl ?? item.assets?.image?.href
    if (!map || !tifUrl || !item.bbox) return

    setCogStates((p) => ({ ...p, [item.id]: { id: item.id, progress: 'Connecting…', done: false } }))
    try {
      const cogResult = await renderCOGFromUrl(tifUrl, 1024, (msg) =>
        setCogStates((p) => ({ ...p, [item.id]: { id: item.id, progress: msg, done: false } }))
      )

      setOverlayLayers((prev) => {
        const existing = prev.find((ol) => ol.id === item.id)
        if (existing) map.removeLayer(existing.overlay)
        return prev.filter((ol) => ol.id !== item.id)
      })

      const bbox = item.bbox as [number, number, number, number]
      const overlay = addCOGOverlay(map, cogResult.dataUrl, bbox, 0.9, cogResult.intrinsicBounds)

      const label = item.id.length > 24 ? item.id.slice(0, 24) + '…' : item.id
      setOverlayLayers((prev) => [...prev, { id: item.id, label, overlay, visible: true, type: 'cog' }])
      // Persist across tab switches
      useAppStore.getState().saveMapOverlay({
        id: item.id, label, dataUrl: cogResult.dataUrl, bbox,
        intrinsicBounds: cogResult.intrinsicBounds, visible: true, body: 'moon',
      } satisfies SavedMapOverlay)
      setCogStates((p) => ({ ...p, [item.id]: { id: item.id, progress: '', done: true } }))
      setTimeout(() => setCogStates((p) => { const n = { ...p }; delete n[item.id]; return n }), 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Load failed'
      setCogStates((p) => ({ ...p, [item.id]: { id: item.id, progress: '', done: false, error: msg } }))
      setTimeout(() => setCogStates((p) => { const n = { ...p }; delete n[item.id]; return n }), 4000)
    }
  }

  /** Download the full TIF then automatically add it as a layer.
   *  For files ≤ 500 MB the same in-memory buffer is used for both saving and
   *  rendering — no second network request. */
  const downloadTIF = async (item: STACFeature) => {
    const tifUrl = item.assets?.image?.href
    if (!tifUrl) return
    const filename = tifUrl.split('/').pop() ?? `${item.id}.tif`
    setDownloadStates((p) => ({ ...p, [item.id]: 0 }))
    try {
      const renderUrl = await downloadAndGetRenderUrl(
        tifUrl,
        filename,
        (pct) => setDownloadStates((p) => ({ ...p, [item.id]: pct })),
      )
      if (renderUrl.startsWith('blob:')) blobUrlsRef.current[item.id] = renderUrl
      await viewAsLayer(item, renderUrl)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error('Download failed', err)
    } finally {
      setTimeout(() => setDownloadStates((p) => { const n = { ...p }; delete n[item.id]; return n }), 3000)
    }
  }

  const toggleOverlay = (id: string) => {
    setOverlayLayers((prev) =>
      prev.map((ol) => {
        if (ol.id !== id) return ol
        const nowVisible = !ol.visible
        ol.visible ? ol.overlay.setOpacity(0) : ol.overlay.setOpacity(0.9)
        useAppStore.getState().setMapOverlayVisible(id, nowVisible)
        return { ...ol, visible: nowVisible }
      })
    )
  }

  const removeOverlay = (id: string) => {
    setOverlayLayers((prev) => {
      const t = prev.find((ol) => ol.id === id)
      if (t) mapInstanceRef.current?.removeLayer(t.overlay)
      return prev.filter((ol) => ol.id !== id)
    })
    useAppStore.getState().deleteMapOverlay(id)
    const blobUrl = blobUrlsRef.current[id]
    if (blobUrl) { URL.revokeObjectURL(blobUrl); delete blobUrlsRef.current[id] }
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

      {/* ── Annotation pin button ─────────────────────────────── */}
      <button type="button" onClick={() => { setAnnoMode(v => !v); setPendingAnno(null) }} className="glass-panel"
        title={annoMode ? 'Exit pin mode' : 'Add map pin'}
        style={{ position: 'absolute', right: '10px', top: searchPanelOpen ? 'auto' : '54px', bottom: searchPanelOpen ? '80px' : 'auto', zIndex: 800, padding: '7px 8px', border: `1px solid ${annoMode ? '#f0b429' : 'var(--glass-border)'}`, cursor: 'pointer', color: annoMode ? '#f0b429' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: 'var(--font-mono)', background: annoMode ? 'rgba(240,180,41,0.08)' : undefined }}>
        <Pin size={11} /> {annoMode ? 'PINNING' : 'PIN'}
      </button>

      {/* Pending annotation input */}
      {annoMode && pendingAnno && (
        <div className="glass-panel" style={{ position: 'absolute', top: '130px', right: searchPanelOpen ? '280px' : '10px', zIndex: 1000, width: '210px', padding: '10px 12px' }}>
          <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#f0b429', marginBottom: '6px' }}>
            PIN · {pendingAnno.lat.toFixed(4)}°, {pendingAnno.lng.toFixed(4)}°
          </div>
          <input value={annoInput} onChange={e => setAnnoInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && annoInput.trim() && (addAnnotation({ lat: pendingAnno.lat, lng: pendingAnno.lng, title: annoInput.trim(), color: annoColor }), setAnnoInput(''), setPendingAnno(null))}
            placeholder="Label…" autoFocus
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: '11px', padding: '5px 8px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
            {ANNO_COLORS.map(c => <button key={c} type="button" onClick={() => setAnnoColor(c)} style={{ width: '14px', height: '14px', borderRadius: '50%', background: c, border: `2px solid ${annoColor === c ? '#fff' : 'transparent'}`, cursor: 'pointer', padding: 0 }} />)}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button type="button" onClick={() => { if (!annoInput.trim()) return; addAnnotation({ lat: pendingAnno.lat, lng: pendingAnno.lng, title: annoInput.trim(), color: annoColor }); setAnnoInput(''); setPendingAnno(null) }} disabled={!annoInput.trim()} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '9px' }}><MessageSquare size={9} /> Save</button>
            <button type="button" onClick={() => setPendingAnno(null)} className="btn" style={{ fontSize: '9px', padding: '3px 8px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Annotation list */}
      {annotations.length > 0 && (
        <div className="glass-panel" style={{ position: 'absolute', bottom: '30px', left: layerPanelOpen ? '230px' : '10px', zIndex: 800, padding: '6px 10px', maxWidth: '180px', maxHeight: '110px', overflowY: 'auto', transition: 'left 0.25s ease' }}>
          <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.06em' }}>PINS · MOON ({annotations.length})</div>
          {annotations.map((ann: Annotation) => (
            <div key={ann.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 0', cursor: 'pointer' }} onClick={() => mapInstanceRef.current?.flyTo([ann.lat, ann.lng], 5)}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ann.color, flexShrink: 0 }} />
              <span style={{ fontSize: '9px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ann.title}</span>
              <button type="button" onClick={e => { e.stopPropagation(); removeAnnotation(ann.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}><X size={8} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
