# FieldShift — Complete Project Documentation
## NASA Space Apps Challenge 2026 | Challenge #7: Field Shift: Adapting Farms with NASA Data

---

# SECTION 1: PROJECT OVERVIEW

## What We're Building
**FieldShift** — A smart farming advisor that uses NASA satellite data to help farmers adapt to climate change. Farmer selects their location → app shows how climate is changing → recommends which crops to grow/avoid → shows health & disaster risks.

## The Problem We're Solving
Pakistan is an agricultural country — 42% of labor works in farming. Climate is changing (temperature rising in some areas, rainfall shifting) but farmers have NO tool to see how their local climate is trending and what that means for their crops. They keep planting the same crops and lose harvests. NASA has 25 years of satellite data that could help them, but it's locked behind complex APIs.

## Our Solution
A web app where a farmer types their city → gets a complete farming dashboard:
1. **Climate Trends** — temperature, rainfall, humidity, solar trends over 25 years
2. **Soil Profile** — soil type, pH, texture from satellite data
3. **Crop Recommendations** — which crops match current + future conditions
4. **Risk Alerts** — drought, flood, heat stress warnings
5. **Health Impact** — what climate change means for farmer health
6. **Planting Calendar** — best months to plant recommended crops

## NASA Data Sources
- **NASA POWER API** (Prediction of Worldwide Energy Resources)
  - URL: https://power.larc.nasa.gov/api/
  - Community: AG (Agroclimatology — specifically for farming!)
  - Parameters: T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, ALLSKY_SFC_SW_DWN, WS2M
  - Coverage: 1981–present, global, ~55km resolution
  - No API key needed

## Other Data Sources
- **SoilGrids** (ISRIC World Soil Information)
  - URL: https://rest.isric.org/soilgrids/v2.0/properties/query
  - Returns: pH, organic carbon, clay/sand/silt percentages
  - No API key needed

- **OpenStreetMap Nominatim** (Geocoding)
  - URL: https://nominatim.openstreetmap.org/search
  - For converting city names to coordinates
  - No API key needed

## Tech Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Charts:** Chart.js or Recharts
- **Globe:** react-globe.gl + Three.js (optional)
- **Backend:** Python FastAPI (optional — frontend can call APIs directly)
- **Deployment:** Vercel (frontend), Render (backend if needed)

---

# SECTION 2: WORK DIVISION

## Person 1 (YOU — Lead Developer)
| Task | Description | Time |
|------|-------------|------|
| 1. Project setup | Create React+Vite app, Tailwind, folder structure | 30 min |
| 2. NASA POWER integration | Fetch climate data for any city (temp, rain, humidity, solar, wind) | 45 min |
| 3. SoilGrids integration | Fetch soil data (pH, texture, organic carbon) | 30 min |
| 4. Climate trend analysis | OLS regression, p-value, trend detection for each variable | 45 min |
| 5. Geocoding | Any city worldwide via Nominatim | 20 min |
| 6. Main app layout | Landing page, search bar, dashboard layout, dark theme | 45 min |
| 7. Climate Trends panel | Charts showing 25-year trends for all variables | 30 min |
| 8. Soil Profile panel | Display soil data in a nice card | 20 min |
| 9. Integration & deployment | Connect everything, build, deploy to Vercel | 30 min |
| **Total** | | **~5 hours** |

## Person 2 (YOUR PARTNER)
| Task | Description | Time |
|------|-------------|------|
| 1. Crop recommendation engine | Match climate + soil data to crop requirements | 1 hour |
| 2. Crop database | Build the JSON database of 15+ crops with requirements | 30 min |
| 3. Crop recommendation UI | Cards showing recommended / at-risk / not-recommended crops | 45 min |
| 4. Health Impact assessment | Climate trends → health risk cards (heatstroke, dengue, etc.) | 45 min |
| 5. Risk Alerts panel | Drought/flood/heat stress warnings based on trends | 30 min |
| 6. Planting Calendar | Best planting months for each recommended crop | 30 min |
| 7. Demo video | Record 30-60 second screen recording of the app | 20 min |
| **Total** | | **~4 hours** |

---

# SECTION 3: PERSON 1 — DETAILED BUILD GUIDE

## Step 1: Project Setup

Give this to your AI tool:

