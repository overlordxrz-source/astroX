import { useRef, forwardRef, useImperativeHandle } from 'react'
import L from 'leaflet'
import EarthMap from './EarthMap'

export interface EarthViewerRef {
  flyTo: (lat: number, lng: number, name?: string) => void
}

const EarthViewer = forwardRef<EarthViewerRef>((_, ref) => {
  const mapInstanceRef = useRef<L.Map | null>(null)

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number) => {
      // Find the Leaflet map instance by querying DOM
      const el = document.querySelector('.leaflet-container') as HTMLElement & { _leaflet_id?: number }
      if (el) {
        const mapId = el._leaflet_id
        if (mapId != null) {
          // @ts-ignore
          const map = L.map._maps?.[mapId] || mapInstanceRef.current
          map?.flyTo([lat, lng], 14, { animate: true, duration: 1.5 })
        }
      }
    },
  }))

  return <EarthMap />
})

EarthViewer.displayName = 'EarthViewer'
export default EarthViewer
