export const LOCATIONS = [
  { id: 'peshawar', name: 'Peshawar', region: 'Khyber Pakhtunkhwa', lat: 34.01, lon: 71.52, aliases: ['peshāwar'] },
  { id: 'multan', name: 'Multan', region: 'Punjab', lat: 30.1575, lon: 71.5249, aliases: ['multān'] },
  { id: 'faisalabad', name: 'Faisalabad', region: 'Punjab', lat: 31.4504, lon: 73.135, aliases: ['lyallpur'] },
  { id: 'lahore', name: 'Lahore', region: 'Punjab', lat: 31.5204, lon: 74.3587, aliases: ['lahor'] },
  { id: 'sukkur', name: 'Sukkur', region: 'Sindh', lat: 27.7052, lon: 68.8574, aliases: ['sindh', 'sind'] },
  { id: 'islamabad', name: 'Islamabad', region: 'Islamabad Capital Territory', lat: 33.6844, lon: 73.0479, aliases: [] },
].map((location) => ({ ...location, country: 'Pakistan', countryCode: 'pk' }))

export const DEFAULT_LOCATION = LOCATIONS[0]

function normalize(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
}

function cityTerms(location) {
  return [location.name, ...location.aliases].map(normalize)
}

export function findLocalLocation(query) {
  const [city, ...area] = normalize(query).split(',').map((term) => term.trim())
  return LOCATIONS.find((location) => (
    cityTerms(location).includes(city)
    && area.every((term) => [location.country, location.region].map(normalize).includes(term))
  )) ?? null
}

export function searchLocalLocations(query) {
  const normalized = normalize(query)
  if (!normalized) return LOCATIONS
  return LOCATIONS.filter((location) => (
    [...cityTerms(location), normalize(location.region), normalize(location.country)]
      .some((term) => term.startsWith(normalized))
  ))
}