```
Create a new React + Vite + Tailwind CSS project called "fieldshift".

Structure:
fieldshift/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   └── earth.webp (optional)
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── styles.css
│       ├── api/
│       │   ├── nasaPower.js      — NASA POWER API client
│       │   ├── soilGrids.js      — SoilGrids API client
│       │   └── geocode.js        — Nominatim geocoding
│       ├── analysis/
│       │   └── trends.js         — Statistical trend analysis
│       ├── data/
│       │   └── crops.js          — Crop requirements database
│       ├── components/
│       │   ├── SearchBar.jsx     — Location input
│       │   ├── ClimateTrends.jsx — Climate charts panel
│       │   ├── SoilProfile.jsx   — Soil data display
│       │   ├── CropAdvisor.jsx   — Crop recommendations (partner builds)
│       │   ├── HealthImpact.jsx  — Health risks (partner builds)
│       │   ├── RiskAlerts.jsx    — Drought/flood alerts (partner builds)
│       │   └── PlantingCalendar.jsx — Seasonal calendar (partner builds)
│       └── utils/
│           └── helpers.js
├── package.json (workspace root)
└── README.md

Design theme:
- Dark background: #0F1419
- Primary green: #22C55E
- Secondary: #15803D
- Accent: #86EFAC
- Cards: #1A2332 with subtle border
- Font: Inter
- Feel: Agricultural/Earth — not space-themed

Setup Tailwind with these colors. Create placeholder components 
for all files. I'll fill in the logic after.
```

## Step 2: NASA POWER API Integration

```
Create frontend/src/api/nasaPower.js

This module fetches climate data from NASA POWER API for farming.

IMPORTANT: Use community=AG (Agroclimatology) not RE.

const BASE_URL = 'https://power.larc.nasa.gov/api/temporal/monthly/point'

Parameters to fetch:
- T2M: Average temperature (°C)
- T2M_MAX: Maximum temperature (°C)
- T2M_MIN: Minimum temperature (°C)
- PRECTOTCORR: Precipitation (mm/day)
- RH2M: Relative humidity (%)
- ALLSKY_SFC_SW_DWN: Solar radiation (kW-hr/m²/day)
- WS2M: Wind speed (m/s)

Function: fetchClimateData(lat, lon, startYear=2001, endYear=2025)

Example API call:
GET https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN,WS2M&community=AG&latitude=34.01&longitude=71.52&start=2001&end=2025&format=JSON

Response structure:
- data.properties.parameter.T2M = {"200101": 5.2, "200102": 8.1, ...}
- Values of -999 mean missing data — filter these out

Return: An object with yearly averages for each parameter:
{
  T2M: { 2001: 19.5, 2002: 19.8, ... },
  PRECTOTCORR: { 2001: 2.1, 2002: 1.8, ... },
  ...
  // Also compute these summary stats:
  currentTemp: 20.3,       // latest year average
  currentRainfall: 1.9,    // latest year
  avgTemp: 19.8,           // 25-year mean
  avgRainfall: 2.0,        // 25-year mean
  annualRainfallMM: 730,   // total mm/year (daily rate × 365)
}

No API key needed. Free. Works for any coordinates on Earth.
```

## Step 3: SoilGrids API Integration

```
Create frontend/src/api/soilGrids.js

This module fetches soil data from the ISRIC SoilGrids API.

Function: fetchSoilData(lat, lon)

API call:
GET https://rest.isric.org/soilgrids/v2.0/properties/query?lon={lon}&lat={lat}&property=phh2o&property=soc&property=clay&property=sand&property=silt&property=nitrogen&depth=0-5cm&depth=5-15cm&value=mean

Response parsing:
- phh2o: Soil pH (divide by 10 — API returns pH × 10)
- soc: Soil organic carbon (g/kg)
- clay: Clay percentage (g/kg, divide by 10 for %)
- sand: Sand percentage (g/kg, divide by 10 for %)
- silt: Silt percentage (g/kg, divide by 10 for %)
- nitrogen: Nitrogen content (cg/kg)

Return object:
{
  ph: 7.2,
  organicCarbon: 8.5,    // g/kg
  clay: 18,              // %
  sand: 62,              // %
  silt: 20,              // %
  nitrogen: 1.2,         // cg/kg
  texture: "Sandy Loam", // derived from clay/sand/silt percentages
  fertility: "Moderate",  // derived from organic carbon + nitrogen
}

Soil texture classification (USDA):
- Sand > 85% → "Sand"
- Clay > 40% → "Clay"
- Silt > 80% → "Silt"
- Sand 50-85%, Clay < 20% → "Sandy Loam"
- Clay 20-35%, Sand 45-65% → "Sandy Clay Loam"
- Clay 25-40%, Silt 15-50% → "Clay Loam"
- Balanced (none dominant) → "Loam"

No API key needed. Free.
```

