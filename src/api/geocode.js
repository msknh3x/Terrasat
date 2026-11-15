import { findLocalLocation, LOCATIONS } from '../data/locations.js'
import { pointCoordinates, requestJson } from './http.js'

const ENDPOINT = 'https://nominatim.openstreetmap.org'
const cache = new Map()
let previousRequest = Promise.resolve()
let lastRequestTime = 0

function parsePlace(result) {
  const address = result.address ?? {}
  if (result.lat == null || result.lon == null) return null
  const lat = Number(result.lat)
  const lon = Number(result.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return {
    id: result.place_id ? `osm-${result.place_id}` : `point-${lat}-${lon}`,
    name: result.name?.trim() || address.city || address.town || address.village || address.county || result.display_name?.split(',')[0]?.trim() || 'Selected field',
    region: address.state || address.region || address.county || '',
    country: address.country || '',
    countryCode: address.country_code || '',
    lat,
    lon,
  }
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
    const data = await requestJson(url, { signal, referrerPolicy: 'origin', timeout: 9000 })
    if (cache.size >= 100) cache.delete(cache.keys().next().value)
    cache.set(key, data)
    return data
  })
  previousRequest = request
  return request
}

export async function geocodeCity(query, { signal } = {}) {
  const q = query.trim()
  if (!q) return null
  const featured = findLocalLocation(q)
  if (featured) return featured

  const pair = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (pair) {
    const [lat, lon] = pointCoordinates(Number(pair[1]), Number(pair[2]))
    const fallback = { id: `point-${lat}-${lon}`, name: 'Selected field', region: '', country: '', countryCode: '', lat, lon }
    try {
      return (await reverseGeocode(lat, lon, { signal })) ?? fallback
    } catch {
      signal?.throwIfAborted()
      return fallback
    }
  }
  const results = await queryNominatim('/search', { q, limit: 1 }, signal)
  return results[0] ? parsePlace(results[0]) : null
}

export async function reverseGeocode(lat, lon, { signal } = {}) {
  const [latitude, longitude] = pointCoordinates(lat, lon)
  const featured = LOCATIONS.find((location) => location.lat === latitude && location.lon === longitude)
  if (featured) return featured

  const result = await queryNominatim('/reverse', { lat: latitude, lon: longitude, zoom: 10 }, signal)
  const place = parsePlace(result)
  if (!place) return null
  const address = result.address ?? {}
  const name = address.city || address.town || address.village || address.municipality || place.name
  return { ...place, name, lat: latitude, lon: longitude }
}
