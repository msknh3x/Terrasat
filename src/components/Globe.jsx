import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactGlobe from 'react-globe.gl'
import * as THREE from 'three'
import { dayNightView, solarPoint } from './globeSolar.js'

const DAY_MAP = `${import.meta.env.BASE_URL}earth-surface.webp`
const NIGHT_MAP = `${import.meta.env.BASE_URL}earth-night-lights.webp`
const BORDERS = 'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson'
const SELECTED_ALTITUDE = 1.62
const RENDERER_OPTIONS = { alpha: true, antialias: true, powerPreference: 'default' }
const SPHERE_VERTEX = `
  varying vec2 mapUv;
  varying vec3 worldNormal;
  varying vec3 worldPoint;

  void main() {
    mapUv = uv;
    worldNormal = mat3(modelMatrix) * normal;
    worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SURFACE_FRAGMENT = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D cloudMap;
  uniform bool hasNight;
  uniform bool hasClouds;
  uniform vec3 sunDirection;
  varying vec2 mapUv;
  varying vec3 worldNormal;
  varying vec3 worldPoint;

  void main() {
    vec3 normal = normalize(worldNormal);
    vec3 view = normalize(cameraPosition - worldPoint);
    float incidence = dot(normal, sunDirection);
    float sunlit = pow(max(incidence, 0.0), 0.74);
    float twilight = smoothstep(-0.20, 0.15, incidence);

    vec3 source = texture2D(dayMap, mapUv).rgb;
    float luma = dot(source, vec3(0.2126, 0.7152, 0.0722));
    // The atlas has a flat blue sea. Its hue and luminance distinguish water
    // from blue-tinted snow and mountain shadows without a separate texture.
    float water = smoothstep(0.18, 0.58, (source.b - source.r) / (source.b + 0.004))
      * smoothstep(0.05, 0.38, (source.b - source.g) / (source.b + 0.004))
      * (1.0 - smoothstep(0.04, 0.17, luma));
    vec3 ocean = mix(vec3(0.0032, 0.0090, 0.0170), source, 0.23);
    vec3 ground = mix(mix(source, vec3(luma), 0.065), ocean, water);
    vec3 lightTint = mix(vec3(0.60, 0.76, 1.00), vec3(1.03, 1.01, 0.97), twilight);
    vec3 color = ground * lightTint * (0.024 + 0.19 * twilight + 0.89 * sunlit);

    float glint = max(0.0, dot(reflect(-sunDirection, normal), view));
    color += water * sunlit * (0.019 * pow(glint, 26.0) + 0.015 * pow(glint, 70.0));

    if (hasClouds && incidence > 0.0) {
      // Project a slight sunward offset onto the cloud shell at local altitude.
      vec3 shadowPoint = normalize(normal + sunDirection * 0.004 / max(incidence, 0.17));
      vec2 shadowUv = vec2(fract(0.5 + atan(shadowPoint.x, shadowPoint.z) / 6.2831853),
        0.5 + asin(clamp(shadowPoint.y, -1.0, 1.0)) / 3.1415927);
      color *= 1.0 - texture2D(cloudMap, shadowUv).a * 0.16 * twilight;
    }

    if (hasNight && incidence < -0.02) {
      float darkness = smoothstep(0.02, 0.20, -incidence);
      // Black Marble stores settlement cores, nearby radiance, and wider glow.
      vec3 radiance = texture2D(nightMap, mapUv).rgb;
      float core = radiance.r * (0.55 + 0.45 * radiance.r) * 0.88;
      float neighborhood = radiance.g * 0.46;
      float halo = radiance.b * 0.17;
      color += darkness * (vec3(1.0, 0.83, 0.63) * (core + neighborhood * 0.24)
        + vec3(1.0, 0.63, 0.32) * (neighborhood * 0.76 + halo));
    }

    float rim = pow(1.0 - max(0.0, dot(normal, view)), 10.0)
      * (0.075 + 0.925 * smoothstep(-0.11, 0.36, incidence));
    color += vec3(0.025, 0.061, 0.112) * rim;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`
const CLOUD_FRAGMENT = `
  uniform sampler2D cloudMap;
  uniform sampler2D nightMap;
  uniform bool hasNight;
  uniform vec3 sunDirection;
  varying vec2 mapUv;
  varying vec3 worldNormal;

  void main() {
    float coverage = texture2D(cloudMap, mapUv).a;
    if (coverage < 0.018) discard;
    float incidence = dot(normalize(worldNormal), sunDirection);
    float twilight = smoothstep(-0.19, 0.14, incidence);
    float sunlit = pow(max(incidence, 0.0), 0.64);
    vec3 cloudLight = vec3(0.014, 0.022, 0.036)
      + twilight * vec3(0.21, 0.25, 0.32) + sunlit * vec3(0.54, 0.51, 0.46);
    if (hasNight && incidence < -0.02) {
      vec2 glow = texture2D(nightMap, mapUv).gb;
      cloudLight += vec3(1.0, 0.69, 0.36) * smoothstep(0.02, 0.20, -incidence)
        * dot(glow, vec2(0.055, 0.027));
    }
    gl_FragColor = vec4(cloudLight, coverage * 0.78);
    #include <colorspace_fragment>
  }
`

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
  return new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: null },
      nightMap: { value: null },
      cloudMap: { value: null },
      hasNight: { value: false },
      hasClouds: { value: false },
      sunDirection: { value: new THREE.Vector3(0, 0, 1) },
    },
    vertexShader: SPHERE_VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    toneMapped: false,
  })
}

