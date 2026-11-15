import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactGlobe from 'react-globe.gl'
import * as THREE from 'three'
import { solarPoint } from './globeSolar.js'

const CDN = 'https://unpkg.com/three-globe@2.45.6/example'
const BORDERS = 'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson'
const HOME_VIEW = { lat: 28, lng: 68, altitude: 1.82 }
const SELECTED_ALTITUDE = 1.62
const RENDERER_OPTIONS = { alpha: true, antialias: true, powerPreference: 'default' }

function normalizedName(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
}

function findCountry(features, city) {
  if (!city) return null
  const code = city.countryCode?.toUpperCase()
  if (code) {
    const match = features.find(({ properties }) =>
      [properties.ISO_A2, properties.ISO_A2_EH, properties.WB_A2].includes(code))
    if (match) return match
  }
  const country = normalizedName(city.country)
  return country ? features.find(({ properties }) =>
    [properties.ADMIN, properties.NAME, properties.NAME_LONG, properties.FORMAL_EN]
      .some((name) => normalizedName(name) === country)) ?? null : null
}

function makeSurface() {
  const sun = new THREE.Vector3(0, 0, 1)
  const material = new THREE.MeshPhongMaterial({
    color: '#f1f2ea',
    specular: '#383e4b',
    shininess: 32,
  })
  // Add lights from the night map only on the dark side of the same terrain.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fieldshiftSun = { value: sun }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 fieldshiftNormal;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nfieldshiftNormal = mat3(modelMatrix) * normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 fieldshiftNormal;\nuniform vec3 fieldshiftSun;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float day = dot(normalize(fieldshiftNormal), fieldshiftSun);
        totalEmissiveRadiance *= 1.0 - smoothstep(-0.19, 0.08, day);
      `)
  }
  return { material, sun }
}

function makeStars() {
  const stars = []
  const count = 1000
  for (let index = 0; index < count; index += 1) {
    const y = 1 - (2 * (index + 0.5)) / count
    const r = Math.sqrt(1 - y * y)
    const angle = index * 2.39996323
    stars.push(750 * r * Math.cos(angle), 750 * y, 750 * r * Math.sin(angle))
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3))
  const material = new THREE.PointsMaterial({
    color: '#bdcab4', size: 0.82, sizeAttenuation: false,
    opacity: 0.32, transparent: true, depthWrite: false, toneMapped: false,
  })
  return new THREE.Points(geometry, material)
}

function makeBorders(globe, features) {
  const positions = []
  const radius = globe.getGlobeRadius() * 1.004
  const previous = new THREE.Vector3()
  const next = new THREE.Vector3()
  const point = new THREE.Vector3()
  for (const { geometry } of features) {
    const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]
    for (const rings of polygons) {
      for (const ring of rings) {
        for (let index = 1; index < ring.length; index += 1) {
          const from = globe.getCoords(ring[index - 1][1], ring[index - 1][0])
          const to = globe.getCoords(ring[index][1], ring[index][0])
          previous.set(from.x, from.y, from.z).normalize()
          next.set(to.x, to.y, to.z).normalize()
          // Short segments keep the borders above the curved Earth surface.
          const segments = Math.max(1, Math.ceil(previous.angleTo(next) / 0.045))
          for (let part = 1; part <= segments; part += 1) {
            point.lerpVectors(previous, next, (part - 1) / segments).setLength(radius)
            positions.push(point.x, point.y, point.z)
            point.lerpVectors(previous, next, part / segments).setLength(radius)
            positions.push(point.x, point.y, point.z)
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({
    color: '#adc7a5', opacity: 0.28, transparent: true, depthWrite: false, toneMapped: false,
  })
  return new THREE.LineSegments(geometry, material)
}

function createCityLabel({ text }) {
  const anchor = document.createElement('span')
  anchor.style.pointerEvents = 'none'
  const label = document.createElement('span')
  label.className = 'fieldshift-globe-label'
  label.textContent = text
  label.style.display = 'block'
  label.style.transform = 'translateY(24px)'
  label.style.maxWidth = 'min(220px, 30vw)'
  label.style.overflow = 'hidden'
  label.style.textOverflow = 'ellipsis'
  anchor.append(label)
  return anchor
}

function ringColor(progress) {
  return `rgba(203,237,117,${0.7 * (1 - progress)})`
}

export default function Globe({ selectedCity, onCityClick, onReady, onUnavailable, clouds, onCloudStatus }) {
  const hostRef = useRef(null)
  const globeRef = useRef(null)
  const dragRef = useRef(null)
  const hovering = useRef(false)
  const focus = useRef(false)
  const sceneSetup = useRef(null)
  const lastPoint = useRef(null)
  const [size, setSize] = useState(null)
  const [earthTexture, setEarthTexture] = useState(null)
  const [features, setFeatures] = useState([])
  const [ready, setReady] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [surface] = useState(makeSurface)

  const marker = Number.isFinite(selectedCity?.lat) && Number.isFinite(selectedCity?.lon ?? selectedCity?.lng)
    ? { lat: selectedCity.lat, lng: selectedCity.lon ?? selectedCity.lng } : null
  const markerLat = marker?.lat
  const markerLng = marker?.lng
  const markerLabel = [selectedCity?.name, selectedCity?.country].filter(Boolean).join(', ')
  const markerData = useMemo(() => markerLat === undefined ? [] : [{ lat: markerLat, lng: markerLng, text: markerLabel }],
    [markerLat, markerLng, markerLabel])
  const activeCountry = useMemo(() => {
    const feature = findCountry(features, selectedCity)
    return feature ? [feature] : []
  }, [features, selectedCity])

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    let finished = false
    const timeout = window.setTimeout(() => {
      finished = true
      onUnavailable()
    }, 12000)
    const loader = new THREE.TextureLoader()
    const texture = loader.load(`${CDN}/img/earth-blue-marble.jpg`, (image) => {
      if (finished) {
        image.dispose()
        return
      }
      window.clearTimeout(timeout)
      image.colorSpace = THREE.SRGBColorSpace
      image.anisotropy = 4
      surface.material.map = image
      surface.material.needsUpdate = true
      setEarthTexture(image)
    }, undefined, () => {
      if (!finished) {
        window.clearTimeout(timeout)
        onUnavailable()
      }
    })
    return () => {
      finished = true
      window.clearTimeout(timeout)
      texture.dispose()
      surface.material.dispose()
    }
  }, [onUnavailable, surface])

  useEffect(() => {
    const request = new AbortController()
    fetch(BORDERS, { signal: request.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((world) => { if (Array.isArray(world?.features)) setFeatures(world.features) })
      .catch(() => {})
    return () => request.abort()
  }, [])

  const setupGlobe = useCallback(() => {
    const globe = globeRef.current
    if (!globe || sceneSetup.current) return

    const controls = globe.controls()
    controls.autoRotate = false
    controls.autoRotateSpeed = 0.28
    controls.enableZoom = false
    controls.enablePan = false

    const renderer = globe.renderer()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const scene = globe.scene()
    const sunlight = new THREE.DirectionalLight('#fff7e8', 2.30)
    globe.lights([new THREE.AmbientLight('#a7c0ec', 0.50), sunlight])
    const stars = makeStars()
    scene.add(stars)

    const updateSun = () => {
      const { lat, lng } = solarPoint()
      const { x, y, z } = globe.getCoords(lat, lng)
      surface.sun.set(x, y, z).normalize()
      sunlight.position.copy(surface.sun).multiplyScalar(400)
    }
    globe.pointOfView(HOME_VIEW, 0)
    updateSun()
    const sunTimer = window.setInterval(updateSun, 60_000)

    const contextLost = (event) => {
      event.preventDefault()
      onUnavailable()
    }
    renderer.domElement.addEventListener('webglcontextlost', contextLost)
    const frame = requestAnimationFrame(() => {
      setReady(true)
      onReady()
    })
    sceneSetup.current = () => {
      cancelAnimationFrame(frame)
      window.clearInterval(sunTimer)
      renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      scene.remove(stars)
      stars.geometry.dispose()
      stars.material.dispose()
    }
  }, [onReady, onUnavailable, surface])

  // The globe library may fire its ready callback from its initial layout pass,
  // before React assigns the imperative ref on the wrapper.
  useEffect(() => {
    if (earthTexture && size && !ready) setupGlobe()
  }, [earthTexture, ready, setupGlobe, size])

  useEffect(() => () => sceneSetup.current?.(), [])

  useEffect(() => {
    if (!ready) return
    const globe = globeRef.current
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) globe.resumeAnimation()
      else globe.pauseAnimation()
    })
    observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [ready])

  useEffect(() => {
    if (!ready || !features.length) return
    const globe = globeRef.current
    const borders = makeBorders(globe, features)
    const scene = globe.scene()
    scene.add(borders)
    return () => {
      scene.remove(borders)
      borders.geometry.dispose()
      borders.material.dispose()
    }
  }, [features, ready])

  useEffect(() => {
    if (!ready) return
    const loader = new THREE.TextureLoader()
    let disposed = false
    const load = (path, apply) => loader.load(`${CDN}/${path}`, (texture) => {
      if (disposed) texture.dispose()
      else apply(texture)
    }, undefined, () => {})

    const bump = load('img/earth-topology.png', (texture) => {
      surface.material.bumpMap = texture
      surface.material.bumpScale = 0.36
      surface.material.needsUpdate = true
    })
    const night = load('img/earth-night.jpg', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      surface.material.emissiveMap = texture
      surface.material.emissive.set('#f9e2ab')
      surface.material.emissiveIntensity = 0.52
      surface.material.needsUpdate = true
    })
    return () => {
      disposed = true
      bump.dispose()
      night.dispose()
    }
  }, [ready, surface])

  useEffect(() => {
    if (!ready || !clouds) return
    const globe = globeRef.current
    const scene = globe.scene()
    let mesh
    let active = true
    let settled = false
    const result = (state) => {
      if (!active || settled) return false
      settled = true
      window.clearTimeout(timeout)
      onCloudStatus({ state, source: clouds.source })
      return true
    }
    onCloudStatus({ state: 'loading', source: clouds.source })
    const timeout = window.setTimeout(() => result('unavailable'), 10_000)
    const texture = new THREE.TextureLoader().load(clouds.url, (image) => {
      if (!active || settled) return
      image.colorSpace = THREE.SRGBColorSpace
      image.anisotropy = 4
      const geometry = new THREE.SphereGeometry(globe.getGlobeRadius() * 1.010, 96, 64)
      const material = new THREE.MeshPhongMaterial({
        map: image, transparent: true, opacity: 0.82, depthWrite: false,
        color: '#f7fbff', specular: '#151515', shininess: 2, alphaTest: 0.015,
      })
      mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.y = -Math.PI / 2
      scene.add(mesh)
      result('ready')
    }, undefined, () => result('unavailable'))

    return () => {
      active = false
      window.clearTimeout(timeout)
      texture.dispose()
      if (mesh) {
        scene.remove(mesh)
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
    }
  }, [clouds, onCloudStatus, ready])

  const syncRotation = useCallback(() => {
    if (!ready) return
    globeRef.current.controls().autoRotate =
      !reducedMotion && !markerData.length && !hovering.current && !focus.current
  }, [markerData.length, ready, reducedMotion])

  useEffect(() => {
    if (!ready) return
    syncRotation()
    const point = markerData[0]
    if (!point) {
      lastPoint.current = null
      return
    }
    if (lastPoint.current === point) return
    lastPoint.current = point
    globeRef.current.pointOfView(
      { lat: point.lat, lng: point.lng, altitude: SELECTED_ALTITUDE },
      reducedMotion ? 0 : 1500,
    )
  }, [markerData, ready, reducedMotion, syncRotation])

  function startGesture(event) {
    if (!ready || event.button !== 0 || !event.isPrimary) return
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }
  }

  function trackGesture(event) {
    const start = dragRef.current
    if (start?.pointerId === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
      start.dragged = true
    }
  }

  function endGesture(event) {
    const start = dragRef.current
    dragRef.current = null
    if (!ready || start?.pointerId !== event.pointerId || start.dragged) return
    const { left, top } = event.currentTarget.getBoundingClientRect()
    const point = globeRef.current.toGlobeCoords(event.clientX - left, event.clientY - top)
    if (point) onCityClick(point)
  }

  function handleKey(event) {
    if (!ready) return
    const globe = globeRef.current
    const view = globe.pointOfView()
    const directions = { ArrowUp: [9, 0], ArrowDown: [-9, 0], ArrowLeft: [0, -12], ArrowRight: [0, 12] }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onCityClick({ lat: view.lat, lng: view.lng })
    } else if (directions[event.key]) {
      event.preventDefault()
      const [lat, lng] = directions[event.key]
      globe.pointOfView({ ...view, lat: THREE.MathUtils.clamp(view.lat + lat, -89, 89), lng: view.lng + lng },
        reducedMotion ? 0 : 180)
    }
  }

  return <div
    className="fieldshift-globe"
    ref={hostRef}
    style={{ width: '100%', height: '100%', cursor: 'grab' }}
    role="region"
    aria-label="Interactive Earth globe. Use the arrow keys to rotate and Enter to select the center."
    tabIndex={ready ? 0 : -1}
    onPointerEnter={() => { hovering.current = true; syncRotation() }}
    onPointerLeave={() => { hovering.current = false; syncRotation() }}
    onPointerDown={startGesture}
    onPointerMove={trackGesture}
    onPointerUp={endGesture}
    onPointerCancel={() => { dragRef.current = null }}
    onFocus={() => { focus.current = true; syncRotation() }}
    onBlur={() => { focus.current = false; syncRotation() }}
    onKeyDown={handleKey}
  >
    {size && earthTexture && <ReactGlobe
      ref={globeRef}
      width={size.width}
      height={size.height}
      animateIn={false}
      backgroundColor="rgba(0,0,0,0)"
      rendererConfig={RENDERER_OPTIONS}
      globeMaterial={surface.material}
      globeCurvatureResolution={2}
      showAtmosphere
      atmosphereColor="#7aa3a2"
      atmosphereAltitude={0.085}
      enablePointerInteraction={false}
      onGlobeReady={setupGlobe}
      polygonsData={activeCountry}
      polygonCapColor={() => 'rgba(203,237,117,.13)'}
      polygonSideColor={() => 'rgba(0,0,0,0)'}
      polygonStrokeColor={() => 'rgba(203,237,117,.85)'}
      polygonAltitude={0.008}
      polygonsTransitionDuration={0}
      pointsData={markerData}
      pointRadius={1.25}
      pointAltitude={0.018}
      pointColor={() => '#cbed75'}
      pointResolution={18}
      pointsTransitionDuration={0}
      ringsData={reducedMotion ? [] : markerData}
      ringColor={() => ringColor}
      ringAltitude={0.016}
      ringMaxRadius={5.2}
      ringPropagationSpeed={2.8}
      ringRepeatPeriod={1700}
      htmlElementsData={markerData}
      htmlElement={createCityLabel}
      htmlAltitude={0.024}
      htmlTransitionDuration={0}
    />}
  </div>
}
