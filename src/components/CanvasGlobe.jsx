import { useEffect, useRef, useState } from 'react'
import { dayNightView, solarPoint } from './globeSolar.js'

const CDN = 'https://unpkg.com/three-globe@2.45.6/example/img'
const BORDERS = 'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson'
const DAY = `${import.meta.env.BASE_URL}earth-surface.webp`
const NIGHT = `${import.meta.env.BASE_URL}earth-night-lights.webp`
const NIGHT_STARTUP_LIMIT = 4000
const DEG = Math.PI / 180
const TAU = Math.PI * 2
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

function alignTextureCoordinates(scene, view) {
  if (scene.alignedLatitude === view.sinLat) return
  const { pixels, textureCoordinates } = scene
  for (let i = 0, j = 0; i < pixels.length; i += 5, j += 2) {
    const x = pixels[i + 1]
    const y = pixels[i + 2]
    const z = pixels[i + 3]
    textureCoordinates[j] = Math.atan2(x, z * view.cosLat - y * view.sinLat) / TAU
    textureCoordinates[j + 1] = .5 - Math.asin(clamp(y * view.cosLat + z * view.sinLat, -1, 1)) / Math.PI
  }
  scene.alignedLatitude = view.sinLat
}

function rasterSurface(scene, view, sun) {
  const { image, projection, pixels, textureCoordinates, day, night, cloud, citySample } = scene
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
  alignTextureCoordinates(scene, view)

  for (let i = 0, j = 0; i < pixels.length; i += 5, j += 2) {
    const offset = pixels[i]
    const x = pixels[i + 1]
    const y = pixels[i + 2]
    const z = pixels[i + 3]
    const edge = pixels[i + 4]
    const rotation = longitude + textureCoordinates[j]
    const u = rotation - Math.floor(rotation)
    const v = textureCoordinates[j + 1]
    sampleTexture(day, u, v, surface)
    const red = LINEAR[(surface[0] + .5) | 0]
    const green = LINEAR[(surface[1] + .5) | 0]
    const blue = LINEAR[(surface[2] + .5) | 0]
    const water = clamp((surface[2] - surface[0] - 3) / 24, 0, 1)
      * clamp((surface[2] - surface[1] - 2) / 16, 0, 1)
    const incidence = x * sun.x + y * sun.y + z * sun.z
    const daylight = Math.max(0, incidence)
    const twilight = clamp((incidence + .13) * 4.2, 0, 1)
    const irradiance = daylight * .77 + Math.sqrt(daylight) * .21
    const exposure = .024 + .045 * twilight + irradiance
    let directLight = 0
    let diffuseLight = 0
    let reflectedLight = 0
    if (night && incidence < -.02) {
      sampleTexture(night, u, v, citySample)
      const core = citySample[0] / 255
      const neighborhood = citySample[1] / 255
      const halo = citySample[2] / 255
      const darkness = clamp((-.02 - incidence) / .18, 0, 1)
      const nightFactor = darkness * darkness * (3 - 2 * darkness)
      // The atlas separates settlement cores from their immediate and broader glow.
      directLight = (core * (.55 + .45 * core) * .88 + neighborhood * .46 * .24) * nightFactor
      diffuseLight = (neighborhood * .46 * .76 + halo * .17) * nightFactor
      reflectedLight = (neighborhood * .055 + halo * .027) * nightFactor
    }
    const glintDot = x * highlightX + y * highlightY + z * highlightZ
    const glare = water && daylight > 0 && glintDot > .8 ? water * glintDot ** 63 * daylight * .084 : 0
    if (cloud) sampleTexture(cloud, u, v, sky, 3)
    const cloudOpacity = cloud ? sky[0] * (.81 / 255) : 0
    const surfaceTransmission = (1 - cloudOpacity) * (1 - cloudOpacity * .25)
    const cloudSunlight = cloudOpacity * (.008 + .063 * twilight + irradiance * .90)
    const cloudCityLight = cloudOpacity * reflectedLight
    const pathLength = 1 - z
    const rimShape = pathLength * pathLength * pathLength * pathLength
    const limb = rimShape * rimShape * (.008 + .076 * twilight + .059 * daylight)
    const scatter = .002 + twilight * .008
    const edgeAlpha = Math.min(1, (1 - edge) / invRadius + .46) * 255

    const oceanRed = .0017 + red * .14
    const oceanGreen = .0055 + green * .16
    const oceanBlue = .014 + blue * .16
    const r = (red + (oceanRed - red) * water) * exposure * 1.02
    const g = (green + (oceanGreen - green) * water) * exposure
    const b = (blue + (oceanBlue - blue) * water) * exposure * .97

    data[offset] = displayColor((r + directLight + diffuseLight + glare * .81) * surfaceTransmission + cloudSunlight + cloudCityLight + scatter * .31 + limb * .27)
    data[offset + 1] = displayColor((g + directLight * .83 + diffuseLight * .63 + glare * .91) * surfaceTransmission + cloudSunlight * 1.015 + cloudCityLight * .69 + scatter * .66 + limb * .59)
    data[offset + 2] = displayColor((b + directLight * .63 + diffuseLight * .32 + glare) * surfaceTransmission + cloudSunlight * 1.035 + cloudCityLight * .36 + scatter * 1.28 + limb)
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

  const radius = Math.min(width * .47, height * .46)
  scene.projection = { width, height, radius, x: width * .5, y: height * .50 }
  const size = Math.min(540, Math.ceil(radius * 2 * Math.max(1, pixelRatio)))
  scene.raster.width = size
  scene.raster.height = size
  scene.image = scene.rasterContext.createImageData(size, size)

  const pixels = []
  for (let row = 0; row < size; row += 1) {
    const y = 1 - (row + .5) * 2 / size
    for (let column = 0; column < size; column += 1) {
      const x = (column + .5) * 2 / size - 1
      const distance = x * x + y * y
      if (distance <= 1) pixels.push((row * size + column) * 4, x, y, Math.sqrt(1 - distance), Math.sqrt(distance))
    }
  }
  scene.pixels = new Float32Array(pixels)
  scene.textureCoordinates = new Float32Array(pixels.length * 2 / 5)
  scene.alignedLatitude = undefined
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
  if (!scene || scene.frame !== null || !scene.visible || !scene.day || scene.waitingForNight || !scene.projection) return
  scene.frame = requestAnimationFrame((now) => {
    scene.frame = null
    if (!scene.visible) return
    if (now - scene.paintedAt < 42) {
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
    }
    if (scene.flight) redraw(scene)
  })
}

function flyTo(scene, target, duration) {
  if (!scene) return
  if (scene.reduced || !scene.ready) {
    scene.pose = { ...target }
    scene.flight = null
  } else {
    scene.flight = { initial: { ...scene.pose }, target, startedAt: performance.now(), duration }
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
      countries: [], frame: null, paintedAt: -Infinity,
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
    const visibility = new IntersectionObserver(([entry]) => {
      scene.visible = entry.isIntersecting
      if (scene.visible) redraw(scene)
    })
    visibility.observe(host)
    const updateMotion = () => {
      scene.reduced = motion.matches
      if (scene.reduced && scene.flight) flyTo(scene, scene.flight.target, 0)
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
    scene.cloud = null
    redraw(scene)
    if (!cloudUrl) return
    const source = cloudSource ?? (cloudLive ? 'satellite' : 'illustrative')
    onCloudStatus?.({ state: 'loading', source, timestamp: cloudTimestamp })
    return requestTexture(cloudUrl, 1024, (texture) => {
      scene.cloud = texture
      redraw(scene)
      onCloudStatus?.({ state: 'ready', source, timestamp: cloudTimestamp })
    }, () => {
      onCloudStatus?.({ state: 'unavailable', source })
    })
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
    if (scene?.drag?.id === event.pointerId) scene.drag = null
  }

  function handleKey(event) {
    const scene = sceneRef.current
    if (!scene?.ready) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
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
