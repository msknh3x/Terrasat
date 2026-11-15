// Local reference windows, not cultivar-level schedules. Temperature and pH
// ranges are screening defaults from the project plan. For crops FAO covers,
// waterMm uses the lower end of its indicative whole-season crop water need.
export const CROP_SOURCES = {
  faoCalendar: {
    label: 'FAO GIEWS · Pakistan crop calendar',
    url: 'https://www.fao.org/giews/countrybrief/country.jsp?code=PAK',
  },
  pmdCalendar: {
    label: 'Pakistan Meteorological Department · Provincial crop calendars',
    url: 'https://www.weather.gov.pk/namc/crop-calendar/Punjab',
  },
  sbpCalendar: {
    label: 'State Bank of Pakistan / NARC · Major crops and oilseeds calendar',
    url: 'https://www.sbp.org.pk/assets/document/publications/Special-Section_%284%29.pdf',
  },
  punjabCalendar: {
    label: 'Punjab Agriculture Department · Reference crop schedules',
    url: 'https://agripunjab.gov.pk/system/files/Maize-Cultivation-with-HEIS.pdf',
  },
  faoWater: {
    label: 'FAO · Indicative crop water requirements',
    url: 'https://www.fao.org/4/s2022e/s2022e07.htm',
  },
};

const LOAMS = ['Loam', 'Sandy Loam', 'Clay Loam', 'Silt Loam'];
const WELL_DRAINED = ['Loam', 'Sandy Loam', 'Silt Loam'];
const HEAVIER = ['Loam', 'Clay', 'Clay Loam', 'Silty Clay Loam', 'Silt Loam'];
const LIGHTER = ['Loam', 'Sandy Loam', 'Loamy Sand', 'Sand'];
const RABI_MONTHS = [11, 12, 1, 2, 3];