## Step 4: Climate Trend Analysis

```
Create frontend/src/analysis/trends.js

Pure JavaScript — no external dependencies.

Function: analyzeTrend(yearlyData)
Input: { 2001: 19.5, 2002: 19.8, ..., 2025: 20.3 }
Output: {
  slope: 0.023,          // change per year
  slopePerDecade: 0.23,  // change per decade
  pValue: 0.01,          // statistical significance
  rSquared: 0.45,        // how well trend fits
  isSignificant: true,   // p < 0.05
  direction: "increasing", // "increasing", "decreasing", "stable"
  totalChange: 0.55,     // total change over period
  years: [2001, 2002, ...],
  values: [19.5, 19.8, ...],
  trendLine: [19.4, 19.42, ...], // fitted values
}

Use OLS (Ordinary Least Squares) linear regression.
Calculate p-value using t-distribution approximation.

Also create:
Function: analyzeAllTrends(climateData)
Runs analyzeTrend on each parameter (T2M, PRECTOTCORR, etc.)
Returns object with trend results for all 7 variables.
```

## Step 5: Geocoding

```
Create frontend/src/api/geocode.js

Two functions:

1. geocodeCity(cityName) — forward geocoding
   URL: https://nominatim.openstreetmap.org/search?q={city}&format=json&limit=1
   Header: User-Agent: FieldShift/1.0
   Returns: { name, lat, lon, country }
   Cache results in a Map.

2. reverseGeocode(lat, lng) — reverse geocoding (for globe clicks)
   URL: https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&zoom=10
   Header: User-Agent: FieldShift/1.0
   Returns: { name, country }
```

## Step 6: Main App Layout & Dashboard

```
Build frontend/src/App.jsx with this layout:

HEADER:
[🌱 FieldShift logo]  [About] [Methodology]  [NASA Space Apps 2026]

HERO SECTION:
[Badge: Powered by NASA POWER]  [Badge: Works for any farm on Earth]
"Adapt your farm to climate change"
"Enter your farm location to get NASA-backed crop recommendations 
and climate risk analysis"
[🔍 Search bar: "Enter city or farm location"]  [Analyze →]

Example chips:
[Peshawar farming outlook] [Multan crop advisor] [Faisalabad climate]
[Lahore agriculture] [Sindh farming risks]

DASHBOARD (appears after search):
┌──────────────────────┬──────────────────────┐
│  CLIMATE TRENDS      │  SOIL PROFILE        │
│  (charts for all 7   │  (pH, texture,       │
│   variables with     │   fertility,         │
│   trend arrows)      │   composition pie)   │
├──────────────────────┼──────────────────────┤
│  CROP RECOMMENDATIONS│  RISK ALERTS         │
│  ✅ Recommended      │  🔴 Drought: HIGH    │
│  ⚠️ At Risk         │  🟡 Heat: MODERATE   │
│  ❌ Not Recommended  │  🟢 Flood: LOW       │
├──────────────────────┼──────────────────────┤
│  HEALTH IMPACT       │  PLANTING CALENDAR   │
│  (heatstroke,dengue, │  (monthly grid       │
│   respiratory risks) │   showing best times)│
└──────────────────────┴──────────────────────┘

FOOTER:
Data: NASA POWER API · SoilGrids · NASA Space Apps 2026
[Download Report PDF] [View Methodology]

Dark theme with GREEN accents (this is a farming app, not space app).
Primary: #22C55E, Background: #0F1419, Cards: #1A2332
```

## Step 7: Climate Trends Panel

