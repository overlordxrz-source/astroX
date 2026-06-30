import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { fetchNasaApod } from '../../utils/geocoding'
import type { ApodData } from '../../types'

export default function ApodPanel() {
  const { settings } = useAppStore()
  const [apods, setApods] = useState<ApodData[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchNasaApod(settings.nasaApiKey, 5)
      .then((d) => setApods((Array.isArray(d) ? d : [d]) as ApodData[]))
      .catch(() => setError('Failed to fetch APOD.'))
      .finally(() => setLoading(false))
  }, [settings.nasaApiKey])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
      <div className="loading-bar" style={{ width: '140px' }} />
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Fetching NASA APOD…</div>
    </div>
  )

  if (error || apods.length === 0) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '12px', color: 'var(--danger)' }}>{error || 'No data'}</div>
    </div>
  )

  const current = apods[idx]

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Image */}
      <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
        {current.media_type === 'image' ? (
          <img src={current.hdurl || current.url} alt={current.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <iframe src={current.url} title={current.title} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />
        )}
        {/* Nav */}
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="btn" style={{ padding: '4px 6px' }}>
            <ChevronLeft size={12} />
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(9,9,11,0.8)', padding: '2px 8px', borderRadius: '3px', border: '1px solid var(--border)' }}>
            {idx + 1} / {apods.length}
          </span>
          <button onClick={() => setIdx((i) => Math.min(apods.length - 1, i + 1))} disabled={idx === apods.length - 1} className="btn" style={{ padding: '4px 6px' }}>
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="scrollable" style={{ width: '240px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '14px' }}>
        <div className="label" style={{ marginBottom: '8px', display: 'block' }}>Astronomy Picture of the Day</div>
        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', lineHeight: 1.4 }}>{current.title}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          {current.date}{current.copyright && ` · © ${current.copyright}`}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{current.explanation}</div>
        <a href={current.url} target="_blank" rel="noreferrer" className="btn" style={{ marginTop: '12px', justifyContent: 'center', textDecoration: 'none' }}>
          <ExternalLink size={10} /> Full resolution
        </a>
      </div>
    </div>
  )
}
