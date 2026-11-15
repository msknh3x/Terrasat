import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, CalendarDays, ChevronDown, ChevronRight, CircleHelp, CloudRain, Database, Droplet, ExternalLink, Globe2, LayoutGrid, Leaf, LoaderCircle, MapPin, Search, ShieldAlert, Sprout, Thermometer, Wind, X } from 'lucide-react'
import { ClimateChart, getPeriod, MetricStrip } from './components/Climate.jsx'
import { CalendarView, CropView, RiskView, SoilView } from './components/DetailViews.jsx'
import { loadFieldData, getDemoFieldData } from './api/fieldData.js'
import { geocodeCity } from './api/geocode.js'
import { DEFAULT_LOCATION, LOCATIONS, searchLocalLocations } from './data/locations.js'
import { analyzeAllTrends } from './analysis/trends.js'
import { ADVISORY_SOURCES, buildAdvisory } from './analysis/advisory.js'

const NAVIGATION = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'climate', label: 'Climate trends', icon: Thermometer },
  { id: 'soil', label: 'Soil profile', icon: Database },
  { id: 'crops', label: 'Crop advisor', icon: Sprout },
  { id: 'risks', label: 'Risk & health', icon: ShieldAlert },
  { id: 'calendar', label: 'Planting calendar', icon: CalendarDays },
]

const RISK_ICONS = { heat: Thermometer, drought: Droplet, flood: CloudRain, frost: Wind }
const RISK_LEVELS = { elevated: 'Elevated', watch: 'Watch', limited: 'Limited signal', unknown: 'Insufficient data' }

function getView() {
  return NAVIGATION.some((item) => item.id === window.location.hash.slice(1))
    ? window.location.hash.slice(1) : 'overview'
}

function coordinates(location) {
  const display = (value, positive, negative) => Math.abs(value).toFixed(2) + '° ' + (value < 0 ? negative : positive)
  return display(location.lat, 'N', 'S') + '  /  ' + display(location.lon, 'E', 'W')
}

function locationLabel(location) {
  return [location.region, location.country].filter((name, index, list) => name && list.indexOf(name) === index).join(', ')
}

function SearchBox({ location, busy, onSearch, variant = 'hero' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const matches = query.trim() ? searchLocalLocations(query) : LOCATIONS.slice(0, 5)
  const focus = useRef(null)
  const form = useRef(null)

  async function submit(value) {
    if (busy || !String(value?.name ?? value ?? '').trim()) return
    setOpen(false)
    const success = await onSearch(value)
    if (success) setQuery('')
  }

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
      <input ref={focus} type="search" aria-label="Search by city or farm location" placeholder="Search city or farm location" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} autoComplete="off" />
      <button type="submit" className="button button-primary" disabled={busy || !query.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />} <span>{busy ? 'Analyzing' : 'Analyze'}</span></button>
    </div>
    {open && matches.length > 0 && <div className="location-options" aria-label="Suggested locations">
      <span className="location-options-label">{query.trim() ? 'Matching launch locations' : 'Explore a location'}</span>
      {matches.map((item) => <button key={item.id} type="button" className="location-option" disabled={busy} onClick={() => submit(item)}><MapPin size={15} /><span><strong>{item.name}</strong><small>{locationLabel(item)}</small></span>{location.id === item.id && <i>Selected</i>}</button>)}
    </div>}
  </form>
}

function Hero({ location, climate, onSearch, busy }) {
  return <section className="hero" aria-labelledby="outlook-title">
    <div className="hero-image" />
    <div className="hero-body">
      <div className="hero-kicker"><span /> Farm climate outlook</div>
      <h1 id="outlook-title">{location.name}</h1>
      <div className="hero-place"><MapPin size={16} /><span>{locationLabel(location) || 'Selected location'}</span><span className="hero-separator" /><span className="hero-coordinates">{coordinates(location)}</span></div>
      <p>Explore how local climate has changed and what it means for your next growing season.</p>
      <SearchBox location={location} busy={busy} onSearch={onSearch} />
      <div className="hero-quick"><span>Explore</span>{LOCATIONS.filter((item) => item.id !== location.id).slice(0, 3).map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => onSearch(item)}>{item.name}<ChevronRight size={12} /></button>)}</div>
    </div>
    <div className="hero-map-marker" aria-hidden="true"><MapPin size={24} /><span>{location.name}</span></div>
    <div className="hero-caption"><span>{getPeriod(climate)} climate record</span><small>Illustrative aerial view</small></div>
  </section>
}

