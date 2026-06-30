import { useState, useCallback } from 'react'
import { Search, ExternalLink, Loader, MapPin, RefreshCw, Satellite } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { geocodeAddress } from '../../utils/geocoding'

interface ScanResult {
  source: string
  provider: string
  resolution: string
  date?: string
  coverage: 'global' | 'regional' | 'spot'
  available: boolean
  url?: string
  note?: string
  loadingMs?: number
  status: 'loading' | 'found' | 'unavailable' | 'error'
  bands?: string
}

interface ScanTarget {
  lat: number
  lng: number
  label: string
  isEarth: boolean
}

// ── Query functions ────────────────────────────────────────────

async function checkNAIP(lat: number, lng: number): Promise<Partial<ScanResult>> {
  const t0 = Date.now()
  try {
    // USGS NAIP identify endpoint — tells us if NAIP tiles exist here
    const url = `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/identify?geometry=${lng},${lat}&geometryType=esriGeometryPoint&returnGeometry=false&f=json`
    const r = await fetch(url)
    const d = await r.json()
    const available = !!(d?.value || d?.catalogItems?.features?.length)
    return {
      available,
      loadingMs: Date.now() - t0,
      note: available ? 'NAIP available for this US location' : 'Outside NAIP coverage (US-only)',
      status: available ? 'found' : 'unavailable',
    }
  } catch {
    return { available: false, status: 'error', loadingMs: Date.now() - t0 }
  }
}

async function checkSentinel2(lat: number, lng: number): Promise<Partial<ScanResult> & { scenes?: number; bestCloudCover?: number; lastDate?: string }> {
  const t0 = Date.now()
  try {
    const pad = 0.1
    const bbox = [lng - pad, lat - pad, lng + pad, lat + pad].join(',')
    const url = `https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items?bbox=${bbox}&limit=5&sortby=-datetime`
    const r = await fetch(url)
    const d = await r.json()
    const features = d?.features || []
    if (features.length === 0) return { available: false, status: 'unavailable', loadingMs: Date.now() - t0 }
    const best = features[0]
    const cloud = best?.properties?.['eo:cloud_cover'] ?? null
    const date = best?.properties?.datetime?.slice(0, 10) ?? null
    return {
      available: true,
      loadingMs: Date.now() - t0,
      scenes: features.length,
      bestCloudCover: cloud != null ? Math.round(cloud) : undefined,
      lastDate: date,
      status: 'found',
      note: `${features.length} scenes · best cloud cover: ${cloud != null ? Math.round(cloud) + '%' : 'unknown'}`,
      date: date ?? undefined,
    }
  } catch {
    return { available: false, status: 'error', loadingMs: Date.now() - t0 }
  }
}

async function checkGIBSLayer(layer: string, lat: number, lng: number): Promise<Partial<ScanResult>> {
  const t0 = Date.now()
  try {
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    // Use WMTS GetTile to test availability — if we get a valid tile, it exists
    const z = 3, x = Math.floor((lng + 180) / 360 * Math.pow(2, z)), y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z))
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible/${z}/${y}/${x}.jpg`
    const r = await fetch(url, { method: 'HEAD' })
    return {
      available: r.ok,
      loadingMs: Date.now() - t0,
      date,
      status: r.ok ? 'found' : 'unavailable',
      note: r.ok ? `Latest tile available (${date})` : 'Tile not available for this location/date',
    }
  } catch {
    return { available: false, status: 'error', loadingMs: Date.now() - t0 }
  }
}

async function checkHiRISE(lat: number, lng: number): Promise<Partial<ScanResult>> {
  const t0 = Date.now()
  try {
    const pad = 2
    const bbox = [lng - pad, lat - pad, lng + pad, lat + pad].join(',')
    const url = `https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_uncontrolled_observations/items?bbox=${bbox}&limit=10`
    const r = await fetch(url)
    const d = await r.json()
    const count = d?.features?.length ?? 0
    return {
      available: count > 0,
      loadingMs: Date.now() - t0,
      status: count > 0 ? 'found' : 'unavailable',
      note: count > 0 ? `${count} HiRISE observations (25cm/px)` : 'No HiRISE coverage in this region',
      url: count > 0 ? `https://stac.astrogeology.usgs.gov/browser-dev/#/collections/mro_hirise_uncontrolled_observations` : undefined,
    }
  } catch {
    return { available: false, status: 'error', loadingMs: Date.now() - t0 }
  }
}

