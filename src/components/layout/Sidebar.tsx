import { Layers } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import LayerPanel from '../panels/LayerPanel'
import SearchPanel from '../panels/SearchPanel'

interface SidebarProps {
  onFlyTo?: (lat: number, lng: number, name: string) => void
}

export default function Sidebar({ onFlyTo }: SidebarProps) {
  const { mode, sidebarOpen } = useAppStore()

  if (!sidebarOpen) return null

  const showSearch = mode === 'earth'
  const showLayers = !['scanner', 'deepspace'].includes(mode)

  return (
    <aside
      className="animate-slide-in"
      style={{
        width: '220px',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Section header */}
      <div
        style={{
          padding: '9px 12px 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <Layers size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="label">Layers</span>
      </div>

      {showSearch && <SearchPanel onFlyTo={onFlyTo} />}
      {showLayers && <LayerPanel />}

      {/* Footer */}
      <div
        style={{
          marginTop: 'auto',
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          fontSize: '10px',
          color: 'var(--text-muted)',
        }}
      >
        {SOURCE_META[mode]}
      </div>
    </aside>
  )
}

const SOURCE_META: Record<string, string> = {
  earth:     '11 sources · 5 groups',
  moon:      'LROC WAC 100m · NAC 0.5m',
  mars:      'CTX 6m · HiRISE 25cm',
  planets:   'MESSENGER · Magellan',
  deepspace: '8 sky surveys',
  scanner:   'Multi-source scanner',
}
