import { useEffect, useState } from 'react'
import { Crosshair, Layers, Wifi } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { EARTH_LAYERS, MOON_LAYERS, MARS_LAYERS, PLANET_CONFIGS } from '../../config/tileLayers'
import { reverseGeocode } from '../../utils/geocoding'

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '3px 0' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right', fontFamily: mono ? 'var(--font-mono)' : undefined, maxWidth: '55%', wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  )
}

export default function InfoPanel() {
  const { mode, hoveredCoords, clickedPoint, mapZoom, selectedEarthLayers, selectedPlanet } = useAppStore()
  const [locationName, setLocationName] = useState('')
  const [loadingLoc, setLoadingLoc] = useState(false)

  const coords = hoveredCoords ?? clickedPoint

  useEffect(() => {
    if (!clickedPoint || mode !== 'earth') return
    let cancelled = false
    setLoadingLoc(true)
    reverseGeocode(clickedPoint.lat, clickedPoint.lng)
      .then((n) => { if (!cancelled) setLocationName(n.split(',').slice(0, 3).join(', ')) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingLoc(false) })
    return () => { cancelled = true }
  }, [clickedPoint, mode])

  const getActiveLayer = () => {
    if (mode === 'earth') {
      const all = EARTH_LAYERS.flatMap((g) => g.layers)
      const active = all.filter((l) => selectedEarthLayers.includes(l.id))
      return active[active.length - 1] ?? null
    }
    if (mode === 'moon') return MOON_LAYERS[0]?.layers[0] ?? null
    if (mode === 'mars') return MARS_LAYERS[0]?.layers[0] ?? null
    if (mode === 'planets') return PLANET_CONFIGS.find((p) => p.id === selectedPlanet)?.layer ?? null
    return null
  }

  const layer = getActiveLayer()

  return (
    <div
      style={{
        width: '210px',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '9px 12px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Crosshair size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="label">Intel</span>
      </div>

      <div className="scrollable flex-1" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Coordinates */}
        <div>
          <div className="label" style={{ marginBottom: '5px', display: 'block' }}>Coordinates</div>
          <Row label="Lat" value={coords ? `${Math.abs(coords.lat).toFixed(6)}° ${coords.lat >= 0 ? 'N' : 'S'}` : '—'} mono />
          <Row label="Lon" value={coords ? `${Math.abs(coords.lng).toFixed(6)}° ${coords.lng >= 0 ? 'E' : 'W'}` : '—'} mono />
          <Row label="Zoom" value={`${mapZoom}`} />
          {mode === 'earth' && <Row label="~Altitude" value={zoomToAlt(mapZoom)} />}
        </div>

        {/* Location */}
        {mode === 'earth' && clickedPoint && (
          <div>
            <div className="label" style={{ marginBottom: '5px', display: 'block' }}>Location</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {loadingLoc ? 'Resolving…' : locationName || '—'}
            </div>
          </div>
        )}

        {/* Active source */}
        {layer && (
          <div>
            <div className="label" style={{ marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Layers size={10} />Active Source
            </div>
            <Row label="Name" value={layer.name} />
            <Row label="Resolution" value={layer.resolution} />
            <Row label="Source" value={layer.source} />
            <Row label="Updates" value={layer.updateFrequency} />
          </div>
        )}

        {/* Resolution reference */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <div className="label" style={{ marginBottom: '6px', display: 'block' }}>Best Available</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {BEST_RES[mode]?.map((item) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
          <Wifi size={11} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Uplink <span style={{ color: 'var(--success)' }}>connected</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function zoomToAlt(z: number): string {
  const m: Record<number, string> = { 0:'~20,000km',1:'~10,000km',2:'~5,000km',3:'~2,500km',4:'~1,200km',5:'~600km',6:'~300km',7:'~150km',8:'~75km',9:'~38km',10:'~19km',11:'~9km',12:'~5km',13:'~2.4km',14:'~1.2km',15:'~600m',16:'~300m',17:'~150m',18:'~75m',19:'~37m' }
  return m[Math.round(z)] ?? '—'
}

const BEST_RES: Record<string, { label: string; value: string }[]> = {
  earth: [
    { label: 'Maxar WV-3', value: '31cm' },
    { label: 'NAIP (USA)', value: '60cm' },
    { label: 'Sentinel-2', value: '10m' },
    { label: 'Landsat 8', value: '15m' },
    { label: 'MODIS', value: '250m' },
  ],
  moon: [
    { label: 'LROC NAC', value: '0.5m' },
    { label: 'LROC WAC', value: '100m' },
    { label: 'Kaguya TC', value: '10m' },
  ],
  mars: [
    { label: 'HiRISE', value: '25cm' },
    { label: 'CTX', value: '6m' },
    { label: 'THEMIS VIS', value: '18m' },
    { label: 'HRSC', value: '12m' },
  ],
  deepspace: [
    { label: 'JWST NIRCam', value: '0.031"' },
    { label: 'HST ACS', value: '0.049"' },
    { label: 'PanSTARRS', value: '0.25"' },
    { label: 'DSS2', value: '~1"' },
  ],
  planets: [
    { label: 'Mercury MDIS', value: '166m' },
    { label: 'Venus SAR', value: '75m' },
  ],
}
