import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, CalendarDays, ChevronDown, ChevronRight, CircleHelp, Cloud, CloudRain, Database, Droplet, ExternalLink, GitCompareArrows, LayoutGrid, Leaf, LoaderCircle, MapPin, Satellite, Search, ShieldAlert, Sprout, Thermometer, Wind, X } from 'lucide-react'
import { ClimateChart, getPeriod, MetricStrip } from './components/Climate.jsx'
import { CalendarView, CropView, RiskView, SoilView } from './components/DetailViews.jsx'
import LocalAtmosphere from './components/LocalAtmosphere.jsx'
import RotationPlanner from './components/RotationPlanner.jsx'
import { fetchSatelliteClouds } from './api/satelliteClouds.js'
import { getCitiesForCountry, LOCATIONS, searchLocalLocations } from './data/locations.js'
import { placeMatchesQuery, searchPlaces } from './api/geocode.js'
import { analyzeAllTrends } from './analysis/trends.js'
import { ADVISORY_SOURCES, buildAdvisory } from './analysis/advisory.js'
import { useFieldSearch } from './hooks/useFieldSearch.js'

const NAVIGATION = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'climate', label: 'Climate trends', icon: Thermometer },
  { id: 'soil', label: 'Soil profile', icon: Database },
  { id: 'crops', label: 'Crop advisor', icon: Sprout },
  { id: 'rotations', label: 'Rotation planner', icon: GitCompareArrows },
  { id: 'risks', label: 'Risk & health', icon: ShieldAlert },
  { id: 'calendar', label: 'Planting calendar', icon: CalendarDays },
]
const NAVIGATION_GROUPS = [
  { label: 'Observe', items: NAVIGATION.slice(0, 3) },
  { label: 'Plan', items: NAVIGATION.slice(3) },
]
const CHALLENGE_URL = 'https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/'

const RISK_ICONS = { heat: Thermometer, drought: Droplet, flood: CloudRain, frost: Wind }
const RISK_LEVELS = { elevated: 'Elevated', watch: 'Watch', limited: 'Limited signal', unknown: 'Insufficient data' }

const Globe = lazy(() => import('./components/Globe.jsx'))
const CanvasGlobe = lazy(() => import('./components/CanvasGlobe.jsx'))
const BASE_CLOUDS = { url: import.meta.env.BASE_URL + 'earth-clouds-archive.webp', source: 'archive' }
const CLOUD_REFRESH = 15 * 60_000
const SATELLITE_CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

function globeRenderer() {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2', { antialias: false })
    if (context) {
      context.getExtension('WEBGL_lose_context')?.loseContext()
      return 'webgl'
    }
  } catch {
    // The photographic projection can render without a WebGL context.
  }
  return 'canvas'
}

class GlobeBoundary extends React.Component {
  state = { unavailable: false }

  static getDerivedStateFromError() {
    return { unavailable: true }
  }

  componentDidCatch() {
    this.props.onUnavailable()
  }

  render() {
    return this.state.unavailable ? null : this.props.children
  }
}

function getView() {
  return NAVIGATION.some((item) => item.id === window.location.hash.slice(1))
    ? window.location.hash.slice(1) : 'overview'
}

function coordinates(location) {
  const display = (value, positive, negative) => Math.abs(value).toFixed(2) + '° ' + (value < 0 ? negative : positive)
  return display(location.lat, 'N', 'S') + '  /  ' + display(location.lon, 'E', 'W')
}

function locationLabel(location) {
  if (location.isCountry) return 'Country'
  return [location.region, location.country].filter((name, index, list) => name && list.indexOf(name) === index).join(', ')
}

