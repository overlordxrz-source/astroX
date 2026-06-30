# AstroX — Orbital Intelligence Platform

A minimalist, CIA × NASA-aesthetic satellite imagery dashboard running entirely in your browser. View the highest-resolution freely-accessible imagery of Earth, the Moon, Mars, other planets, and deep space — from a single local app.

![AstroX](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20TypeScript-blue?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## Features

| Mode | What you get |
|---|---|
| **Earth** | ESRI/Maxar (30–60cm), USGS NAIP (60cm USA), Sentinel-2, VIIRS/MODIS real-time, Landsat, Planet NICFI (4.77m tropics, requires free key) |
| **Moon** | LROC WAC global mosaic (100m), LOLA elevation (236m), links to LROC QuickMap (0.5m NAC) |
| **Mars** | Viking MDIM color (232m), MRO CTX mosaic (6m), MOLA elevation — plus live HiRISE spot search (25cm) |
| **Planets** | Mercury (MESSENGER 166m), Venus (Magellan SAR 75m radar) with NASA Trek tiles |
| **Deep Space** | Aladin Lite sky atlas — DSS2, PanSTARRS, Hubble GOODS, 2MASS, WISE, SDSS, XMM X-ray, JWST NIRCam (Carina, SMACS 0723) |
| **Scanner** | Programmatic source scanner — enter any location and query Sentinel-2 STAC, USGS NAIP, NASA GIBS, HiRISE, LROC, JWST MAST in parallel |

---

## Architecture

```
astroX/
├── src/
│   ├── components/
│   │   ├── layout/          # Header, Sidebar, StatusBar
│   │   ├── map/             # EarthMap, PlanetMap, MoonViewer, MarsEarthMap
│   │   └── panels/          # LayerPanel, SearchPanel, InfoPanel, SourceScanner,
│   │                        #   DeepSpaceViewer, ApodPanel, PlanetsViewer, SettingsModal
│   ├── config/
│   │   └── tileLayers.ts    # All tile layer definitions (Earth, Moon, Mars, Planets, Deep Space)
│   ├── stores/
│   │   └── appStore.ts      # Zustand global state (mode, layers, coords, settings)
│   ├── types/
│   │   └── index.ts         # TypeScript interfaces
│   └── utils/
│       ├── mapController.ts # Singleton Leaflet map controller for flyTo
│       └── geocoding.ts     # Nominatim geocoding + HiRISE STAC search
├── public/
│   └── satellite.svg
├── index.html               # Fonts (Inter + JetBrains Mono) + Leaflet CSS + Aladin Lite init
└── vite.config.ts           # Tailwind v4 + React plugin
```

### Stack

- **React 19** + **TypeScript 6** — UI framework
- **Vite 8** — dev server and bundler
- **Leaflet 1.9** — interactive 2D maps (Earth, Moon, Mars, Planets)
- **Aladin Lite v3** — deep sky HiPS tile viewer (loaded at runtime from CDS)
- **Zustand 5** — global state (persisted to localStorage, versioned migrations)
- **Tailwind CSS v4** — utility styling via `@tailwindcss/vite` plugin

### Data Sources

| Source | Resolution | Access |
|---|---|---|
| ESRI World Imagery (Maxar/Nearmap) | 30–60cm urban | Free, no key |
| USGS NAIP Aerial | 60cm (USA) | Free, no key |
| Sentinel-2 L2A (AWS Element84 STAC) | 10m | Free, no key |
| NASA GIBS (VIIRS, MODIS, Landsat) | 30m–375m | Free, no key |
| Planet NICFI Tropics | 4.77m | Free after sign-up at planet.com/nicfi |
| HiRISE (Mars) | 25cm | Free via USGS STAC API |
| LROC WAC/NAC (Moon) | 100m / 0.5m | Free via NASA Trek / LROC QuickMap |
| NASA Trek (Moon, Mars, Mercury, Venus) | Varies | Free, no key |
| JWST NIRCam via MAST | 0.031″/px | Free, no key |
| Aladin Lite (DSS2, PanSTARRS, HST, WISE, SDSS, XMM, JWST HiPS) | 0.06″–6″ | Free, no key |
| NASA APOD | Image/video | Free NASA API key |

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
# → http://localhost:5173
```

Open Settings (gear icon, top right) to enter your keys:

- **NASA API key** — free at [api.nasa.gov](https://api.nasa.gov) — enables APOD
- **Planet API key** — free at [planet.com/nicfi](https://www.planet.com/nicfi) — enables 4.77m tropical imagery

No build step or backend required. Everything runs client-side.

---

## Source Scanner

The **Scanner** tab is a programmatic imagery discovery tool. Enter any location (address or lat/lng) and it queries all available imagery sources in parallel — no LLM involved:

- Sentinel-2 via AWS Element84 STAC (returns scene count + cloud cover + latest date)
- USGS NAIP AGOL identify endpoint (USA coverage check)
- NASA GIBS WMTS HEAD requests (per-tile availability)
- USGS Astrogeology STAC (HiRISE 25cm spot coverage on Mars)
- NASA ODE REST (LROC NAC spot coverage on Moon)
- MAST API (JWST total observation count)

---

## Future Goals

- [ ] **Sentinel-2 true-color tile rendering** — serve Sentinel-2 COG tiles directly via `titiler` or `rio-cogeo` (Python FastAPI sidecar)
- [ ] **Planet API integration** — authenticated tile streaming once NICFI key is in settings
- [ ] **HiRISE thumbnail previews** — render actual 25cm Mars patches inline from USGS STAC assets
- [ ] **JWST image browser** — integrate MAST cone search to browse and view JWST observations at a given RA/Dec
- [ ] **Time slider** — for GIBS layers, allow scrubbing back through historical dates (fires, storms, floods)
- [ ] **Annotation layer** — pin notes / markers on Earth/Moon/Mars with local storage
- [ ] **Export** — save viewport as GeoTIFF / PNG with coordinate metadata
- [ ] **WorldView-3 open data** — integrate Maxar Open Data Program releases (disaster response events, free)
- [ ] **Comparison mode** — split-screen two layers / two dates side by side
- [ ] **Electron wrapper** — package as a desktop app for offline tile caching

---

## License

MIT