```
Build frontend/src/components/ClimateTrends.jsx

Takes climateData + trendResults as props.

Shows a grid of 7 trend cards, each with:
- Emoji + variable name
- Arrow: ↑ (green), ↓ (red), → (gray)
- Rate: "+0.23°C/decade"
- Significance badge: "Significant" (green) or "Not significant" (gray)
- Small sparkline chart (Chart.js line, no labels, just the shape)

And one big main chart (user selectable) showing the full 25-year 
trend with data points + trend line.

The farming-relevant interpretation under each:
- Temperature rising → "Growing season extending but heat stress increasing"
- Rainfall decreasing → "Water availability declining — irrigation critical"
- Solar increasing → "More sunlight — good for some crops, heat risk for others"
```

## Step 8: Soil Profile Panel

```
Build frontend/src/components/SoilProfile.jsx

Takes soilData as props.

Shows:
- pH meter visualization (scale 0-14, marker at current pH)
  - < 5.5: "Acidic ⚠️" (red)
  - 5.5-7.0: "Slightly Acidic" (yellow)
  - 7.0-7.5: "Neutral ✅" (green)
  - 7.5-8.5: "Alkaline" (yellow)
  - > 8.5: "Very Alkaline ⚠️" (red)

- Soil texture triangle or pie chart (clay/sand/silt %)
- Texture classification: "Sandy Loam"
- Organic carbon: X g/kg with rating (Low/Medium/High)
- Nitrogen: X cg/kg with rating
- Overall fertility rating: Low / Moderate / High / Very High

Dark card, green accents, farming feel.
```

---

# SECTION 4: PERSON 2 (PARTNER) — DETAILED BUILD GUIDE

## Give your partner this entire section.

---

### Task 1: Crop Database

