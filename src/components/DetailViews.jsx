import { Fragment, useState } from 'react'
import {
  ArrowUpRight, CalendarDays, ChevronDown, CloudRain, Droplet, Droplets, FlaskConical,
  Info, Leaf, LoaderCircle, MapPin, Snowflake, Sprout, Sun, Thermometer, Waves, Wheat, Wind,
} from 'lucide-react'
import './details.css'

const powerSource = { label: 'NASA POWER', url: 'https://power.larc.nasa.gov/docs/services/api/temporal/monthly/' }
const soilGridsSource = { label: 'ISRIC SoilGrids', url: 'https://isric.org/explore/soilgrids/' }

const cropStatus = {
  recommended: 'Recommended',
  'at-risk': 'At risk',
  'not-recommended': 'Poor fit',
  'insufficient-data': 'Limited data',
}

const riskStatus = {
  elevated: 'Elevated',
  watch: 'Watch',
  limited: 'Limited signal',
  unknown: 'Insufficient data',
}

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const formatValue = (value, digits = 1) => Number.isFinite(value)
  ? value.toLocaleString('en', { maximumFractionDigits: digits })
  : 'Unavailable'

const formatMonthRange = (values) => values.map((month) => months[month - 1].slice(0, 3)).join(', ')

export function CropGlyph({ crop, size = 18 }) {
  const icons = { cereal: Wheat, pulse: Sprout, oilseed: Sun, vegetable: Leaf, 'cash crop': Sprout }
  const Glyph = icons[crop?.category?.toLowerCase()] ?? Sprout

  return <Glyph aria-hidden="true" size={size} strokeWidth={1.6} />
}

