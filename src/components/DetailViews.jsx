import { Fragment, useState } from 'react'
import {
  CalendarDays, ChevronDown, CloudRain, Droplet, Droplets, FlaskConical,
  Info, Layers, Leaf, Snowflake, Sprout, Sun, Thermometer, Waves, Wheat, Wind,
} from 'lucide-react'
import './details.css'

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

function ViewHeader({ title, description, action }) {
  return (
    <header className="fd-heading">
      <div>
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

function Badge({ type, labels }) {
  return <span className={`fd-badge fd-${type}`}><i aria-hidden="true" />{labels[type] ?? type}</span>
}

function SourceLink({ source }) {
  if (!source?.url) return null
  return <a className="fd-source" href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
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

export function CropView({ advisory, location, irrigation = 'rainfed', onIrrigationChange }) {
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const crops = advisory?.crops ?? []
  const visible = crops.filter((crop) => filter === 'all' || crop.status === filter)
  const filters = [['all', 'All crops'], ...Object.entries(cropStatus)]
  const subtitle = location?.name
    ? `Compare crop fit for ${location.name} using historical growing conditions, soil and water access.`
    : 'Compare crop fit using historical growing conditions, soil and water access.'

  return (
    <div className="fd-view">
      <ViewHeader
        title="Crop advisor"
        description={subtitle}
        action={crops.length > 0 && <WaterSource irrigation={irrigation} onIrrigationChange={onIrrigationChange} />}
      />
      {crops.length === 0 ? (
        <Empty icon={Sprout} title="Crop ratings unavailable">
          {advisory?.cropNote ?? advisory?.calendarNote ?? 'Choose a location with a supported regional crop calendar to see crop ratings.'}
        </Empty>
      ) : (
        <>
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
          <Notice>{advisory?.cropNote ?? 'Scores are a first-pass comparison. Check field drainage, water availability and local variety guidance before selecting a crop.'}</Notice>
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

export function RiskView({ advisory, location }) {
  const risks = advisory?.risks ?? []
  const target = location?.name ? ` around ${location.name}` : ''

  return (
    <div className="fd-view">
      <ViewHeader title="Climate risks" description={`Historical signals${target} that can inform seasonal planning.`} />
      {risks.length > 0 ? (
        <div className="fd-risk-grid">
          {risks.map((risk) => (
            <article key={risk.id} className="fd-risk-card">
              <div className="fd-risk-top">
                <span className="fd-icon"><RiskIcon id={risk.id} /></span>
                <Badge type={risk.level} labels={riskStatus} />
              </div>
              <h2>{risk.name}</h2>
              <p className="fd-risk-signal">{risk.signal}</p>
              <SignalMeter level={risk.level} />
              <p>{risk.description}</p>
              <SourceLink source={risk.source} />
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={CloudRain} title="Climate signals unavailable">
          Climate history for this location is required to calculate the indicators.
        </Empty>
      )}
      <WorkerExposure health={advisory?.health} />
      <Notice>{advisory?.riskNote ?? 'These indicators describe past climate patterns. Use local forecasts and official advisories for immediate weather and health decisions.'}</Notice>
    </div>
  )
}

function CalendarLegend() {
  return (
    <div className="fd-calendar-legend" aria-label="Calendar legend">
      <span><i className="fd-sowing" /> Sow</span>
      <span><i className="fd-harvest" /> Harvest</span>
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

export function CalendarView({ advisory }) {
  const [showAll, setShowAll] = useState(false)
  const calendar = advisory?.calendar ?? []
  const recommended = calendar.filter((crop) => crop.status === 'recommended')
  const visible = showAll || recommended.length === 0 ? calendar : recommended
  const currentMonth = new Date().getMonth()

  return (
    <div className="fd-view">
      <ViewHeader
        title="Planting calendar"
        description="Find reference windows for sowing and harvest."
        action={calendar.length > 0 && <CalendarLegend />}
      />
      {recommended.length > 0 && recommended.length !== calendar.length && (
        <div className="fd-filter" role="group" aria-label="Calendar crop filters">
          <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>Recommended <span>{recommended.length}</span></button>
          <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>All crops <span>{calendar.length}</span></button>
        </div>
      )}
      {calendar.length > 0 ? (
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
      ) : (
        <Empty icon={CalendarDays} title="No planting windows available">
          {advisory?.calendarNote ?? 'Planting windows appear when the regional crop catalog has a supported match.'}
        </Empty>
      )}
      {calendar.length > 0 && (
        <Notice>{advisory?.calendarNote ?? 'Reference windows vary by variety, district, water access and seasonal weather. Confirm timing with local extension guidance.'}</Notice>
      )}
    </div>
  )
}

const soilTypes = [
  { key: 'sand', name: 'Sand', color: '#e2ad79' },
  { key: 'silt', name: 'Silt', color: '#94b5a0' },
  { key: 'clay', name: 'Clay', color: '#a47b63' },
]

function SoilComposition({ soil }) {
  const parts = soilTypes.filter(({ key }) => Number.isFinite(soil[key]) && soil[key] >= 0)
  const total = parts.reduce((sum, { key }) => sum + soil[key], 0)
  let position = 0
  const hasGraphic = parts.length === soilTypes.length && total > 0
  const stops = hasGraphic ? parts.map(({ color, key }) => {
    const start = position
    position += soil[key] / total * 100
    return `${color} ${start}% ${position}%`
  }).join(', ') : null

  return (
    <section className="fd-soil-composition">
      <h2>Soil composition</h2>
      <div className="fd-soil-composition-body">
        {hasGraphic && (
          <div className="fd-soil-donut" style={{ '--fd-soil-slices': `conic-gradient(${stops})` }} aria-hidden="true">
            <span><Layers size={28} strokeWidth={1.25} /></span>
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
      </div>
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
  const source = soil?.source && soil.source !== 'soilgrids' ? soil.source : 'ISRIC SoilGrids'
  const depth = soil?.depth ?? 'Unavailable'
  const point = soil?.point
  const hasPoint = Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
  const coordinate = (value, axis) => `${Math.abs(value).toFixed(3)}° ${axis[value < 0 ? 1 : 0]}`
  const cellLabel = hasPoint && `${coordinate(point.lat, ['N', 'S'])}, ${coordinate(point.lon, ['E', 'W'])}`
  const hasSoil = Boolean(soil && Object.keys(soil).length > 0)

  return (
    <div className="fd-view">
      <ViewHeader
        title="Soil profile"
        description={location?.name ? `Modeled topsoil properties near ${location.name}.` : 'Modeled topsoil properties for this location.'}
      />
      {hasSoil ? (
        <>
          <div className="fd-soil-summary">
            <span className="fd-icon"><Layers size={25} aria-hidden="true" /></span>
            <div><span>Estimated texture</span><strong>{soil.texture || 'Unavailable'}</strong></div>
            <div><span>Modeled depth</span><strong>{depth}</strong></div>
            <div><span>{soil.mode === 'snapshot' ? 'Saved estimate from' : 'Source'}</span><strong>{source}</strong></div>
          </div>
          <div className="fd-soil-grid">
            <SoilChemistry soil={soil} />
            <SoilComposition soil={soil} />
          </div>
          <Notice>
            {hasPoint ? `Modeled 250 m grid cell at ${cellLabel}. ` : 'These values describe a model grid cell. '}
            Sample your field before choosing a soil amendment or fertilizer rate.
          </Notice>
        </>
      ) : (
        <Empty icon={FlaskConical} title={soilStatus === 'loading' ? 'Requesting the soil profile' : 'Soil data unavailable'}>
          {soilStatus === 'loading'
            ? 'Waiting for modeled soil properties for this location.'
            : 'Soil data is not available for this location. Crop recommendations are based on climate data only.'}
        </Empty>
      )}
    </div>
  )
}
