# FieldShift

FieldShift is a React and Vite dashboard for exploring local climate history and screening crop options. It opens with the Peshawar outlook and includes archived source data for six locations in Pakistan.

## Run locally

Use Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Use `npm run build` to produce the static app in `dist/` and `npm run preview` to serve the production build.

## Data and coverage

- NASA POWER monthly agroclimatology data cover 2001–2025. Annual rainfall sums monthly totals. Temperature maxima and minima are annual extremes. Every chart labels its unit and compares annual records with an optional ordinary least-squares fit.
- Peshawar, Multan, Faisalabad, Lahore, Sukkur, and Islamabad use bundled NASA POWER data and nearby ISRIC SoilGrids surface cell estimates. The soil panel identifies its sampled cell.
- Submitted searches beyond the bundled locations use OpenStreetMap Nominatim, NASA POWER, and SoilGrids REST. SoilGrids may be unavailable. Search suggestions while typing are entirely local.
- Crop scoring and calendar guidance use Pakistan crop profiles. The rainfed and irrigated settings let users see which crop matches depend on dependable irrigation. International locations retain their climate and exposure views.
- Historical signals support planning. Immediate weather, public-health and hazard decisions require current local information.
- The illustrative banner was generated for the app. Location coordinates and data sources appear separately in the UI.

## Code structure

`src/api/` holds data retrieval and normalization, `src/analysis/` holds trend analysis, crop screening and PDF generation, `src/data/` holds source snapshots and crop references, and `src/components/` holds dashboard views.
