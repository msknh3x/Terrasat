import { useEffect, useRef, useState } from 'react'
import { solarPoint } from './globeSolar.js'

const CDN = 'https://unpkg.com/three-globe@2.45.6/example/img'
const BORDERS = 'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson'
const DAY = `${CDN}/earth-blue-marble.jpg`
const NIGHT = `${CDN}/earth-night.jpg`
const DEG = Math.PI / 180
const TAU = Math.PI * 2
const HOME = { lat: 28 * DEG, lng: 68 * DEG }
const KEY_ROTATIONS = { ArrowUp: [9, 0], ArrowDown: [-9, 0], ArrowLeft: [0, -12], ArrowRight: [0, 12] }
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
const wrap = (longitude) => ((longitude + Math.PI) % TAU + TAU) % TAU - Math.PI

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

function textureIndex(map, u, v) {
  return 4 * (Math.min(map.height - 1, Math.max(0, (v * map.height) | 0)) * map.width
    + Math.min(map.width - 1, (u * map.width) | 0))
}

function rasterSurface(scene, view, sun) {
  const { image, projection, pixels, day, night, cloud } = scene
  const { width, data } = image
  const { radius } = projection
  const invRadius = 2 / width

  for (let i = 0; i < pixels.length; i += 5) {
    const offset = pixels[i]
    const x = pixels[i + 1]
    const y = pixels[i + 2]
    const z = pixels[i + 3]
    const edge = pixels[i + 4]
    const localLatitude = Math.asin(clamp(y * view.cosLat + z * view.sinLat, -1, 1))
    const longitude = view.lng + Math.atan2(x, z * view.cosLat - y * view.sinLat)
    const rotation = longitude / TAU + 0.5
    const u = rotation - Math.floor(rotation)
    const v = 0.5 - localLatitude / Math.PI
    const dayAt = textureIndex(day, u, v)
    const incidence = x * sun.x + y * sun.y + z * sun.z
    const twilight = clamp((incidence + .18) * 4, 0, 1)
    const sunlit = Math.sqrt(Math.max(0, incidence))
    const exposure = .25 + .22 * twilight + .62 * sunlit
    const nightLight = night ? (1 - twilight) * night.data[textureIndex(night, u, v)] * .74 : 0
    const cloudOpacity = cloud ? cloud.data[textureIndex(cloud, u, v) + 3] * (.86 / 255) : 0
    const reflected = cloudOpacity * (51 + 173 * twilight + 34 * sunlit)
    const cloudShadow = 1 - cloudOpacity * .72
    const rim = (1 - z) ** 4 * (.20 + .70 * twilight)
    const edgeAlpha = Math.min(1, (1 - edge) / invRadius + .46) * 255

    data[offset] = (day.data[dayAt] * exposure + nightLight + 7) * cloudShadow + reflected + 58 * rim
    data[offset + 1] = (day.data[dayAt + 1] * exposure + nightLight * .72 + 13) * cloudShadow + reflected * 1.018 + 103 * rim
    data[offset + 2] = (day.data[dayAt + 2] * exposure + nightLight * .40 + 22) * cloudShadow + reflected * 1.03 + 127 * rim
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

  const radius = Math.min(width * .46, height * .445)
  scene.projection = { width, height, radius, x: width * .5, y: height * .51 }
  const size = Math.min(450, Math.ceil(radius * 2 * Math.max(1, pixelRatio)))
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
}

function paintBoundaries(scene, view) {
  if (!scene.countries.length) return
  const { context, projection, countries, selected } = scene
  const favorite = selected?.country?.toLowerCase()
  const code = selected?.countryCode?.toUpperCase()
  const featured = countries.find((country) => (code && country.codes.includes(code))
    || (favorite && country.names.includes(favorite)))
  const { x, y, radius } = projection

  function trace(rings) {
    for (const ring of rings) {
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
  }

  context.beginPath()
  for (const country of countries) trace(country.rings)
  context.lineWidth = .6
  context.strokeStyle = 'rgba(206,226,219,.25)'
  context.stroke()

  if (featured) {
    context.beginPath()
    trace(featured.rings)
    context.lineWidth = 1.25
    context.strokeStyle = 'rgba(203,237,117,.84)'
    context.stroke()
  }
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

  const halo = context.createRadialGradient(x, y, radius * .93, x, y, radius * 1.16)
  halo.addColorStop(0, 'rgba(105,151,136,0)')
  halo.addColorStop(.31, 'rgba(116,177,159,.28)')
  halo.addColorStop(.66, 'rgba(77,132,111,.08)')
  halo.addColorStop(1, 'rgba(77,132,111,0)')
  context.fillStyle = halo
  context.fillRect(0, 0, width, height)

  rasterSurface(scene, view, sun)
  paintBoundaries(scene, view)

  const point = selected && project(selected.point, view)
  marker.hidden = !(point && point.z > .05)
  if (!marker.hidden) {
    marker.style.transform = `translate3d(${x + radius * point.x}px,${y - radius * point.y}px,0)`
  }
  scene.paintedAt = now
}

function queueFrame(scene) {
  if (scene.frame !== null || !scene.visible || !scene.day || !scene.projection) return
  scene.frame = requestAnimationFrame((now) => {
    scene.frame = null
    const spin = !scene.reduced && !scene.drag && !scene.selected && !scene.hovering && !scene.focused
    if (now - scene.paintedAt < (spin && !scene.dirty ? 75 : 42)) {
      queueFrame(scene)
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
    } else if (spin && !scene.dirty) {
      const elapsed = Math.min(now - scene.paintedAt, 100)
      scene.pose.lng = wrap(scene.pose.lng + elapsed * .000013)
    }

    paint(scene, now)
    scene.dirty = false
    if (!scene.ready) {
      scene.ready = true
      scene.didDraw()
    }
    if (scene.flight || spin) queueFrame(scene)
  })
}

function redraw(scene) {
  if (!scene) return
  scene.dirty = true
  queueFrame(scene)
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
.fieldshift-canvas-marker i, .fieldshift-canvas-marker::before {
  content: ''; position: absolute; width: 9px; height: 9px; top: -4.5px; left: -4.5px;
  border-radius: 50%; background: #cbed75; box-shadow: 0 0 9px #cbed75b0;
}
.fieldshift-canvas-marker::before { background: transparent; border: 1px solid #cbed75; animation: fieldshift-canvas-pulse 1.85s ease-out infinite; }
.fieldshift-canvas-marker > span { position: absolute; left: 0; top: 13px; transform: translateX(-50%); }
@keyframes fieldshift-canvas-pulse { to { opacity: 0; transform: scale(3.8); } }
@media (prefers-reduced-motion: reduce) { .fieldshift-canvas-marker::before { animation: none; } }
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
      pose: { ...HOME }, visible: true, ready: false, reduced: motion.matches,
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

    const cancelDay = requestTexture(DAY, 1536, (day) => {
      scene.day = day
      redraw(scene)
    }, onUnavailable)
    const cancelNight = requestTexture(NIGHT, 1024, (night) => {
      scene.night = night
      redraw(scene)
    })

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
      cancelNight()
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

  function setInteraction(key, value) {
    const scene = sceneRef.current
    if (!scene) return
    scene[key] = value
    redraw(scene)
  }

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
    onPointerEnter={() => setInteraction('hovering', true)}
    onPointerLeave={() => setInteraction('hovering', false)}
    onPointerDown={startGesture}
    onPointerMove={moveGesture}
    onPointerUp={endGesture}
    onPointerCancel={() => setInteraction('drag', null)}
    onFocus={() => setInteraction('focused', true)}
    onBlur={() => setInteraction('focused', false)}
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
