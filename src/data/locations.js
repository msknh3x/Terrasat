export const LOCATIONS = [
  { id: 'peshawar', name: 'Peshawar', region: 'Khyber Pakhtunkhwa', lat: 34.01, lon: 71.52, aliases: ['peshāwar'] },
  { id: 'multan', name: 'Multan', region: 'Punjab', lat: 30.1575, lon: 71.5249, aliases: ['multān'] },
  { id: 'faisalabad', name: 'Faisalabad', region: 'Punjab', lat: 31.4504, lon: 73.135, aliases: ['lyallpur'] },
  { id: 'lahore', name: 'Lahore', region: 'Punjab', lat: 31.5204, lon: 74.3587, aliases: ['lahor'] },
  { id: 'sukkur', name: 'Sukkur', region: 'Sindh', lat: 27.7052, lon: 68.8574, aliases: ['sindh', 'sind'] },
  { id: 'islamabad', name: 'Islamabad', region: 'Islamabad Capital Territory', lat: 33.6844, lon: 73.0479, aliases: [] },
].map((location) => ({ ...location, country: 'Pakistan', countryCode: 'pk' }))

export const DEFAULT_LOCATION = LOCATIONS[0]

const PAKISTAN_QUALIFIERS = ['pakistan', 'pk', 'pak']

export function normalizeLocationQuery(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'")
    .toLowerCase().replace(/[,\s]+/g, ' ').trim()
}

function cityTerms(location) {
  return [location.name, ...location.aliases].map(normalizeLocationQuery)
}

function qualifiedCityTerms(location) {
  const region = normalizeLocationQuery(location.region)
  return cityTerms(location).flatMap((city) => [
    city,
    `${city} ${region}`,
    ...PAKISTAN_QUALIFIERS.flatMap((country) => [
      `${city} ${country}`,
      `${city} ${region} ${country}`,
      `${city} ${country} ${region}`,
    ]),
  ])
}

export function findLocalLocation(query) {
  const normalized = normalizeLocationQuery(query)
  return LOCATIONS.find((location) => qualifiedCityTerms(location).includes(normalized)) ?? null
}

export function searchLocalLocations(query) {
  const normalized = normalizeLocationQuery(query)
  if (!normalized) return LOCATIONS
  return LOCATIONS.filter((location) => (
    [...qualifiedCityTerms(location), normalizeLocationQuery(location.region), normalizeLocationQuery(location.country)]
      .some((term) => term.startsWith(normalized))
  ))
}