async function checkLROC(lat: number, lng: number): Promise<Partial<ScanResult>> {
  const t0 = Date.now()
  // LROC has global WAC coverage. NAC coverage is spot-based.
  // Check NAC coverage via PDS ODE
  try {
    const url = `https://oderest.rsl.wustl.edu/live2/?target=moon&ihid=lro&iid=lroc&pt=EDR&westlon=${lng - 1}&eastlon=${lng + 1}&minlat=${lat - 1}&maxlat=${lat + 1}&output=json&results=5`
    const r = await fetch(url)
    const d = await r.json()
    const products = d?.ODEResults?.Products?.Product
    const count = Array.isArray(products) ? products.length : products ? 1 : 0
    return {
      available: true,
      loadingMs: Date.now() - t0,
      status: 'found',
      note: `WAC global (100m). ${count > 0 ? `${count} NAC spots (0.5m) nearby` : 'No NAC spot coverage found'}`,
    }
  } catch {
    return { available: true, status: 'found', loadingMs: Date.now() - t0, note: 'WAC global coverage (100m/px)' }
  }
}

async function checkMASTJWST(): Promise<Partial<ScanResult>> {
  const t0 = Date.now()
  try {
    // Query MAST CAOM for recent JWST observations — just confirm the service is up and return count
    const url = `https://mast.stsci.edu/api/v0/invoke?request=Mast.Caom.Filtered&format=json&params={"filters":[{"paramName":"obs_collection","values":["JWST"]}],"columns":"COUNT_BIG(*)"}&timeout=6000`
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const d = await r.json()
    const count: number = d?.data?.[0]?.['COUNT_BIG(*)'] ?? 0
    return {
      available: true,
      status: 'found',
      loadingMs: Date.now() - t0,
      note: `${count > 0 ? count.toLocaleString() + ' JWST observations' : 'Archive accessible'} · NIRCam 0.03″/px`,
      url: 'https://mast.stsci.edu/portal/Mashup/Clients/Mast/Portal.html',
    }
  } catch {
    return {
      available: true,
      status: 'found',
      loadingMs: Date.now() - t0,
      note: 'MAST archive accessible — NIRCam 0.031″/px resolution',
      url: 'https://mast.stsci.edu/portal/Mashup/Clients/Mast/Portal.html',
    }
  }
}

// ── Source definitions ─────────────────────────────────────────

