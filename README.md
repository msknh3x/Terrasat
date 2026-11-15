# FieldShift

FieldShift is an Earth-observation dashboard for exploring local climate history and planning crop rotations. It opens with the Peshawar outlook and includes archived source data for six locations in Pakistan. Its planning tools address the [2026 NASA Space Apps Field Shift challenge](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/).

## Run locally

Use Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Use `npm run build` to produce the static app in `dist/` and `npm run preview` to serve the production build.

## Redeploy to an existing Vercel project

From this directory, sign in to the account that owns the existing Vercel project. Run `npx vercel link`, select that project, then run `npx vercel deploy --prod`. If the project overrides the Vite defaults, set its build command to `npm run build` and its output directory to `dist`.

## Data and coverage

- NASA POWER monthly agroclimatology data cover 2001–2025. Annual rainfall sums monthly totals. Temperature maxima and minima are annual extremes. Every chart labels its unit and compares annual records with an optional ordinary least-squares fit.
- Peshawar, Multan, Faisalabad, Lahore, Sukkur, and Islamabad use bundled NASA POWER data and nearby ISRIC SoilGrids surface cell estimates. The soil panel identifies its sampled cell.
- The six bundled locations load their climate and soil archives locally. A separately loaded [GeoNames](https://www.geonames.org/) index (CC BY 4.0) resolves common place names. OpenStreetMap Nominatim supplies other searches and reverse geocoding. For locations outside the archive, NASA POWER and SoilGrids load independently once the location is known. Soil estimates may be unavailable.
- Crop scoring and calendar guidance use Pakistan crop profiles. The rainfed and irrigated settings let users see which crop matches depend on dependable irrigation. International locations retain their climate and exposure views.
- The rotation planner pairs Rabi and Kharif crops when their Pakistan reference windows fit without overlapping in a 12-month cycle. It uses the same field-level inputs as the crop advisor and compares climate fit and crop water requirements.
- Historical signals support planning. Immediate weather, public-health and hazard decisions require current local information.
- The interactive globe uses NASA Earth Observatory’s [Blue Marble 2002](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) surface and cloud composites and the [Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/) night-light composite. The current UTC solar position governs daylight and night lighting. The optional Latest satellite setting shows timestamped imagery containing modified EUMETSAT data.

## Code structure

`src/api/` holds data retrieval and normalization, `src/analysis/` holds trend analysis, crop and rotation screening, and PDF generation, `src/data/` holds source snapshots and crop references, and `src/components/` holds dashboard views.
