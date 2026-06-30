import { useState, useEffect, useRef } from 'react'
import { Search, Star, Telescope } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { DEEP_SPACE_SOURCES, FAMOUS_TARGETS } from '../../config/tileLayers'

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

      {/* Aladin viewer */}
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
      </div>
    </div>
  )
}