function SearchBox({ location, busy, onSearch, variant = 'hero' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState([])
  const [hasQueried, setHasQueried] = useState(false)
  const focus = useRef(null)
  const form = useRef(null)
  const timer = useRef(null)
  const abortController = useRef(null)

  const isCountry = Boolean(location?.isCountry)
  const countryCode = isCountry ? location.countryCode : null

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setHasQueried(false)
      abortController.current?.abort()
      let initial = searchLocalLocations('', { countryCode })
      if (!initial.length && countryCode) {
        getCitiesForCountry(countryCode, null, 5)
      }
      setMatches(initial.length ? initial.slice(0, 5) : LOCATIONS.slice(0, 5))
      return
    }

    setHasQueried(true)
    const instant = searchLocalLocations(trimmed, { countryCode })
    setMatches(instant)

    clearTimeout(timer.current)
    abortController.current?.abort()
    const controller = new AbortController()
    abortController.current = controller

    timer.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(trimmed, { signal: controller.signal, limit: 8, countryCode })
        if (!controller.signal.aborted) {
          setMatches(results)
        }
      } catch {
        // Ignored
      }
    }, 180)

    return () => {
      clearTimeout(timer.current)
      controller.abort()
    }
  }, [query, countryCode])

  async function submit(value) {
    if (!value) return
    const isObject = typeof value === 'object' && Number.isFinite(value?.lat) && Number.isFinite(value?.lon)
    const rawQuery = isObject ? value.name : String(value).trim()
    if (!rawQuery) return

    if (isObject) {
      setOpen(false)
      const res = await onSearch(value)
      if (res && !res.ambiguous) setQuery('')
      return
    }

    const candidateMatches = matches.filter((m) => placeMatchesQuery(m, rawQuery))
    if (candidateMatches.length > 1) {
      const firstName = candidateMatches[0].name.toLowerCase()
      const allSameName = candidateMatches.every((m) => m.name.toLowerCase() === firstName)
      if (allSameName) {
        setOpen(true)
        requestAnimationFrame(() => form.current?.querySelector('.location-option')?.focus())
        return
      }
    }

    if (candidateMatches.length === 1) {
      setOpen(false)
      const res = await onSearch(candidateMatches[0])
      if (res && !res.ambiguous) setQuery('')
      return
    }

    const submittedText = query
    const res = await onSearch(rawQuery)
    if (res && !res.ambiguous) {
      setOpen(false)
      setQuery((current) => current === submittedText ? '' : current)
    } else if (res?.ambiguous && res?.choices?.length) {
      setMatches(res.choices)
      setOpen(true)
      requestAnimationFrame(() => form.current?.querySelector('.location-option')?.focus())
    } else {
      setMatches([])
      setOpen(true)
    }
  }

  const placeholderText = isCountry
    ? `Search city or town in ${location.name}…`
    : 'City, town, or country'

  return <form className={`location-search location-search-${variant}`} role="search" ref={form} onBlur={(event) => {
    if (!form.current?.contains(event.relatedTarget)) setOpen(false)
  }} onSubmit={(event) => {
    event.preventDefault()
    submit(query)
  }} onKeyDown={(event) => {
    if (event.key === 'Escape') { setOpen(false); focus.current?.focus() }
    if (event.key === 'ArrowDown' && event.target === focus.current && matches.length) {
      event.preventDefault()
      setOpen(true)
      requestAnimationFrame(() => form.current?.querySelector('.location-option')?.focus())
    }
  }}>
    <div className="search-input">
      <Search size={19} aria-hidden="true" />
      <input ref={focus} type="search" aria-label="Search by city, town, or country" placeholder={placeholderText} value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} autoComplete="off" />
      <button type="submit" className="button button-primary" disabled={!query.trim() || busy} aria-busy={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />} <span>{busy ? 'Locating' : 'Analyze'}</span></button>
    </div>
    {open && <div className="location-options" aria-label="Suggested locations">
      <span className="location-options-label">
        {query.trim()
          ? (matches.length > 1 && matches.every((m) => m.name.toLowerCase() === matches[0].name.toLowerCase())
              ? 'Select region for ' + matches[0].name
              : 'Matching locations')
          : (isCountry ? `Cities & towns in ${location.name}` : 'Explore a location')}
      </span>
      {matches.length > 0 ? (
        matches.map((item) => <button key={item.id} type="button" className="location-option" onClick={() => submit(item)}>
          <MapPin size={15} />
          <span><strong>{item.name}</strong><small>{locationLabel(item)}</small></span>
          {item.isCountry && <span className="location-type-tag">Country</span>}
          {!item.isCountry && item.type && item.type !== 'city' && <span className="location-type-tag">{item.type}</span>}
          {location.id === item.id && <i>Selected</i>}
        </button>)
      ) : hasQueried ? (
        <div className="location-options-empty" role="status">No matching country, city, or town found.</div>
      ) : null}
    </div>}
  </form>
}

