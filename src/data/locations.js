export const LOCATIONS = [
  { id: 'peshawar', name: 'Peshawar', region: 'Khyber Pakhtunkhwa', lat: 34.01, lon: 71.52, aliases: ['peshāwar'], type: 'city' },
  { id: 'multan', name: 'Multan', region: 'Punjab', lat: 30.1575, lon: 71.5249, aliases: ['multān'], type: 'city' },
  { id: 'faisalabad', name: 'Faisalabad', region: 'Punjab', lat: 31.4504, lon: 73.135, aliases: ['lyallpur'], type: 'city' },
  { id: 'lahore', name: 'Lahore', region: 'Punjab', lat: 31.5204, lon: 74.3587, aliases: ['lahor'], type: 'city' },
  { id: 'sukkur', name: 'Sukkur', region: 'Sindh', lat: 27.7052, lon: 68.8574, aliases: ['sindh', 'sind'], type: 'city' },
  { id: 'islamabad', name: 'Islamabad', region: 'Islamabad Capital Territory', lat: 33.6844, lon: 73.0479, aliases: [], type: 'city' },
].map((location) => ({ ...location, country: 'Pakistan', countryCode: 'pk' }))

export const DEFAULT_LOCATION = LOCATIONS[0]

export const COUNTRY_ALIASES = {
  gb: ['uk', 'united kingdom', 'great britain', 'britain', 'england', 'scotland', 'wales'],
  us: ['usa', 'united states', 'united states of america', 'america'],
  pk: ['pakistan', 'pak', 'پاکستان'],
  ae: ['uae', 'united arab emirates'],
  br: ['brazil', 'brasil'],
  de: ['germany', 'deutschland'],
  fr: ['france'],
  in: ['india', 'bharat'],
  cn: ['china', 'prc'],
  ru: ['russia', 'russian federation'],
  ca: ['canada'],
  au: ['australia'],
  tr: ['turkey', 'turkiye', 'türkiye'],
  sa: ['saudi arabia', 'ksa'],
  eg: ['egypt', 'misr'],
  mx: ['mexico', 'méxico'],
  jp: ['japan', 'nippon', 'nihon'],
  id: ['indonesia'],
}

export const COUNTRIES = [
  { id: 'country-pk', name: 'Pakistan', country: 'Pakistan', countryCode: 'pk', isCountry: true, type: 'country', lat: 30.3753, lon: 69.3451, aliases: ['pak', 'پاکستان'] },
  { id: 'country-us', name: 'United States', country: 'United States', countryCode: 'us', isCountry: true, type: 'country', lat: 37.0902, lon: -95.7129, aliases: ['usa', 'united states of america', 'america'] },
  { id: 'country-gb', name: 'United Kingdom', country: 'United Kingdom', countryCode: 'gb', isCountry: true, type: 'country', lat: 55.3781, lon: -3.436, aliases: ['uk', 'great britain', 'britain', 'england', 'scotland', 'wales'] },
  { id: 'country-br', name: 'Brazil', country: 'Brazil', countryCode: 'br', isCountry: true, type: 'country', lat: -14.235, lon: -51.9253, aliases: ['brasil'] },
  { id: 'country-in', name: 'India', country: 'India', countryCode: 'in', isCountry: true, type: 'country', lat: 20.5937, lon: 78.9629, aliases: ['bharat'] },
  { id: 'country-cn', name: 'China', country: 'China', countryCode: 'cn', isCountry: true, type: 'country', lat: 35.8617, lon: 104.1954, aliases: ['prc'] },
  { id: 'country-ca', name: 'Canada', country: 'Canada', countryCode: 'ca', isCountry: true, type: 'country', lat: 56.1304, lon: -106.3468, aliases: [] },
  { id: 'country-au', name: 'Australia', country: 'Australia', countryCode: 'au', isCountry: true, type: 'country', lat: -25.2744, lon: 133.7751, aliases: [] },
  { id: 'country-de', name: 'Germany', country: 'Germany', countryCode: 'de', isCountry: true, type: 'country', lat: 51.1657, lon: 10.4515, aliases: ['deutschland'] },
  { id: 'country-fr', name: 'France', country: 'France', countryCode: 'fr', isCountry: true, type: 'country', lat: 46.2276, lon: 2.2137, aliases: [] },
  { id: 'country-tr', name: 'Turkey', country: 'Turkey', countryCode: 'tr', isCountry: true, type: 'country', lat: 38.9637, lon: 35.2433, aliases: ['türkiye', 'turkiye'] },
  { id: 'country-eg', name: 'Egypt', country: 'Egypt', countryCode: 'eg', isCountry: true, type: 'country', lat: 26.8206, lon: 30.8025, aliases: ['misr'] },
  { id: 'country-sa', name: 'Saudi Arabia', country: 'Saudi Arabia', countryCode: 'sa', isCountry: true, type: 'country', lat: 23.8859, lon: 45.0792, aliases: ['ksa'] },
  { id: 'country-ae', name: 'United Arab Emirates', country: 'United Arab Emirates', countryCode: 'ae', isCountry: true, type: 'country', lat: 23.4241, lon: 53.8478, aliases: ['uae'] },
  { id: 'country-bd', name: 'Bangladesh', country: 'Bangladesh', countryCode: 'bd', isCountry: true, type: 'country', lat: 23.685, lon: 90.3563, aliases: [] },
  { id: 'country-ng', name: 'Nigeria', country: 'Nigeria', countryCode: 'ng', isCountry: true, type: 'country', lat: 9.082, lon: 8.6753, aliases: [] },
  { id: 'country-ke', name: 'Kenya', country: 'Kenya', countryCode: 'ke', isCountry: true, type: 'country', lat: -0.0236, lon: 37.9062, aliases: [] },
  { id: 'country-za', name: 'South Africa', country: 'South Africa', countryCode: 'za', isCountry: true, type: 'country', lat: -30.5595, lon: 22.9375, aliases: ['rsa'] },
  { id: 'country-mx', name: 'Mexico', country: 'Mexico', countryCode: 'mx', isCountry: true, type: 'country', lat: 23.6345, lon: -102.5528, aliases: ['méxico'] },
  { id: 'country-ar', name: 'Argentina', country: 'Argentina', countryCode: 'ar', isCountry: true, type: 'country', lat: -38.4161, lon: -63.6167, aliases: [] },
  { id: 'country-jp', name: 'Japan', country: 'Japan', countryCode: 'jp', isCountry: true, type: 'country', lat: 36.2048, lon: 138.2529, aliases: ['nippon', 'nihon'] },
  { id: 'country-id', name: 'Indonesia', country: 'Indonesia', countryCode: 'id', isCountry: true, type: 'country', lat: -0.7893, lon: 113.9213, aliases: [] },
]

