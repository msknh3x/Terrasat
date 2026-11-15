import { pointCoordinates, requestJson } from './http.js'

const ENDPOINT = 'https://power.larc.nasa.gov/api/temporal/monthly/point'
export const PARAMETERS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'RH2M', 'ALLSKY_SFC_SW_DWN', 'WS2M']
const REQUEST_PARAMETERS = [...PARAMETERS, 'T2M_MAX_AVG']
export const START_YEAR = 2001
export const END_YEAR = 2025

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)
const RAIN = 'PRECTOTCORR'
const SOLAR = 'ALLSKY_SFC_SW_DWN'
const cache = new Map()

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

export function makePowerUrl(lat, lon, startYear = START_YEAR, endYear = END_YEAR) {
  const [latitude, longitude] = pointCoordinates(lat, lon)
  const apiKey = import.meta.env.VITE_NASA_API_KEY || 'wQWRPh6BPJHRdLpWdBgJdLLHPQH9rrLrqgkcghpF'
  const url = new URL(ENDPOINT)
  url.search = new URLSearchParams({
    parameters: REQUEST_PARAMETERS.join(','),
    community: 'AG',
    latitude,
    longitude,
    start: startYear,
    end: endYear,
    format: 'JSON',
    api_key: apiKey,
  })
  return url
}

function yearValue(parameter, months) {
  const values = months.map(({ value }) => value)
  if (parameter === 'T2M_MAX') return Math.max(...values)
  if (parameter === 'T2M_MIN') return Math.min(...values)
  if (parameter === RAIN) return values.reduce((total, value) => total + value, 0)
  const days = months.reduce((total, month) => total + month.days, 0)
  return months.reduce((total, month) => total + month.value * month.days, 0) / days
}

export function normalizePowerResponse(payload, mode = 'live') {
  const raw = payload.properties?.parameter
  if (!raw) throw new Error('NASA POWER did not return climate history for this location.')

  const missing = payload.header?.fill_value ?? -999
  const startYear = Number(payload.header?.start?.slice(0, 4)) || START_YEAR
  const endYear = Number(payload.header?.end?.slice(0, 4)) || END_YEAR
  const solarMJ = /^MJ\b/i.test(payload.parameters?.[SOLAR]?.units ?? 'MJ')
  const rainRate = !payload.parameters?.[RAIN]?.units || /(?:\/day|day\s*[-^]?1)/i.test(payload.parameters[RAIN].units)
  const yearly = {}
  const monthly = {}
  const normals = {}

  for (const parameter of REQUEST_PARAMETERS) {
    yearly[parameter] = {}
    monthly[parameter] = {}
    const byMonth = MONTHS.map(() => [])

    for (let year = startYear; year <= endYear; year += 1) {
      const months = []
      for (const month of MONTHS) {
        const key = `${year}${String(month).padStart(2, '0')}`
        const datum = raw[parameter]?.[key]
        if (!Number.isFinite(datum) || datum === missing || datum <= -999) continue
        const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
        let value = datum
        if (parameter === RAIN && rainRate) value *= days
        if (parameter === SOLAR && solarMJ) value /= 3.6

        monthly[parameter][key] = value
        months.push({ value, days })
      }

      if (months.length === MONTHS.length) {
        yearly[parameter][year] = yearValue(parameter, months)
        months.forEach(({ value }, index) => byMonth[index].push(value))
      }
    }

    normals[parameter] = byMonth.map(average)
  }

  const years = Object.keys(yearly.T2M).map(Number)
  if (!years.length) throw new Error('NASA POWER returned no complete temperature years for this location.')
  const latestYear = years.at(-1)
  const annualRainfallMM = average(Object.values(yearly[RAIN]))
  const meanOf = (parameter) => average(Object.values(yearly[parameter]))
  const stats = {
    avgTemp: meanOf('T2M'),
    avgMaxTemp: meanOf('T2M_MAX'),
    avgMinTemp: meanOf('T2M_MIN'),
    annualRainfallMM,
    avgRainfall: annualRainfallMM,
    avgHumidity: meanOf('RH2M'),
    avgSolar: meanOf(SOLAR),
    avgWind: meanOf('WS2M'),
    currentTemp: yearly.T2M[latestYear],
    currentRainfall: yearly[RAIN][latestYear] ?? null,
  }

  return {
    ...yearly,
    ...stats,
    yearly,
    monthly,
    normals,
    stats,
    years,
    startYear: years[0],
    endYear: latestYear,
    source: 'nasa-power',
    mode,
    timeStandard: payload.header?.time_standard ?? 'LST',
    sourceVersion: payload.header?.api?.version,
    coordinates: payload.geometry?.coordinates?.slice(0, 2),
  }
}

export async function fetchClimateData(lat, lon, { signal, startYear = START_YEAR, endYear = END_YEAR } = {}) {
  signal?.throwIfAborted()
  const url = makePowerUrl(lat, lon, startYear, endYear)
  const key = url.toString()
  if (cache.has(key)) return cache.get(key)

  const raw = await requestJson(url, { signal, timeout: 18000 })
  const result = normalizePowerResponse(raw)
  if (cache.size >= 20) cache.delete(cache.keys().next().value)
  cache.set(key, result)
  return result
}