function Hero({ location, selectedCity, onSearch, busy }) {
  const [globeReady, setGlobeReady] = useState(false)
  const [renderer, setRenderer] = useState(globeRenderer)
  const [cloudMode, setCloudMode] = useState('archive')
  const [satelliteClouds, setSatelliteClouds] = useState(null)
  const [satelliteUnavailable, setSatelliteUnavailable] = useState(false)
  const [cloudStatus, setCloudStatus] = useState(null)

  const isCountry = Boolean(location.isCountry)
  const quickLocations = useMemo(() => {
    if (isCountry) {
      const countryCities = LOCATIONS.filter((item) => item.countryCode === location.countryCode)
      return (countryCities.length ? countryCities : LOCATIONS).slice(0, 3)
    }
    return LOCATIONS.filter((item) => item.id !== location.id).slice(0, 3)
  }, [location, isCountry])

  const markReady = useCallback(() => setGlobeReady(true), [])
  const markUnavailable = useCallback(() => {
    setGlobeReady(false)
    setRenderer((current) => current === 'webgl' ? 'canvas' : 'unavailable')
  }, [])
  const selectPoint = useCallback(({ lat, lng }) => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) onSearch({ lat, lng })
  }, [onSearch])

  const canRenderGlobe = renderer !== 'unavailable'
  const requestsSatellite = canRenderGlobe && cloudMode === 'satellite'
  const ActiveGlobe = renderer === 'canvas' ? CanvasGlobe : Globe
  const clouds = cloudMode === 'off' ? null
    : requestsSatellite && satelliteClouds && !satelliteUnavailable ? satelliteClouds : BASE_CLOUDS

  useEffect(() => {
    if (!requestsSatellite) return
    const request = new AbortController()
    let activeUrl
    let displayedTimestamp
    let updating = false

    async function refresh() {
      if (updating || request.signal.aborted) return
      updating = true
      try {
        const { image, timestamp } = await fetchSatelliteClouds({ signal: request.signal })
        request.signal.throwIfAborted()
        if (timestamp === displayedTimestamp) return
        const previousUrl = activeUrl
        activeUrl = URL.createObjectURL(image)
        displayedTimestamp = timestamp
        setSatelliteUnavailable(false)
        setSatelliteClouds({ url: activeUrl, timestamp, source: 'satellite' })
        if (previousUrl) URL.revokeObjectURL(previousUrl)
      } catch {
        if (request.signal.aborted || activeUrl) return
        setSatelliteUnavailable(true)
      } finally {
        updating = false
      }
    }

    function refreshVisible() {
      if (document.visibilityState === 'visible') refresh()
    }

    setSatelliteUnavailable(false)
    refresh()
    const timer = window.setInterval(refreshVisible, CLOUD_REFRESH)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      request.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshVisible)
      if (activeUrl) URL.revokeObjectURL(activeUrl)
      setSatelliteClouds(null)
    }
  }, [requestsSatellite])

  const updateClouds = useCallback((status) => {
    setCloudStatus(status)
    if (status.source === 'satellite' && status.state === 'unavailable') setSatelliteUnavailable(true)
  }, [])
  const satelliteVisible = requestsSatellite && !satelliteUnavailable && satelliteClouds
    && cloudStatus?.source === 'satellite' && cloudStatus.state === 'ready'
    && (!cloudStatus.timestamp || cloudStatus.timestamp === satelliteClouds.timestamp)
  const stamp = satelliteVisible ? SATELLITE_CLOCK.format(new Date(satelliteClouds.timestamp)) + ' UTC' : ''
  const archiveUnavailable = cloudStatus?.source === 'archive' && cloudStatus.state === 'unavailable'
  const globeCaption = satelliteVisible ? 'Satellite clouds · ' + stamp
    : cloudMode === 'off' ? 'Clouds off'
      : requestsSatellite ? (satelliteUnavailable ? 'Satellite clouds unavailable' : 'Loading satellite clouds…')
        : archiveUnavailable ? 'NASA cloud composite unavailable' : 'NASA Blue Marble cloud composite'

  return <section className="hero" aria-labelledby="outlook-title">
    <div className="hero-body">
      <div className="hero-kicker"><Satellite size={15} aria-hidden="true" /> Farm climate observatory</div>
      <h1 id="outlook-title">{location.name}</h1>
      <div className="hero-place"><MapPin size={16} /><span>{locationLabel(location) || 'Selected location'}</span><span className="hero-separator" /><span className="hero-coordinates">{coordinates(location)}</span></div>
      {isCountry ? (
        <p className="hero-country-hint">Selected country: <strong>{location.name}</strong>. Choose a city or town below to analyze local farm climate and soil data.</p>
      ) : (
        <p>Use NASA climate records to see how heat and rainfall are shifting, then plan what to grow next.</p>
      )}
      <SearchBox location={location} busy={busy} onSearch={onSearch} />
      <div className="hero-quick"><span>{isCountry ? 'Explore cities' : 'Quick look'}</span>{quickLocations.map((item) => <button type="button" key={item.id} onClick={() => onSearch(item)}>{item.name}<ChevronRight size={12} /></button>)}</div>
    </div>
    <div className="hero-visual">
      <div className="hero-globe-frame" data-ready={globeReady || undefined}>
        {!globeReady && <div className="hero-globe-loading" role="status">
          {canRenderGlobe && <LoaderCircle size={15} className="spin" aria-hidden="true" />}
          {canRenderGlobe ? 'Loading Earth…' : 'Interactive Earth unavailable'}
        </div>}
        {canRenderGlobe && <div className="hero-globe" aria-hidden={!globeReady} inert={!globeReady}>
          <GlobeBoundary key={renderer} onUnavailable={markUnavailable}>
            <Suspense fallback={null}>
              <ActiveGlobe selectedCity={selectedCity} onCityClick={selectPoint} onReady={markReady} onUnavailable={markUnavailable} clouds={clouds} onCloudStatus={updateClouds} />
            </Suspense>
          </GlobeBoundary>
        </div>}
        {globeReady && <label className="hero-globe-control">
          <Cloud size={14} aria-hidden="true" />
          <select aria-label="Globe clouds" value={cloudMode} onChange={(event) => setCloudMode(event.target.value)}>
            <option value="archive">NASA clouds</option>
            <option value="satellite">Latest satellite</option>
            <option value="off">Clouds off</option>
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>}
      </div>
      {canRenderGlobe && <div className="hero-globe-meta">
        <span className="hero-globe-hint">Drag to rotate. Select land to explore.</span>
        <div className="hero-caption">
          <span role="status">{globeCaption}</span>
          <small><a href="https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/" target="_blank" rel="noreferrer">NASA Earth Observatory</a>{satelliteVisible && <> · <a href="https://www.eumetsat.int/eumetsat-data-licensing" target="_blank" rel="noreferrer">Contains modified EUMETSAT data</a></>}</small>
        </div>
      </div>}
    </div>
  </section>
}

