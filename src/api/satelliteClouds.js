const WMS = 'https://view.eumetsat.int/geoserver'
const LAYER = 'worldcloudmap_ir108'
const WIDTH = 1024
const HEIGHT = 512
const MAX_FRAME_AGE = 9 * 60 * 60 * 1000
const MAX_CLOCK_SKEW = 15 * 60 * 1000
const METADATA_INTERVAL = 2 * 60 * 1000
const RETRY_INTERVAL = 30 * 1000

let cachedFrame = null
let activeRequest = null
let lastError = null
let nextCheck = 0

function wmsUrl(path, options) {
  const url = new URL(`${WMS}/${path}`)
  url.search = new URLSearchParams({ service: 'WMS', version: '1.3.0', ...options })
  return url
}

function isFresh(timestamp) {
  const age = Date.now() - Date.parse(timestamp)
  return age >= -MAX_CLOCK_SKEW && age <= MAX_FRAME_AGE
}

async function getResponse(url, signal, timeout) {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
  })
  if (!response.ok) throw new Error(`EUMETSAT returned HTTP ${response.status}.`)
  return response
}

async function latestTimestamp(signal) {
  const url = wmsUrl(`mumi/${LAYER}/wms`, { request: 'GetCapabilities' })
  const response = await getResponse(url, signal, 10000)
  const xml = new DOMParser().parseFromString(await response.text(), 'text/xml')
  const dimension = Array.from(xml.getElementsByTagName('Dimension'))
    .find((item) => item.getAttribute('name') === 'time')
  const timestamp = dimension?.getAttribute('default')

  if (!timestamp || !isFresh(timestamp)) {
    throw new Error('No recent EUMETSAT cloud frame is available.')
  }
  return new Date(timestamp).toISOString()
}

async function cloudAlpha(source, signal) {
  const bitmap = await createImageBitmap(source)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })

  try {
    signal.throwIfAborted()
    if (!context || bitmap.width !== WIDTH || bitmap.height !== HEIGHT) {
      throw new Error('The EUMETSAT cloud frame has an unexpected size or format.')
    }
    context.drawImage(bitmap, 0, 0)
  } finally {
    bitmap.close()
  }

  const frame = context.getImageData(0, 0, WIDTH, HEIGHT)
  const { data } = frame
  for (let index = 0; index < data.length; index += 4) {
    // Cold, bright infrared features provide the cloud texture. Keep the
    // source coverage mask so missing imagery stays transparent.
    const light = Math.min(1, Math.max(0, (data[index] - 81) / 104))
    data[index + 3] *= light * light * (3 - 2 * light)
    data[index] = 255
    data[index + 1] = 255
    data[index + 2] = 255
  }
  context.putImageData(frame, 0, 0)

  const image = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode the EUMETSAT cloud frame.'))
    }, 'image/png')
  })
  signal.throwIfAborted()
  return image
}

async function refreshCloudFrame(signal) {
  const timestamp = await latestTimestamp(signal)
  if (cachedFrame?.timestamp === timestamp) return cachedFrame

  const url = wmsUrl('ows', {
    request: 'GetMap',
    layers: `mumi:${LAYER}`,
    styles: '',
    format: 'image/png',
    transparent: 'true',
    crs: 'EPSG:4326',
    bbox: '-90,-180,90,180',
    width: WIDTH,
    height: HEIGHT,
    time: timestamp,
  })
  const response = await getResponse(url, signal, 14000)
  const source = await response.blob()
  if (source.type !== 'image/png' || source.size === 0) {
    throw new Error('EUMETSAT did not return a satellite image.')
  }
  const image = await cloudAlpha(source, signal)
  return { image, timestamp }
}

function beginRequest() {
  const controller = new AbortController()
  const request = { controller, users: 0 }
  request.promise = refreshCloudFrame(controller.signal)
    .then((frame) => {
      cachedFrame = frame
      lastError = null
      nextCheck = Date.now() + METADATA_INTERVAL
      return frame
    })
    .catch((error) => {
      controller.signal.throwIfAborted()
      lastError = error
      nextCheck = Date.now() + RETRY_INTERVAL
      if (cachedFrame && isFresh(cachedFrame.timestamp)) return cachedFrame
      throw error
    })
    .finally(() => {
      if (activeRequest === request) activeRequest = null
    })
  activeRequest = request
  return request
}

export async function fetchSatelliteClouds({ signal } = {}) {
  signal?.throwIfAborted()
  if (!activeRequest && Date.now() < nextCheck) {
    if (cachedFrame && isFresh(cachedFrame.timestamp)) return cachedFrame
    if (lastError) throw lastError
  }

  // Keep one network and image-processing job across mounted views. An
  // aborted consumer cancels the job only once no other consumers need it.
  const request = activeRequest ?? beginRequest()
  request.users += 1
  let abort
  try {
    if (!signal) return await request.promise
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
    })
    return await Promise.race([request.promise, cancelled])
  } finally {
    if (abort) signal.removeEventListener('abort', abort)
    request.users -= 1
    if (!request.users && signal?.aborted && activeRequest === request) {
      activeRequest = null
      request.controller.abort(signal.reason)
    }
  }
}
