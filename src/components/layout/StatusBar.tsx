import { useAppStore } from '../../stores/appStore'

export default function StatusBar() {
  const { mode, hoveredCoords, mapZoom, clickedPoint } = useAppStore()
  const coords = hoveredCoords ?? clickedPoint
  const lat = coords?.lat
  const lng = coords?.lng
  const latStr = lat != null ? `${lat >= 0 ? '' : '-'}${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}` : null
  const lngStr = lng != null ? `${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}` : null

  return (
    <footer className="status-bar" style={{ justifyContent: 'space-between' }}>
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div className="animate-pulse-dot" style={{ width: '4px', height: '4px', background: 'var(--accent)', borderRadius: '50%' }} />
          <span style={{ color: 'var(--accent)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em' }}>LIVE</span>
        </div>
        <span style={{ color: 'var(--text-muted)' }}>MODE/<span style={{ color: 'var(--text-secondary)' }}>{mode.toUpperCase()}</span></span>
        <span>Z<span style={{ color: 'var(--text-secondary)' }}>{mapZoom}</span></span>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {latStr && lngStr ? (
          <span style={{ color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>
            {latStr}&ensp;{lngStr}
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>— hover map —</span>
        )}
        <span style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border)', paddingLeft: '12px', fontSize: '9px', letterSpacing: '0.08em' }}>
          ASTROX v2
        </span>
      </div>
    </footer>
  )
}