function SeasonalSignals({ advisory, location, navigate, isLoading }) {
  const order = ['elevated', 'watch', 'limited', 'unknown']
  const signals = [...(advisory?.risks ?? [])].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level)).slice(0, 3)
  return <section className="panel signals-panel">
    <div className="panel-head"><div><h2>Field signals</h2><p>Seasonal risks in the climate record</p></div><span className="signal-head-icon"><ShieldAlert size={18} /></span></div>
    <div className="signal-list">
      {signals.length ? signals.map((signal) => {
        const Icon = RISK_ICONS[signal.id] ?? ShieldAlert
        return <div className="signal-row" key={signal.id}>
          <span className={`signal-icon tone-${signal.level}`}><Icon size={17} /></span>
          <div><strong>{signal.name}</strong><p>{signal.signal}</p></div>
          <span className={`signal-level tone-${signal.level}`}>{RISK_LEVELS[signal.level] ?? signal.level}</span>
        </div>
      }) : <p className="empty-note" role={isLoading ? 'status' : undefined}>{isLoading ? `Loading climate indicators for ${location.name}…` : `Seasonal indicators require a climate record for ${location.name}.`}</p>}
    </div>
    <button type="button" className="section-link" onClick={() => navigate('risks')}>Explore risk & health <ArrowRight size={15} /></button>
  </section>
}

