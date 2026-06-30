import { useAppStore } from './stores/appStore'
import Header from './components/layout/Header'
import StatusBar from './components/layout/StatusBar'
import Sidebar from './components/layout/Sidebar'
import InfoPanel from './components/panels/InfoPanel'
import EarthMap from './components/map/EarthMap'
import MarsEarthMap from './components/map/MarsEarthMap'
import MoonViewer from './components/map/MoonViewer'
import PlanetsViewer from './components/panels/PlanetsViewer'
import DeepSpaceViewer from './components/panels/DeepSpaceViewer'
import SourceScanner from './components/panels/SourceScanner'
import SettingsModal from './components/panels/SettingsModal'
import { mapController } from './utils/mapController'

export default function App() {
  const { mode, settingsOpen } = useAppStore()

  const handleFlyTo = (lat: number, lng: number) => {
    mapController.flyTo(lat, lng, 14)
  }

  const showInfoPanel = ['earth', 'moon', 'mars', 'planets'].includes(mode)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      <Header />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar onFlyTo={handleFlyTo} />

        <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {mode === 'earth' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <EarthMap />
            </div>
          )}
          {mode === 'moon' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <MoonViewer />
            </div>
          )}
          {mode === 'mars' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <MarsEarthMap />
            </div>
          )}
          {mode === 'planets' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <PlanetsViewer />
            </div>
          )}
          {mode === 'deepspace' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <DeepSpaceViewer />
            </div>
          )}
          {mode === 'scanner' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <SourceScanner />
            </div>
          )}
        </main>

        {showInfoPanel && <InfoPanel />}
      </div>

      <StatusBar />
      {settingsOpen && <SettingsModal />}
    </div>
  )
}
