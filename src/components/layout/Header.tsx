import { useState, useEffect } from 'react'
import { ScanLine, Settings, Menu, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type { ViewMode } from '../../types'

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'earth',     label: 'Earth' },
  { id: 'moon',      label: 'Moon' },
  { id: 'mars',      label: 'Mars' },
  { id: 'planets',   label: 'Planets' },
  { id: 'deepspace', label: 'Deep Space' },
  { id: 'scanner',   label: 'Scanner' },
]

function Clock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="mono-sm" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
      {t.toUTCString().slice(5, 25)} UTC
    </span>
  )
}

export default function Header() {
  const { mode, setMode, sidebarOpen, setSidebarOpen, setSettingsOpen } = useAppStore()

  return (
    <header
      style={{
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: '12px',
      }}
    >
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="btn btn-ghost"
          style={{ padding: '4px', borderRadius: '4px' }}
        >
          {sidebarOpen ? <X size={14} /> : <Menu size={14} />}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ScanLine size={15} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: '13px', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
            AstroX
          </span>
        </div>
        <span style={{ width: '1px', height: '14px', background: 'var(--border)', display: 'inline-block' }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Orbital Intelligence</span>
      </div>

      {/* Center: tabs */}
      <nav style={{ display: 'flex', gap: '2px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id as ViewMode)}
            className="btn btn-ghost"
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              color: mode === m.id ? 'var(--text-primary)' : 'var(--text-muted)',
              background: mode === m.id ? 'var(--bg-active)' : 'transparent',
              borderColor: mode === m.id ? 'var(--border)' : 'transparent',
              borderRadius: '4px',
            }}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <Clock />
        <button
          onClick={() => setSettingsOpen(true)}
          className="btn btn-ghost"
          style={{ padding: '4px' }}
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  )
}
