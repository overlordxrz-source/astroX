import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { PLANET_CONFIGS } from '../../config/tileLayers'
import PlanetMap from '../map/PlanetMap'
import ApodPanel from './ApodPanel'

export default function PlanetsViewer() {
  const { selectedPlanet, setSelectedPlanet } = useAppStore()
  const [tab, setTab] = useState<'map' | 'apod'>('map')

  const config = PLANET_CONFIGS.find((p) => p.id === selectedPlanet)
  const [activeLayerId, setActiveLayerId] = useState<string>(config?.layers[0]?.id ?? '')

  // When planet changes, reset layer to the first available
  const handleSelectPlanet = (id: string) => {
    setSelectedPlanet(id)
    const c = PLANET_CONFIGS.find((p) => p.id === id)
    setActiveLayerId(c?.layers[0]?.id ?? '')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      {/* Tab bar */}
      <div style={{ padding: '0 12px', height: '38px', display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        {PLANET_CONFIGS.map((p) => (
          <button
            key={p.id}
            onClick={() => handleSelectPlanet(p.id)}
            className={`btn btn-ghost ${selectedPlanet === p.id ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '3px 9px' }}
          >
            {p.name}
          </button>
        ))}
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => setTab('map')} className={`btn btn-ghost ${tab === 'map' ? 'active' : ''}`} style={{ fontSize: '11px', padding: '3px 9px' }}>Map</button>
        <button onClick={() => setTab('apod')} className={`btn btn-ghost ${tab === 'apod' ? 'active' : ''}`} style={{ fontSize: '11px', padding: '3px 9px' }}>APOD</button>

        {config && tab === 'map' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className="tag tag-blue">{config.layers.find(l => l.id === activeLayerId)?.resolution ?? config.layers[0]?.resolution}</span>
            <span className="tag">{config.distance}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {tab === 'map' && config && (
          <>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <PlanetMap body={selectedPlanet} layerId={activeLayerId} />
            </div>
            {/* Layer switcher sidebar */}
            <div style={{ width: '190px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
                <span className="label">Layers</span>
              </div>
              <div style={{ padding: '8px', flex: 1 }}>
                {config.layers.map((l) => {
                  const active = activeLayerId === l.id
                  return (
                    <div
                      key={l.id}
                      className={`layer-item ${active ? 'active' : ''}`}
                      onClick={() => setActiveLayerId(l.id)}
                      style={{ marginBottom: '2px' }}
                    >
                      <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-md)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                        {active && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: active ? 500 : 400, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{l.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{l.resolution}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {selectedPlanet === 'mercury' && <>Source: MESSENGER (2004–2015)<br />Best res: 5m (targeted)</> }
                {selectedPlanet === 'venus' && <>Source: Magellan (1990–1994)<br />SAR radar penetrates clouds</>}
              </div>
            </div>
          </>
        )}
        {tab === 'apod' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <ApodPanel />
          </div>
        )}
      </div>
    </div>
  )
}
