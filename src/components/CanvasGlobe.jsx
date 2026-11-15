import { useEffect, useRef, useState } from 'react'
import { dayNightView, OVERVIEW_DRIFT, solarPoint } from './globeSolar.js'

const CDN = 'https://unpkg.com/three-globe@2.45.6/example/img'
const BORDERS = 'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson'
const DAY = `${import.meta.env.BASE_URL}earth-surface-2002.webp`
const NIGHT = `${import.meta.env.BASE_URL}earth-night-lights.webp`
const NIGHT_STARTUP_LIMIT = 700
const DEG = Math.PI / 180
const TAU = Math.PI * 2
const PIXEL_STRIDE = 6
const KEY_ROTATIONS = { ArrowUp: [9, 0], ArrowDown: [-9, 0], ArrowLeft: [0, -12], ArrowRight: [0, 12] }
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
const wrap = (longitude) => ((longitude + Math.PI) % TAU + TAU) % TAU - Math.PI
const LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const color = i / 255
  return color <= .04045 ? color / 12.92 : ((color + .055) / 1.055) ** 2.4
})
const DISPLAY = Uint8ClampedArray.from({ length: 4096 }, (_, i) => {
  const color = i / 4095
  return (color <= .0031308 ? 12.92 * color : 1.055 * color ** (1 / 2.4) - .055) * 255
})

function displayColor(value) {
  return DISPLAY[Math.min(4095, Math.max(0, (value * 4095 + .5) | 0))]
}

function cityExposure(light, darkness) {
  return darkness * light / (1 + .57 * light)
}

function smoothstep(minimum, maximum, value) {
  const t = clamp((value - minimum) / (maximum - minimum), 0, 1)
  return t * t * (3 - 2 * t)
}

let boundariesPromise

function requestTexture(url, maxWidth, onLoad, onError) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  let active = true
  const timeout = window.setTimeout(() => settle(onError), 10000)

  function settle(action, value) {
    if (!active) return
    active = false
    window.clearTimeout(timeout)
    image.onload = null
    image.onerror = null
    action?.(value)
  }

  image.onload = () => {
    try {
      const scratch = document.createElement('canvas')
      const ratio = Math.min(maxWidth / image.naturalWidth, 1)
      scratch.width = Math.round(image.naturalWidth * ratio)
      scratch.height = Math.round(image.naturalHeight * ratio)
      const context = scratch.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0, scratch.width, scratch.height)
      const { data, width, height } = context.getImageData(0, 0, scratch.width, scratch.height)
      settle(onLoad, { data, width, height })
    } catch {
      settle(onError)
    }
  }
  image.onerror = () => settle(onError)
  image.src = url

  return () => settle()
}

function countryBoundaries() {
  boundariesPromise ??= fetch(BORDERS)
    .then((response) => {
      if (!response.ok) throw new Error('Country boundaries are unavailable.')
      return response.json()
    })
    .then(({ features }) => features.flatMap(({ geometry, properties }) => {
      if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return []
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
      return [{
        names: [properties.ADMIN, properties.NAME, properties.NAME_LONG].map((name) => name?.toLowerCase()),
        codes: [properties.ISO_A2, properties.ISO_A2_EH, properties.WB_A2],
        rings: polygons.flatMap((part) => part.map((ring) => ring.map(([lng, lat]) => ({
          lng: lng * DEG,
          sinLat: Math.sin(lat * DEG),
          cosLat: Math.cos(lat * DEG),
        })))),
      }]
    }))
    .catch(() => {
      boundariesPromise = null
      return []
    })
  return boundariesPromise
}

function project(point, view) {
  const longitude = point.lng - view.lng
  const meridian = point.cosLat * Math.cos(longitude)
  return {
    x: point.cosLat * Math.sin(longitude),
    y: point.sinLat * view.cosLat - meridian * view.sinLat,
    z: point.sinLat * view.sinLat + meridian * view.cosLat,
  }
}

