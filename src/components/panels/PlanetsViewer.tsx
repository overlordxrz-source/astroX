import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { PLANET_CONFIGS } from '../../config/tileLayers'
import PlanetMap from '../map/PlanetMap'
import ApodPanel from './ApodPanel'

export default function PlanetsViewer() {
  const { selectedPlanet, setSelectedPlanet } = useAppStore()
  const [tab, setTab] = useState<'map' | 'apod'>('map')

  const config = PLANET_CONFIGS.find((p) => p.id === selectedPlanet)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      {/* Tab bar */}
      <div style={{ padding: '0 12px', height: '38px', display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        {PLANET_CONFIGS.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedPlanet(p.id)}
            className={`btn btn-ghost ${selectedPlanet === p.id ? 'active' : ''}`}
            style={{ fontSize: '11px', padding: '3px 9px' }}
          >
            {p.name}
          </button>
        ))}
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => setTab('map')} className={`btn btn-ghost ${tab === 'map' ? 'active' : ''}`} style={{ fontSize: '11px', padding: '3px 9px' }}>Map</button>
        <button onClick={() => setTab('apod')} className={`btn btn-ghost ${tab === 'apod' ? 'active' : ''}`} style={{ fontSize: '11px', padding: '3px 9px' }}>APOD</button>

        {config && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <span className="tag tag-blue">{config.layer.resolution}</span>
            <span className="tag">{config.distance}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tab === 'map' && config && <PlanetMap body={selectedPlanet} />}
        {tab === 'apod' && <ApodPanel />}
      </div>
    </div>
  )
}
