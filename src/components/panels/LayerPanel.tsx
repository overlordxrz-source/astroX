import { useAppStore } from '../../stores/appStore'
import { EARTH_LAYERS, MOON_LAYERS, MARS_LAYERS, PLANET_CONFIGS } from '../../config/tileLayers'

const CLASS_TAG: Record<string, string> = {
  OPEN: 'tag-green',
  FREE: 'tag-blue',
  RESTRICTED: 'tag-amber',
}

export default function LayerPanel() {
  const { mode, selectedEarthLayers, toggleEarthLayer, selectedPlanet, setSelectedPlanet, settings } = useAppStore()

  if (mode === 'earth') {
    return (
      <div className="scrollable flex-1" style={{ padding: '6px 8px' }}>
        {EARTH_LAYERS.map((group) => (
          <div key={group.id} style={{ marginBottom: '14px' }}>
            <div className="label" style={{ padding: '4px 2px 6px', display: 'block' }}>
              {group.label.replace('── ', '')}
            </div>
            {group.layers.map((layer) => {
              const active = selectedEarthLayers.includes(layer.id)
              return (
                <div
                  key={layer.id}
                  className={`layer-item ${active ? 'active' : ''}`}
                  onClick={() => toggleEarthLayer(layer.id)}
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '3px',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-md)'}`,
                      background: active ? 'var(--accent)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '1px',
                    }}
                  >
                    {active && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400 }}>
                      {layer.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {layer.resolution} · {layer.updateFrequency}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                    <span className={`tag ${CLASS_TAG[layer.classification]}`}>
                      {layer.classification}
                    </span>
                    {layer.requiresKey && layer.keyName === 'planetApiKey' && !settings.planetApiKey && (
                      <a
                        href={layer.signupUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '9px', color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        get key →
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  if (mode === 'moon') {
    return (
      <div className="scrollable flex-1" style={{ padding: '6px 8px' }}>
        <div className="label" style={{ padding: '4px 2px 6px', display: 'block' }}>LROC / LRO</div>
        {MOON_LAYERS.flatMap((g) => g.layers).map((layer) => (
          <div key={layer.id} className="layer-item active">
            <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: '1px solid var(--accent)', background: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{layer.name}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{layer.resolution}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (mode === 'mars') {
    return (
      <div className="scrollable flex-1" style={{ padding: '6px 8px' }}>
        {MARS_LAYERS.map((group) => (
          <div key={group.id} style={{ marginBottom: '14px' }}>
            <div className="label" style={{ padding: '4px 2px 6px', display: 'block' }}>
              {group.label.replace('── ', '')}
            </div>
            {group.layers.map((layer) => (
              <div key={layer.id} className="layer-item active">
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: '1px solid #ea580c', background: '#ea580c', flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{layer.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{layer.resolution}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (mode === 'planets') {
    return (
      <div className="scrollable flex-1" style={{ padding: '6px 8px' }}>
        <div className="label" style={{ padding: '4px 2px 6px', display: 'block' }}>SELECT BODY</div>
        {PLANET_CONFIGS.map((planet) => {
          const active = selectedPlanet === planet.id
          return (
            <div
              key={planet.id}
              className={`layer-item ${active ? 'active' : ''}`}
              onClick={() => setSelectedPlanet(planet.id)}
            >
              <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-md)'}`, background: active ? 'var(--accent)' : 'transparent', flexShrink: 0, marginTop: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <div>
                <div style={{ fontSize: '12px', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400 }}>{planet.name}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{planet.distance} · {planet.layers[0]?.resolution}</div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>No layers in this mode.</div>
}
