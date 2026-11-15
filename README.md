# FieldShift

FieldShift is an Earth-observation dashboard for exploring local climate history and planning crop rotations. It opens with the Peshawar outlook and includes archived source data for six locations in Pakistan. Its planning tools address the [2026 NASA Space Apps Field Shift challenge](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/).

## Demo

<video src="public/demo.mp4" controls="controls" width="100%"></video>

## Getting Started

### Prerequisites

Node.js `20.19+` or `22.12+`

### Local Development

```sh
npm ci
npm run dev
```

### Production Build

```sh
npm run build
npm run preview
```

`npm run build` produces the static application in `dist/`, and `npm run preview` serves the production build locally.

## Deployment

### Redeploy to an existing Vercel project

From this directory, sign in to the account that owns the existing Vercel project:

1. Link to the project:
   ```sh
   npx vercel link
   ```
2. Deploy to production:
   ```sh
   npx vercel deploy --prod
   ```

If the project overrides default Vite settings, ensure the build command is set to `npm run build` and the output directory is `dist`.

## Data and Coverage

- **Agroclimatology (2001–2025):** Powered by NASA POWER monthly agroclimatology data. Annual rainfall sums monthly totals, while temperature maxima and minima reflect annual extremes. Charts display explicit units and compare annual records with an optional ordinary least-squares (OLS) fit.
- **Bundled Locations:** Peshawar, Multan, Faisalabad, Lahore, Sukkur, and Islamabad use bundled NASA POWER data and nearby ISRIC SoilGrids surface cell estimates. The soil panel identifies its sampled cell. These six locations load their climate and soil archives locally.
- **Geocoding & Search:** A separately loaded [GeoNames](https://www.geonames.org/) index (CC BY 4.0) resolves common place names. OpenStreetMap Nominatim supplies other searches and reverse geocoding. For locations outside the archive, NASA POWER and SoilGrids load independently once coordinates are resolved (soil estimates may be unavailable).
- **Crop Scoring & Calendar Guidance:** Uses Pakistan crop profiles to evaluate suitability. Rainfed and irrigated settings let users see which crop matches depend on dependable irrigation. International locations retain their climate and exposure views.
- **Rotation Planner:** Pairs Rabi and Kharif crops when their Pakistan reference windows fit without overlapping in a 12-month cycle. It uses the same field-level inputs as the crop advisor and compares climate fit and crop water requirements.
- **Interactive 3D Globe:** Uses NASA Earth Observatory's [Blue Marble 2002](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) surface and cloud composites and the [Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/) night-light composite. The current UTC solar position governs daylight and night lighting. An optional Latest satellite setting shows timestamped imagery containing modified EUMETSAT data.
- **UI & Assets:** The illustrative banner was generated for the app. Location coordinates and data sources appear separately in the UI.

> **Note:** Historical signals support planning. Immediate weather, public-health, and hazard decisions require current local information.

## Code Structure

- `src/api/` — Data retrieval and normalization.
- `src/analysis/` — Trend analysis, crop and rotation screening, and PDF generation.
- `src/data/` — Source snapshots and crop references.
- `src/components/` — Dashboard views.