```
Create frontend/src/data/crops.js

Export a CROPS object with 15+ crops. Each crop has:

export const CROPS = {
  wheat: {
    name: "Wheat",
    emoji: "🌾",
    category: "cereal",
    temp_min: 10, temp_max: 25,      // °C optimal range
    rain_min: 300, rain_max: 900,     // mm/year
    humidity_min: 30, humidity_max: 70, // %
    solar_min: 4.0,                    // kWh/m²/day minimum
    soil_ph_min: 6.0, soil_ph_max: 7.5,
    soil_types: ["Loam", "Clay Loam", "Sandy Loam"],
    season: "Rabi (Oct-Mar)",
    planting_months: [10, 11],        // October, November
    harvest_months: [3, 4],           // March, April
    water_need: "moderate",
    drought_tolerant: false,
    heat_tolerant: false,
    cold_tolerant: true,
    description: "Staple cereal crop. Needs cool growing season with moderate water.",
    risk_factors: ["heat stress above 30°C during grain fill", "waterlogging"],
  },
  rice: {
    name: "Rice",
    emoji: "🍚",
    category: "cereal",
    temp_min: 20, temp_max: 35,
    rain_min: 1000, rain_max: 2000,
    humidity_min: 60, humidity_max: 90,
    solar_min: 4.5,
    soil_ph_min: 5.5, soil_ph_max: 7.0,
    soil_types: ["Clay", "Clay Loam", "Silt"],
    season: "Kharif (Jun-Oct)",
    planting_months: [6, 7],
    harvest_months: [10, 11],
    water_need: "very high",
    drought_tolerant: false,
    heat_tolerant: true,
    cold_tolerant: false,
    description: "Water-intensive crop needing warm, humid conditions and heavy clay soil.",
    risk_factors: ["drought causes complete failure", "needs standing water"],
  },
  cotton: {
    name: "Cotton",
    emoji: "🏵️",
    category: "cash crop",
    temp_min: 21, temp_max: 37,
    rain_min: 500, rain_max: 1200,
    humidity_min: 40, humidity_max: 70,
    solar_min: 5.0,
    soil_ph_min: 5.5, soil_ph_max: 8.0,
    soil_types: ["Loam", "Sandy Loam", "Clay Loam"],
    season: "Kharif (Apr-Oct)",
    planting_months: [4, 5],
    harvest_months: [9, 10, 11],
    water_need: "moderate",
    drought_tolerant: true,
    heat_tolerant: true,
    cold_tolerant: false,
    description: "Major cash crop. Tolerates heat well but sensitive to waterlogging.",
    risk_factors: ["pest pressure increases with humidity", "frost kills plants"],
  },
  maize: {
    name: "Maize/Corn",
    emoji: "🌽",
    category: "cereal",
    temp_min: 18, temp_max: 32,
    rain_min: 500, rain_max: 1000,
    humidity_min: 40, humidity_max: 80,
    solar_min: 4.5,
    soil_ph_min: 5.5, soil_ph_max: 7.5,
    soil_types: ["Loam", "Sandy Loam"],
    season: "Kharif (Jun-Sep) / Spring (Feb-May)",
    planting_months: [2, 3, 6, 7],
    harvest_months: [5, 6, 9, 10],
    water_need: "moderate-high",
    drought_tolerant: false,
    heat_tolerant: false,
    cold_tolerant: false,
    description: "Versatile cereal needing moderate warmth and consistent water.",
    risk_factors: ["drought during tasseling = major yield loss", "heat above 35°C"],
  },
  sugarcane: {
    name: "Sugarcane",
    emoji: "🎋",
    category: "cash crop",
    temp_min: 20, temp_max: 38,
    rain_min: 1000, rain_max: 2500,
    humidity_min: 50, humidity_max: 85,
    solar_min: 5.0,
    soil_ph_min: 5.0, soil_ph_max: 8.0,
    soil_types: ["Loam", "Clay Loam", "Clay"],
    season: "Year-round (plant Sep-Mar, harvest Dec-Apr)",
    planting_months: [9, 10, 2, 3],
    harvest_months: [12, 1, 2, 3, 4],
    water_need: "very high",
    drought_tolerant: false,
    heat_tolerant: true,
    cold_tolerant: false,
    description: "Long-duration cash crop needing lots of water and sunshine.",
    risk_factors: ["water scarcity = stunted growth", "frost damage"],
  },
  millet: {
    name: "Millet",
    emoji: "🌿",
    category: "cereal",
    temp_min: 25, temp_max: 40,
    rain_min: 200, rain_max: 600,
    humidity_min: 20, humidity_max: 60,
    solar_min: 5.0,
    soil_ph_min: 5.0, soil_ph_max: 8.0,
    soil_types: ["Sandy Loam", "Sand", "Loam"],
    season: "Kharif (Jul-Oct)",
    planting_months: [7],
    harvest_months: [10],
    water_need: "very low",
    drought_tolerant: true,
    heat_tolerant: true,
    cold_tolerant: false,
    description: "Extremely drought-resistant. Ideal for hot, dry regions with poor soil.",
    risk_factors: ["excess water causes root rot", "low market value"],
  },
  sorghum: {
    name: "Sorghum",
    emoji: "🌱",
    category: "cereal",
    temp_min: 25, temp_max: 40,
    rain_min: 300, rain_max: 750,
    humidity_min: 25, humidity_max: 65,
    solar_min: 5.0,
    soil_ph_min: 5.5, soil_ph_max: 8.5,
    soil_types: ["Loam", "Sandy Loam", "Clay Loam"],
    season: "Kharif (Jun-Oct)",
    planting_months: [6, 7],
    harvest_months: [10, 11],
    water_need: "low",
    drought_tolerant: true,
    heat_tolerant: true,
    cold_tolerant: false,
    description: "Heat and drought champion. Great alternative when water is scarce.",
    risk_factors: ["grain mold in humid conditions"],
  },
  chickpea: {
    name: "Chickpea",
    emoji: "🫘",
    category: "pulse",
    temp_min: 10, temp_max: 30,
    rain_min: 200, rain_max: 500,
    humidity_min: 20, humidity_max: 50,
    solar_min: 4.0,
    soil_ph_min: 6.0, soil_ph_max: 8.0,
    soil_types: ["Loam", "Sandy Loam"],
    season: "Rabi (Oct-Mar)",
    planting_months: [10, 11],
    harvest_months: [3, 4],
    water_need: "low",
    drought_tolerant: true,
    heat_tolerant: false,
    cold_tolerant: true,
    description: "Nitrogen-fixing pulse. Low water need, improves soil health.",
    risk_factors: ["heat during flowering causes pod drop", "excess rain"],
  },
  lentil: {
    name: "Lentil",
    emoji: "🟤",
    category: "pulse",
    temp_min: 10, temp_max: 27,
    rain_min: 200, rain_max: 500,
    humidity_min: 20, humidity_max: 50,
    solar_min: 3.5,
    soil_ph_min: 6.0, soil_ph_max: 8.0,
    soil_types: ["Loam", "Sandy Loam", "Silt"],
    season: "Rabi (Oct-Mar)",
    planting_months: [10, 11],
    harvest_months: [3, 4],
    water_need: "low",
    drought_tolerant: true,
    heat_tolerant: false,
    cold_tolerant: true,
    description: "Cool-season pulse. Fixes nitrogen, builds soil for next crop.",
    risk_factors: ["waterlogging kills roots", "heat above 30°C"],
  },
  sunflower: {
    name: "Sunflower",
    emoji: "🌻",
    category: "oilseed",
    temp_min: 18, temp_max: 33,
    rain_min: 400, rain_max: 800,
    humidity_min: 30, humidity_max: 65,
    solar_min: 5.0,
    soil_ph_min: 6.0, soil_ph_max: 7.5,
    soil_types: ["Loam", "Sandy Loam", "Clay Loam"],
    season: "Spring (Feb-Jun)",
    planting_months: [2, 3],
    harvest_months: [6, 7],
    water_need: "moderate",
    drought_tolerant: true,
    heat_tolerant: true,
    cold_tolerant: false,
    description: "Oilseed crop with deep roots. Handles drought better than most.",
    risk_factors: ["bird damage at harvest", "excess moisture = disease"],
  },
  potato: {
    name: "Potato",
    emoji: "🥔",
    category: "vegetable",
    temp_min: 10, temp_max: 25,
    rain_min: 400, rain_max: 800,
    humidity_min: 60, humidity_max: 80,
    solar_min: 3.5,
    soil_ph_min: 5.0, soil_ph_max: 6.5,
    soil_types: ["Sandy Loam", "Loam"],
    season: "Rabi (Oct-Feb)",
    planting_months: [10, 11],
    harvest_months: [1, 2],
    water_need: "moderate-high",
    drought_tolerant: false,
    heat_tolerant: false,
    cold_tolerant: true,
    description: "Needs cool conditions and well-drained sandy soil.",
    risk_factors: ["heat above 30°C stops tuber growth", "late blight in wet conditions"],
  },
  tomato: {
    name: "Tomato",
    emoji: "🍅",
    category: "vegetable",
    temp_min: 18, temp_max: 30,
    rain_min: 400, rain_max: 800,
    humidity_min: 40, humidity_max: 70,
    solar_min: 5.0,
    soil_ph_min: 6.0, soil_ph_max: 7.0,
    soil_types: ["Loam", "Sandy Loam"],
    season: "Spring/Autumn",
    planting_months: [2, 3, 8, 9],
    harvest_months: [5, 6, 11, 12],
    water_need: "moderate",
    drought_tolerant: false,
    heat_tolerant: false,
    cold_tolerant: false,
    description: "Popular vegetable. Sensitive to both extreme heat and cold.",
    risk_factors: ["above 35°C = flower drop", "frost kills plants"],
  },
  onion: {
    name: "Onion",
    emoji: "🧅",
    category: "vegetable",
    temp_min: 13, temp_max: 30,
    rain_min: 350, rain_max: 600,
    humidity_min: 40, humidity_max: 70,
    solar_min: 4.0,
    soil_ph_min: 6.0, soil_ph_max: 7.5,
    soil_types: ["Loam", "Sandy Loam", "Silt"],
    season: "Rabi (Oct-Apr)",
    planting_months: [10, 11],
    harvest_months: [3, 4],
    water_need: "moderate",
    drought_tolerant: false,
    heat_tolerant: false,
    cold_tolerant: true,
    description: "Cool-season bulb crop. Needs consistent moisture during growth.",
    risk_factors: ["excess rain during maturity = rot", "bolting in cold snaps"],
  },
  mustard: {
    name: "Mustard/Canola",
    emoji: "🌼",
    category: "oilseed",
    temp_min: 10, temp_max: 25,
    rain_min: 250, rain_max: 500,
    humidity_min: 30, humidity_max: 60,
    solar_min: 4.0,
    soil_ph_min: 6.0, soil_ph_max: 8.0,
    soil_types: ["Loam", "Sandy Loam", "Clay Loam"],
    season: "Rabi (Oct-Mar)",
    planting_months: [10, 11],
    harvest_months: [2, 3],
    water_need: "low",
    drought_tolerant: true,
    heat_tolerant: false,
    cold_tolerant: true,
    description: "Oilseed crop that thrives in cool, dry Rabi season.",
    risk_factors: ["aphid attacks", "heat during flowering reduces oil content"],
  },
  sesame: {
    name: "Sesame",
    emoji: "🌰",
    category: "oilseed",
    temp_min: 25, temp_max: 40,
    rain_min: 300, rain_max: 700,
    humidity_min: 30, humidity_max: 60,
    solar_min: 5.0,
    soil_ph_min: 5.5, soil_ph_max: 8.0,
    soil_types: ["Sandy Loam", "Loam"],
    season: "Kharif (Jul-Oct)",
    planting_months: [7],
    harvest_months: [10],
    water_need: "low",
    drought_tolerant: true,
    heat_tolerant: true,
    cold_tolerant: false,
    description: "Ancient oilseed. Thrives in hot, dry conditions with minimal water.",
    risk_factors: ["waterlogging kills plants quickly", "needs well-drained soil"],
  },
}
```

