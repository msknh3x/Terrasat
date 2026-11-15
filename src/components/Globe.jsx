import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactGlobe from 'react-globe.gl'
import * as THREE from 'three'
import { dayNightView, OVERVIEW_DRIFT, solarPoint } from './globeSolar.js'

const DAY_MAP = `${import.meta.env.BASE_URL}earth-surface-2002.webp`
const NIGHT_MAP = `${import.meta.env.BASE_URL}earth-night-lights.webp`
const BORDERS = 'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson'
const SELECTED_ALTITUDE = 3.7
const HALF_VIEW_ANGLE = THREE.MathUtils.degToRad(13.8)
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
    float daylight = max(incidence, 0.0);
    float irradiance = 0.60 * daylight + 0.33 * sqrt(daylight);
    float twilight = smoothstep(-0.16, 0.20, incidence);
    float darkness = smoothstep(0.02, 0.20, -incidence);

    vec3 source = texture2D(dayMap, mapUv).rgb;
    float luma = dot(source, vec3(0.2126, 0.7152, 0.0722));
    // Preserve the observed color and detail of coastal water while giving
    // the very dark open-ocean pixels a modest blue subsurface contribution.
    float water = smoothstep(0.12, 0.64, (source.b - source.r) / (source.b + 0.004))
      * smoothstep(0.045, 0.38, (source.b - source.g) / (source.b + 0.004))
      * (1.0 - smoothstep(0.045, 0.20, luma));
    vec3 ocean = source * vec3(0.90, 1.08, 1.22)
      + vec3(0.017, 0.026, 0.105) * (1.0 - 0.72 * smoothstep(0.008, 0.12, luma));
    vec3 ground = mix(source, ocean, water);
    vec3 lightTint = mix(vec3(0.64, 0.79, 1.10), vec3(1.015, 1.0, 0.978), twilight);
    vec3 color = ground * lightTint * (0.013 + 0.042 * darkness + 0.155 * twilight + 0.98 * irradiance);

    float glint = max(0.0, dot(reflect(-sunDirection, normal), view));
    color += water * irradiance * (0.026 * pow(glint, 24.0) + 0.013 * pow(glint, 70.0))
      * vec3(0.82, 0.93, 1.0);

    if (hasClouds && incidence > 0.0) {
      // Project a slight sunward offset onto the cloud shell at local altitude.
      vec3 shadowPoint = normalize(normal + sunDirection * 0.004 / max(incidence, 0.17));
      vec2 shadowUv = vec2(fract(0.5 + atan(shadowPoint.x, shadowPoint.z) / 6.2831853),
        0.5 + asin(clamp(shadowPoint.y, -1.0, 1.0)) / 3.1415927);
      color *= 1.0 - texture2D(cloudMap, shadowUv).a * 0.15 * twilight;
    }

    if (hasNight && incidence < -0.02) {
      // Lift dim suburbs and road corridors while keeping the atlas's dark areas intact.
      vec3 radiance = texture2D(nightMap, mapUv).rgb;
      float core = radiance.r * (1.34 - 0.34 * radiance.r) * 0.91;
      float neighborhood = radiance.g * (1.10 - 0.56 * radiance.g);
      float halo = radiance.b * (0.62 - 0.39 * radiance.b);
      vec3 light = vec3(1.0, 0.89, 0.74) * (core + neighborhood * 0.29)
        + vec3(1.0, 0.66, 0.39) * (neighborhood * 0.71 + halo);
      color += darkness * light / (1.0 + 0.57 * light);
    }

    float slant = max(0.0, dot(normal, view));
    float rim = exp(-8.0 * slant) * (0.03 + 0.07 * darkness + 0.97 * smoothstep(-0.14, 0.49, incidence));
    color = color * (1.0 - 0.24 * rim) + vec3(0.100, 0.23, 0.61) * rim * 0.74;
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
    float daylight = max(incidence, 0.0);
    float twilight = smoothstep(-0.16, 0.20, incidence);
    float darkness = smoothstep(0.02, 0.20, -incidence);
    float irradiance = 0.60 * daylight + 0.33 * sqrt(daylight);
    float density = smoothstep(0.04, 0.88, coverage);
    vec3 cloudTint = mix(vec3(0.54, 0.70, 1.0), vec3(0.987, 1.0, 1.022), twilight);
    vec3 cloudLight = cloudTint * (0.009 + 0.019 * darkness + 0.195 * twilight + 0.74 * irradiance / 0.93)
      * mix(0.82, 1.07, density);
    if (hasNight && incidence < -0.02) {
      vec2 glow = texture2D(nightMap, mapUv).gb;
      cloudLight += vec3(1.0, 0.72, 0.43) * darkness * dot(glow, vec2(0.15, 0.075));
    }
    gl_FragColor = vec4(cloudLight, coverage * (0.86 + 0.14 * density));
    #include <colorspace_fragment>
  }