function SeasonalSignals({ advisory, location, navigate }) {
  const order = ['elevated', 'watch', 'limited', 'unknown']
  const signals = [...(advisory?.risks ?? [])].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level)).slice(0, 3)
  return <section className="panel signals-panel">
    <div className="panel-head"><div><h2>Seasonal signals</h2><p>Historical climate indicators</p></div><span className="signal-head-icon"><ShieldAlert size={18} /></span></div>
    <div className="signal-list">
      {signals.length ? signals.map((signal) => {
        const Icon = RISK_ICONS[signal.id] ?? ShieldAlert
        return <div className="signal-row" key={signal.id}>
          <span className={`signal-icon tone-${signal.level}`}><Icon size={17} /></span>
          <div><strong>{signal.name}</strong><p>{signal.signal}</p></div>
          <span className={`signal-level tone-${signal.level}`}>{RISK_LEVELS[signal.level] ?? signal.level}</span>
        </div>
      }) : <p className="empty-note">Climate history is needed to assess seasonal signals for {location.name}.</p>}
    </div>
    <button type="button" className="section-link" onClick={() => navigate('risks')}>Explore risk & health <ArrowRight size={15} /></button>
  </section>
}

function PlanningPreview({ advisory, soil, navigate }) {
  const crops = (advisory?.crops ?? []).filter((crop) => Number.isFinite(crop.score)).slice().sort((a, b) => b.score - a.score).slice(0, 3)
  return <div className="overview-grid planning-grid">
    <section className="panel planning-panel">
      <div className="panel-head"><div><h2>Crop shortlist</h2><p>Highest fit under the selected water setting</p></div><button type="button" className="panel-link" onClick={() => navigate('crops')}>Crop advisor <ArrowRight size={14} /></button></div>
      {crops.length ? <div className="crop-preview">{crops.map((crop) => <div key={crop.id}><span className="preview-icon"><Sprout size={17} /></span><span><strong>{crop.name}</strong><small>{crop.season}</small></span><b>{Math.round(crop.score)}<small> / 100</small></b></div>)}</div> : <p className="empty-note">{advisory?.cropNote || 'Load a climate record to screen crops.'}</p>}
    </section>
    <section className="panel planning-panel soil-preview">
      <div className="panel-head"><div><h2>Surface soil</h2><p>Modeled topsoil composition</p></div><span className="signal-head-icon"><Database size={18} /></span></div>
      {soil ? <div className="soil-mini"><div><strong>{soil.texture || 'Texture unavailable'}</strong><span>{Number.isFinite(soil.ph) ? 'pH ' + soil.ph.toFixed(1) : 'pH unavailable'}</span></div>
        <div className="soil-bar" aria-hidden="true">{['sand', 'silt', 'clay'].map((part) => <i key={part} className={'soil-' + part} style={{ flexGrow: soil[part] || 0 }} />)}</div>
        <div className="soil-legend">{['sand', 'silt', 'clay'].map((part) => <span key={part}><i className={'soil-' + part} />{part} {Number.isFinite(soil[part]) ? Math.round(soil[part]) + '%' : '—'}</span>)}</div>
      </div> : <p className="empty-note">Soil estimates are unavailable at this location.</p>}
      <button type="button" className="section-link" onClick={() => navigate('soil')}>View soil profile <ArrowRight size={15} /></button>
    </section>
  </div>
}