function createCityLabel({ text }) {
  const anchor = document.createElement('span')
  anchor.style.pointerEvents = 'none'
  const label = document.createElement('span')
  label.className = 'fieldshift-globe-label'
  label.textContent = text
  label.style.display = 'block'
  label.style.transform = 'translateY(16px)'
  label.style.maxWidth = 'min(220px, 30vw)'
  label.style.overflow = 'hidden'
  label.style.textOverflow = 'ellipsis'
  anchor.append(label)
  return anchor
}

export default function Globe({ selectedCity, onCityClick, onReady, onUnavailable, clouds, onCloudStatus }) {
  const hostRef = useRef(null)
  const globeRef = useRef(null)
  const dragRef = useRef(null)
  const sceneSetup = useRef(null)
  const lastPoint = useRef(null)
  const [size, setSize] = useState(null)
  const [earthTexture, setEarthTexture] = useState(null)
  const [nightSettled, setNightSettled] = useState(false)
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
    const texture = loader.load(DAY_MAP, (image) => {
      if (finished) {
        image.dispose()
        return
      }
      window.clearTimeout(timeout)
      image.colorSpace = THREE.SRGBColorSpace
      image.anisotropy = 8
      surface.uniforms.dayMap.value = image
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
      surface.dispose()
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
    controls.enableZoom = false
    controls.enablePan = false

    const renderer = globe.renderer()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    globe.lights([new THREE.AmbientLight(0xffffff, 1.25)])

    const updateSun = () => {
      const { lat, lng } = solarPoint()
      const { x, y, z } = globe.getCoords(lat, lng)
      surface.uniforms.sunDirection.value.set(x, y, z).normalize()
    }
    globe.pointOfView({ ...dayNightView(), altitude: SELECTED_ALTITUDE }, 0)
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
    }
  }, [onReady, onUnavailable, surface])

  // The globe library may fire its ready callback from its initial layout pass,
  // before React assigns the imperative ref on the wrapper.
  useEffect(() => {
    if (earthTexture && nightSettled && size && !ready) setupGlobe()
  }, [earthTexture, nightSettled, ready, setupGlobe, size])

  useEffect(() => () => sceneSetup.current?.(), [])

  useEffect(() => {
    if (!ready || !size) return
    const camera = globeRef.current.camera()
    const stageRatio = Math.max(1, 0.97 * size.height / size.width)
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(25 * Math.PI / 180) * stageRatio))
    camera.updateProjectionMatrix()
  }, [ready, size])

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
    let active = true
    const finishLoading = () => {
      if (!active) return
      window.clearTimeout(timeout)
      setNightSettled(true)
    }
    const timeout = window.setTimeout(finishLoading, 4000)
    const night = new THREE.TextureLoader().load(NIGHT_MAP, (texture) => {
      if (!active) return
      // These channels represent intensity, not display color.
      texture.colorSpace = THREE.NoColorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.anisotropy = 8
      surface.uniforms.nightMap.value = texture
      surface.uniforms.hasNight.value = true
      finishLoading()
    }, undefined, finishLoading)
    return () => {
      active = false
      window.clearTimeout(timeout)
      surface.uniforms.hasNight.value = false
      surface.uniforms.nightMap.value = null
      night.dispose()
    }
  }, [surface])

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
      image.anisotropy = 4
      surface.uniforms.cloudMap.value = image
      surface.uniforms.hasClouds.value = true
      const geometry = new THREE.SphereGeometry(globe.getGlobeRadius() * 1.0037, 128, 64)
      const material = new THREE.ShaderMaterial({
        uniforms: {
          cloudMap: { value: image },
          nightMap: surface.uniforms.nightMap,
          hasNight: surface.uniforms.hasNight,
          sunDirection: surface.uniforms.sunDirection,
        },
        vertexShader: SPHERE_VERTEX,
        fragmentShader: CLOUD_FRAGMENT,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
      mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.y = -Math.PI / 2
      scene.add(mesh)
      result('ready')
    }, undefined, () => result('unavailable'))

    return () => {
      active = false
      window.clearTimeout(timeout)
      surface.uniforms.hasClouds.value = false
      surface.uniforms.cloudMap.value = null
      texture.dispose()
      if (mesh) {
        scene.remove(mesh)
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
    }
  }, [clouds, onCloudStatus, ready, surface])

  useEffect(() => {
    if (!ready) return
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
  }, [markerData, ready, reducedMotion])

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
    onPointerDown={startGesture}
    onPointerMove={trackGesture}
    onPointerUp={endGesture}
    onPointerCancel={() => { dragRef.current = null }}
    onKeyDown={handleKey}
  >
    {size && earthTexture && nightSettled && <ReactGlobe
      ref={globeRef}
      width={size.width}
      height={size.height}
      animateIn={false}
      backgroundColor="rgba(0,0,0,0)"
      rendererConfig={RENDERER_OPTIONS}
      globeMaterial={surface}
      globeCurvatureResolution={2}
      showAtmosphere={false}
      atmosphereAltitude={0}
      enablePointerInteraction={false}
      onGlobeReady={setupGlobe}
      polygonsData={activeCountry}
      polygonCapColor={() => 'rgba(0,0,0,0)'}
      polygonSideColor={() => 'rgba(0,0,0,0)'}
      polygonStrokeColor={() => 'rgba(224,238,199,.48)'}
      polygonAltitude={0.008}
      polygonsTransitionDuration={0}
      pointsData={markerData}
      pointRadius={0.76}
      pointAltitude={0.018}
      pointColor={() => '#e1edc9'}
      pointResolution={18}
      pointsTransitionDuration={0}
      htmlElementsData={markerData}
      htmlElement={createCityLabel}
      htmlAltitude={0.024}
      htmlTransitionDuration={0}
    />}
  </div>
}