export function normalizeLocationQuery(value) {
  if (!value) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´']/g, "'")
    .toLowerCase()
    .replace(/[,\s]+/g, ' ')
    .trim()
}

function cityTerms(location) {
  return [location.name, ...(location.aliases || [])].map(normalizeLocationQuery)
}

function qualifiedCityTerms(location) {
  const region = normalizeLocationQuery(location.region)
  const country = normalizeLocationQuery(location.country)
  const qualifiers = COUNTRY_ALIASES[location.countryCode] || [country]
  return cityTerms(location).flatMap((city) => [
    city,
    `${city} ${region}`,
    ...qualifiers.flatMap((q) => [
      `${city} ${q}`,
      `${city} ${region} ${q}`,
      `${city} ${q} ${region}`,
    ]),
  ])
}

export function findLocalLocation(query) {
  const normalized = normalizeLocationQuery(query)
  if (!normalized) return null
  return LOCATIONS.find((location) => qualifiedCityTerms(location).includes(normalized)) ?? null
}

export function findCountry(query) {
  const normalized = normalizeLocationQuery(query)
  if (!normalized) return null
  return COUNTRIES.find((c) => {
    if (normalizeLocationQuery(c.name) === normalized) return true
    if (normalizeLocationQuery(c.countryCode) === normalized) return true
    return (c.aliases || []).some((a) => normalizeLocationQuery(a) === normalized)
  }) ?? null
}

export function searchLocalLocations(query, { countryCode } = {}) {
  const normalized = normalizeLocationQuery(query)
  let list = LOCATIONS
  if (countryCode) {
    list = list.filter((l) => l.countryCode === countryCode.toLowerCase())
  }
  if (!normalized) return list
  return list.filter((location) => (
    [...qualifiedCityTerms(location), normalizeLocationQuery(location.region), normalizeLocationQuery(location.country)]
      .some((term) => term.startsWith(normalized) || term.includes(normalized))
  ))
}

export function getCitiesForCountry(countryCode, gazetteer = null, limit = 5) {
  const cc = (countryCode || '').toLowerCase()
  if (cc === 'pk') {
    return LOCATIONS.slice(0, limit)
  }
  if (!gazetteer?.rows) return []
  return gazetteer.rows
    .filter((r) => r[4] === cc)
    .slice(0, limit)
    .map(([id, name, lat, lon, code, region]) => ({
      id: `geonames-${id}`,
      name,
      lat,
      lon,
      region,
      countryCode: code,
      country: gazetteer.countries[code] || '',
      type: 'city',
    }))
}