function coordinatesFor(lat, lng) {
  return { lng: lng * DEG, sinLat: Math.sin(lat * DEG), cosLat: Math.cos(lat * DEG) }
}

function overviewPose() {
  const { lat, lng } = dayNightView()
  return { lat: lat * DEG, lng: lng * DEG }
}

function toLocation(x, y, pose) {
  const squared = x * x + y * y
  if (squared > 1) return null
  const z = Math.sqrt(1 - squared)
  const sinLat = Math.sin(pose.lat)
  const cosLat = Math.cos(pose.lat)
  return {
    lat: Math.asin(clamp(y * cosLat + z * sinLat, -1, 1)) / DEG,
    lng: wrap(pose.lng + Math.atan2(x, z * cosLat - y * sinLat)) / DEG,
  }
}

function sampleTexture(map, u, v, channels, firstChannel = 0) {
  const column = u * map.width - .5
  const row = clamp(v * map.height - .5, 0, map.height - 1)
  const floorX = Math.floor(column)
  const floorY = Math.floor(row)
  const x0 = floorX < 0 ? map.width - 1 : floorX
  const x1 = x0 + 1 === map.width ? 0 : x0 + 1
  const y1 = Math.min(floorY + 1, map.height - 1)
  const fx = column - floorX
  const fy = row - floorY
  const topLeft = (floorY * map.width + x0) * 4 + firstChannel
  const topRight = (floorY * map.width + x1) * 4 + firstChannel
  const bottomLeft = (y1 * map.width + x0) * 4 + firstChannel
  const bottomRight = (y1 * map.width + x1) * 4 + firstChannel
  const texels = map.data

  for (let i = 0; i < channels.length; i += 1) {
    const top = texels[topLeft + i] + (texels[topRight + i] - texels[topLeft + i]) * fx
    const bottom = texels[bottomLeft + i] + (texels[bottomRight + i] - texels[bottomLeft + i]) * fx
    channels[i] = top + (bottom - top) * fy
  }
}

function alignTextureCoordinates(grid, view) {
  if (grid.alignedLatitude === view.sinLat) return
  const { pixels, textureCoordinates } = grid
  for (let i = 0, j = 0; i < pixels.length; i += PIXEL_STRIDE, j += 2) {
    const x = pixels[i + 1]
    const y = pixels[i + 2]
    const z = pixels[i + 3]
    textureCoordinates[j] = Math.atan2(x, z * view.cosLat - y * view.sinLat) / TAU
    textureCoordinates[j + 1] = .5 - Math.asin(clamp(y * view.cosLat + z * view.sinLat, -1, 1)) / Math.PI
  }
  grid.alignedLatitude = view.sinLat
}

