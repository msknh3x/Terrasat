import { pointCoordinates, requestJson } from './http.js'

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const FIELDS = ['relative_humidity_2m', 'cloud_cover', 'temperature_2m', 'dew_point_2m']
const CACHE_AGE = 5 * 60 * 1000
const cache = new Map()

const temperature = (value) => Number.isFinite(value) ? value : null
const percentage = (value) => Number.isFinite(value) && value >= 0 && value <= 100 ? value : null

function readAtmosphere(payload) {
  const current = payload?.current
  const time = current?.time
  const measurements = {
    humidity: percentage(current?.relative_humidity_2m),
    cloudCover: percentage(current?.cloud_cover),
    airTemperature: temperature(current?.temperature_2m),
    dewPoint: temperature(current?.dew_point_2m),
  }

  if (!Number.isSafeInteger(time) || time <= 0 || time > 8.64e12 || Object.values(measurements).every((value) => value === null)) {
    throw new Error('Current weather measurements are unavailable.')
  }

  return { ...measurements, validAt: time * 1000, timeZone: payload.timezone }
}

export async function fetchAtmosphere(lat, lon, { signal } = {}) {
  signal?.throwIfAborted()
  const [latitude, longitude] = pointCoordinates(lat, lon)
  const key = `${latitude},${longitude}`
  const cached = cache.get(key)

  if (cached && Date.now() < cached.expiresAt) return cached.data

  const params = new URLSearchParams({
    latitude, longitude, current: FIELDS.join(','), timezone: 'auto', timeformat: 'unixtime',
  })
  const response = await requestJson(`${ENDPOINT}?${params}`, { signal, timeout: 9000 })
  const data = readAtmosphere(response)

  if (cache.size >= 32) cache.delete(cache.keys().next().value)
  cache.set(key, { data, expiresAt: Date.now() + CACHE_AGE })
  return data
}