### Task 2: Crop Recommendation Engine

```
Create frontend/src/components/CropAdvisor.jsx

This component receives:
- climateData: { currentTemp, avgRainfall, annualRainfallMM, ... }
- trendResults: { T2M: { direction, slope, ... }, PRECTOTCORR: { ... }, ... }
- soilData: { ph, texture, clay, sand, silt, ... }

Logic — for each crop in CROPS database:

1. Calculate CURRENT FIT SCORE (0-100):
   - Temperature in range? +25 points
   - Rainfall in range? +25 points
   - Soil pH in range? +25 points
   - Soil texture matches? +25 points

2. Calculate FUTURE FIT SCORE (0-100) based on trends:
   - If temp rising AND crop is heat-tolerant → +10 bonus
   - If temp rising AND crop max temp close to current → -20 penalty
   - If rainfall decreasing AND crop is drought-tolerant → +10 bonus
   - If rainfall decreasing AND crop needs high water → -20 penalty
   - If humidity rising AND crop needs low humidity → -10 penalty

3. Calculate COMBINED SCORE = (current × 0.4) + (future × 0.6)
   Future matters MORE because we're advising for climate adaptation.

4. Categorize:
   - Score ≥ 70 → ✅ RECOMMENDED (green card)
   - Score 40-69 → ⚠️ AT RISK (yellow card)
   - Score < 40 → ❌ NOT RECOMMENDED (red card)

5. Generate one-line explanation for each:
   - "✅ Millet — drought & heat tolerant, ideal as your region gets hotter and drier"
   - "⚠️ Wheat — currently viable but rising temperatures approaching upper limit"
   - "❌ Rice — insufficient rainfall trend, needs 1000mm+ but your area gets 450mm"

Display: 3 sections (Recommended / At Risk / Not Recommended)
Each crop card shows: emoji, name, score bar, season, one-line reason
Sort by score descending within each category.
```