function rasterSurface(scene, view, sun) {
  const { projection, grid, day, night, cloud, citySample } = scene
  const { image, pixels, textureCoordinates } = grid
  const { width, data } = image
  const { radius } = projection
  const invRadius = 2 / width
  const lightVectorScale = 1 / Math.sqrt(Math.max(.0001, 2 + 2 * sun.z))
  const highlightX = sun.x * lightVectorScale
  const highlightY = sun.y * lightVectorScale
  const highlightZ = (1 + sun.z) * lightVectorScale
  const surface = scene.surfaceSample
  const sky = scene.cloudSample
  const longitude = view.lng / TAU + .5
  alignTextureCoordinates(grid, view)

  for (let i = 0, j = 0; i < pixels.length; i += PIXEL_STRIDE, j += 2) {
    const offset = pixels[i]
    const x = pixels[i + 1]
    const y = pixels[i + 2]
    const z = pixels[i + 3]
    const edge = pixels[i + 4]
    const rimProfile = pixels[i + 5]
    const rotation = longitude + textureCoordinates[j]
    const u = rotation - Math.floor(rotation)
    const v = textureCoordinates[j + 1]
    sampleTexture(day, u, v, surface)
    const red = LINEAR[(surface[0] + .5) | 0]
    const green = LINEAR[(surface[1] + .5) | 0]
    const blue = LINEAR[(surface[2] + .5) | 0]
    const luminance = red * .2126 + green * .7152 + blue * .0722
    const water = smoothstep(.16, .53, (blue - red) / (blue + .004))
      * smoothstep(.05, .35, (blue - green) / (blue + .004))
      * (1 - smoothstep(.04, .21, luminance))
    const incidence = x * sun.x + y * sun.y + z * sun.z
    const daylight = Math.max(0, incidence)
    const twilight = smoothstep(-.16, .20, incidence)
    const darkness = smoothstep(.02, .20, -incidence)
    const irradiance = daylight * .60 + Math.sqrt(daylight) * .33
    const exposure = .013 + .042 * darkness + .155 * twilight + irradiance * .98
    let cityRed = 0
    let cityGreen = 0
    let cityBlue = 0
    let reflectedLight = 0
    if (night && incidence < -.02) {
      sampleTexture(night, u, v, citySample)
      const core = citySample[0] / 255
      const neighborhood = citySample[1] / 255
      const halo = citySample[2] / 255
      // Lift dim suburbs and road corridors while keeping the atlas's dark areas intact.
      const nearbyGlow = neighborhood * (1.10 - .56 * neighborhood)
      const directLight = core * (1.34 - .34 * core) * .91 + nearbyGlow * .29
      const diffuseLight = nearbyGlow * .71 + halo * (.62 - .39 * halo)
      cityRed = cityExposure(directLight + diffuseLight, darkness)
      cityGreen = cityExposure(directLight * .89 + diffuseLight * .66, darkness)
      cityBlue = cityExposure(directLight * .74 + diffuseLight * .39, darkness)
      reflectedLight = (neighborhood * .15 + halo * .075) * darkness
    }
    const glintDot = x * highlightX + y * highlightY + z * highlightZ
    const glare = water && daylight > 0 && glintDot > .75
      ? water * irradiance * (.036 * glintDot ** 32 + .022 * glintDot ** 76) : 0
    if (cloud) sampleTexture(cloud, u, v, sky, 3)
    const cloudCover = cloud ? sky[0] / 255 : 0
    const cloudOpacity = cloudCover * (.86 + .14 * smoothstep(.04, .88, cloudCover))
    const surfaceTransmission = (1 - cloudOpacity) * (1 - cloudOpacity * .065 * twilight)
    const cloudSunlight = cloudOpacity * (.009 + .019 * darkness + .195 * twilight + irradiance * .79)
    const cloudCityLight = cloudOpacity * reflectedLight
    const limb = rimProfile * (.03 + .07 * darkness + .97 * smoothstep(-.14, .49, incidence)) * .74
    const scatter = .0008 + twilight * .003
    const edgeAlpha = Math.min(1, (1 - edge) / invRadius + .46) * 255

    // Preserve the natural texture over water and tint the deepest open ocean.
    const deepWater = (1 - smoothstep(.008, .12, luminance) * .72) * water
    const r = (red * (1 - water * .10) + .017 * deepWater) * exposure * (.64 + .39 * twilight)
    const g = (green * (1 + water * .08) + .026 * deepWater) * exposure * (.76 + .25 * twilight)
    const b = (blue * (1 + water * .22) + .105 * deepWater) * exposure * (1 - .025 * twilight)

    data[offset] = displayColor((r + cityRed + glare * .84) * surfaceTransmission + cloudSunlight * .99 + cloudCityLight + scatter * .30 + limb * .100)
    data[offset + 1] = displayColor((g + cityGreen + glare * .93) * surfaceTransmission + cloudSunlight + cloudCityLight * .72 + scatter * .58 + limb * .23)
    data[offset + 2] = displayColor((b + cityBlue + glare) * surfaceTransmission + cloudSunlight * 1.035 + cloudCityLight * .43 + scatter * 1.25 + limb * .61)
    data[offset + 3] = edgeAlpha
  }

  scene.rasterContext.putImageData(image, 0, 0)
  const { x, y } = projection
  scene.context.drawImage(scene.raster, x - radius, y - radius, 2 * radius, 2 * radius)
}

