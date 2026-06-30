import { useState } from 'react'
import { Search, MapPin } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { geocodeAddress } from '../../utils/geocoding'
import type { SearchResult } from '../../types'

interface SearchPanelProps {
  onFlyTo?: (lat: number, lng: number, name: string) => void
}

export default function SearchPanel({ onFlyTo }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { setClickedPoint } = useAppStore()

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setResults([])
    try {
      const data = await geocodeAddress(query)
      setResults(data)
      if (data.length === 0) setError('No results found.')
    } catch {
      setError('Search failed.')
    } finally {
      setLoading(false)
    }
  }

  const selectResult = (r: SearchResult) => {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    setClickedPoint({ lat, lng, name: r.display_name.split(',')[0] })
    onFlyTo?.(lat, lng, r.display_name)
    setResults([])
    setQuery(r.display_name.split(',').slice(0, 2).join(', '))
  }

  return (
    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
      <div className="label" style={{ marginBottom: '6px', display: 'block' }}>Location</div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search address or place…"
          style={{ fontSize: '12px', height: '28px' }}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="btn"
          style={{ height: '28px', padding: '0 8px', flexShrink: 0 }}
        >
          <Search size={11} />
        </button>
      </div>

      {error && (
        <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '5px' }}>{error}</div>
      )}

      {results.length > 0 && (
        <div
          className="scrollable"
          style={{
            maxHeight: '150px',
            marginTop: '5px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-overlay)',
          }}
        >
          {results.map((r) => (
            <button
              key={r.place_id}
              onClick={() => selectResult(r)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 9px',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-primary)' }}>
                <MapPin size={10} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                {r.display_name.split(',').slice(0, 2).join(', ')}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '15px' }}>
                {parseFloat(r.lat).toFixed(4)}°,{' '}{parseFloat(r.lon).toFixed(4)}°
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
