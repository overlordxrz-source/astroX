import { useState, useEffect } from 'react'
import { Settings, Crosshair } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type { ViewMode } from '../../types'

const MODES: { id: ViewMode; label: string; dot?: string }[] = [
  { id: 'earth',     label: 'EARTH',     dot: '#0dcc88' },
  { id: 'moon',      label: 'MOON',      dot: '#7a93a8' },
  { id: 'mars',      label: 'MARS',      dot: '#e8722a' },
  { id: 'planets',   label: 'PLANETS',   dot: '#3b9eff' },
  { id: 'deepspace', label: 'DEEP SPACE', dot: '#9b7aff' },
  { id: 'scanner',   label: 'SCANNER',   dot: '#f0b429' },
]

function Clock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
      {t.getUTCFullYear()}-{pad(t.getUTCMonth()+1)}-{pad(t.getUTCDate())}
      {' '}
      <span style={{ color: 'var(--text-secondary)' }}>
        {pad(t.getUTCHours())}:{pad(t.getUTCMinutes())}:{pad(t.getUTCSeconds())}
      </span>
      {' '}UTC
    </span>
  )
}

export default function Header() {
  const { mode, setMode, setSettingsOpen } = useAppStore()
  return (
    <header className="app-header" style={{ padding: '0', justifyContent: 'space-between' }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexShrink: 0, padding: '0 14px', borderRight: '1px solid var(--border)', height: '100%' }}>
        <Crosshair size={13} style={{ color: 'var(--accent)', marginRight: '7px' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.12em' }}>
          ASTROX
        </span>
        <span style={{ marginLeft: '8px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          v2
        </span>
      </div>

      {/* Mode tabs — centred */}
      <nav style={{ display: 'flex', gap: '1px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        {MODES.map((m) => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id as ViewMode)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '0 11px',
                height: '40px',
                background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? m.dot ?? 'var(--accent)' : 'transparent'}`,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.12s',
                white_space: 'nowrap',
              } as React.CSSProperties}
            >
              <span
                style={{
                  width: '5px', height: '5px',
                  borderRadius: '50%',
                  background: active ? m.dot ?? 'var(--accent)' : 'var(--text-muted)',
                  opacity: active ? 1 : 0.4,
                  flexShrink: 0,
                  boxShadow: active ? `0 0 6px ${m.dot ?? 'var(--accent)'}` : 'none',
                }}
              />
              {m.label}
            </button>
          )
        })}
      </nav>

      {/* Right: clock + settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, padding: '0 12px', height: '100%', borderLeft: '1px solid var(--border)' }}>
        <Clock />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '3px' }}
          title="Settings"
        >
          <Settings size={13} />
        </button>
      </div>

    </header>
  )
}