function sizeProjection(scene, width, height) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.65)
  scene.canvas.width = Math.round(width * pixelRatio)
  scene.canvas.height = Math.round(height * pixelRatio)
  scene.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  scene.context.imageSmoothingQuality = 'high'

  const radius = Math.min(width * .47, height * .46)
  scene.projection = { width, height, radius, x: width * .5, y: height * .50 }
  scene.settledSize = Math.min(696, Math.ceil(radius * 2 * Math.max(1, pixelRatio)))
  scene.grids.clear()
  scene.grid = null
}

function prepareGrid(scene, mode) {
  const cap = mode === 'drag' ? 380 : mode === 'reveal' ? 472 : 696
  const size = Math.min(cap, scene.settledSize)
  if (scene.grid?.image.width === size) return
  let grid = scene.grids.get(size)
  if (!grid) {
    grid = makeGrid(scene.rasterContext, size)
    scene.grids.set(size, grid)
  }
  scene.grid = grid
  scene.raster.width = size
  scene.raster.height = size
}

function makeGrid(context, size) {
  const pixels = new Float32Array(size * size * PIXEL_STRIDE)
  let i = 0
  for (let row = 0; row < size; row += 1) {
    const y = 1 - (row + .5) * 2 / size
    for (let column = 0; column < size; column += 1) {
      const x = (column + .5) * 2 / size - 1
      const distance = x * x + y * y
      if (distance > 1) continue
      const z = Math.sqrt(1 - distance)
      pixels[i] = (row * size + column) * 4
      pixels[i + 1] = x
      pixels[i + 2] = y
      pixels[i + 3] = z
      pixels[i + 4] = Math.sqrt(distance)
      pixels[i + 5] = Math.exp(-8 * z)
      i += PIXEL_STRIDE
    }
  }
  return {
    image: context.createImageData(size, size),
    pixels: pixels.subarray(0, i),
    textureCoordinates: new Float32Array(i * 2 / PIXEL_STRIDE),
    alignedLatitude: undefined,
  }
}

function paintBoundaries(scene, view) {
  const { context, projection, countries, selected } = scene
  if (!selected || !countries.length) return
  const favorite = selected?.country?.toLowerCase()
  const code = selected?.countryCode?.toUpperCase()
  const featured = countries.find((country) => (code && country.codes.includes(code))
    || (favorite && country.names.includes(favorite)))
  if (!featured) return
  const { x, y, radius } = projection

  context.beginPath()
  for (const ring of featured.rings) {
    let drawing = false
    for (const point of ring) {
      const relative = project(point, view)
      if (relative.z > .02) {
        const px = x + relative.x * radius
        const py = y - relative.y * radius
        if (drawing) context.lineTo(px, py)
        else context.moveTo(px, py)
        drawing = true
      } else drawing = false
    }
  }
  context.lineWidth = 1
  context.strokeStyle = 'rgba(224,238,199,.48)'
  context.stroke()
}

function paintAtmosphere(context, x, y, radius, sun) {
  const outer = radius * 1.013
  const halo = context.createRadialGradient(x, y, radius * .99, x, y, outer)
  const strength = .033 + smoothstep(-.7, .7, sun.z) * .12
  halo.addColorStop(0, `rgba(94,145,235,${strength})`)
  halo.addColorStop(.54, `rgba(91,138,237,${strength * .44})`)
  halo.addColorStop(1, 'rgba(78,122,237,0)')
  context.fillStyle = halo
  context.beginPath()
  context.arc(x, y, outer, 0, TAU)
  context.fill()
}