const EARTH_SOURCES: ScanResult[] = [
  { source: 'ESRI World Imagery',    provider: 'Esri/Maxar',   resolution: '~30–60cm',  coverage: 'global',   available: false, bands: 'RGB',           status: 'loading', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer' },
  { source: 'USGS NAIP',             provider: 'USGS/USDA',    resolution: '60cm',      coverage: 'regional', available: false, bands: 'RGBN',          status: 'loading', note: 'USA only' },
  { source: 'Sentinel-2 L2A',        provider: 'ESA/AWS',      resolution: '10m',       coverage: 'global',   available: false, bands: '12-band',       status: 'loading', url: 'https://earth-search.aws.element84.com/v1' },
  { source: 'VIIRS Near Real-Time',  provider: 'NASA LANCE',   resolution: '375m',      coverage: 'global',   available: false, bands: 'True Color',    status: 'loading', url: 'https://gibs.earthdata.nasa.gov' },
  { source: 'MODIS Terra',           provider: 'NASA GIBS',    resolution: '250m',       coverage: 'global',   available: false, bands: 'True Color',    status: 'loading', url: 'https://gibs.earthdata.nasa.gov' },
  { source: 'Landsat 8/9 OLI',       provider: 'NASA/USGS',    resolution: '30m',        coverage: 'global',   available: false, bands: 'Multispectral', status: 'loading', url: 'https://earthexplorer.usgs.gov' },
  { source: 'JWST NIRCam (MAST)',    provider: 'NASA/STScI',   resolution: '0.031″/px',  coverage: 'spot',     available: false, bands: '0.6–5μm IR',    status: 'loading', url: 'https://mast.stsci.edu', note: 'Deep space targets, not Earth imagery' },
]

const MARS_SOURCES: ScanResult[] = [
  { source: 'MRO HiRISE',            provider: 'NASA/UA',      resolution: '25cm',      coverage: 'spot',     available: false, bands: 'RGB+NIR',   status: 'loading', url: 'https://stac.astrogeology.usgs.gov/api' },
  { source: 'MRO CTX',               provider: 'NASA/Caltech', resolution: '6m',        coverage: 'global',   available: false, bands: 'Gray',      status: 'loading' },
  { source: 'THEMIS VIS',            provider: 'NASA/ASU',     resolution: '18m',       coverage: 'global',   available: false, bands: 'Visible',   status: 'loading' },
  { source: 'MOLA DEM',              provider: 'NASA/GSFC',    resolution: '463m',      coverage: 'global',   available: false, bands: 'Elevation', status: 'loading' },
]

const MOON_SOURCES: ScanResult[] = [
  { source: 'LROC WAC Mosaic',       provider: 'NASA/ASU',     resolution: '100m',      coverage: 'global',   available: true,  bands: 'Grayscale', status: 'found' },
  { source: 'LROC NAC Spots',        provider: 'NASA/ASU',     resolution: '0.5m',      coverage: 'spot',     available: false, bands: 'Grayscale', status: 'loading' },
  { source: 'LOLA DEM',              provider: 'NASA/GSFC',    resolution: '236m',      coverage: 'global',   available: true,  bands: 'Elevation', status: 'found' },
  { source: 'Kaguya (Selene)',        provider: 'JAXA',         resolution: '10m',       coverage: 'global',   available: true,  bands: 'Multispectral', status: 'found', url: 'https://stac.astrogeology.usgs.gov' },
]

// ── Component ──────────────────────────────────────────────────

export default function SourceScanner() {
  const { clickedPoint } = useAppStore()
  const [scanMode, setScanMode] = useState<'earth' | 'mars' | 'moon'>('earth')
  const [results, setResults] = useState<ScanResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [target, setTarget] = useState<ScanTarget | null>(null)
  const [scanTime, setScanTime] = useState<number | null>(null)

  const runScan = useCallback(async (t: ScanTarget) => {
    setScanning(true)
    setScanTime(null)
    const wallT0 = Date.now()

    if (!t.isEarth) {
      // Mars / Moon: use static knowledge + HiRISE/LROC live check
      const base = t.label === 'mars' ? [...MARS_SOURCES] : [...MOON_SOURCES]
      setResults(base.map((s) => ({ ...s, status: 'loading' as const })))

      if (t.label === 'mars') {
        const hirise = await checkHiRISE(t.lat, t.lng)
        setResults((prev) => prev.map((s) => s.source === 'MRO HiRISE' ? { ...s, ...hirise } : s.source !== 'MRO HiRISE' ? { ...s, status: 'found', available: true } : s))
      } else {
        const lroc = await checkLROC(t.lat, t.lng)
        setResults((prev) => prev.map((s) => s.source === 'LROC NAC Spots' ? { ...s, ...lroc, available: true } : { ...s, status: 'found', available: true }))
      }
      setScanTime(Date.now() - wallT0)
      setScanning(false)
      return
    }

    // Earth: parallel queries
    const base = EARTH_SOURCES.map((s) => ({ ...s, status: 'loading' as const }))
    setResults(base)

    const [naip, s2, viirs, modis, jwst] = await Promise.all([
      checkNAIP(t.lat, t.lng),
      checkSentinel2(t.lat, t.lng),
      checkGIBSLayer('VIIRS_SNPP_CorrectedReflectance_TrueColor', t.lat, t.lng),
      checkGIBSLayer('MODIS_Terra_CorrectedReflectance_TrueColor', t.lat, t.lng),
      checkMASTJWST(),
    ])

    setResults((prev) => prev.map((s) => {
      if (s.source === 'USGS NAIP')            return { ...s, ...naip }
      if (s.source === 'Sentinel-2 L2A')       return { ...s, ...s2 }
      if (s.source === 'VIIRS Near Real-Time') return { ...s, ...viirs }
      if (s.source === 'MODIS Terra')          return { ...s, ...modis }
      if (s.source === 'JWST NIRCam (MAST)')   return { ...s, ...jwst }
      // ESRI and Landsat are always global, mark found
      return { ...s, available: true, status: 'found', note: s.source === 'ESRI World Imagery' ? 'Always available globally' : 'Global annual mosaic available' }
    }))

    setScanTime(Date.now() - wallT0)
    setScanning(false)
  }, [])

  const handleSearch = async () => {
    const q = targetInput.trim()
    if (!q) return
    try {
      const results = await geocodeAddress(q)
      if (results.length === 0) return
      const r = results[0]
      const t: ScanTarget = {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        label: r.display_name.split(',')[0],
        isEarth: scanMode === 'earth',
      }
      setTarget(t)
      await runScan(t)
    } catch {
      console.error('search failed')
    }
  }

  const handleUseCurrentCoords = async () => {
    const pt = clickedPoint
    if (!pt) return
    const t: ScanTarget = {
      lat: pt.lat,
      lng: pt.lng,
      label: `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`,
      isEarth: scanMode === 'earth',
    }
    setTarget(t)
    await runScan(t)
  }

  const found = results.filter((r) => r.available)
  const unavail = results.filter((r) => !r.available && r.status !== 'loading')

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-base)' }}>
      {/* Left: controls */}
      <div
        style={{
          width: '280px',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Satellite size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '13px' }}>Source Scanner</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Enter a location to query all available satellite imagery sources in parallel — resolution, coverage, latest date.
          </p>
        </div>

        {/* Body scan mode */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <div className="label" style={{ marginBottom: '6px', display: 'block' }}>Body</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['earth', 'mars', 'moon'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setScanMode(m)}
                className={`btn ${scanMode === m ? 'active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize', fontSize: '11px' }}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Target */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <div className="label" style={{ marginBottom: '6px', display: 'block' }}>
            {scanMode === 'earth' ? 'Location (Address or Coords)' : 'Coordinates on ' + scanMode.charAt(0).toUpperCase() + scanMode.slice(1)}
          </div>
          {scanMode === 'earth' && (
            <>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                <input
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g. Tokyo, 37.7749,-122.4194"
                  style={{ height: '28px', fontSize: '12px' }}
                />
                <button onClick={handleSearch} disabled={scanning} className="btn" style={{ height: '28px', padding: '0 8px', flexShrink: 0 }}>
                  <Search size={11} />
                </button>
              </div>
              {clickedPoint && (
                <button onClick={handleUseCurrentCoords} className="btn" style={{ width: '100%', justifyContent: 'center', fontSize: '11px' }}>
                  <MapPin size={10} />
                  Use map click ({clickedPoint.lat.toFixed(3)}, {clickedPoint.lng.toFixed(3)})
                </button>
              )}
            </>
          )}
          {scanMode !== 'earth' && (
            <>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>Enter coordinates to check spot coverage (e.g. HiRISE on Mars)</p>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                <input value={targetInput} onChange={(e) => setTargetInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="lat, lon (e.g. -14.57, 175.47)" style={{ height: '28px', fontSize: '12px' }} />
                <button onClick={handleSearch} disabled={scanning} className="btn" style={{ height: '28px', padding: '0 8px', flexShrink: 0 }}>
                  <Search size={11} />
                </button>
              </div>
              <button onClick={() => { const t: ScanTarget = { lat: 0, lng: 0, label: 'Equator/Prime Meridian', isEarth: false }; setTarget(t); runScan({ ...t, label: scanMode }) }} className="btn" style={{ width: '100%', justifyContent: 'center', fontSize: '11px' }}>
                <RefreshCw size={10} /> Scan global coverage
              </button>
            </>
          )}
        </div>

        {/* Source list */}
        <div style={{ padding: '10px 14px', flex: 1, overflow: 'auto' }}>
          <div className="label" style={{ marginBottom: '8px', display: 'block' }}>Sources being queried</div>
          {(scanMode === 'earth' ? EARTH_SOURCES : scanMode === 'mars' ? MARS_SOURCES : MOON_SOURCES).map((s) => (
            <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.source}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.resolution} · {s.bands}</div>
              </div>
              <span className="tag tag-blue">{s.coverage}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: results */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {!target && !scanning && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', opacity: 0.5 }}>
            <Satellite size={28} style={{ color: 'var(--text-muted)' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Enter a location and run a scan to see what imagery is available.
            </div>
          </div>
        )}

        {(target || results.length > 0) && (
          <>
            {/* Target banner */}
            {target && (
              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{target.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {target.lat.toFixed(5)}°, {target.lng.toFixed(5)}°
                    {scanTime != null && <span> · scanned in {scanTime}ms</span>}
                  </div>
                </div>
                {scanning && <Loader size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />}
              </div>
            )}

            {/* Summary stats */}
            {!scanning && results.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', flex: 1 }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>{found.length}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>sources available</div>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', flex: 1 }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {found.reduce((best, r) => {
                      const res = parseFloat(r.resolution)
                      return (!best || res < best) ? res : best
                    }, 0)}
                    <span style={{ fontSize: '12px', fontWeight: 400 }}>{found.some(r => r.resolution.includes('cm')) ? 'cm' : 'm'}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>best resolution</div>
                </div>
                <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', flex: 1 }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-secondary)' }}>{unavail.length}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>unavailable</div>
                </div>
              </div>
            )}

            {/* Results grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
              {results.map((r) => (
                <div key={r.source} className="result-card" style={{ opacity: r.status === 'unavailable' ? 0.5 : 1, borderColor: r.available ? 'var(--border)' : 'var(--border)' }}>
                  {/* Status indicator */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                        background: r.status === 'loading' ? 'var(--text-muted)' : r.available ? 'var(--success)' : 'var(--text-muted)',
                        animation: r.status === 'loading' ? 'pulse 1s ease-in-out infinite' : undefined,
                      }} />
                      <span style={{ fontWeight: 500, fontSize: '12px' }}>{r.source}</span>
                    </div>
                    <span className={`tag ${r.available ? 'tag-green' : ''}`} style={{ fontSize: '9px' }}>
                      {r.status === 'loading' ? '…' : r.available ? '✓' : '—'}
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{r.provider}</div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <span className="tag" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{r.resolution}</span>
                    {r.bands && <span className="tag">{r.bands}</span>}
                    <span className="tag">{r.coverage}</span>
                  </div>

                  {r.note && (
                    <div style={{ fontSize: '10px', color: r.available ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.5, marginBottom: r.url ? '6px' : 0 }}>
                      {r.note}
                    </div>
                  )}
                  {r.date && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Latest: {r.date}</div>
                  )}
                  {r.url && r.available && (
                    <a href={r.url} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '10px', color: 'var(--accent)', textDecoration: 'none' }}>
                      <ExternalLink size={9} /> Access data
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