function PlanningPreview({ advisory, soil, soilStatus, climateStatus, irrigation, navigate }) {
  const crops = (advisory?.crops ?? []).filter((crop) => Number.isFinite(crop.score)).slice().sort((a, b) => b.score - a.score).slice(0, 3)
  return <div className="overview-grid planning-grid">
    <section className="panel planning-panel">
      <div className="panel-head"><div><h2>Crop shortlist</h2><p>{irrigation === 'irrigated' ? 'Irrigated' : 'Rainfed'} fit{soilStatus === 'loading' ? ' · soil readings pending' : ''}</p></div><button type="button" className="panel-link" onClick={() => navigate('crops')}>Crop advisor <ArrowRight size={14} /></button></div>
      {crops.length ? <div className="crop-preview">{crops.map((crop) => <div key={crop.id}><span className="preview-icon"><Sprout size={17} /></span><span><strong>{crop.name}</strong><small>{crop.season}</small></span><b>{Math.round(crop.score)}<small> / 100</small></b></div>)}</div> : <p className="empty-note">{climateStatus === 'loading' ? 'Waiting for the climate record…' : advisory?.cropNote || 'Crop screening requires climate history.'}</p>}
    </section>
    <section className="panel planning-panel soil-preview">
      <div className="panel-head"><div><h2>Surface soil</h2><p>Modeled topsoil composition</p></div><span className="signal-head-icon"><Database size={18} /></span></div>
      {soil ? <div className="soil-mini"><div><strong>{soil.texture || 'Texture unavailable'}</strong><span>{Number.isFinite(soil.ph) ? 'pH ' + soil.ph.toFixed(1) : 'pH unavailable'}</span></div>
        <div className="soil-bar" aria-hidden="true">{['sand', 'silt', 'clay'].map((part) => <i key={part} className={'soil-' + part} style={{ flexGrow: soil[part] || 0 }} />)}</div>
        <div className="soil-legend">{['sand', 'silt', 'clay'].map((part) => <span key={part}><i className={'soil-' + part} />{part} {Number.isFinite(soil[part]) ? Math.round(soil[part]) + '%' : '—'}</span>)}</div>
      </div> : <p className="empty-note" role={soilStatus === 'loading' ? 'status' : undefined}>{soilStatus === 'loading' ? 'Checking SoilGrids for this point…' : 'Soil estimates are unavailable at this location.'}</p>}
      <button type="button" className="section-link" onClick={() => navigate('soil')}>View soil profile <ArrowRight size={15} /></button>
    </section>
  </div>
}

