<div align="center">

<img src="public/fieldshift.svg" alt="FieldShift Logo" width="80" height="80" />

# FieldShift

<<<<<<< Updated upstream
FieldShift is an Earth-observation dashboard for exploring local climate history and planning crop rotations. It opens with the Peshawar outlook and includes archived source data for six locations in Pakistan. Its planning tools address the [2026 NASA Space Apps Field Shift challenge](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/).
=======
**A React & Vite dashboard for exploring local climate history, agroclimatology trends, and screening crop options.**
>>>>>>> Stashed changes

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.12%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Data Source: NASA POWER](https://img.shields.io/badge/Data-NASA%20POWER-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](https://power.larc.nasa.gov/)
[![Soil Data: ISRIC SoilGrids](https://img.shields.io/badge/Soil-ISRIC%20SoilGrids-5B8C5A?style=for-the-badge)](https://www.isric.org/explore/soilgrids)

<p align="center">
  FieldShift opens with the <b>Peshawar</b> outlook and includes archived source data for six primary locations across Pakistan.
</p>

---

</div>

## 📌 Overview

**FieldShift** is an agroclimatic intelligence dashboard built with React and Vite. It empowers farm planning by pairing 24+ years of local climate history with soil profile estimates and crop suitability models.

- **Default View**: Launches directly with the historical climate outlook for **Peshawar**.
- **Pre-Bundled Coverage**: Includes curated, archived datasets for six strategic agricultural regions across Pakistan.
- **Global Compatibility**: Extends screening and climate analysis to international coordinates via live API retrieval.

---

## ⚡ Run Locally

### Prerequisites
- **Node.js**: `20.19+` or `22.12+`
- **Package Manager**: `npm`

### Installation & Development

```sh
# Install exact dependencies
npm ci

# Start local development server
npm run dev
```

### Production Build

<<<<<<< Updated upstream
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
=======
```sh
# Generate optimized static build in dist/
npm run build

# Preview production build locally
npm run preview
```
>>>>>>> Stashed changes

---

<<<<<<< Updated upstream
`src/api/` holds data retrieval and normalization, `src/analysis/` holds trend analysis, crop and rotation screening, and PDF generation, `src/data/` holds source snapshots and crop references, and `src/components/` holds dashboard views.
=======
## 📊 Data & Coverage

| Domain | Source & Method | Scope & Details |
| :--- | :--- | :--- |
| **Agroclimatology** | [NASA POWER](https://power.larc.nasa.gov/) (Monthly) | Covers **2001–2025**. Annual rainfall sums monthly totals; temperature maxima and minima capture annual extremes. Every chart explicitly labels its unit and compares annual records with an optional Ordinary Least-Squares (OLS) regression fit. |
| **Bundled Regions** | Bundled NASA POWER & [ISRIC SoilGrids](https://www.isric.org/explore/soilgrids) | **Peshawar**, **Multan**, **Faisalabad**, **Lahore**, **Sukkur**, and **Islamabad** include pre-packaged NASA POWER datasets and nearby ISRIC SoilGrids surface cell estimates. The soil panel clearly identifies its sampled cell. |
| **Global Search** | [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) + APIs | Searches submitted beyond bundled locations fetch coordinates via Nominatim, historical climate via NASA POWER, and soil estimates via SoilGrids REST *(note: SoilGrids may occasionally be unavailable)*. Typeahead search suggestions are computed entirely locally. |
| **Crop Screening** | Pakistan Agronomic Profiles | Crop scoring and calendar guidance leverage Pakistan crop profiles. Dual **Rainfed** and **Irrigated** settings allow users to evaluate which crop matches depend on reliable irrigation. International locations retain full climate and exposure views. |

> [!NOTE]
> **Advisory & Planning Scope**: Historical signals support medium- and long-term planning. Immediate weather, public-health, and hazard decisions require current local information.

> [!NOTE]
> **UI & Attribution**: The illustrative banner was generated for the app. Location coordinates and underlying data sources appear separately in the UI.

---

## 🏗️ Code Structure

```text
src/
├── api/          # Data retrieval, REST queries, and normalization (NASA POWER, SoilGrids, Nominatim)
├── analysis/     # Trend analysis (OLS fit), crop screening algorithms, and PDF report generation
├── data/         # Source snapshots, bundled location datasets, and Pakistan crop reference matrices
└── components/   # Interactive dashboard views, 3D globe visualization, and analytical panels
```

---

<div align="center">
  <sub>Built for hackathon showcase with React, Vite, and open environmental datasets.</sub>
</div>
>>>>>>> Stashed changes