export const CROPS = [
  {
    id: 'wheat', name: 'Wheat', category: 'Cereal', season: 'Rabi',
    plantingMonths: [10, 11, 12], harvestMonths: [3, 4, 5], growthMonths: RABI_MONTHS,
    temperature: [10, 25], hotMax: 31, ph: [6, 7.8], textures: LOAMS,
    waterMm: 450, waterNeed: 'Moderate', droughtTolerant: false,
    fieldNote: 'Grain fill is sensitive to spring heat.', source: CROP_SOURCES.faoCalendar,
  },
  {
    id: 'rice', name: 'Rice', category: 'Cereal', season: 'Kharif',
    plantingMonths: [5, 6, 7], harvestMonths: [9, 10, 11, 12], growthMonths: [7, 8, 9, 10],
    temperature: [20, 35], hotMax: 37, ph: [5.5, 7.5], textures: HEAVIER,
    waterMm: 450, waterNeed: 'Very high', droughtTolerant: false, managedWater: true,
    fieldNote: 'Paddy systems need a dependable water supply and suitable field drainage.',
    source: CROP_SOURCES.faoCalendar,
  },
  {
    id: 'cotton', name: 'Cotton', category: 'Fibre crop', season: 'Kharif',
    plantingMonths: [4, 5, 6], harvestMonths: [9, 10, 11], growthMonths: [5, 6, 7, 8, 9, 10],
    temperature: [21, 37], hotMax: 42, ph: [5.5, 8], textures: LOAMS,
    waterMm: 700, waterNeed: 'High', droughtTolerant: true, wetSensitive: true,
    fieldNote: 'Check drainage and field access during the monsoon.', source: CROP_SOURCES.sbpCalendar,
  },
  {
    id: 'maize', name: 'Maize', category: 'Cereal', season: 'Kharif',
    plantingMonths: [6, 7], harvestMonths: [9, 10, 11], growthMonths: [7, 8, 9, 10],
    temperature: [18, 32], hotMax: 36, ph: [5.5, 7.5], textures: LOAMS,
    waterMm: 500, waterNeed: 'High', droughtTolerant: false,
    fieldNote: 'Tasselling and silking are sensitive to water shortages.', source: CROP_SOURCES.punjabCalendar,
  },
  {
    id: 'sugarcane', name: 'Sugarcane', category: 'Cash crop', season: 'Spring planted',
    plantingMonths: [2, 3], harvestMonths: [12, 1, 2], growthMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    temperature: [20, 38], hotMax: 41, ph: [5, 8], textures: LOAMS,
    waterMm: 1500, waterNeed: 'Very high', droughtTolerant: false, managedWater: true,
    fieldNote: 'Verify water availability over the long growing season.', source: CROP_SOURCES.punjabCalendar,
  },
  {
    id: 'millet', name: 'Pearl millet', category: 'Cereal', season: 'Kharif',
    plantingMonths: [6, 7, 8], harvestMonths: [10, 11], growthMonths: [7, 8, 9, 10],
    temperature: [23, 38], hotMax: 44, ph: [5, 8.3], textures: LIGHTER,
    waterMm: 450, waterNeed: 'Lower', droughtTolerant: true, wetSensitive: true,
    fieldNote: 'A drought-tolerant option for well-drained fields.', source: CROP_SOURCES.faoCalendar,
  },
  {
    id: 'sorghum', name: 'Sorghum', category: 'Cereal', season: 'Kharif',
    plantingMonths: [6, 7, 8], harvestMonths: [9, 10, 11], growthMonths: [7, 8, 9, 10],
    temperature: [23, 38], hotMax: 43, ph: [5.5, 8.5], textures: LOAMS,
    waterMm: 450, waterNeed: 'Lower', droughtTolerant: true, wetSensitive: true,
    fieldNote: 'A heat-tolerant option where establishment moisture is available.', source: CROP_SOURCES.faoCalendar,
  },
  {
    id: 'chickpea', name: 'Chickpea', category: 'Pulse', season: 'Rabi',
    plantingMonths: [10, 11], harvestMonths: [2, 3, 4], growthMonths: RABI_MONTHS,
    temperature: [10, 27], hotMax: 33, ph: [6, 8.1], textures: WELL_DRAINED,
    waterMm: 230, waterNeed: 'Lower', droughtTolerant: true, wetSensitive: true,
    fieldNote: 'Check moisture at flowering and avoid poorly drained plots.', source: CROP_SOURCES.punjabCalendar,
  },
  {
    id: 'lentil', name: 'Lentil', category: 'Pulse', season: 'Rabi',
    plantingMonths: [10, 11], harvestMonths: [3, 4], growthMonths: RABI_MONTHS,
    temperature: [10, 25], hotMax: 31, ph: [6, 8], textures: WELL_DRAINED,
    waterMm: 230, waterNeed: 'Lower', droughtTolerant: true, wetSensitive: true,
    fieldNote: 'Well-drained fields help limit stand loss from saturated soils.', source: CROP_SOURCES.pmdCalendar,
  },
  {
    id: 'sunflower', name: 'Sunflower', category: 'Oilseed', season: 'Spring',
    plantingMonths: [1, 2, 3], harvestMonths: [5, 6, 7], growthMonths: [2, 3, 4, 5, 6],
    temperature: [18, 33], hotMax: 39, ph: [6, 7.8], textures: LOAMS,
    waterMm: 600, waterNeed: 'High', droughtTolerant: true,
    fieldNote: 'Protect moisture from budding through seed fill.', source: CROP_SOURCES.sbpCalendar,
  },
  {
    id: 'potato', name: 'Potato', category: 'Vegetable', season: 'Spring',
    plantingMonths: [1, 2, 3], harvestMonths: [4, 5, 6], growthMonths: [2, 3, 4, 5],
    temperature: [10, 23], hotMax: 29, ph: [5, 6.8], textures: WELL_DRAINED,
    waterMm: 500, waterNeed: 'High', droughtTolerant: false, wetSensitive: true,
    fieldNote: 'Tuber development is sensitive to heat and inconsistent moisture.', source: CROP_SOURCES.faoCalendar,
  },
  {
    id: 'tomato', name: 'Tomato', category: 'Vegetable', season: 'Spring',
    plantingMonths: [2, 3], harvestMonths: [5, 6], growthMonths: [2, 3, 4, 5, 6],
    temperature: [18, 30], hotMax: 35, ph: [5.8, 7.2], textures: WELL_DRAINED,
    waterMm: 400, waterNeed: 'Moderate', droughtTolerant: false,
    fieldNote: 'Check flowering conditions and keep soil moisture consistent.', source: CROP_SOURCES.pmdCalendar,
  },
  {
    id: 'onion', name: 'Onion', category: 'Vegetable', season: 'Rabi',
    plantingMonths: [10, 11], harvestMonths: [3, 4, 5], growthMonths: RABI_MONTHS,
    temperature: [12, 29], hotMax: 34, ph: [6, 7.8], textures: WELL_DRAINED,
    waterMm: 350, waterNeed: 'Moderate', droughtTolerant: false,
    fieldNote: 'Check soil moisture while the bulb forms and drainage near harvest.', source: CROP_SOURCES.pmdCalendar,
  },
  {
    id: 'mustard', name: 'Mustard / canola', category: 'Oilseed', season: 'Rabi',
    plantingMonths: [9, 10, 11], harvestMonths: [3, 4], growthMonths: RABI_MONTHS,
    temperature: [10, 25], hotMax: 32, ph: [5.8, 8], textures: LOAMS,
    waterMm: 280, waterNeed: 'Lower', droughtTolerant: true,
    fieldNote: 'Check local flowering dates and late-season heat.', source: CROP_SOURCES.punjabCalendar,
  },
  {
    id: 'sesame', name: 'Sesame', category: 'Oilseed', season: 'Kharif',
    plantingMonths: [6, 7], harvestMonths: [10, 11], growthMonths: [7, 8, 9, 10],
    temperature: [24, 39], hotMax: 43, ph: [5.5, 8], textures: LIGHTER,
    waterMm: 300, waterNeed: 'Lower', droughtTolerant: true, wetSensitive: true,
    fieldNote: 'Choose free-draining fields and confirm the variety’s sowing window.', source: CROP_SOURCES.punjabCalendar,
  },
  {
    id: 'barley', name: 'Barley', category: 'Cereal', season: 'Rabi',
    plantingMonths: [10, 11], harvestMonths: [3, 4, 5], growthMonths: RABI_MONTHS,
    temperature: [8, 24], hotMax: 31, ph: [6, 8.5], textures: LOAMS,
    waterMm: 450, waterNeed: 'Moderate', droughtTolerant: true,
    fieldNote: 'Check cultivar, soil moisture at establishment and terminal heat.', source: CROP_SOURCES.faoCalendar,
  },
];