function RotationEntry({ navigate }) {
  return <section className="panel rotation-entry" aria-labelledby="rotation-entry-title">
    <div className="rotation-entry-icon" aria-hidden="true"><GitCompareArrows size={25} /></div>
    <div><h2 id="rotation-entry-title">Compare crop rotations</h2><p>Pair Pakistan’s cool-season Rabi and warm-season Kharif crops. Compare climate fit, water needs, and planting windows.</p></div>
    <button type="button" className="button button-outline" onClick={() => navigate('rotations')}>Rotation planner <ArrowRight size={15} /></button>
  </section>
}

function Methods({ dialogRef, onClose }) {
  const advisoryLinks = Array.isArray(ADVISORY_SOURCES) ? ADVISORY_SOURCES.flatMap((source) => typeof source === 'object' && source?.url ? [{ href: source.url, label: source.name ?? source.label ?? source.title }] : []) : []
  const sources = [
    { href: CHALLENGE_URL, label: '2026 Field Shift challenge' },
    { href: 'https://power.larc.nasa.gov/docs/services/api/temporal/monthly/', label: 'NASA POWER monthly data' },
    { href: 'https://isric.org/explore/soilgrids/', label: 'ISRIC SoilGrids' },
    { href: 'https://www.openstreetmap.org/copyright', label: 'OpenStreetMap contributors' },
    { href: 'https://www.geonames.org/', label: 'GeoNames place names' },
    { href: 'https://creativecommons.org/licenses/by/4.0/', label: 'GeoNames data license' },
    { href: 'https://open-meteo.com/en/docs', label: 'Open-Meteo weather model' },
    { href: 'https://view.eumetsat.int/', label: 'EUMETSAT satellite imagery' },
    { href: 'https://svs.gsfc.nasa.gov/4851/', label: 'NASA SVS star field' },
    ...advisoryLinks,
  ]
  return <dialog className="method-dialog" ref={dialogRef} onClose={onClose} onClick={(event) => {
    if (event.target === event.currentTarget) event.currentTarget.close()
  }}>
    <div className="dialog-inner">
      <div className="dialog-head"><div><span className="context-label"><CircleHelp size={15} /> FieldShift</span><h2>Data & methodology</h2></div><button type="button" className="icon-button" aria-label="Close methodology" onClick={() => dialogRef.current.close()}><X size={20} /></button></div>
      <div className="method-body">
        <section><h3>Climate history</h3><p>NASA POWER agroclimatology monthly records cover 2001–2025. We aggregate complete years, sum monthly precipitation in millimetres, and fit linear trends with a two-sided 5% significance threshold. A weak trend can coexist with substantial year-to-year variation.</p></section>
        <section><h3>Globe and current conditions</h3><p>The default cloud layer uses a NASA Blue Marble composite. Latest satellite mode shows timestamped EUMETSAT infrared imagery when available. The local conditions use Open-Meteo model estimates for the selected location. The daylight boundary follows the calculated position of the Sun in UTC. Night lighting uses NASA’s Black Marble satellite composite. The star field uses NASA’s Deep Star Maps, visualized by Ernie Wright.</p></section>
        <section><h3>Spatial resolution</h3><p>Climate data describe a regional grid cell around the selected location. SoilGrids provides modeled surface estimates. Use a field sample to confirm soil pH and texture before making field-level decisions.</p></section>
        <section><h3>Crops and seasonal timing</h3><p>The advisor screens growing-season climate, water assumptions and available soil measures. The rotation planner pairs Rabi and Kharif crops whose reference windows fit within one year. Planting windows vary by region, cultivar and farm management.</p></section>
        <section><h3>Finding a location</h3><p>The local GeoNames index resolves many city searches. OpenStreetMap supplies additional search results and place names for globe selections. Climate and soil load independently.</p></section>
        <section><h3>Risk and worker health</h3><p>Historical conditions identify exposure signals worth investigating. Use current local weather, river alerts and public health guidance for immediate decisions.</p></section>
        <div className="method-sources">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={13} /></a>)}</div>
      </div>
    </div>
  </dialog>
}