function paint(scene, now) {
  const { context, projection, pose, marker, selected } = scene
  const { width, height, x, y, radius } = projection
  const view = { lng: pose.lng, cosLat: Math.cos(pose.lat), sinLat: Math.sin(pose.lat) }

  const minute = Math.floor(Date.now() / 60000)
  if (!scene.solar || scene.solar.minute !== minute) {
    const point = solarPoint()
    scene.solar = { minute, point: coordinatesFor(point.lat, point.lng) }
  }
  const sun = project(scene.solar.point, view)
  context.clearRect(0, 0, width, height)

  const rasterMode = scene.flight?.idle ? 'reveal' : scene.flight || scene.drag?.moved ? 'drag' : 'settled'
  prepareGrid(scene, rasterMode)
  paintAtmosphere(context, x, y, radius, sun)
  rasterSurface(scene, view, sun)
  paintBoundaries(scene, view)

  const point = selected && project(selected.point, view)
  marker.hidden = !(point && point.z > .05)
  if (!marker.hidden) {
    marker.style.transform = `translate3d(${x + radius * point.x}px,${y - radius * point.y}px,0)`
  }
  scene.paintedAt = now
}

function redraw(scene) {
  if (!scene || scene.frame !== null || !scene.visible || !scene.day
    || scene.waitingForNight || scene.waitingForCloud || !scene.projection) return
  scene.frame = requestAnimationFrame((now) => {
    scene.frame = null
    if (!scene.visible) return
    const frameInterval = scene.flight?.idle ? 49 : 32
    if (now - scene.paintedAt < frameInterval) {
      redraw(scene)
      return
    }

    if (scene.flight) {
      const { initial, target, startedAt, duration } = scene.flight
      const progress = clamp((now - startedAt) / duration, 0, 1)
      const fraction = progress * progress * (3 - 2 * progress)
      scene.pose = {
        lat: initial.lat + (target.lat - initial.lat) * fraction,
        lng: wrap(initial.lng + wrap(target.lng - initial.lng) * fraction),
      }
      if (progress === 1) scene.flight = null
    }

    paint(scene, now)
    if (!scene.ready) {
      scene.ready = true
      scene.didDraw()
      if (!scene.reduced && !scene.selected) {
        const target = { ...scene.pose, lng: wrap(scene.pose.lng + OVERVIEW_DRIFT.degrees * DEG) }
        flyTo(scene, target, OVERVIEW_DRIFT.duration, true)
      }
    }
    if (scene.flight) redraw(scene)
  })
}

function flyTo(scene, target, duration, idle = false) {
  if (!scene) return
  if (scene.reduced || !scene.ready) {
    scene.pose = { ...target }
    scene.flight = null
  } else {
    scene.flight = { initial: { ...scene.pose }, target, startedAt: performance.now(), duration, idle }
  }
  redraw(scene)
}

const PIN_STYLES = `
.fieldshift-canvas-globe { position: relative; width: 100%; height: 100%; cursor: grab; touch-action: pan-y; }
.fieldshift-canvas-globe:active { cursor: grabbing; }
.fieldshift-canvas-globe:focus-visible { outline-offset: -4px; }
.fieldshift-canvas-globe > canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.fieldshift-canvas-marker { position: absolute; inset: 0 auto auto 0; width: 0; height: 0; pointer-events: none; }
.fieldshift-canvas-marker i {
  position: absolute; width: 6px; height: 6px; top: -3px; left: -3px;
  border-radius: 50%; background: #e4f0d1; box-shadow: 0 0 0 1.5px #14211a;
}
.fieldshift-canvas-marker > span { position: absolute; left: 0; top: 13px; transform: translateX(-50%); }
`

