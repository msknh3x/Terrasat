import { pointCoordinates, requestJson } from './http.js'

const ENDPOINT = 'https://rest.isric.org/soilgrids/v2.0/properties/query'
export const SOIL_PROPERTIES = {
  phh2o: ['ph', 10],
  soc: ['organicCarbon', 10],
  clay: ['clay', 10],
  sand: ['sand', 10],
  silt: ['silt', 10],
  nitrogen: ['nitrogen', 100],
}
const DEPTHS = { '0-5cm': 5, '5-15cm': 10 }
const cache = new Map()

export function soilTexture({ sand, silt, clay }) {
  if (![sand, silt, clay].every((value) => Number.isFinite(value) && value >= 0)) return null
  const total = sand + silt + clay
  if (total === 0) return null
  const s = 100 * sand / total
  const l = 100 * silt / total
  const c = 100 * clay / total
  if (l + 1.5 * c < 15) return 'Sand'
  if (l + 2 * c < 30) return 'Loamy Sand'
  if ((c >= 7 && c < 20 && s > 52 && l + 2 * c >= 30) || (c < 7 && l < 50 && l + 2 * c >= 30)) return 'Sandy Loam'
  if (c >= 7 && c < 27 && l >= 28 && l < 50 && s <= 52) return 'Loam'
  if ((l >= 50 && c >= 12 && c < 27) || (l >= 50 && l < 80 && c < 12)) return 'Silt Loam'
  if (l >= 80 && c < 12) return 'Silt'
  if (c >= 20 && c < 35 && l < 28 && s > 45) return 'Sandy Clay Loam'
  if (c >= 27 && c < 40 && s > 20 && s <= 45) return 'Clay Loam'
  if (c >= 27 && c < 40 && s <= 20) return 'Silty Clay Loam'
  if (c >= 35 && s > 45) return 'Sandy Clay'
  if (c >= 40 && l >= 40) return 'Silty Clay'
  if (c >= 40 && s <= 45 && l < 40) return 'Clay'
  return 'Loam'
}

function fertilityIndicator(organicCarbon, nitrogen) {
  if (organicCarbon === null || nitrogen === null) return null
  if (organicCarbon < 8 || nitrogen < 0.6) return 'Low'
  if (organicCarbon < 16 || nitrogen < 1.2) return 'Moderate'
  if (organicCarbon < 25 || nitrogen < 2) return 'High'
  return 'Very High'
}

export function normalizeSoilResponse(payload, mode = 'live', point) {
  const layers = payload?.properties?.layers
  if (!Array.isArray(layers)) return null

  const data = {}
  const mappedDepths = new Set()
  for (const [layerName, [field, scale]] of Object.entries(SOIL_PROPERTIES)) {
    const layer = layers.find(({ name }) => name === layerName)
    const depths = (layer?.depths ?? []).flatMap((depth) => {
      const raw = depth.values?.mean
      const thickness = DEPTHS[depth.label]
      if (!thickness || !Number.isFinite(raw) || raw < 0 || (layerName === 'phh2o' && (raw <= 0 || raw > 140))) return []
      return [{ label: depth.label, raw, thickness }]
    })
    const thickness = depths.reduce((total, depth) => total + depth.thickness, 0)
    data[field] = thickness
      ? depths.reduce((total, depth) => total + depth.raw * depth.thickness, 0) / (thickness * scale)
      : null
    depths.forEach(({ label }) => mappedDepths.add(label))
  }

  if (Object.values(data).every((value) => value === null)) return null
  const texture = soilTexture(data)
  const fertility = fertilityIndicator(data.organicCarbon, data.nitrogen)
  return {
    ...data,
    texture,
    fertility,
    depth: mappedDepths.size === 2 ? '0–15 cm' : (mappedDepths.has('0-5cm') ? '0–5 cm' : '5–15 cm'),
    source: 'soilgrids',
    mode,
    point,
  }
}

export async function fetchSoilData(lat, lon, { signal } = {}) {
  signal?.throwIfAborted()
  const [latitude, longitude] = pointCoordinates(lat, lon)
  const url = new URL(ENDPOINT)
  url.search = new URLSearchParams({ lat: latitude, lon: longitude, value: 'mean' })
  for (const property of Object.keys(SOIL_PROPERTIES)) url.searchParams.append('property', property)
  for (const depth of Object.keys(DEPTHS)) url.searchParams.append('depth', depth)

  const key = url.toString()
  if (cache.has(key)) return cache.get(key)
  try {
    const raw = await requestJson(url, { signal, timeout: 12000 })
    const result = normalizeSoilResponse(raw, 'live', { lat: latitude, lon: longitude })
    if (cache.size >= 20) cache.delete(cache.keys().next().value)
    cache.set(key, result)
    return result
  } catch (error) {
    if (signal?.aborted) throw error
    if (
      error?.status === 404 ||
      error instanceof SyntaxError ||
      error?.name === 'SyntaxError' ||
      error?.message?.includes('JSON') ||
      error?.message?.includes('404')
    ) {
      return null
    }
    throw error
  }
}
