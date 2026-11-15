import { useCallback, useEffect, useRef, useState } from 'react'
import { getDemoFieldData, requestFieldSources } from '../api/fieldData.js'
import { geocodeCity, reverseGeocode } from '../api/geocode.js'
import { pointCoordinates } from '../api/http.js'
import { DEFAULT_LOCATION, LOCATIONS } from '../data/locations.js'

const LOOKUP_CACHE_LIMIT = 60

function startSelection(location, hasAnalyzed) {
  const bundled = getDemoFieldData(location)
  return {
    location,
    dataset: bundled ?? { climate: null, soil: null, warnings: [] },
    hasAnalyzed,
    climateStatus: bundled ? 'ready' : 'loading',
    soilStatus: bundled ? (bundled.soil ? 'ready' : 'unavailable') : 'loading',
    climateError: '',
  }
}

function globePoint(query) {
  if (query?.id || !Number.isFinite(query?.lat) || !Number.isFinite(query?.lng)) return null
  const [lat, lon] = pointCoordinates(query.lat, query.lng)
  return { lat, lon }
}

async function resolveLocation(query, point, signal) {
  if (point) {
    let location
    try {
      location = await reverseGeocode(point.lat, point.lon, { signal })
    } catch (error) {
      signal.throwIfAborted()
      if (error?.status !== 404) {
        throw new Error('Could not look up that point. Try again or search for a city.', { cause: error })
      }
    }
    if (!location) throw new Error('No nearby place found. Select land or search for a city.')
    return location
  }

  if (typeof query === 'string') {
    const location = await geocodeCity(query, { signal })
    if (!location) throw new Error('Location not found. Try adding a region or country.')
    return location
  }

  if (Number.isFinite(query?.lat) && Number.isFinite(query?.lon)) return query
  throw new Error('Location not found. Try adding a region or country.')
}

function lookupKey(query) {
  if (typeof query !== 'string') return null
  return query.trim().toLowerCase().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ')
}

export function useFieldSearch() {
  const [selection, setSelection] = useState(() => startSelection(DEFAULT_LOCATION, false))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lookupRequest = useRef(null)
  const fieldRequest = useRef(null)
  const lookupCache = useRef(new Map())

  useEffect(() => () => {
    lookupRequest.current?.lookup.abort()
    lookupRequest.current?.field.abort()
    fieldRequest.current?.abort()
    lookupRequest.current = null
    fieldRequest.current = null
  }, [])

  const runSearch = useCallback(async (query) => {
    lookupRequest.current?.lookup.abort()
    lookupRequest.current?.field.abort()
    const request = { lookup: new AbortController(), field: new AbortController() }
    lookupRequest.current = request
    const { signal } = request.lookup

    setBusy(true)
    setError('')

    try {
      const point = globePoint(query)
      const key = lookupKey(query)
      const cachedLocation = lookupCache.current.get(key)
      const alreadyBundled = point && LOCATIONS.some(({ lat, lon }) => point.lat === lat && point.lon === lon)
      const prefetched = point && !alreadyBundled ? requestFieldSources(point, { signal: request.field.signal }) : null
      if (prefetched) {
        // These requests can finish before the name lookup. Attach rejection handlers
        // now, then use the results once the point has been accepted.
        prefetched.climate.catch(() => {})
        prefetched.ground.catch(() => {})
      }

      const location = cachedLocation ?? await resolveLocation(query, point, signal)
      signal.throwIfAborted()
      if (key && !cachedLocation) {
        if (lookupCache.current.size >= LOOKUP_CACHE_LIMIT) {
          lookupCache.current.delete(lookupCache.current.keys().next().value)
        }
        lookupCache.current.set(key, location)
      }

      const next = startSelection(location, true)
      fieldRequest.current?.abort()
      fieldRequest.current = request.field
      setSelection(next)

      if (next.climateStatus === 'loading') {
        const sources = prefetched ?? requestFieldSources(location, { signal: request.field.signal })
        const update = (apply) => {
          if (request.field.signal.aborted) return
          setSelection((current) => fieldRequest.current === request.field ? apply(current) : current)
        }

        sources.climate.then(
          (climate) => update((current) => ({ ...current, climateStatus: 'ready', dataset: { ...current.dataset, climate } })),
          (problem) => update((current) => ({ ...current, climateStatus: 'unavailable', climateError: problem.message })),
        )
        sources.ground.then(
          ({ soil, warnings }) => update((current) => ({
            ...current,
            soilStatus: soil ? 'ready' : 'unavailable',
            dataset: { ...current.dataset, soil, warnings },
          })),
          () => {},
        )
      }

      return true
    } catch (problem) {
      request.field.abort()
      if (!signal.aborted) setError(problem?.message || 'Location data could not be loaded. Please try again.')
      return false
    } finally {
      if (lookupRequest.current === request) {
        lookupRequest.current = null
        setBusy(false)
      }
    }
  }, [])

  return { ...selection, busy, error, setError, runSearch }
}
