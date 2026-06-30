import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { MOON_LAYERS } from '../../config/tileLayers'
import PlanetMap from './PlanetMap'

export default function MoonViewer() {
  const allLayers = MOON_LAYERS.flatMap((g) => g.layers)
  const [activeLayer, setActiveLayer] = useState(allLayers[0]?.id || 'moon_wac_mosaic')

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <PlanetMap body="moon" layerId={activeLayer} />
      </div>

      <div style={{ width: '200px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)' }}>
          <span className="label">LROC Layers</span>
        </div>

        <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
          {allLayers.map((l) => {
            const active = activeLayer === l.id
            return (
              <div
                key={l.id}
                className={`layer-item ${active ? 'active' : ''}`}
                onClick={() => setActiveLayer(l.id)}
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

        <div style={{ padding: '10px 12px', flex: 1 }}>
          <div className="label" style={{ display: 'block', marginBottom: '8px' }}>Best Available</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {[['LROC NAC', '0.5m/px'], ['LROC WAC', '100m/px'], ['Kaguya TC', '10m/px'], ['Chang\'e 2', '7m/px'], ['LOLA DEM', '236m elevation']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div className="label" style={{ display: 'block', marginBottom: '4px' }}>Sources</div>
          {[
            { label: 'LROC QuickMap (NAC 0.5m)', url: 'https://quickmap.lroc.im-ldi.com' },
            { label: 'NASA Moon Trek', url: 'https://trek.nasa.gov/moon/' },
            { label: 'USGS STAC (Kaguya)', url: 'https://stac.astrogeology.usgs.gov' },
          ].map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
              <ExternalLink size={9} /> {s.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