function ViewHeader({ title, description, location, action }) {
  const place = [location?.name, location?.country].filter(Boolean).join(', ')

  return (
    <header className="fd-heading">
      <div>
        {place && <span className="fd-location"><MapPin size={13} aria-hidden="true" />{place}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  )
}

function Notice({ children }) {
  return (
    <div className="fd-notice">
      <Info size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

function Empty({ icon: Icon = Info, title, children }) {
  return (
    <section className="fd-empty">
      <span className="fd-icon"><Icon size={22} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  )
}

function LoadingData({ title, children }) {
  return (
    <div className="fd-loading" role="status">
      <LoaderCircle size={19} aria-hidden="true" />
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  )
}

function Badge({ type, labels }) {
  return <span className={`fd-badge fd-${type}`}><i aria-hidden="true" />{labels[type] ?? type}</span>
}

function SourceLink({ source }) {
  if (!source?.url) return null
  return (
    <a className="fd-source" href={source.url} target="_blank" rel="noreferrer">
      {source.label}<ArrowUpRight size={12} aria-hidden="true" />
    </a>
  )
}

function ObservationStrip({ entries }) {
  return (
    <dl className="fd-observation-strip" style={{ '--fd-entry-count': entries.length }}>
      {entries.map(({ label, value, source }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}<SourceLink source={source} /></dd>
        </div>
      ))}
    </dl>
  )
}

function WaterSource({ irrigation, onIrrigationChange }) {
  if (!onIrrigationChange) return null

  return (
    <div className="fd-water">
      <Droplet size={16} aria-hidden="true" />
      <label htmlFor="fieldshift-water-source">Water source</label>
      <select
        id="fieldshift-water-source"
        value={irrigation}
        onChange={(event) => onIrrigationChange(event.target.value)}
      >
        <option value="rainfed">Rainfed</option>
        <option value="irrigated">Irrigated</option>
      </select>
    </div>
  )
}

function CropDetails({ crop, id }) {
  return (
    <div className="fd-crop-detail" id={id}>
      <dl className="fd-crop-facts">
        <div><dt>Crop water need</dt><dd>{crop.waterNeed ?? 'Unavailable'}</dd></div>
        <div><dt>Historical season temperature</dt><dd>{Number.isFinite(crop.seasonalTemp) ? `${formatValue(crop.seasonalTemp)} °C` : 'Unavailable'}</dd></div>
        <div><dt>Historical season rainfall</dt><dd>{Number.isFinite(crop.seasonalRain) ? `${formatValue(crop.seasonalRain, 0)} mm` : 'Unavailable'}</dd></div>
        <div><dt>Reference sowing</dt><dd>{formatMonthRange(crop.plantingMonths ?? []) || 'Unavailable'}</dd></div>
        <div><dt>Reference harvest</dt><dd>{formatMonthRange(crop.harvestMonths ?? []) || 'Unavailable'}</dd></div>
      </dl>
      {crop.reasons?.length > 0 && (
        <ul className="fd-crop-reasons">
          {crop.reasons.map((reason, index) => <li key={`${crop.id}-${index}`}>{reason}</li>)}
        </ul>
      )}
      <SourceLink source={crop.source} />
    </div>
  )
}

export function CropView({ advisory, location, irrigation = 'rainfed', onIrrigationChange, isLoading, soilStatus }) {
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const crops = advisory?.crops ?? []
  const visible = crops.filter((crop) => filter === 'all' || crop.status === filter)
  const filters = [['all', 'All crops'], ...Object.entries(cropStatus)]
  const soilPending = soilStatus === 'loading'

  return (
    <div className="fd-view">
      <ViewHeader
        title="Crop advisor"
        location={location}
        description="Compare crops by growing-season heat, rainfall and the water you can supply."
        action={!isLoading && crops.length > 0 && <WaterSource irrigation={irrigation} onIrrigationChange={onIrrigationChange} />}
      />
      {isLoading ? (
        <LoadingData title="Loading crop outlook">Waiting for the historical temperature and rainfall record from NASA POWER.</LoadingData>
      ) : crops.length === 0 ? (
        <Empty icon={Sprout} title="Crop ratings unavailable">
          {advisory?.cropNote ?? advisory?.calendarNote ?? 'Choose a location with a supported regional crop calendar to see crop ratings.'}
        </Empty>
      ) : (
        <>
          <ObservationStrip entries={[
            { label: 'Climate record', source: powerSource },
            {
              label: 'Modeled soil',
              value: { loading: 'Loading', unavailable: 'Unavailable' }[soilStatus],
              source: soilStatus === 'ready' ? soilGridsSource : undefined,
            },
            { label: 'Crop reference', value: 'Pakistan seasonal catalog' },
          ].filter(({ value, source }) => value || source)} />
          <div className="fd-filter" role="group" aria-label="Crop fit filters">
            {filters.map(([value, label]) => {
              const count = value === 'all' ? crops.length : crops.filter((crop) => crop.status === value).length
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => { setFilter(value); setExpanded(null) }}
                >
                  {label} <span>{count}</span>
                </button>
              )
            })}
          </div>
          {visible.length > 0 ? (
            <div className="fd-table-wrap" tabIndex={0} role="region" aria-label="Crop fit comparison">
              <table className="fd-crop-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">Crop</th>
                    <th scope="col" role="columnheader">Fit score</th>
                    <th scope="col" role="columnheader">Growing season</th>
                    <th scope="col" role="columnheader">Primary factor</th>
                    <th scope="col" role="columnheader"><span className="fd-sr">Details</span></th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {visible.map((crop) => {
                    const detailId = `fieldshift-crop-${crop.id}`
                    const isExpanded = expanded === crop.id
                    return (
                      <Fragment key={crop.id}>
                        <tr role="row" className={isExpanded ? 'fd-row-expanded' : undefined}>
                          <th scope="row" role="rowheader">
                            <div className="fd-crop-name">
                              <span className="fd-icon"><CropGlyph crop={crop} /></span>
                              <span>{crop.name}<small>{crop.category}</small></span>
                            </div>
                          </th>
                          <td role="cell">
                            <div className={`fd-score fd-${crop.status}`}>
                              {Number.isFinite(crop.score) ? (
                                <>
                                  <strong>{Math.round(crop.score)}<span> / 100</span></strong>
                                  <span className="fd-score-bar" aria-hidden="true">
                                    <i style={{ width: `${Math.max(0, Math.min(100, crop.score))}%` }} />
                                  </span>
                                </>
                              ) : null}
                              <Badge type={crop.status} labels={cropStatus} />
                            </div>
                          </td>
                          <td role="cell">{crop.season}</td>
                          <td role="cell" className="fd-crop-reason">{crop.reason}</td>
                          <td role="cell">
                            <button
                              className="fd-disclosure"
                              type="button"
                              aria-controls={isExpanded ? detailId : undefined}
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? 'Hide' : 'Show'} ${crop.name} details`}
                              onClick={() => setExpanded(isExpanded ? null : crop.id)}
                            >
                              <ChevronDown aria-hidden="true" size={16} />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && <tr className="fd-details-row" role="row"><td colSpan={5} role="cell"><CropDetails crop={crop} id={detailId} /></td></tr>}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={Sprout} title="No crops match this filter">
              Select a different filter to see the rest of the crop catalog.
            </Empty>
          )}
          <Notice>{soilPending
            ? 'Scores use the historical climate and selected water source while the soil estimate loads.'
            : advisory?.cropNote ?? 'Check field drainage, water availability and local variety guidance before selecting a crop.'}</Notice>
        </>
      )}
    </div>
  )
}

const riskIcons = {
  drought: Droplets,
  flood: Waves,
  heat: Thermometer,
  'heat-illness': Thermometer,
  frost: Snowflake,
  vector: Droplet,
  air: Wind,
  'water-safety': Waves,
  'work-planning': Sun,
}

function RiskIcon({ id, size = 21 }) {
  const Icon = riskIcons[id] ?? Info
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />
}

function SignalMeter({ level }) {
  const active = { unknown: 0, limited: 1, watch: 2, elevated: 3 }[level] ?? 0

  return (
    <div className={`fd-signal-meter fd-${level}`} aria-hidden="true">
      {[1, 2, 3].map((bar) => <i className={bar <= active ? 'is-active' : undefined} key={bar} />)}
    </div>
  )
}

function WorkerExposure({ health = [] }) {
  if (!health.length) return null

  return (
    <section aria-labelledby="fd-worker-title">
      <div className="fd-section-title">
        <h2 id="fd-worker-title">Worker exposure</h2>
        <p>Historical climate cues for outdoor work and local health planning.</p>
      </div>
      <div className="fd-worker-list">
        {health.map((risk) => (
          <article key={risk.id} className="fd-worker-row">
            <span className="fd-icon"><RiskIcon id={risk.id} size={18} /></span>
            <div>
              <h3>{risk.name}</h3>
              <span className="fd-worker-signal">{risk.signal}</span>
              <p>{risk.description}</p>
              <SourceLink source={risk.source} />
            </div>
            <Badge type={risk.level} labels={riskStatus} />
          </article>
        ))}
      </div>
    </section>
  )
}

function RiskCard({ risk }) {
  const [measurementOrMonth, measurement] = risk.signal?.split(' · ', 2) ?? []

  return (
    <article className={`fd-risk-card fd-${risk.level}`}>
      <div className="fd-risk-top">
        <span className="fd-icon"><RiskIcon id={risk.id} /></span>
        <Badge type={risk.level} labels={riskStatus} />
      </div>
      <h2>{risk.name}</h2>
      <p className="fd-risk-signal">
        <span>{measurement ?? measurementOrMonth}</span>{measurement && <> <small>{measurementOrMonth}</small></>}
      </p>
      <SignalMeter level={risk.level} />
      <p>{risk.description}</p>
      <SourceLink source={risk.source} />
    </article>
  )
}

export function RiskView({ advisory, location, isLoading }) {
  const risks = advisory?.risks ?? []

  return (
    <div className="fd-view">
      <ViewHeader
        title="Climate risks"
        location={location}
        description="See when historical heat, rainfall and cold could affect crops and field work."
      />
      {isLoading ? (
        <LoadingData title="Loading climate risks">Waiting for the NASA POWER record used to calculate the seasonal signals.</LoadingData>
      ) : risks.length > 0 ? (
        <>
          <ObservationStrip entries={[
            { label: 'Climate record', source: powerSource },
            { label: 'Indicator basis', value: 'Monthly averages and long-term trends' },
          ]} />
          <div className="fd-risk-grid">
            {risks.map((risk) => <RiskCard key={risk.id} risk={risk} />)}
          </div>
          <WorkerExposure health={advisory?.health} />
          <Notice>{advisory?.riskNote ?? 'Use local forecasts and official advisories for immediate weather and health decisions.'}</Notice>
        </>
      ) : (
        <Empty icon={CloudRain} title="Climate signals unavailable">
          Climate history for this location is required to calculate the indicators.
        </Empty>
      )}
    </div>
  )
}

function CalendarLegend() {
  return (
    <div className="fd-calendar-legend" aria-label="Calendar legend">
      <span><i className="fd-sowing" /> Sow</span>
      <span><i className="fd-harvest" /> Harvest</span>
      <span><i className="fd-month-key" /> Current month</span>
    </div>
  )
}

function CalendarCell({ crop, monthNumber, active }) {
  const sowing = crop.plantingMonths?.includes(monthNumber)
  const harvest = crop.harvestMonths?.includes(monthNumber)
  const activity = sowing && harvest ? 'sowing and harvest' : sowing ? 'sowing' : harvest ? 'harvest' : 'no reference activity'
  const description = `${crop.name}, ${months[monthNumber - 1]}, ${activity}`

  return (
    <td className={active ? 'fd-current-month' : undefined} title={description}>
      <span className="fd-sr">{description}</span>
      <div className="fd-calendar-cell" aria-hidden="true">
        {sowing && <i className="fd-sowing" />}
        {harvest && <i className="fd-harvest" />}
      </div>
    </td>
  )
}

function CalendarSources({ crops }) {
  const unique = new Map()
  for (const { source } of crops) {
    if (source?.url) unique.set(source.url, source)
  }
  if (!unique.size) return null

  return (
    <section className="fd-calendar-sources" aria-labelledby="fd-calendar-sources-title">
      <h2 id="fd-calendar-sources-title">Calendar references</h2>
      <ul>
        {[...unique.values()].map((source) => <li key={source.url}><SourceLink source={source} /></li>)}
      </ul>
    </section>
  )
}

export function CalendarView({ advisory, location, isLoading }) {
  const [showAll, setShowAll] = useState(false)
  const calendar = advisory?.calendar ?? []
  const recommended = calendar.filter((crop) => crop.status === 'recommended')
  const visible = showAll || recommended.length === 0 ? calendar : recommended
  const currentMonth = new Date().getMonth()

  return (
    <div className="fd-view">
      <ViewHeader
        title="Planting calendar"
        location={location}
        description="Plan around regional sowing and harvest windows."
      />
      {isLoading ? (
        <LoadingData title="Loading planting calendar">Matching regional crop windows with the location's climate record.</LoadingData>
      ) : calendar.length > 0 ? (
        <>
          <div className="fd-calendar-controls">
            {recommended.length > 0 && recommended.length !== calendar.length && (
              <div className="fd-filter" role="group" aria-label="Calendar crop filters">
                <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>Recommended <span>{recommended.length}</span></button>
                <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>All crops <span>{calendar.length}</span></button>
              </div>
            )}
            <CalendarLegend />
          </div>
          <div className="fd-table-wrap fd-calendar-wrap" tabIndex={0} role="region" aria-label="Scrollable planting and harvest calendar">
            <table className="fd-calendar">
              <thead>
                <tr>
                  <th scope="col">Crop / season</th>
                  {months.map((month, index) => (
                    <th key={month} scope="col" className={index === currentMonth ? 'fd-current-month' : undefined}>
                      <abbr title={month}>{month.slice(0, 3)}</abbr>
                      {index === currentMonth && <span className="fd-sr">, current month</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((crop) => (
                  <tr key={crop.id}>
                    <th scope="row">
                      <span className="fd-calendar-crop">{crop.name}</span>
                      <small>{crop.season}</small>
                    </th>
                    {months.map((month, index) => <CalendarCell crop={crop} key={month} active={index === currentMonth} monthNumber={index + 1} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CalendarSources crops={visible} />
          <Notice>{advisory?.calendarNote ?? 'Reference windows vary by variety, district, water access and seasonal weather. Confirm timing with local extension guidance.'}</Notice>
        </>
      ) : (
        <Empty icon={CalendarDays} title="No planting windows available">
          {advisory?.calendarNote ?? 'Planting windows appear when the regional crop catalog has a supported match.'}
        </Empty>
      )}
    </div>
  )
}

const soilTypes = [
  { key: 'sand', name: 'Sand', color: '#eac196' },
  { key: 'silt', name: 'Silt', color: '#a8be9d' },
  { key: 'clay', name: 'Clay', color: '#d69b8a' },
]

function SoilComposition({ soil }) {
  const parts = soilTypes.filter(({ key }) => Number.isFinite(soil[key]) && soil[key] >= 0)
  const total = parts.reduce((sum, { key }) => sum + soil[key], 0)
  const hasGraphic = parts.length === soilTypes.length && total > 0

  return (
    <section className="fd-soil-composition">
      <h2>Particle composition</h2>
      {hasGraphic && (
        <div className="fd-texture-graphic" aria-hidden="true">
          <div className="fd-texture-strip">
            {parts.map(({ key, color }) => (
              <span key={key} style={{ flexBasis: `${soil[key] / total * 100}%`, '--fd-soil-swatch': color }} />
            ))}
          </div>
          <div className="fd-texture-axis"><span>0%</span><span>50%</span><span>100%</span></div>
        </div>
      )}
      <dl className="fd-soil-legend">
        {soilTypes.map(({ name, key, color }) => (
          <div key={key}>
            <dt><i style={{ '--fd-soil-swatch': color }} />{name}</dt>
            <dd>{Number.isFinite(soil[key]) ? `${formatValue(soil[key])}%` : 'Unavailable'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function phLabel(ph) {
  if (ph < 5.5) return 'Acidic'
  if (ph < 6.5) return 'Slightly acidic'
  if (ph <= 7.3) return 'Near neutral'
  if (ph <= 8.5) return 'Alkaline'
  return 'Very alkaline'
}

function SoilChemistry({ soil }) {
  const hasPh = Number.isFinite(soil.ph) && soil.ph >= 0 && soil.ph <= 14

  return (
    <section className="fd-soil-chemistry">
      <h2>Soil chemistry</h2>
      <div className="fd-ph-score">
        <span>{hasPh ? formatValue(soil.ph, 2) : 'Unavailable'}</span>
        {hasPh && <span>pH <small>{phLabel(soil.ph)}</small></span>}
      </div>
      {hasPh && (
        <div className="fd-ph-scale" aria-hidden="true">
          <div><i style={{ '--fd-ph-position': `${soil.ph / 14 * 100}%` }} /></div>
          <span>0</span><span>7</span><span>14</span>
        </div>
      )}
      <dl className="fd-soil-legend fd-soil-elements">
        <div><dt>Organic carbon</dt><dd>{Number.isFinite(soil.organicCarbon) ? `${formatValue(soil.organicCarbon)} g/kg` : 'Unavailable'}</dd></div>
        <div><dt>Total nitrogen</dt><dd>{Number.isFinite(soil.nitrogen) ? `${formatValue(soil.nitrogen, 2)} g/kg` : 'Unavailable'}</dd></div>
        {soil.fertility && <div><dt>Carbon and nitrogen indicator</dt><dd>{soil.fertility}</dd></div>}
      </dl>
    </section>
  )
}

export function SoilView({ soil, location, soilStatus }) {
  const source = soil?.source && soil.source !== 'soilgrids' ? { label: soil.source } : soilGridsSource
  const point = soil?.point
  const hasPoint = Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
  const coordinate = (value, axis) => `${Math.abs(value).toFixed(3)}° ${axis[value < 0 ? 1 : 0]}`
  const cellLabel = hasPoint && `${coordinate(point.lat, ['N', 'S'])}, ${coordinate(point.lon, ['E', 'W'])}`
  const hasSoil = Boolean(soil && Object.keys(soil).length > 0)

  return (
    <div className="fd-view">
      <ViewHeader
        title="Soil profile"
        location={location}
        description="Check modeled topsoil texture and chemistry before taking field samples."
      />
      {hasSoil ? (
        <>
          <ObservationStrip entries={[
            { label: 'Estimated texture', value: soil.texture || 'Unavailable' },
            { label: 'Modeled depth', value: soil.depth ?? 'Unavailable' },
            { label: '250 m grid point', value: cellLabel || 'Unavailable' },
            { label: soil.mode === 'snapshot' ? 'Saved estimate' : 'Soil model', value: source.url ? undefined : source.label, source },
          ]} />
          <div className="fd-soil-grid">
            <SoilChemistry soil={soil} />
            <SoilComposition soil={soil} />
          </div>
          <Notice>Soil conditions can vary within a grid cell. Sample your field before choosing a soil amendment or fertilizer rate.</Notice>
        </>
      ) : soilStatus === 'loading' ? (
        <LoadingData title="Loading soil profile">Waiting for modeled topsoil properties from ISRIC SoilGrids.</LoadingData>
      ) : (
        <Empty icon={FlaskConical} title="Soil data unavailable">
          Soil data is not available for this location. Crop recommendations are based on climate data only.
        </Empty>
      )}
    </div>
  )
}