export default function App() {
  const [view, setView] = useState(getView)
  const [metric, setMetric] = useState('T2M')
  const [irrigation, setIrrigation] = useState('rainfed')
  const [exporting, setExporting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [searching, setSearching] = useState(false)
  const methodDialog = useRef(null)
  const searchDialog = useRef(null)
  const { location, dataset, hasAnalyzed, busy, climateStatus, soilStatus, error, climateError, setError, runSearch } = useFieldSearch()
  const climate = dataset?.climate
  const soil = dataset?.soil
  const isClimateLoading = climateStatus === 'loading'
  const latestNotice = reportError || (!searching ? error : '')
  const trends = useMemo(() => climate ? analyzeAllTrends(climate) : {}, [climate])
  const advisory = useMemo(() => climate ? buildAdvisory(climate, trends, soil, location, { irrigation }) : null, [climate, trends, soil, location, irrigation])

  useEffect(() => {
    const update = () => setView(getView())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  useEffect(() => {
    searchDialog.current?.querySelector('input')?.focus()
  }, [searching])

  function navigate(next) {
    setView(next)
    window.location.hash = next === 'overview' ? '' : next
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const selectLocation = useCallback(async (query) => {
    setReportError('')
    const found = await runSearch(query)
    if (found && !found.ambiguous && searchDialog.current?.open) searchDialog.current.close()
    return found
  }, [runSearch])

  async function exportReport() {
    if (!climate) return
    setExporting(true)
    setReportError('')
    try {
      const { downloadReport } = await import('./analysis/report.js')
      await downloadReport({ location, climate, soil, trends, advisory, irrigation })
    } catch {
      setReportError('Could not create the report. Try downloading it again.')
    } finally {
      setExporting(false)
    }
  }

  return <>
    <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus() }}>Skip to content</a>
    <div className="app">
      <aside className="side-rail">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); navigate('overview') }}><span className="brand-icon"><Leaf size={22} strokeWidth={2.3} /></span><span>FieldShift<small>Earth observation</small></span></a>
        <div className="rail-main">
          <nav className="main-nav" aria-label="Dashboard">
            {NAVIGATION_GROUPS.map((group) => <div className="nav-group" key={group.label}>
              <span className="rail-label">{group.label}</span>
              {group.items.map(({ id, label, icon: Icon }) => <a key={id} href={id === 'overview' ? '#' : '#' + id} aria-current={view === id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(id) }}><Icon size={17} /><span>{label}</span>{view === id && <i />}</a>)}
            </div>)}
          </nav>
        </div>
        <div className="rail-footer">
          <button type="button" className="rail-method" onClick={() => methodDialog.current.showModal()}><CircleHelp size={17} /> Data & methodology <ExternalLink size={12} /></button>
          <a className="rail-source" href={CHALLENGE_URL} target="_blank" rel="noreferrer"><span className="source-icon"><Satellite size={17} /></span><div><strong>NASA Space Apps 2026</strong><small>Field Shift challenge <ExternalLink size={10} aria-hidden="true" /></small></div></a>
        </div>
      </aside>
      <div className="app-frame">
        <header className="top-bar">
          <div className="breadcrumbs"><span>Field observatory</span><ChevronRight size={13} /><strong>{NAVIGATION.find((item) => item.id === view)?.label}</strong></div>
          <div className="top-actions">
            <button type="button" className="button button-quiet current-location" aria-label={'Change location from ' + location.name} onClick={() => { setError(''); setSearching(true); searchDialog.current.showModal() }}><MapPin size={16} /><span>{location.name}</span><ChevronDown size={13} /></button>
            <button type="button" className="button button-outline download-button" disabled={!climate || exporting} onClick={exportReport} aria-label="Download PDF report">{exporting ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />} <span>{exporting ? 'Preparing report' : 'Download report'}</span></button>
          </div>
        </header>
        <main className="workspace" id="main-content" tabIndex={-1}>
          {latestNotice && <div className="notice notice-error" role="alert"><ShieldAlert size={17} /><span>{latestNotice}</span><button className="icon-button" type="button" onClick={() => { if (reportError) setReportError(''); else setError('') }} aria-label="Dismiss error"><X size={16} /></button></div>}
          {view === 'overview' && <>
            <Hero location={location} selectedCity={hasAnalyzed ? location : null} busy={busy} onSearch={selectLocation} />
            <LocalAtmosphere location={location} />
            <div className="section-heading"><div><h2>Climate baseline</h2><p>{climate ? `Annual summaries · ${getPeriod(climate)}` : `Climate record for ${location.name}`}</p></div><span className="source-pill" data-loading={isClimateLoading || undefined}><i />{isClimateLoading ? 'Requesting NASA POWER' : climate?.mode === 'snapshot' ? 'NASA POWER archive' : climate ? 'NASA POWER' : 'Climate data unavailable'}</span></div>
            <MetricStrip climate={climate} trends={trends} selected={metric} onSelect={setMetric} isLoading={isClimateLoading} />
            <div className="overview-grid"><ClimateChart climate={climate} trends={trends} selected={metric} onSelect={setMetric} location={location} isLoading={isClimateLoading} error={climateError} /><SeasonalSignals advisory={advisory} location={location} navigate={navigate} isLoading={isClimateLoading} /></div>
            <RotationEntry navigate={navigate} />
            <PlanningPreview advisory={advisory} soil={soil} soilStatus={soilStatus} climateStatus={climateStatus} irrigation={irrigation} navigate={navigate} />
          </>}
          {view === 'climate' && <>
            <div className="detail-head"><div className="context-label"><MapPin size={15} />{location.name}, {location.country}</div><h1>Climate trends</h1><p>Explore seven variables across the {getPeriod(climate)} NASA POWER record.</p></div>
            <MetricStrip climate={climate} trends={trends} selected={metric} onSelect={setMetric} isLoading={isClimateLoading} all />
            <ClimateChart climate={climate} trends={trends} selected={metric} onSelect={setMetric} location={location} isLoading={isClimateLoading} error={climateError} />
          </>}
          {view === 'crops' && <CropView advisory={advisory} location={location} irrigation={irrigation} onIrrigationChange={setIrrigation} isLoading={isClimateLoading} soilStatus={soilStatus} />}
          {view === 'rotations' && <RotationPlanner advisory={advisory} location={location} irrigation={irrigation} onIrrigationChange={setIrrigation} isLoading={isClimateLoading} soilStatus={soilStatus} />}
          {view === 'risks' && <RiskView advisory={advisory} location={location} isLoading={isClimateLoading} />}
          {view === 'calendar' && <CalendarView advisory={advisory} location={location} isLoading={isClimateLoading} />}
          {view === 'soil' && <SoilView soil={soil} location={location} soilStatus={soilStatus} />}
          <footer className="workspace-footer"><span>NASA POWER · ISRIC SoilGrids · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">© GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>)</span><button type="button" onClick={() => methodDialog.current.showModal()}>Data & methodology <ExternalLink size={12} /></button></footer>
        </main>
      </div>
    </div>
    <Methods dialogRef={methodDialog} />
    <dialog ref={searchDialog} className="search-dialog" onClose={() => setSearching(false)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
      <div className="dialog-inner">
        <div className="dialog-head"><div><h2>Change location</h2><p>Search for a country, city, or town near your farm.</p></div><button type="button" className="icon-button" aria-label="Close location search" onClick={() => searchDialog.current.close()}><X size={20} /></button></div>
        {searching && <SearchBox variant="dialog" location={location} busy={busy} onSearch={selectLocation} />}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-cities">{LOCATIONS.map((item) => <button type="button" key={item.id} onClick={() => selectLocation(item)}><MapPin size={16} /><span>{item.name}<small>{locationLabel(item)}</small></span><ChevronRight size={15} /></button>)}</div>
      </div>
    </dialog>
  </>
}