function Methods({ dialogRef, onClose }) {
  const advisoryLinks = Array.isArray(ADVISORY_SOURCES) ? ADVISORY_SOURCES.flatMap((source) => typeof source === 'object' && source?.url ? [{ href: source.url, label: source.name ?? source.label ?? source.title }] : []) : []
  const sources = [
    { href: 'https://power.larc.nasa.gov/docs/services/api/temporal/monthly/', label: 'NASA POWER monthly data' },
    { href: 'https://isric.org/explore/soilgrids/', label: 'ISRIC SoilGrids' },
    { href: 'https://www.openstreetmap.org/copyright', label: 'OpenStreetMap contributors' },
    ...advisoryLinks,
  ]
  return <dialog className="method-dialog" ref={dialogRef} onClose={onClose} onClick={(event) => {
    if (event.target === event.currentTarget) event.currentTarget.close()
  }}>
    <div className="dialog-inner">
      <div className="dialog-head"><div><span className="context-label"><CircleHelp size={15} /> FieldShift</span><h2>Data & methodology</h2></div><button type="button" className="icon-button" aria-label="Close methodology" onClick={() => dialogRef.current.close()}><X size={20} /></button></div>
      <div className="method-body">
        <section><h3>Climate history</h3><p>NASA POWER agroclimatology monthly records cover 2001–2025. We aggregate complete years, sum monthly precipitation in millimetres, and fit linear trends with a two-sided 5% significance threshold. A weak trend can coexist with substantial year-to-year variation.</p></section>
        <section><h3>Spatial resolution</h3><p>Climate data describe a regional grid cell around the selected location. SoilGrids provides modeled surface estimates. Use a field sample to confirm soil pH and texture before making field-level decisions.</p></section>
        <section><h3>Crops and seasonal timing</h3><p>The advisor screens growing-season climate, water assumptions and available soil measures against a small crop library. Planting windows are Pakistan reference windows that vary with cultivar, region and management.</p></section>
        <section><h3>Risk and worker health</h3><p>Historical conditions identify exposure signals worth investigating. Use current local weather, river alerts and public health guidance for immediate decisions.</p></section>
        <div className="method-sources">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={13} /></a>)}</div>
      </div>
    </div>
  </dialog>
}