export default function CanvasGlobe({ selectedCity, onCityClick, onReady, onUnavailable, clouds, onCloudStatus }) {
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const markerRef = useRef(null)
  const sceneRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const raster = document.createElement('canvas')
    const context = canvas.getContext('2d')
    const rasterContext = raster.getContext('2d')
    if (!context || !rasterContext) {
      onUnavailable?.()
      return
    }

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const scene = {
      canvas, context, raster, rasterContext, marker: markerRef.current,
      pose: overviewPose(), visible: true, ready: false, reduced: motion.matches, waitingForNight: true,
      surfaceSample: new Float32Array(3), cloudSample: new Float32Array(1), citySample: new Float32Array(3),
      countries: [], frame: null, paintedAt: -Infinity, grids: new Map(),
      didDraw: () => {
        setReady(true)
        onReady?.()
      },
    }
    sceneRef.current = scene

    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width < 12 || height < 12) return
      sizeProjection(scene, width, height)
      redraw(scene)
    })
    resize.observe(host)
    let intersectsViewport = true
    let hiddenSince = null
    const updateVisibility = () => {
      const visible = intersectsViewport && document.visibilityState === 'visible'
      if (scene.visible && !visible) hiddenSince = performance.now()
      if (!scene.visible && visible && hiddenSince !== null) {
        if (scene.flight) {
          scene.flight.startedAt += performance.now() - Math.max(hiddenSince, scene.flight.startedAt)
        }
        hiddenSince = null
      }
      scene.visible = visible
      if (visible) redraw(scene)
    }
    const visibility = new IntersectionObserver(([entry]) => {
      intersectsViewport = entry.isIntersecting
      updateVisibility()
    })
    visibility.observe(host)
    document.addEventListener('visibilitychange', updateVisibility)
    updateVisibility()
    const updateMotion = () => {
      scene.reduced = motion.matches
      if (scene.reduced && scene.flight?.idle) scene.flight = null
      else if (scene.reduced && scene.flight) flyTo(scene, scene.flight.target, 0)
      redraw(scene)
    }
    motion.addEventListener('change', updateMotion)

    const showDay = (day) => {
      scene.day = day
      redraw(scene)
    }
    let cancelFallback
    const cancelDay = requestTexture(DAY, 3072, showDay, () => {
      cancelFallback = requestTexture(`${CDN}/earth-blue-marble.jpg`, 2048, showDay, onUnavailable)
    })
    const showNight = (night) => {
      if (night) scene.night = night
      scene.waitingForNight = false
      window.clearTimeout(nightStartupDeadline)
      redraw(scene)
    }
    const nightStartupDeadline = window.setTimeout(showNight, NIGHT_STARTUP_LIMIT)
    const cancelNight = requestTexture(NIGHT, 3072, showNight, showNight)

    let mounted = true
    countryBoundaries().then((countries) => {
      if (!mounted) return
      scene.countries = countries
      redraw(scene)
    })
    const daylight = window.setInterval(() => redraw(scene), 60000)

    return () => {
      mounted = false
      cancelDay()
      cancelFallback?.()
      cancelNight()
      window.clearTimeout(nightStartupDeadline)
      resize.disconnect()
      visibility.disconnect()
      document.removeEventListener('visibilitychange', updateVisibility)
      motion.removeEventListener('change', updateMotion)
      window.clearInterval(daylight)
      if (scene.frame !== null) cancelAnimationFrame(scene.frame)
      sceneRef.current = null
    }
  }, [onReady, onUnavailable])

  const cloudUrl = clouds?.url
  const cloudLive = clouds?.live
  const cloudSource = clouds?.source
  const cloudTimestamp = clouds?.timestamp
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (!cloudUrl) {
      scene.cloud = null
      redraw(scene)
      return
    }
    const source = cloudSource ?? (cloudLive ? 'satellite' : 'illustrative')
    scene.waitingForCloud = source === 'archive' && !scene.ready
    const finishStartup = () => {
      scene.waitingForCloud = false
      redraw(scene)
    }
    const startupLimit = window.setTimeout(finishStartup, 950)
    onCloudStatus?.({ state: 'loading', source, timestamp: cloudTimestamp })
    const cancel = requestTexture(cloudUrl, 2048, (texture) => {
      scene.cloud = texture
      window.clearTimeout(startupLimit)
      finishStartup()
      onCloudStatus?.({ state: 'ready', source, timestamp: cloudTimestamp })
    }, () => {
      window.clearTimeout(startupLimit)
      finishStartup()
      onCloudStatus?.({ state: 'unavailable', source })
    })
    return () => {
      cancel()
      window.clearTimeout(startupLimit)
      scene.waitingForCloud = false
    }
  }, [cloudUrl, cloudLive, cloudSource, cloudTimestamp, onCloudStatus])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const lat = selectedCity?.lat
    const lng = selectedCity?.lon ?? selectedCity?.lng
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      scene.selected = null
      redraw(scene)
      return
    }
    scene.selected = { country: selectedCity.country, countryCode: selectedCity.countryCode, point: coordinatesFor(lat, lng) }
    flyTo(scene, { lat: lat * DEG, lng: lng * DEG }, 1500)
  }, [selectedCity])

  function startGesture(event) {
    const scene = sceneRef.current
    if (!scene?.ready || event.button !== 0 || !event.isPrimary) return
    scene.flight = null
    scene.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, initial: { ...scene.pose }, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveGesture(event) {
    const scene = sceneRef.current
    const drag = scene?.drag
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 5) return
    drag.moved = true
    const radiansPerPixel = 1.02 / scene.projection.radius
    scene.pose = {
      lat: clamp(drag.initial.lat + dy * radiansPerPixel, -89 * DEG, 89 * DEG),
      lng: wrap(drag.initial.lng - dx * radiansPerPixel),
    }
    redraw(scene)
  }

  function endGesture(event) {
    const scene = sceneRef.current
    const drag = scene?.drag
    if (!drag || drag.id !== event.pointerId) return
    scene.drag = null
    redraw(scene)
    if (drag.moved) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const { x, y, radius } = scene.projection
    const point = toLocation((event.clientX - bounds.left - x) / radius, (y + bounds.top - event.clientY) / radius, scene.pose)
    if (point) onCityClick?.(point)
  }

  function cancelGesture(event) {
    const scene = sceneRef.current
    if (scene?.drag?.id !== event.pointerId) return
    scene.drag = null
    redraw(scene)
  }

  function handleKey(event) {
    const scene = sceneRef.current
    if (!scene?.ready) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      scene.flight = null
      redraw(scene)
      onCityClick?.({ lat: scene.pose.lat / DEG, lng: scene.pose.lng / DEG })
    } else if (Object.hasOwn(KEY_ROTATIONS, event.key)) {
      event.preventDefault()
      const [lat, lng] = KEY_ROTATIONS[event.key]
      flyTo(scene, {
        lat: clamp(scene.pose.lat + lat * DEG, -89 * DEG, 89 * DEG),
        lng: wrap(scene.pose.lng + lng * DEG),
      }, 180)
    }
  }

  const name = [selectedCity?.name, selectedCity?.country].filter(Boolean).join(', ')
  return <div
    className="fieldshift-canvas-globe"
    ref={hostRef}
    role="region"
    aria-label="Interactive Earth globe. Use arrow keys to rotate and Enter to select the center."
    tabIndex={ready ? 0 : -1}
    onPointerDown={startGesture}
    onPointerMove={moveGesture}
    onPointerUp={endGesture}
    onPointerCancel={cancelGesture}
    onKeyDown={handleKey}
  >
    <style>{PIN_STYLES}</style>
    <canvas ref={canvasRef} aria-hidden="true" />
    <div ref={markerRef} className="fieldshift-canvas-marker" aria-hidden="true" hidden>
      <i />
      <span className="fieldshift-globe-label">{name}</span>
    </div>
  </div>
}
