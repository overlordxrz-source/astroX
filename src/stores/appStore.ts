import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ViewMode, GeoPoint, AppSettings, AgentMessage } from '../types'

/** A rendered COG overview saved across tab switches (session-only, not in localStorage) */
export interface SavedMapOverlay {
  id: string
  label: string
  /** base64 PNG rendered from the COG overview */
  dataUrl: string
  bbox: [number, number, number, number]
  intrinsicBounds: [number, number, number, number] | null
  visible: boolean
  body: 'earth' | 'moon' | 'mars'
}

interface AppState {
  mode: ViewMode
  selectedEarthLayers: string[]
  selectedPlanetLayer: string
  selectedPlanet: string
  deepSpaceSurvey: string
  deepSpaceTarget: string
  mapCenter: [number, number]
  mapZoom: number
  hoveredCoords: { lat: number; lng: number } | null
  clickedPoint: GeoPoint | null
  settings: AppSettings
  agentMessages: AgentMessage[]
  agentLoading: boolean
  sidebarOpen: boolean
  infoPanelOpen: boolean
  settingsOpen: boolean
  /** Rendered overlays — kept in RAM across tab switches, never persisted to disk */
  mapOverlays: SavedMapOverlay[]

  setMode: (mode: ViewMode) => void
  setSelectedEarthLayers: (layers: string[]) => void
  toggleEarthLayer: (layerId: string) => void
  setSelectedPlanetLayer: (layerId: string) => void
  setSelectedPlanet: (planet: string) => void
  setDeepSpaceSurvey: (survey: string) => void
  setDeepSpaceTarget: (target: string) => void
  setMapCenter: (center: [number, number]) => void
  setMapZoom: (zoom: number) => void
  setHoveredCoords: (coords: { lat: number; lng: number } | null) => void
  setClickedPoint: (point: GeoPoint | null) => void
  updateSettings: (settings: Partial<AppSettings>) => void
  addAgentMessage: (msg: AgentMessage) => void
  setAgentLoading: (loading: boolean) => void
  clearAgentMessages: () => void
  setSidebarOpen: (open: boolean) => void
  setInfoPanelOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  saveMapOverlay: (o: SavedMapOverlay) => void
  deleteMapOverlay: (id: string) => void
  setMapOverlayVisible: (id: string, visible: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mode: 'earth',
      selectedEarthLayers: ['esri_world'],
      selectedPlanetLayer: 'moon_wac_mosaic',
      selectedPlanet: 'moon',
      deepSpaceSurvey: 'P/DSS2/color',
      deepSpaceTarget: 'M42',
      mapCenter: [20, 0],
      mapZoom: 3,
      hoveredCoords: null,
      clickedPoint: null,
      settings: {
        nasaApiKey: 'yK0PGO70gLui46WUxprrhbggWv6ixX21hjB7gbvD',
        anthropicApiKey: '',
        planetApiKey: '',
        showScanlines: false,
        showGrid: false,
        showCoords: true,
        showClassification: false,
      },
      agentMessages: [],
      agentLoading: false,
      sidebarOpen: true,
      infoPanelOpen: true,
      settingsOpen: false,
      mapOverlays: [],

      setMode: (mode) => set({ mode }),
      setSelectedEarthLayers: (layers) => set({ selectedEarthLayers: layers }),
      toggleEarthLayer: (layerId) =>
        set((state) => ({
          selectedEarthLayers: state.selectedEarthLayers.includes(layerId)
            ? state.selectedEarthLayers.filter((id) => id !== layerId)
            : [...state.selectedEarthLayers, layerId],
        })),
      setSelectedPlanetLayer: (layerId) => set({ selectedPlanetLayer: layerId }),
      setSelectedPlanet: (planet) => set({ selectedPlanet: planet }),
      setDeepSpaceSurvey: (survey) => set({ deepSpaceSurvey: survey }),
      setDeepSpaceTarget: (target) => set({ deepSpaceTarget: target }),
      setMapCenter: (center) => set({ mapCenter: center }),
      setMapZoom: (zoom) => set({ mapZoom: zoom }),
      setHoveredCoords: (coords) => set({ hoveredCoords: coords }),
      setClickedPoint: (point) => set({ clickedPoint: point }),
      updateSettings: (newSettings) =>
        set((state) => ({ settings: { ...state.settings, ...newSettings } })),
      addAgentMessage: (msg) =>
        set((state) => ({ agentMessages: [...state.agentMessages, msg] })),
      setAgentLoading: (loading) => set({ agentLoading: loading }),
      clearAgentMessages: () => set({ agentMessages: [] }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setInfoPanelOpen: (open) => set({ infoPanelOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      saveMapOverlay: (o) =>
        set((s) => ({
          mapOverlays: [
            ...s.mapOverlays.filter((x) => x.id !== o.id),
            o,
          ],
        })),
      deleteMapOverlay: (id) =>
        set((s) => ({ mapOverlays: s.mapOverlays.filter((x) => x.id !== id) })),
      setMapOverlayVisible: (id, visible) =>
        set((s) => ({
          mapOverlays: s.mapOverlays.map((x) => x.id === id ? { ...x, visible } : x),
        })),
    }),
    {
      name: 'astrox-storage',
      version: 3,
      partialize: (state) => ({ settings: state.settings, mode: state.mode }),
      migrate: (persisted: unknown, _version: number) => {
        const p = persisted as Record<string, unknown>
        const validModes = ['earth', 'moon', 'mars', 'planets', 'deepspace']
        if (!validModes.includes(p.mode as string)) {
          p.mode = 'earth'
        }
        // Ensure all settings fields exist
        const defaults = { nasaApiKey: 'yK0PGO70gLui46WUxprrhbggWv6ixX21hjB7gbvD', anthropicApiKey: '', planetApiKey: '', showScanlines: false, showGrid: false, showCoords: true, showClassification: false }
        p.settings = { ...defaults, ...(p.settings as Record<string, unknown> ?? {}) }
        return p
      },
    }
  )
)