### Task 3: Health Impact Assessment

```
Create frontend/src/components/HealthImpact.jsx

Takes trendResults as props. Shows health risk cards:

LOGIC:

1. HEATSTROKE RISK:
   - T2M_MAX rising significantly → HIGH 🔴
   - T2M_MAX rising not significant → MODERATE 🟡
   - T2M_MAX stable or falling → LOW 🟢
   - Message: "Max temperature trend: {slope}°C/decade. 
     {HIGH: Workers and elderly face increasing heat exhaustion risk.}
     {LOW: Heat stress risk is not increasing in your area.}"

2. DENGUE / VECTOR-BORNE DISEASE:
   - T2M rising + RH2M rising → HIGH 🔴
   - Only one rising → MODERATE 🟡
   - Both stable/falling → LOW 🟢
   - Message: "Warmer + wetter = longer mosquito breeding season."

3. RESPIRATORY HEALTH:
   - RH2M rising significantly → ELEVATED 🟡
   - RH2M stable → NORMAL 🟢
   - Message: "Humidity affects asthma and respiratory conditions."

4. FLOOD / WATERBORNE DISEASE:
   - PRECTOTCORR increasing significantly → HIGH 🔴
   - PRECTOTCORR decreasing → DROUGHT RISK 🟡
   - Stable → NORMAL 🟢

5. AGRICULTURAL WORKER SAFETY:
   - T2M_MAX rising + solar increasing → HIGH 🔴
   - Message: "Outdoor work hours may need to shift to avoid peak heat."

Card design: Dark card with colored left border (red/yellow/green).
Emoji + risk name + badge + one-line explanation.

Disclaimer at bottom: "Based on climate trend analysis only. 
Consult local health authorities for medical guidance."
```

