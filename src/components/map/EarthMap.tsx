import { useEffect, useRef, useCallback, useState } from 'react'
import L from 'leaflet'
import {
  Search, Layers, X, Eye, EyeOff, Download, Loader, MapPin, ChevronLeft,
  MessageSquare, Pin, Columns2, ChevronsLeftRight, Camera,
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { EARTH_LAYERS } from '../../config/tileLayers'
import { mapController } from '../../utils/mapController'
import { searchSentinel2, type STACFeature } from '../../utils/geocoding'
import { renderCOGFromUrl, addCOGOverlay, downloadFile } from '../../utils/cogLoader'
import { useAnnotations, ANNO_COLORS, type Annotation } from '../../hooks/useAnnotations'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface OverlayLayer {
  id: string; label: string; overlay: L.ImageOverlay; visible: boolean; type: 'thumbnail' | 'cog'
}

/** Quick-pick layers available in the compare selector */
const COMPARE_PICKS = [
  { id: 'esri_world', label: 'ESRI World' },
  { id: 'gibs_viirs_today', label: 'VIIRS Today' },
  { id: 'gibs_modis_terra', label: 'MODIS Terra' },
  { id: 'gibs_blue_marble', label: 'Blue Marble' },
  { id: 'gibs_nighttime', label: 'Earth Night' },
  { id: 'gibs_landsat', label: 'Landsat' },
  { id: 'usgs_naip', label: 'NAIP (USA)' },
]

export default function EarthMap() {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const layerMapRef = useRef<Record<string, L.TileLayer>>({})
  const markerRef = useRef<L.Marker | null>(null)
  const annoMarkersRef = useRef<Record<string, L.Marker>>({})
  const compareTileRef = useRef<L.TileLayer | null>(null)
  const isDragging = useRef(false)

  const {
    selectedEarthLayers, mapCenter, mapZoom,
    setMapCenter, setMapZoom, setHoveredCoords, clickedPoint, setClickedPoint, settings,
  } = useAppStore()

  const allLayers = EARTH_LAYERS.flatMap(g => g.layers)

  // ── COG search panel ─────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [results, setResults] = useState<STACFeature[]>([])
  const [searching, setSearching] = useState(false)
  const [maxCloud, setMaxCloud] = useState(20)
  const [overlayLayers, setOverlayLayers] = useState<OverlayLayer[]>([])
  const [cogStates, setCogStates] = useState<Record<string, { progress: string; done: boolean; error?: string }>>({})
  const [dlStates, setDlStates] = useState<Record<string, number>>({})

  // ── Annotations ───────────────────────────────────────────────
  const { annotations, addAnnotation, removeAnnotation } = useAnnotations('astrox-earth-annotations')
  const [annoMode, setAnnoMode] = useState(false)
  const [pendingAnno, setPendingAnno] = useState<{ lat: number; lng: number } | null>(null)
  const [annoInput, setAnnoInput] = useState('')
  const [annoColor, setAnnoColor] = useState(ANNO_COLORS[0])

  // ── Comparison mode ───────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false)
  const [compareLayerId, setCompareLayerId] = useState('gibs_viirs_today')
  const [dividerPct, setDividerPct] = useState(50)

  // ── GIBS time slider ──────────────────────────────────────────
  const [gibsDate, setGibsDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })

  // ── Map init ──────────────────────────────────────────────────
  const initMap = useCallback(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: mapCenter, zoom: mapZoom, zoomControl: false, attributionControl: true,
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false, maxWidth: 120 }).addTo(map)
    map.on('mousemove', e => setHoveredCoords({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.on('mouseout', () => setHoveredCoords(null))
    map.on('click', e => setClickedPoint({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.on('moveend', () => { const c = map.getCenter(); setMapCenter([c.lat, c.lng]); setMapZoom(map.getZoom()) })
    allLayers.forEach(layer => {
      let url = layer.url
      if (layer.requiresKey && layer.keyName === 'planetApiKey')
        url = url.replace('{PLANET_API_KEY}', settings.planetApiKey || 'no-key')
      layerMapRef.current[layer.id] = L.tileLayer(url, {
        maxZoom: layer.maxZoom ?? 19, minZoom: layer.minZoom ?? 0,
        attribution: layer.attribution, tms: layer.tms, opacity: 1,
      })
    })
    mapRef.current = map
    mapController.register(map)
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 150)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line

  useEffect(() => {
    const c = initMap()
    return () => { c?.(); mapController.unregister(); mapRef.current?.remove(); mapRef.current = null }
  }, [initMap])

  // Sync active tile layers
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    allLayers.forEach(layer => {
      const tl = layerMapRef.current[layer.id]; if (!tl) return
      const show = selectedEarthLayers.includes(layer.id)
      if (show && !map.hasLayer(tl)) map.addLayer(tl)
      else if (!show && map.hasLayer(tl)) map.removeLayer(tl)
    })
    if (selectedEarthLayers.length === 0) { const osm = layerMapRef.current['osm']; if (osm && !map.hasLayer(osm)) map.addLayer(osm) }
  }, [selectedEarthLayers]) // eslint-disable-line

  // Handle map click
  useEffect(() => {
    if (!clickedPoint) return
    if (annoMode) { setPendingAnno({ lat: clickedPoint.lat, lng: clickedPoint.lng }); return }
    setSearchCoords({ lat: clickedPoint.lat, lng: clickedPoint.lng })
    setSearchOpen(true)
    const map = mapRef.current; if (!map) return
    if (markerRef.current) markerRef.current.remove()
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:10px;height:10px;border:2px solid #0dcc88;border-radius:50%;background:rgba(13,204,136,0.2)"></div>`,
      iconSize: [10, 10], iconAnchor: [5, 5],
    })
    markerRef.current = L.marker([clickedPoint.lat, clickedPoint.lng], { icon }).addTo(map)
  }, [clickedPoint, annoMode])

  // Annotation markers
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    Object.values(annoMarkersRef.current).forEach(m => m.remove())
    annoMarkersRef.current = {}
    annotations.forEach((ann: Annotation) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border:2px solid ${ann.color};border-radius:50%;background:${ann.color}33;box-shadow:0 0 8px ${ann.color}77"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      })
      const m = L.marker([ann.lat, ann.lng], { icon }).addTo(map)
        .bindPopup(`<div style="background:#0c1014;border:1px solid rgba(255,255,255,0.1);color:#d4e0eb;font-family:Inter,sans-serif;font-size:11px;padding:8px 10px;border-radius:4px;min-width:120px"><b>${ann.title}</b><br/><span style="font-size:9px;color:#5a6a7a;font-family:monospace">${ann.lat.toFixed(4)}, ${ann.lng.toFixed(4)}</span><br/><button onclick="window.__deleteAnno('${ann.id}')" style="margin-top:6px;font-size:9px;color:#ff4d6d;background:none;border:none;cursor:pointer;padding:0">Remove</button></div>`,
          { closeButton: false, className: 'custom-popup' })
      annoMarkersRef.current[ann.id] = m
    })
    ;(window as unknown as Record<string, unknown>).__deleteAnno = (id: string) => removeAnnotation(id)
  }, [annotations]) // eslint-disable-line

  // GIBS date → rebuild GIBS tile URLs
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    allLayers.filter(l => l.source === 'NASA GIBS').forEach(layer => {
      const tl = layerMapRef.current[layer.id]; if (!tl || !map.hasLayer(tl)) return
      const newUrl = layer.url.replace(/\/default\/[^/]+\//, `/default/${gibsDate}/`)
      map.removeLayer(tl)
      const newTl = L.tileLayer(newUrl, { maxZoom: layer.maxZoom ?? 9, minZoom: layer.minZoom ?? 0, attribution: layer.attribution })
      newTl.addTo(map)
      layerMapRef.current[layer.id] = newTl
    })
  }, [gibsDate]) // eslint-disable-line

  // Compare mode: setup/teardown pane + compare tile
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    if (compareTileRef.current) { map.removeLayer(compareTileRef.current); compareTileRef.current = null }
    if (!compareMode) {
      const pane = map.getPane('comparePane') as HTMLElement | undefined
      if (pane) pane.style.clipPath = 'none'
      return
    }
    let pane = map.getPane('comparePane') as HTMLElement | undefined
    if (!pane) { map.createPane('comparePane'); pane = map.getPane('comparePane') as HTMLElement; pane.style.zIndex = '260' }
    pane.style.clipPath = `inset(0 0 0 ${dividerPct}%)`
    const lc = allLayers.find(l => l.id === compareLayerId); if (!lc) return
    const tl = L.tileLayer(lc.url, { maxZoom: lc.maxZoom ?? 9, attribution: lc.attribution, pane: 'comparePane' })
    tl.addTo(map); compareTileRef.current = tl
  }, [compareMode, compareLayerId]) // eslint-disable-line

  // Compare: sync divider → pane clip-path
  useEffect(() => {
    if (!compareMode) return
    const pane = mapRef.current?.getPane('comparePane') as HTMLElement | undefined
    if (pane) pane.style.clipPath = `inset(0 0 0 ${dividerPct}%)`
  }, [compareMode, dividerPct])

  // Divider drag handler — disables map drag while dragging
  const startDividerDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); e.stopPropagation()
    const map = mapRef.current; map?.dragging.disable()
    isDragging.current = true
    const mapEl = containerRef.current
    const getX = (ev: MouseEvent | TouchEvent) => 'touches' in ev ? ev.touches[0].clientX : ev.clientX
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!isDragging.current || !mapEl) return
      const rect = mapEl.getBoundingClientRect()
      setDividerPct(Math.max(5, Math.min(95, ((getX(ev) - rect.left) / rect.width) * 100)))
    }
    const onUp = () => {
      isDragging.current = false; map?.dragging.enable()
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onUp)
  }, [])

  // ── Search helpers ────────────────────────────────────────────
  const searchImages = async () => {
    if (!searchCoords) return
    setSearching(true); setResults([])
    const r = await searchSentinel2(searchCoords.lat, searchCoords.lng, maxCloud)
    setResults(r); setSearching(false)
  }

  const viewAsLayer = async (item: STACFeature) => {
    const map = mapRef.current; if (!map) return
    const tifUrl = item.assets?.visual?.href ?? item.assets?.TCI?.href
    if (!tifUrl || !item.bbox) return
    setCogStates(p => ({ ...p, [item.id]: { progress: 'Connecting…', done: false } }))
    try {
      const cogResult = await renderCOGFromUrl(tifUrl, 1024, msg => setCogStates(p => ({ ...p, [item.id]: { progress: msg, done: false } })))
      setOverlayLayers(prev => { const ex = prev.find(ol => ol.id === item.id); if (ex) map.removeLayer(ex.overlay); return prev.filter(ol => ol.id !== item.id) })
      const overlay = addCOGOverlay(map, cogResult.dataUrl, item.bbox as [number, number, number, number], 0.9, cogResult.intrinsicBounds)
      setOverlayLayers(prev => [...prev, { id: item.id, label: item.id.slice(0, 22), overlay, visible: true, type: 'cog' }])
      setCogStates(p => ({ ...p, [item.id]: { progress: '', done: true } }))
      setTimeout(() => setCogStates(p => { const n = { ...p }; delete n[item.id]; return n }), 2500)
    } catch (err) {
      setCogStates(p => ({ ...p, [item.id]: { progress: '', done: false, error: (err as Error).message } }))
      setTimeout(() => setCogStates(p => { const n = { ...p }; delete n[item.id]; return n }), 4000)
    }
  }

  const addThumb = (item: STACFeature) => {
    const map = mapRef.current; if (!map || !item.bbox) return
    const thumb = item.assets?.thumbnail?.href; if (!thumb) return
    const [w, s, e, n] = item.bbox
    setOverlayLayers(prev => {
      const ex = prev.find(ol => ol.id === item.id)
      if (ex) { map.removeLayer(ex.overlay); return prev.filter(ol => ol.id !== item.id) }
      const ov = L.imageOverlay(thumb, [[s, w], [n, e]], { opacity: 0.9 })
      ov.addTo(map); map.fitBounds([[s, w], [n, e]], { padding: [20, 20] })
      return [...prev, { id: item.id, label: item.id.slice(0, 22), overlay: ov, visible: true, type: 'thumbnail' }]
    })
  }

  const toggleOverlay = (id: string) =>
    setOverlayLayers(prev => prev.map(ol => { if (ol.id !== id) return ol; ol.visible ? ol.overlay.setOpacity(0) : ol.overlay.setOpacity(0.9); return { ...ol, visible: !ol.visible } }))

  const removeOverlay = (id: string) =>
    setOverlayLayers(prev => { const t = prev.find(ol => ol.id === id); if (t) mapRef.current?.removeLayer(t.overlay); return prev.filter(ol => ol.id !== id) })

  // ── Export ────────────────────────────────────────────────────
  const exportView = () => {
    const map = mapRef.current; if (!map) return
    const c = map.getCenter(); const z = map.getZoom(); const b = map.getBounds()
    const meta = {
      center: { lat: c.lat, lng: c.lng }, zoom: z,
      bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
      activeLayers: selectedEarthLayers,
      date: gibsDate,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `astrox-view-${Date.now()}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const isGibsActive = selectedEarthLayers.some(id => allLayers.find(l => l.id === id)?.source === 'NASA GIBS')
  const compareLayerLabel = COMPARE_PICKS.find(p => p.id === compareLayerId)?.label ?? compareLayerId

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {!compareMode && <div className="crosshair" />}

      {/* ── Compare mode divider ─────────────────────────────── */}
      {compareMode && (
        <>
          {/* Left label */}
          <div style={{ position: 'absolute', top: '14px', left: `calc(${dividerPct}% - 120px)`, zIndex: 999, pointerEvents: 'none', background: 'rgba(9,9,11,0.75)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: '110px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {allLayers.find(l => l.id === selectedEarthLayers[0])?.name ?? 'Base layer'} ←
          </div>
          {/* Right label */}
          <div style={{ position: 'absolute', top: '14px', left: `calc(${dividerPct}% + 10px)`, zIndex: 999, pointerEvents: 'none', background: 'rgba(9,9,11,0.75)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '3px 8px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
            → {compareLayerLabel}
          </div>
          {/* Divider line + handle */}
          <div
            style={{ position: 'absolute', left: `${dividerPct}%`, top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.7)', zIndex: 1000, cursor: 'col-resize', transform: 'translateX(-50%)', touchAction: 'none', userSelect: 'none' }}
            onMouseDown={startDividerDrag}
            onTouchStart={startDividerDrag}
          >
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(13,204,136,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.6)', cursor: 'col-resize' }}>
              <ChevronsLeftRight size={14} color="#000" />
            </div>
          </div>
        </>
      )}

      {/* ── Floating toolbar (top-left) ──────────────────────── */}
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 900, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {/* Compare toggle */}
        <button type="button" onClick={() => setCompareMode(v => !v)} className="glass-panel"
          title="Toggle split-screen comparison"
          style={{ padding: '7px 8px', border: `1px solid ${compareMode ? 'var(--accent)' : 'var(--glass-border)'}`, cursor: 'pointer', color: compareMode ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: 'var(--font-mono)', background: compareMode ? 'rgba(13,204,136,0.08)' : undefined }}>
          <Columns2 size={11} /> {compareMode ? 'COMPARE' : 'SPLIT'}
        </button>
        {/* Annotation toggle */}
        <button type="button" onClick={() => { setAnnoMode(v => !v); setPendingAnno(null) }} className="glass-panel"
          title={annoMode ? 'Exit pin mode' : 'Add map pin'}
          style={{ padding: '7px 8px', border: `1px solid ${annoMode ? '#f0b429' : 'var(--glass-border)'}`, cursor: 'pointer', color: annoMode ? '#f0b429' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: 'var(--font-mono)', background: annoMode ? 'rgba(240,180,41,0.08)' : undefined }}>
          <Pin size={11} /> {annoMode ? 'PINNING' : 'PIN'}
        </button>
        {/* Export */}
        <button type="button" onClick={exportView} className="glass-panel"
          title="Export view metadata as JSON"
          style={{ padding: '7px 8px', border: '1px solid var(--glass-border)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
          <Camera size={11} /> EXPORT
        </button>
        {/* Overlay list */}
        {overlayLayers.length > 0 && (
          <div className="glass-panel" style={{ padding: '4px 6px', minWidth: '120px' }}>
            <div className="label" style={{ padding: '2px 4px 4px', fontSize: '8px' }}>OVERLAYS</div>
            {overlayLayers.map(ol => (
              <div key={ol.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px', fontSize: '9px' }}>
                <button type="button" onClick={() => toggleOverlay(ol.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: ol.visible ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>
                  {ol.visible ? <Eye size={9} /> : <EyeOff size={9} />}
                </button>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '8px' }}>{ol.label}</span>
                <span style={{ fontSize: '7px', color: ol.type === 'cog' ? 'var(--accent)' : 'var(--text-muted)' }}>{ol.type.toUpperCase()}</span>
                <button type="button" onClick={() => removeOverlay(ol.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', flexShrink: 0 }}><X size={8} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Compare layer selector (bottom-center, when compare active) ── */}
      {compareMode && (
        <div className="glass-panel" style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 900, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>RIGHT →</span>
          {COMPARE_PICKS.map(pick => (
            <button key={pick.id} type="button"
              onClick={() => setCompareLayerId(pick.id)}
              className="btn"
              style={{ fontSize: '9px', padding: '2px 8px', background: compareLayerId === pick.id ? 'rgba(13,204,136,0.12)' : undefined, borderColor: compareLayerId === pick.id ? 'var(--accent)' : undefined, color: compareLayerId === pick.id ? 'var(--accent)' : undefined }}>
              {pick.label}
            </button>
          ))}
        </div>
      )}

      {/* ── GIBS time slider ──────────────────────────────────── */}
      {isGibsActive && (
        <div className="glass-panel" style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 900, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>DATE</span>
          <input type="date" value={gibsDate}
            max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)} min="2012-01-01"
            onChange={e => setGibsDate(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '10px', outline: 'none', cursor: 'pointer' }}
          />
        </div>
      )}

      {/* ── Annotation input popup ─────────────────────────────── */}
      {annoMode && pendingAnno && (
        <div className="glass-panel" style={{ position: 'absolute', top: '130px', left: '10px', zIndex: 1000, width: '220px', padding: '10px 12px' }}>
          <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#f0b429', marginBottom: '6px', letterSpacing: '0.06em' }}>
            PIN · {pendingAnno.lat.toFixed(4)}°, {pendingAnno.lng.toFixed(4)}°
          </div>
          <input value={annoInput} onChange={e => setAnnoInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && annoInput.trim() && (addAnnotation({ lat: pendingAnno.lat, lng: pendingAnno.lng, title: annoInput.trim(), color: annoColor }), setAnnoInput(''), setPendingAnno(null))}
            placeholder="Label…" autoFocus
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: '11px', padding: '5px 8px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
            {ANNO_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setAnnoColor(c)}
                style={{ width: '14px', height: '14px', borderRadius: '50%', background: c, border: `2px solid ${annoColor === c ? '#fff' : 'transparent'}`, cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button type="button" onClick={() => { if (!annoInput.trim()) return; addAnnotation({ lat: pendingAnno.lat, lng: pendingAnno.lng, title: annoInput.trim(), color: annoColor }); setAnnoInput(''); setPendingAnno(null) }}
              disabled={!annoInput.trim()} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '9px' }}>
              <MessageSquare size={9} /> Save
            </button>
            <button type="button" onClick={() => setPendingAnno(null)} className="btn" style={{ fontSize: '9px', padding: '3px 8px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Search panel toggle ────────────────────────────────── */}
      {!searchOpen && (
        <button type="button" onClick={() => setSearchOpen(true)} className="glass-panel"
          style={{ position: 'absolute', right: '10px', top: '10px', zIndex: 900, padding: '7px 8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent)', fontSize: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
          <ChevronLeft size={10} /> <Search size={11} />
        </button>
      )}

      {/* ── Sentinel-2 search panel ────────────────────────────── */}
      <div className="glass-panel floating-panel animate-slide-right"
        style={{ right: searchOpen ? '10px' : '-280px', top: '10px', width: '270px', transition: 'right 0.25s ease' }}>
        <div className="floating-panel-header">
          <Search size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span className="label" style={{ flex: 1 }}>Find High-Res Images</span>
          <button type="button" onClick={() => setSearchOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)' }}><X size={11} /></button>
        </div>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>CLOUD ≤</span>
            <input type="range" min={0} max={100} step={5} value={maxCloud} onChange={e => setMaxCloud(parseInt(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', minWidth: '28px' }}>{maxCloud}%</span>
          </div>
          {searchCoords ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '7px', padding: '4px 8px', background: 'rgba(13,204,136,0.05)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)' }}>
              <MapPin size={9} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', flex: 1 }}>{searchCoords.lat.toFixed(4)}°, {searchCoords.lng.toFixed(4)}°</span>
            </div>
          ) : (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '7px', textAlign: 'center' }}>Click map to set location</div>
          )}
          <button type="button" onClick={searchImages} disabled={!searchCoords || searching} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '10px' }}>
            {searching ? <><Loader size={10} className="animate-spin" /> Searching…</> : <><Search size={10} /> Find Sentinel-2 Scenes</>}
          </button>
        </div>
        <div className="floating-panel-body" style={{ padding: '8px' }}>
          {results.length === 0 && !searching && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 8px' }}>Click map then search for Sentinel-2 scenes (10m) at that point</div>
          )}
          {results.map(item => {
            const thumb = item.assets?.thumbnail?.href
            const tifUrl = item.assets?.visual?.href ?? item.assets?.TCI?.href
            const cloud = item.properties?.['eo:cloud_cover']
            const date = item.properties?.datetime
            const cog = cogStates[item.id]; const dlPct = dlStates[item.id]
            return (
              <div key={item.id} className="result-card" style={{ marginBottom: '6px' }}>
                {thumb && (
                  <div style={{ position: 'relative', marginBottom: '6px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border)' }} onClick={() => addThumb(item)}>
                    <img src={thumb} alt={item.id} style={{ width: '100%', display: 'block', maxHeight: '80px', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: '3px', right: '3px', background: 'rgba(0,0,0,0.7)', borderRadius: '2px', padding: '1px 5px', fontSize: '8px', color: '#fff', fontFamily: 'var(--font-mono)' }}>{cloud != null ? `☁ ${cloud.toFixed(1)}%` : 'Preview'}</div>
                  </div>
                )}
                <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.id}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '5px' }}>
                  <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>Sentinel-2 · 10m</span>
                  {date && <span style={{ color: 'var(--text-muted)' }}>{new Date(date).toLocaleDateString('en-US', { year: '2-digit', month: 'short', day: 'numeric' })}</span>}
                </div>
                {cog && !cog.done && !cog.error && <div style={{ marginBottom: '5px', fontSize: '9px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}><Loader size={9} className="animate-spin" /> {cog.progress}</div>}
                {cog?.error && <div style={{ fontSize: '9px', color: 'var(--danger)', marginBottom: '4px' }}>{cog.error}</div>}
                {cog?.done && <div style={{ fontSize: '9px', color: 'var(--accent)', marginBottom: '4px' }}>Layer added ✓</div>}
                {dlPct != null && (
                  <div style={{ marginBottom: '5px' }}>
                    <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px', overflow: 'hidden', marginBottom: '2px' }}><div style={{ height: '100%', width: `${dlPct}%`, background: dlPct === 100 ? 'var(--success)' : 'var(--accent)', transition: 'width 0.2s' }} /></div>
                    <span style={{ fontSize: '9px', color: dlPct === 100 ? 'var(--success)' : 'var(--accent)' }}>{dlPct === 100 ? 'Saved ✓' : `${dlPct}%`}</span>
                  </div>
                )}
                {tifUrl && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="button" onClick={() => viewAsLayer(item)} disabled={!!cog && !cog.done && !cog.error} className="cog-btn" style={{ flex: 1, justifyContent: 'center' }}><Eye size={9} /> View Layer</button>
                    <button type="button" onClick={() => { const fn = item.id + '_visual.tif'; setDlStates(p => ({ ...p, [item.id]: 0 })); downloadFile(tifUrl, fn, pct => setDlStates(p => ({ ...p, [item.id]: pct }))).finally(() => setTimeout(() => setDlStates(p => { const n = { ...p }; delete n[item.id]; return n }), 3000)) }} disabled={dlPct != null} className="btn" style={{ fontSize: '9px', padding: '3px 7px' }}><Download size={9} /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[['Sentinel-2 L2A', '10m/px'], ['ESRI World', '30–60cm/px'], ['NAIP (USA)', '60cm/px']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l}</span><span style={{ color: 'var(--text-secondary)' }}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Annotation list (bottom-left) ─────────────────────── */}
      {annotations.length > 0 && (
        <div className="glass-panel" style={{ position: 'absolute', bottom: '30px', left: '10px', zIndex: 900, padding: '6px 10px', maxWidth: '200px', maxHeight: '120px', overflowY: 'auto' }}>
          <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.06em' }}>PINS ({annotations.length})</div>
          {annotations.map((ann: Annotation) => (
            <div key={ann.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 0', cursor: 'pointer' }} onClick={() => mapRef.current?.flyTo([ann.lat, ann.lng], 14)}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ann.color, flexShrink: 0 }} />
              <span style={{ fontSize: '9px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ann.title}</span>
              <button type="button" onClick={e => { e.stopPropagation(); removeAnnotation(ann.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }}><X size={8} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
