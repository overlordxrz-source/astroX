import type L from 'leaflet'

let mapInstance: L.Map | null = null

export const mapController = {
  register(map: L.Map) {
    mapInstance = map
  },
  unregister() {
    mapInstance = null
  },
  flyTo(lat: number, lng: number, zoom = 14) {
    mapInstance?.flyTo([lat, lng], zoom, { animate: true, duration: 1.5 })
  },
  getMap() {
    return mapInstance
  },
}
