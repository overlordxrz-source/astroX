import { useAppStore } from '../../stores/appStore'

export default function StatusBar() {
  const { mode, hoveredCoords, mapZoom, clickedPoint } = useAppStore()

  const coords = hoveredCoords ?? clickedPoint
  const lat = coords?.lat
  const lng = coords?.lng

  const latStr = lat != null ? `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}` : null
  const lngStr = lng != null ? `${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}` : null

  return (
    <footer
      style={{
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        fontSize: '10px',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div className="animate-pulse-dot" style={{ width: '5px', height: '5px', background: 'var(--success)', borderRadius: '50%' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Connected</span>
        </div>
        <span>{mode.toUpperCase()}</span>
        <span>Zoom {mapZoom}</span>
      </div>

      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
        {latStr && lngStr ? (
          <span style={{ color: 'var(--text-secondary)' }}>{latStr}  {lngStr}</span>
        ) : (
          <span>Hover map for coordinates</span>
        )}
        <span>AstroX v1.0</span>
      </div>
    </footer>
  )
}