### Task 4: Risk Alerts Panel

```
Create frontend/src/components/RiskAlerts.jsx

Takes trendResults as props. Shows 4 risk gauges:

1. 🔥 DROUGHT RISK
   - PRECTOTCORR decreasing significantly → HIGH
   - PRECTOTCORR decreasing not significant → MODERATE
   - PRECTOTCORR stable/increasing → LOW

2. 🌊 FLOOD RISK
   - PRECTOTCORR increasing significantly → HIGH
   - Stable → LOW

3. 🌡️ HEAT STRESS
   - T2M_MAX rising significantly → HIGH
   - Rising not significant → MODERATE
   - Stable/falling → LOW

4. ❄️ FROST RISK
   - T2M_MIN falling significantly → HIGH
   - Stable → MODERATE
   - Rising → LOW

Each gauge: circular or semi-circular meter with color gradient
(green → yellow → red), risk level label, one sentence explanation.
```

### Task 5: Planting Calendar

```
Create frontend/src/components/PlantingCalendar.jsx

Takes the list of RECOMMENDED crops from CropAdvisor.

Display a 12-month grid (Jan–Dec) with:
- Each recommended crop as a row
- Colored bars showing planting months (green) and harvest months (gold)
- Current month highlighted

Example:
         J  F  M  A  M  J  J  A  S  O  N  D
Wheat    .  .  .  ██ ██ .  .  .  .  ██ ██ .
         .  .  .  harvest    .  .  .  plant
Millet   .  .  .  .  .  .  ██ .  .  ██ .  .
                           plant    harvest
Cotton   .  .  .  ██ ██ .  .  .  ██ ██ ██ .
                  plant         harvest

Use colored blocks: 🟩 = planting, 🟨 = harvest, ⬜ = off-season

Dark grid with green/gold cells. Clean and easy to read.
```

### Task 6: Demo Video

Record 30-60 seconds showing:
1. Open app → type "Peshawar" → click Analyze
2. Show climate trends loading → charts appear
3. Scroll to crop recommendations → show recommended vs at-risk
4. Show health impact cards
5. Show risk alerts
6. Show planting calendar

Upload to YouTube (unlisted) and paste link in submission.

---

# SECTION 5: SUBMISSION

## Team Creation
- Team Name: FieldShift
- Challenge: Field Shift: Adapting Farms with NASA Data
- Event: Universal Event
- Skills: Software, Coding, Web Development, Data Visualization, Data Analysis, Agriculture, Earth Science, Artificial Intelligence & Machine Learning, Weather

## Project Submission Fields

**Title:** FieldShift — Smart Farming with NASA Climate Data

**Summary:** FieldShift helps farmers adapt to climate change using 25 years of NASA POWER satellite data. Enter any farm location worldwide to see climate trends, soil analysis, personalized crop recommendations, health risk assessment, and an optimized planting calendar — all powered by real NASA observations.

**NASA Resources:**
- NASA POWER API (https://power.larc.nasa.gov/) — Agroclimatology community
- Parameters: T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, ALLSKY_SFC_SW_DWN, WS2M

**References:**
- NASA POWER: https://power.larc.nasa.gov/
- NASA POWER Methodology: https://power.larc.nasa.gov/docs/methodology/
- SoilGrids: https://soilgrids.org/
- ISRIC: https://www.isric.org/

---

# SECTION 6: TIMELINE

Right now → Submit by tonight 11:59 PM.

| Time | Person 1 | Person 2 |
|------|----------|----------|
| Hour 1 | Project setup + NASA API + Geocoding | Crop database (crops.js) |
| Hour 2 | SoilGrids API + Trend analysis | Crop recommendation engine |
| Hour 3 | Main layout + Climate Trends panel + Soil panel | Health Impact component |
| Hour 4 | Integration — connect all components | Risk Alerts + Planting Calendar |
| Hour 5 | Testing + deployment | Demo video + submission text |
| SUBMIT | Push to GitHub → Deploy to Vercel → Fill submission form |

GO BUILD. CLOCK IS TICKING. 🚀
