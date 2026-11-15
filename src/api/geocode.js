import {
  COUNTRIES,
  COUNTRY_ALIASES,
  findCountry,
  findLocalLocation,
  getCitiesForCountry,
  LOCATIONS,
  normalizeLocationQuery,
  searchLocalLocations,
} from '../data/locations.js'
import { pointCoordinates, requestJson } from './http.js'

const ENDPOINT = 'https://nominatim.openstreetmap.org'
const cache = new Map()
let previousRequest = Promise.resolve()
let lastRequestTime = 0
let gazetteerPromise = null

const DISALLOWED_CATEGORIES = new Set([
  'shop', 'amenity', 'tourism', 'leisure', 'highway', 'building',
  'office', 'craft', 'historic', 'commercial', 'industrial',
  'emergency', 'man_made', 'railway', 'aeroway', 'club', 'healthcare',
  'landuse', 'natural', 'waterway', 'place_of_worship',
])

const ALLOWED_PLACE_TYPES = new Set([
  'country', 'state', 'province', 'region', 'county', 'district',
  'municipality', 'city', 'town', 'village', 'hamlet', 'suburb', 'locality',
  'island', 'islands', 'administrative',
])

export function isAllowedPlace(result) {
  if (!result) return false
  const category = String(result.category || result.class || '').toLowerCase().trim()
  const type = String(result.type || '').toLowerCase().trim()
  const addressType = String(result.addresstype || '').toLowerCase().trim()

  if (DISALLOWED_CATEGORIES.has(category) || DISALLOWED_CATEGORIES.has(type) || DISALLOWED_CATEGORIES.has(addressType)) {
    return false
  }
  if (category === 'highway' || type === 'road' || addressType === 'road' || addressType === 'house' || addressType === 'postcode' || addressType === 'street') {
    return false
  }
  if (category === 'place' && ALLOWED_PLACE_TYPES.has(type)) {
    return true
  }
  if (category === 'boundary' && type === 'administrative') {
    return true
  }
  if ((category === 'place' || category === 'boundary') && ALLOWED_PLACE_TYPES.has(addressType)) {
    return true
  }
  return false
}