`
const ATMOSPHERE_FRAGMENT = `
  uniform vec3 sunDirection;
  varying vec3 worldNormal;
  varying vec3 worldPoint;

  void main() {
    vec3 normal = normalize(worldNormal);
    vec3 view = normalize(cameraPosition - worldPoint);
    float incidence = dot(normal, sunDirection);
    float slant = max(0.0, dot(normal, view));
    float edge = exp(-15.0 * slant);
    float light = 0.025 + 0.065 * smoothstep(0.02, 0.20, -incidence)
      + 0.975 * smoothstep(-0.15, 0.54, incidence);
    gl_FragColor = vec4(vec3(0.105, 0.26, 0.68), edge * light * 0.58);
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

function atmosphereShell(radius, surface) {
  const geometry = new THREE.SphereGeometry(radius * 1.012, 100, 60)
  const material = new THREE.ShaderMaterial({
    uniforms: { sunDirection: surface.uniforms.sunDirection },
    vertexShader: SPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 3
  return mesh
}

function cloudShell(radius, surface) {
  const geometry = new THREE.SphereGeometry(radius * 1.0037, 120, 64)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: surface.uniforms.cloudMap,
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
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.y = -Math.PI / 2
  mesh.renderOrder = 2
  mesh.visible = false
  return mesh
}

function releaseMesh(scene, mesh) {
  scene.remove(mesh)
  mesh.geometry.dispose()
  mesh.material.dispose()
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
  const cloudLayer = useRef(null)
  const overviewFrame = useRef(null)
  const overviewStopped = useRef(false)
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
    const texture = loader.load(DAY_MAP, (image) => {
      if (finished) {
        image.dispose()
        return
      }
      window.clearTimeout(timeout)
      image.colorSpace = THREE.SRGBColorSpace
      image.wrapS = THREE.RepeatWrapping
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
    const isTouchScreen = window.matchMedia('(pointer: coarse)').matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouchScreen ? 1.35 : 1.75))
    globe.lights([new THREE.AmbientLight(0xffffff, 1.25)])
    const scene = globe.scene()
    const radius = globe.getGlobeRadius()
    const air = atmosphereShell(radius, surface)
    const cloudMesh = cloudShell(radius, surface)
    cloudLayer.current = { mesh: cloudMesh, texture: null }
    scene.add(cloudMesh, air)

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
      cloudLayer.current?.texture?.dispose()
      cloudLayer.current = null
      surface.uniforms.hasClouds.value = false
      surface.uniforms.cloudMap.value = null
      releaseMesh(scene, cloudMesh)
      releaseMesh(scene, air)
      sceneSetup.current = null
    }
  }, [onReady, onUnavailable, surface])

  // The globe library may fire its ready callback from its initial layout pass,
  // before React assigns the imperative ref on the wrapper.
  useEffect(() => {
    if (earthTexture && size && !ready) setupGlobe()
  }, [earthTexture, ready, setupGlobe, size])

  useEffect(() => () => sceneSetup.current?.(), [])

  useEffect(() => {
    if (!ready || !size) return
    const camera = globeRef.current.camera()
    const stageRatio = Math.max(1, 0.97 * size.height / size.width)
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(HALF_VIEW_ANGLE) * stageRatio))
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

  const stopOverview = useCallback(() => {
    overviewStopped.current = true
    if (overviewFrame.current !== null) {
      cancelAnimationFrame(overviewFrame.current)
      overviewFrame.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready || reducedMotion || markerData.length || overviewStopped.current) return

    const globe = globeRef.current
    const origin = globe.pointOfView()
    let elapsed = 0
    let frameTime = null
    function advance(now) {
      overviewFrame.current = null
      if (overviewStopped.current) return
      if (frameTime !== null) elapsed += Math.min(80, now - frameTime)
      frameTime = now
      const progress = Math.min(elapsed / OVERVIEW_DRIFT.duration, 1)
      const turn = OVERVIEW_DRIFT.degrees * progress * progress * (3 - 2 * progress)
      globe.pointOfView({ ...origin, lng: origin.lng + turn }, 0)
      if (progress < 1) overviewFrame.current = requestAnimationFrame(advance)
      else stopOverview()
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !overviewStopped.current && overviewFrame.current === null) {
        overviewFrame.current = requestAnimationFrame(advance)
      } else if (!entry.isIntersecting && overviewFrame.current !== null) {
        cancelAnimationFrame(overviewFrame.current)
        overviewFrame.current = null
        frameTime = null
      }
    })
    observer.observe(hostRef.current)
    return () => {
      observer.disconnect()
      if (overviewFrame.current !== null) cancelAnimationFrame(overviewFrame.current)
      overviewFrame.current = null
    }
  }, [markerData.length, ready, reducedMotion, stopOverview])

  useEffect(() => {
    let active = true
    const night = new THREE.TextureLoader().load(NIGHT_MAP, (texture) => {
      if (!active) return
      // These channels represent intensity, not display color.
      texture.colorSpace = THREE.NoColorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.anisotropy = 8
      surface.uniforms.nightMap.value = texture
      surface.uniforms.hasNight.value = true
    }, undefined, () => {})
    return () => {
      active = false
      surface.uniforms.hasNight.value = false
      surface.uniforms.nightMap.value = null
      night.dispose()
    }
  }, [surface])

  useEffect(() => {
    const layer = cloudLayer.current
    if (!ready || !layer) return
    if (!clouds) {
      layer.mesh.visible = false
      layer.texture?.dispose()
      layer.texture = null
      surface.uniforms.hasClouds.value = false
      surface.uniforms.cloudMap.value = null
      return
    }
    let active = true
    let settled = false
    const result = (state) => {
      if (!active || settled) return
      settled = true
      window.clearTimeout(timeout)
      onCloudStatus({ state, source: clouds.source })
    }
    onCloudStatus({ state: 'loading', source: clouds.source })
    const timeout = window.setTimeout(() => result('unavailable'), 10_000)
    const texture = new THREE.TextureLoader().load(clouds.url, (image) => {
      if (!active || settled) return
      image.wrapS = THREE.RepeatWrapping
      image.anisotropy = 4
      layer.texture?.dispose()
      layer.texture = image
      surface.uniforms.cloudMap.value = image
      surface.uniforms.hasClouds.value = true
      layer.mesh.visible = true
      result('ready')
    }, undefined, () => result('unavailable'))

    return () => {
      active = false
      window.clearTimeout(timeout)
      // Retain the displayed cloud frame while the next frame downloads.
      if (layer.texture !== texture) texture.dispose()
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
    stopOverview()
    globeRef.current.pointOfView(
      { lat: point.lat, lng: point.lng, altitude: SELECTED_ALTITUDE },
      reducedMotion ? 0 : 1500,
    )
  }, [markerData, ready, reducedMotion, stopOverview])

  function startGesture(event) {
    if (!ready || event.button !== 0 || !event.isPrimary) return
    stopOverview()
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
      stopOverview()
      onCityClick({ lat: view.lat, lng: view.lng })
    } else if (directions[event.key]) {
      event.preventDefault()
      stopOverview()
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
    {size && earthTexture && <ReactGlobe
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