export default function App() {
  const [view, setView] = useState(getView)
  const [selection, setSelection] = useState(() => ({ location: DEFAULT_LOCATION, dataset: getDemoFieldData(DEFAULT_LOCATION) }))
  const [metric, setMetric] = useState('T2M')
  const [irrigation, setIrrigation] = useState('rainfed')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const dataRequest = useRef(null)
  const methodDialog = useRef(null)
  const searchDialog = useRef(null)
  const { location, dataset } = selection
  const climate = dataset?.climate
  const soil = dataset?.soil
  const trends = useMemo(() => climate ? analyzeAllTrends(climate) : {}, [climate])
  const advisory = useMemo(() => climate ? buildAdvisory(climate, trends, soil, location, { irrigation }) : null, [climate, trends, soil, location, irrigation])

  useEffect(() => {
    const update = () => setView(getView())
    window.addEventListener('hashchange', update)
    return () => {
      window.removeEventListener('hashchange', update)
      dataRequest.current?.abort()
    }
  }, [])

  useEffect(() => {
    searchDialog.current?.querySelector('input')?.focus()
  }, [searching])

  function navigate(next) {
    setView(next)
    window.location.hash = next === 'overview' ? '' : next
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  async function runSearch(query) {
    dataRequest.current?.abort()
    const request = new AbortController()
    dataRequest.current = request
    setBusy(true)
    setError('')
    try {
      const nextLocation = typeof query === 'string' ? await geocodeCity(query, { signal: request.signal }) : query
      if (!nextLocation) throw new Error('Location not found. Try adding a region or country.')
      const nextDataset = await loadFieldData(nextLocation, { signal: request.signal })
      if (!nextDataset?.climate) throw new Error(`Climate data for ${nextLocation.name} is unavailable. Try again or select a launch location.`)
      if (request.signal.aborted) return false
      setSelection({ location: nextLocation, dataset: nextDataset })
      searchDialog.current?.close()
      return true
    } catch (problem) {
      if (!request.signal.aborted) setError(problem.message || 'Location data could not be loaded. Please try again.')
      return false
    } finally {
      if (!request.signal.aborted) setBusy(false)
    }
  }

  async function exportReport() {
    if (!climate) return
    setExporting(true)
    setError('')
    try {
      const { downloadReport } = await import('./analysis/report.js')
      await downloadReport({ location, climate, soil, trends, advisory, irrigation })
    } catch {
      setError('Could not create the report. Try downloading it again.')
    } finally {
      setExporting(false)
    }
  }

  return <>
    <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus() }}>Skip to content</a>
    <div className="app">
      <aside className="side-rail">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); navigate('overview') }}><span className="brand-icon"><Leaf size={22} strokeWidth={2.4} /></span><span>FieldShift<small>Farm climate advisor</small></span></a>
        <div className="rail-main">
          <span className="rail-label">Workspace</span>
          <nav className="main-nav" aria-label="Dashboard">
            {NAVIGATION.map(({ id, label, icon: Icon }) => <a key={id} href={id === 'overview' ? '#' : '#' + id} aria-current={view === id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(id) }}><Icon size={18} /><span>{label}</span>{view === id && <i />}</a>)}
          </nav>
        </div>
        <div className="rail-footer">
          <button type="button" className="rail-method" onClick={() => methodDialog.current.showModal()}><CircleHelp size={17} /> Data & methodology <ExternalLink size={12} /></button>
          <div className="rail-source"><span className="source-icon"><Globe2 size={17} /></span><div><strong>NASA POWER</strong><small>Agroclimatology data</small></div></div>
        </div>
      </aside>
      <div className="app-frame">
        <header className="top-bar">
          <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><strong>{NAVIGATION.find((item) => item.id === view)?.label}</strong></div>
          <div className="top-actions">
            <button type="button" className="button button-quiet current-location" aria-label={'Change location from ' + location.name} onClick={() => { setError(''); setSearching(true); searchDialog.current.showModal() }}><MapPin size={16} /><span>{location.name}</span><ChevronDown size={13} /></button>
            <button type="button" className="button button-outline download-button" disabled={!climate || exporting} onClick={exportReport} aria-label="Download PDF report">{exporting ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />} <span>{exporting ? 'Preparing report' : 'Download report'}</span></button>
          </div>
        </header>
        <main className="workspace" id="main-content" tabIndex={-1}>
          {error && !searching && <div className="notice notice-error" role="alert"><ShieldAlert size={17} /><span>{error}</span><button className="icon-button" type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
          {view === 'overview' && <>
            <Hero location={location} climate={climate} busy={busy} onSearch={runSearch} />
            <div className="section-heading"><div><h2>Climate baseline</h2><p>Annual averages over {getPeriod(climate)}</p></div><span className="source-pill"><i />{climate?.mode === 'snapshot' ? 'NASA POWER archive' : climate ? 'NASA POWER' : 'Climate data unavailable'}</span></div>
            <MetricStrip climate={climate} trends={trends} selected={metric} onSelect={setMetric} />
            <div className="overview-grid"><ClimateChart climate={climate} trends={trends} selected={metric} onSelect={setMetric} /><SeasonalSignals advisory={advisory} location={location} navigate={navigate} /></div>
            <PlanningPreview advisory={advisory} soil={soil} navigate={navigate} />
          </>}
          {view === 'climate' && <>
            <div className="detail-head"><div className="context-label"><MapPin size={15} />{location.name}, {location.country}</div><h1>Climate trends</h1><p>Explore seven variables across the {getPeriod(climate)} NASA POWER record.</p></div>
            <MetricStrip climate={climate} trends={trends} selected={metric} onSelect={setMetric} all />
            <ClimateChart climate={climate} trends={trends} selected={metric} onSelect={setMetric} />
          </>}
          {view === 'crops' && <CropView advisory={advisory} location={location} irrigation={irrigation} onIrrigationChange={setIrrigation} />}
          {view === 'risks' && <RiskView advisory={advisory} location={location} />}
          {view === 'calendar' && <CalendarView advisory={advisory} location={location} />}
          {view === 'soil' && <SoilView soil={soil} location={location} soilStatus={busy ? 'loading' : soil ? 'ready' : 'unavailable'} />}
          <footer className="workspace-footer"><span>NASA POWER · ISRIC SoilGrids · © OpenStreetMap contributors</span><button type="button" onClick={() => methodDialog.current.showModal()}>Data & methodology <ExternalLink size={12} /></button></footer>
        </main>
      </div>
    </div>
    <Methods dialogRef={methodDialog} />
    <dialog ref={searchDialog} className="search-dialog" onClose={() => setSearching(false)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
      <div className="dialog-inner">
        <div className="dialog-head"><div><h2>Change location</h2><p>Search for a city near your farm.</p></div><button type="button" className="icon-button" aria-label="Close location search" onClick={() => searchDialog.current.close()}><X size={20} /></button></div>
        {searching && <SearchBox variant="dialog" location={location} busy={busy} onSearch={runSearch} />}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-cities">{LOCATIONS.map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => runSearch(item)}><MapPin size={16} /><span>{item.name}<small>{locationLabel(item)}</small></span><ChevronRight size={15} /></button>)}</div>
      </div>
    </dialog>
  </>
}
