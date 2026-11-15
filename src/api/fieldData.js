import { LOCATIONS } from '../data/locations.js'
import { fetchClimateData, normalizePowerResponse } from './nasaPower.js'
import { fetchSoilData, normalizeSoilResponse } from './soilGrids.js'
import peshawar from '../data/power/peshawar.json' with { type: 'json' }
import multan from '../data/power/multan.json' with { type: 'json' }
import faisalabad from '../data/power/faisalabad.json' with { type: 'json' }
import lahore from '../data/power/lahore.json' with { type: 'json' }
import sukkur from '../data/power/sukkur.json' with { type: 'json' }
import islamabad from '../data/power/islamabad.json' with { type: 'json' }
import soilSamples from '../data/soil/soilSamples.json' with { type: 'json' }

const POWER_SNAPSHOTS = { peshawar, multan, faisalabad, lahore, sukkur, islamabad }
const fieldCache = new Map()

function noSoilWarning() {
  return 'SoilGrids returned no soil estimate here. Crop matches use the available climate data.'
}

function soilUnavailableWarning() {
  return 'SoilGrids is unavailable for this location. Crop matches use the available climate data.'
}

export function getDemoFieldData(location) {
  if (!location) return null
  const featured = LOCATIONS.find(({ id, lat, lon }) => id === location.id && lat === location.lat && lon === location.lon)
  if (!featured) return null
  if (fieldCache.has(featured.id)) return fieldCache.get(featured.id)

  const climate = normalizePowerResponse(POWER_SNAPSHOTS[featured.id], 'snapshot')
  const soilSample = soilSamples[featured.id]
  const soil = soilSample ? normalizeSoilResponse(soilSample, 'snapshot', soilSample.point) : null
  const result = { climate, soil, warnings: soil ? [] : [noSoilWarning()] }
  fieldCache.set(featured.id, result)
  return result
}

export function requestFieldSources(location, { signal } = {}) {
  signal?.throwIfAborted()
  const bundled = getDemoFieldData(location)
  if (bundled) {
    const { climate, soil, warnings } = bundled
    return { climate: Promise.resolve(climate), ground: Promise.resolve({ soil, warnings }) }
  }

  const { lat, lon } = location
  const climate = fetchClimateData(lat, lon, { signal }).catch((cause) => {
    signal?.throwIfAborted()
    throw new Error('NASA POWER climate history could not be loaded for this location. Try again in a moment.', { cause })
  })
  const ground = fetchSoilData(lat, lon, { signal }).then(
    (soil) => ({ soil, warnings: soil ? [] : [noSoilWarning()] }),
    () => {
      signal?.throwIfAborted()
      return { soil: null, warnings: [soilUnavailableWarning()] }
    },
  )

  return { climate, ground }
}

export async function loadFieldData(location, { signal } = {}) {
  signal?.throwIfAborted()
  const bundled = getDemoFieldData(location)
  if (bundled) return bundled

  const sources = requestFieldSources(location, { signal })
  const [climate, ground] = await Promise.all([sources.climate, sources.ground])
  signal?.throwIfAborted()
  return { climate, ...ground }
}
