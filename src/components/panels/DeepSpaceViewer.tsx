import { useState, useEffect, useRef } from 'react'
import { Search, Star, Telescope, Loader, ExternalLink, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { DEEP_SPACE_SOURCES, FAMOUS_TARGETS } from '../../config/tileLayers'

interface JwstObs {
  obs_id: string
  target_name: string
  instrument_name: string
  filters: string
  t_exptime: number
  t_obs_release: string
  calib_level: number
  ra: number
  dec: number
}

async function queryMastJwst(ra: number, dec: number, radius = 0.3): Promise<JwstObs[]> {
  try {
    const params = new URLSearchParams({
      request: 'Mast.Caom.Filtered',
      params: JSON.stringify({
        columns: 'obs_id,target_name,instrument_name,filters,t_exptime,t_obs_release,calib_level,s_ra,s_dec',
        filters: [
          { paramName: 'obs_collection', values: ['JWST'] },
          { paramName: 'calib_level', values: ['2', '3'] },
        ],
        position: `${ra} ${dec} ${radius}`,
      }),
      format: 'json',
      pagesize: '10',
      page: '1',
    })
    const res = await fetch('https://mast.stsci.edu/api/v0.1/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.fields || !data.data) return []
    const fields: string[] = data.fields.map((f: { name: string }) => f.name)
    const rows = (data.data as unknown[][]).map(row =>
      Object.fromEntries(fields.map((f, i) => [f, row[i]]))
    )
    return rows.map(r => ({
      obs_id: String(r['obs_id'] ?? ''),
      target_name: String(r['target_name'] ?? 'Unknown'),
      instrument_name: String(r['instrument_name'] ?? ''),
      filters: String(r['filters'] ?? ''),
      t_exptime: Number(r['t_exptime'] ?? 0),
      t_obs_release: String(r['t_obs_release'] ?? ''),
      calib_level: Number(r['calib_level'] ?? 0),
      ra: Number(r['s_ra'] ?? ra),
      dec: Number(r['s_dec'] ?? dec),
    }))
  } catch {
    return []
  }
}

declare global {
  interface Window {
    A: {
      aladin: (selector: string, options: Record<string, unknown>) => AladinInstance
    }
  }
}
interface AladinInstance {
  gotoObject: (name: string) => void
  gotoRaDec: (ra: number, dec: number) => void
  setImageSurvey: (survey: string) => void
  setFov: (fov: number) => void
  getRa: () => number
  getDec: () => number
}

export default function DeepSpaceViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const aladinRef = useRef<AladinInstance | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadingAladin, setLoadingAladin] = useState(true)
  const [targetInput, setTargetInput] = useState('')
  const [currentTarget, setCurrentTarget] = useState('Orion Nebula')
  const [jwstResults, setJwstResults] = useState<JwstObs[]>([])
  const [jwstLoading, setJwstLoading] = useState(false)
  const [jwstPanelOpen, setJwstPanelOpen] = useState(false)

  const { deepSpaceSurvey, setDeepSpaceSurvey } = useAppStore()

  const initAladin = () => {
    if (!containerRef.current || aladinRef.current) return
    try {
      const aladin = window.A.aladin('#aladin-lite-div', {
        survey: deepSpaceSurvey,
        fov: 2,
        target: 'M42',
        cooFrame: 'equatorial',
        showReticle: true,
        showZoomControl: false,
        showFullscreenControl: false,
        showLayersControl: false,
        showGotoControl: false,
        showShareControl: false,
        backgroundColor: '#09090b',
        showCatalog: false,
        showProjectionControl: false,
      })
      aladinRef.current = aladin
      setLoaded(true)
      setLoadingAladin(false)
    } catch {
      setLoadingAladin(false)
    }
  }

  useEffect(() => {
    if (window.A && typeof window.A.aladin === 'function') {
      initAladin()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://aladin.u-strasbg.fr/AladinLite/api/v3/latest/aladin.js'
    script.type = 'text/javascript'
    script.charset = 'utf-8'
    script.onload = () => setTimeout(initAladin, 500)
    script.onerror = () => setLoadingAladin(false)
    document.head.appendChild(script)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const goToTarget = () => {
    const t = targetInput.trim() || currentTarget
    if (!aladinRef.current) return
    try { aladinRef.current.gotoObject(t) } catch { /* name resolve may fail */ }
    setCurrentTarget(t)
    setTargetInput('')
  }

  const searchJwst = async () => {
    if (!aladinRef.current) return
    setJwstLoading(true); setJwstResults([])
    const ra = aladinRef.current.getRa()
    const dec = aladinRef.current.getDec()
    const results = await queryMastJwst(ra, dec)
    setJwstResults(results); setJwstLoading(false)
    setJwstPanelOpen(true)
  }

  const changeSurvey = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    e?.preventDefault()
    setDeepSpaceSurvey(id)
    try {
      aladinRef.current?.setImageSurvey(id)
    } catch {
      // survey switch failed, will retry on next render
    }
  }

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
      {/* Sidebar */}
      <div style={{
        width: '220px', flexShrink: 0,
        background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Target search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '7px' }}>
            <Telescope size={11} style={{ color: 'var(--text-muted)' }} />
            <span className="label">Target</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && goToTarget()}
              placeholder="M31, NGC 1300, Eta Car…"
              style={{ height: '28px', fontSize: '12px' }}
            />
            <button type="button" onClick={goToTarget} className="btn" style={{ height: '28px', padding: '0 7px', flexShrink: 0 }}>
              <Search size={11} />
            </button>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '5px' }}>
            Current: <span style={{ color: 'var(--text-secondary)' }}>{currentTarget}</span>
          </div>
        </div>

        {/* Surveys */}
        <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', flex: 1, overflow: 'auto' }}>
          <div className="label" style={{ display: 'block', padding: '2px 2px 6px' }}>Sky Surveys</div>
          {DEEP_SPACE_SOURCES.map((s) => {
            const active = deepSpaceSurvey === s.id
            return (
              <div
                key={s.id}
                className={`layer-item ${active ? 'active' : ''}`}
                onClick={(e) => changeSurvey(s.id, e)}
              >
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-md)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400 }}>{s.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.telescope} · {s.resolution}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* JWST MAST search */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
            <Telescope size={10} style={{ color: '#9b7aff' }} />
            <span className="label" style={{ color: '#9b7aff' }}>JWST Observations</span>
          </div>
          <button type="button" onClick={searchJwst} disabled={!loaded || jwstLoading}
            className="btn"
            style={{ width: '100%', justifyContent: 'center', fontSize: '10px', borderColor: 'rgba(155,122,255,0.3)', color: jwstLoading ? 'var(--text-muted)' : '#9b7aff', background: 'rgba(155,122,255,0.06)' }}>
            {jwstLoading ? <><Loader size={10} className="animate-spin" /> Querying MAST…</> : <><Search size={10} /> Find JWST at Current View</>}
          </button>
          {jwstResults.length > 0 && !jwstLoading && (
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
              {jwstResults.length} observation{jwstResults.length > 1 ? 's' : ''} found
            </div>
          )}
        </div>

        {/* Famous targets */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
            <Star size={10} style={{ color: 'var(--text-muted)' }} />
            <span className="label">Famous Objects</span>
          </div>
          <div style={{ maxHeight: '160px', overflow: 'auto' }}>
            {FAMOUS_TARGETS.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={(e) => {
                  e.stopPropagation()
                  try {
                    aladinRef.current?.gotoRaDec(t.ra, t.dec)
                    aladinRef.current?.setFov(1.5)
                  } catch { /* ignore */ }
                  setCurrentTarget(t.name)
                }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '3px 0', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Aladin viewer + JWST overlay panel */}
      <div style={{ flex: 1, position: 'relative', background: '#000' }}>
        {loadingAladin && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'var(--bg-base)' }}>
            <Telescope size={24} style={{ color: 'var(--text-muted)' }} />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading sky atlas…</div>
            <div className="loading-bar" style={{ width: '160px' }} />
          </div>
        )}
        <div id="aladin-lite-div" ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {loaded && (
          <div style={{ position: 'absolute', top: 10, left: 10, pointerEvents: 'none', zIndex: 10, background: 'rgba(9,9,11,0.8)', border: '1px solid var(--border)', borderRadius: '4px', padding: '5px 8px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Survey</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {DEEP_SPACE_SOURCES.find((s) => s.id === deepSpaceSurvey)?.name}
            </div>
          </div>
        )}

        {/* JWST results floating panel */}
        {jwstPanelOpen && (
          <div style={{
            position: 'absolute', right: '10px', top: '10px', bottom: '10px',
            width: '260px', zIndex: 200,
            background: 'rgba(9,9,11,0.92)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(155,122,255,0.2)', borderRadius: '8px',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(155,122,255,0.15)', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <Telescope size={11} style={{ color: '#9b7aff' }} />
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#9b7aff', letterSpacing: '0.08em', flex: 1 }}>JWST · MAST</span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{jwstResults.length} obs</span>
              <button type="button" onClick={() => setJwstPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}><X size={11} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {jwstResults.length === 0 ? (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 8px' }}>
                  No JWST observations found at this location.<br/><br/>
                  Try a famous target like M42, SMACS 0723, or Carina Nebula.
                </div>
              ) : jwstResults.map(obs => (
                <div key={obs.obs_id} style={{ marginBottom: '8px', padding: '8px 10px', background: 'rgba(155,122,255,0.05)', border: '1px solid rgba(155,122,255,0.12)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#d4e0eb', fontWeight: 600, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {obs.target_name}
                  </div>
                  <div style={{ fontSize: '9px', color: '#9b7aff', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                    {obs.instrument_name}{obs.filters ? ` · ${obs.filters}` : ''}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-muted)', marginBottom: '5px' }}>
                    <span>{obs.t_exptime > 0 ? `${obs.t_exptime.toFixed(0)}s` : '—'}</span>
                    <span>L{obs.calib_level}</span>
                    <span>{obs.t_obs_release ? new Date(obs.t_obs_release).toLocaleDateString('en-US', { year: '2-digit', month: 'short' }) : '—'}</span>
                  </div>
                  <a
                    href={`https://mast.stsci.edu/portal/Mashup/Clients/Mast/Portal.html?searchQuery=${encodeURIComponent(JSON.stringify({ service: 'Mast.Caom.Filtered', params: { filters: [{ paramName: 'obs_id', values: [obs.obs_id] }] } }))}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '8px', color: '#9b7aff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', opacity: 0.8 }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
                  >
                    <ExternalLink size={8} /> View on MAST
                  </a>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(155,122,255,0.12)', flexShrink: 0, fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Data: STScI MAST Portal · Radius 0.3°
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
