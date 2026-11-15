export async function requestJson(url, { signal, timeout = 12000, ...options } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal?.throwIfAborted()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('The data service timed out.')), timeout)

  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) {
      const error = new Error(`The data service returned HTTP ${response.status}.`)
      error.status = response.status
      throw error
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export function pointCoordinates(lat, lon) {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
    throw new Error('Enter a valid latitude and longitude.')
  }
  return [Number(lat.toFixed(4)), Number(lon.toFixed(4))]
}
