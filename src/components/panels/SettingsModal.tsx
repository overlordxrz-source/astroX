import { X, Key } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

export default function SettingsModal() {
  const { settings, updateSettings, setSettingsOpen } = useAppStore()

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          width: '400px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-md)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Settings</span>
          <button onClick={() => setSettingsOpen(false)} className="btn btn-ghost" style={{ padding: '3px' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* NASA API Key */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
              <Key size={11} style={{ color: 'var(--text-muted)' }} />
              <span className="label">NASA API Key</span>
            </div>
            <input
              value={settings.nasaApiKey}
              onChange={(e) => updateSettings({ nasaApiKey: e.target.value })}
              placeholder="Get free key at api.nasa.gov"
              style={{ height: '30px', fontSize: '12px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Used for APOD and near-real-time layers. Free at{' '}
              <a href="https://api.nasa.gov" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>api.nasa.gov</a>
            </p>
          </div>

          {/* Planet API Key */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
              <Key size={11} style={{ color: 'var(--text-muted)' }} />
              <span className="label">Planet API Key</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>optional</span>
            </div>
            <input
              value={settings.planetApiKey}
              onChange={(e) => updateSettings({ planetApiKey: e.target.value })}
              placeholder="Paste Planet NICFI key here"
              style={{ height: '30px', fontSize: '12px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Unlocks 4.77m Planet NICFI tropical imagery. Free sign-up at{' '}
              <a href="https://www.planet.com/nicfi/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>planet.com/nicfi</a>
            </p>
          </div>

          {/* Display options */}
          <div>
            <div className="label" style={{ marginBottom: '8px', display: 'block' }}>Display</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {([
                { key: 'showCoords' as const, label: 'Show coordinates in status bar' },
              ]).map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <div
                    onClick={() => updateSettings({ [key]: !settings[key] })}
                    style={{
                      width: '16px', height: '16px', borderRadius: '3px',
                      border: `1px solid ${settings[key] ? 'var(--accent)' : 'var(--border-md)'}`,
                      background: settings[key] ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {settings[key] && <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1 4l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={() => setSettingsOpen(false)}
            className="btn btn-primary"
            style={{ justifyContent: 'center' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