export function parsePlace(result) {
  if (!result || !isAllowedPlace(result)) return null
  const address = result.address ?? {}
  if (result.lat == null || result.lon == null) return null
  const lat = Number(result.lat)
  const lon = Number(result.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const addressType = (result.addresstype || '').toLowerCase()
  const isCountry = addressType === 'country' || result.type === 'country'

  const specificType = address[addressType]
  let rawName = isCountry
    ? (address.country || result.name || '')
    : (specificType || result.name || address.city || address.town || address.village || address.municipality || address.county || result.display_name?.split(',')[0] || '')

  rawName = rawName.trim().replace(/\s+(?:CP|civil parish)$/i, '')

  const country = address.country?.trim() || ''
  const countryCode = (address.country_code || '').toLowerCase().trim()
  const region = (address.state || address.region || address.county || '').trim()

  const aliases = COUNTRY_ALIASES[countryCode] || []

  return {
    id: result.place_id ? `osm-${result.place_id}` : `point-${lat}-${lon}`,
    name: rawName || 'Selected field',
    region: isCountry ? '' : region,
    country,
    countryCode,
    aliases,
    type: isCountry ? 'country' : (addressType || result.type || 'city'),
    isCountry,
    lat,
    lon,
  }
}

export function placeMatchesQuery(place, query, { partial = false } = {}) {
  const nq = normalizeLocationQuery(query)
  if (!nq) return true
  const name = normalizeLocationQuery(place.name)
  const aliases = (place.aliases || []).map(normalizeLocationQuery)
  const region = normalizeLocationQuery(place.region)
  const country = normalizeLocationQuery(place.country)
  const countryCode = normalizeLocationQuery(place.countryCode)
  const mappedAliases = (COUNTRY_ALIASES[countryCode] || []).map(normalizeLocationQuery)

  const allNames = [name, ...aliases]
  const allTerms = [name, ...aliases, region, country, countryCode, ...mappedAliases].filter(Boolean)
  const fullLabel = normalizeLocationQuery([place.name, place.region, place.country].filter(Boolean).join(' '))

  if (allNames.some((n) => n === nq || (partial && n.startsWith(nq)))) return true
  if (fullLabel === nq || (partial && fullLabel.startsWith(nq))) return true

  const tokens = nq.split(' ').filter(Boolean)
  const firstToken = tokens[0]
  const matchesName = allNames.some((n) => n === firstToken || n.startsWith(firstToken) || n.includes(firstToken))
  if (!matchesName && tokens.length > 1) {
    const firstTwo = tokens.slice(0, 2).join(' ')
    const matchesTwo = allNames.some((n) => n === firstTwo || n.startsWith(firstTwo))
    if (!matchesTwo) return false
  } else if (!matchesName && tokens.length === 1) {
    return false
  }

  return tokens.every((token) => allTerms.some((term) => term.includes(token)))
}

function loadGazetteer() {
  if (!gazetteerPromise) {
    gazetteerPromise = import('../data/cityGazetteer.json', { with: { type: 'json' } })
      .then((m) => m?.default || null)
      .catch(() => null)
  }
  return gazetteerPromise
}

function gazetteerRowToPlace(row, gazetteer) {
  const [id, name, lat, lon, countryCode, region] = row
  return {
    id: `geonames-${id}`,
    name,
    lat,
    lon,
    region,
    countryCode,
    country: gazetteer.countries[countryCode] || '',
    type: 'city',
    isCountry: false,
    aliases: [],
  }
}

async function lookupOfflineCity(query) {
  const gazetteer = await loadGazetteer()
  const key = normalizeLocationQuery(query)
  if (!gazetteer || !Object.hasOwn(gazetteer.lookup, key)) return null
  return gazetteerRowToPlace(gazetteer.rows[gazetteer.lookup[key]], gazetteer)
}

export async function searchOfflineCities(query, { limit = 8, countryCode } = {}) {
  const gazetteer = await loadGazetteer()
  if (!gazetteer) return []
  const nq = normalizeLocationQuery(query)
  if (!nq) return []

  const matched = []
  const seen = new Set()
  const cc = countryCode ? countryCode.toLowerCase() : null

  if (Object.hasOwn(gazetteer.lookup, nq)) {
    const idx = gazetteer.lookup[nq]
    const row = gazetteer.rows[idx]
    if (!cc || row[4] === cc) {
      seen.add(idx)
      matched.push(gazetteerRowToPlace(row, gazetteer))
    }
  }

  for (const [key, rowIndex] of Object.entries(gazetteer.lookup)) {
    if (seen.has(rowIndex)) continue
    if (key.startsWith(nq)) {
      const row = gazetteer.rows[rowIndex]
      if (!cc || row[4] === cc) {
        seen.add(rowIndex)
        matched.push(gazetteerRowToPlace(row, gazetteer))
        if (matched.length >= limit) break
      }
    }
  }

  return matched
}

async function queryNominatim(path, params, signal) {
  const url = new URL(path, ENDPOINT)
  url.search = new URLSearchParams({ format: 'jsonv2', addressdetails: 1, 'accept-language': 'en', ...params })
  const key = url.toString()
  if (cache.has(key)) return cache.get(key)

  const request = previousRequest.catch(() => {}).then(async () => {
    const delay = Math.max(0, 1100 - (Date.now() - lastRequestTime))
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    signal?.throwIfAborted()
    if (cache.has(key)) return cache.get(key)
    lastRequestTime = Date.now()
    const headers = typeof window === 'undefined'
      ? { 'User-Agent': 'FieldShift/1.0 (Farm Climate Observatory; https://github.com/HamzaTaif/FieldShift)' }
      : undefined
    const data = await requestJson(url, { signal, referrerPolicy: 'origin', timeout: 9000, headers })
    if (cache.size >= 100) cache.delete(cache.keys().next().value)
    cache.set(key, data)
    return data
  })
  previousRequest = request
  return request
}

export async function searchPlaces(query, { signal, limit = 8, countryCode } = {}) {
  const q = String(query || '').trim()
  if (!q) {
    if (countryCode) {
      const gaz = await loadGazetteer()
      return getCitiesForCountry(countryCode, gaz, limit)
    }
    return LOCATIONS.slice(0, limit)
  }

  const results = []
  const seen = new Set()

  function add(place) {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return
    const key = normalizeLocationQuery(`${place.name} ${place.region || ''} ${place.country || ''}`)
    if (seen.has(key)) return
    seen.add(key)
    results.push(place)
  }

  // 1. Search local featured locations
  const localMatches = searchLocalLocations(q, { countryCode })
  for (const item of localMatches) add(item)

  // 2. Check country matches
  if (!countryCode) {
    const country = findCountry(q)
    if (country) add(country)
  }

  // 3. Check offline gazetteer
  const offlineMatches = await searchOfflineCities(q, { limit, countryCode })
  for (const item of offlineMatches) add(item)

  // 4. Query Nominatim for small towns / worldwide places missing from local index
  if (results.length < limit) {
    try {
      const remote = await queryNominatim('/search', { q, limit: 10 }, signal)
      if (Array.isArray(remote)) {
        for (const item of remote) {
          if (!isAllowedPlace(item)) continue
          const parsed = parsePlace(item)
          if (!parsed) continue
          if (countryCode && parsed.countryCode !== countryCode.toLowerCase()) continue
          if (placeMatchesQuery(parsed, q, { partial: true })) {
            add(parsed)
            if (results.length >= limit) break
          }
        }
      }
    } catch {
      // Ignore network errors or aborted signals in autocomplete
    }
  }

  return results.slice(0, limit)
}

export async function geocodeCity(query, { signal, countryCode } = {}) {
  signal?.throwIfAborted()
  const q = String(query || '').trim()
  if (!q) return null

  // 1. Featured local location
  const featured = findLocalLocation(q)
  if (featured && (!countryCode || featured.countryCode === countryCode.toLowerCase())) {
    return featured
  }

  // 2. Lat, lon coordinate pair
  const pair = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (pair) {
    const [lat, lon] = pointCoordinates(Number(pair[1]), Number(pair[2]))
    const fallback = { id: `point-${lat}-${lon}`, name: 'Selected field', region: '', country: '', countryCode: '', lat, lon, type: 'coordinates' }
    try {
      return (await reverseGeocode(lat, lon, { signal })) ?? fallback
    } catch {
      signal?.throwIfAborted()
      return fallback
    }
  }

  // 3. Country lookup
  if (!countryCode) {
    const country = findCountry(q)
    if (country) return country
  }

  // 4. Offline city lookup
  const offline = await lookupOfflineCity(q)
  if (offline && (!countryCode || offline.countryCode === countryCode.toLowerCase())) {
    return offline
  }

  // 5. Nominatim lookup
  let rawResults = []
  try {
    rawResults = await queryNominatim('/search', { q, limit: 10 }, signal)
  } catch {
    return null
  }
  signal?.throwIfAborted()
  if (!Array.isArray(rawResults) || !rawResults.length) return null

  const allowedPlaces = rawResults
    .filter(isAllowedPlace)
    .map(parsePlace)
    .filter(Boolean)
    .filter((place) => {
      if (countryCode && place.countryCode !== countryCode.toLowerCase()) return false
      return placeMatchesQuery(place, q, { partial: false })
    })

  if (!allowedPlaces.length) return null

  // Ambiguity check for places sharing the same name
  const firstName = allowedPlaces[0].name.toLowerCase()
  const sameNameCount = allowedPlaces.filter((p) => p.name.toLowerCase() === firstName).length
  const nq = normalizeLocationQuery(q)
  const isQualified = nq.includes(',') || nq.split(' ').length > firstName.split(' ').length

  if (sameNameCount > 1 && !isQualified) {
    return {
      ambiguous: true,
      name: allowedPlaces[0].name,
      choices: allowedPlaces,
    }
  }

  return allowedPlaces[0]
}

export async function reverseGeocode(lat, lon, { signal } = {}) {
  const [latitude, longitude] = pointCoordinates(lat, lon)
  const featured = LOCATIONS.find((location) => location.lat === latitude && location.lon === longitude)
  if (featured) return featured

  const result = await queryNominatim('/reverse', { lat: latitude, lon: longitude, zoom: 10 }, signal)
  if (!result || !isAllowedPlace(result)) return null
  const place = parsePlace(result)
  if (!place) return null

  const address = result.address ?? {}
  const name = address.city || address.town || address.village || address.municipality || place.name
  return { ...place, name, lat: latitude, lon: longitude }
}
