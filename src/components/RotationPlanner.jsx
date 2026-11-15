import { useMemo, useState } from 'react'
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, Droplet, Info, LoaderCircle, MapPin } from 'lucide-react'
import { buildRotations, rankRotations, windowIncludes } from '../analysis/rotations.js'
import { CROP_SOURCES } from '../data/crops.js'
import './rotation.css'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const EMPTY_CROPS = []
const PRIORITIES = [
  { value: 'fit', label: 'Strongest crop fit' },
  { value: 'water', label: 'Lower water need' },
  { value: 'diversity', label: 'Broader crop mix' },
]
const PROVINCIAL_CALENDARS = {
  'Khyber Pakhtunkhwa': 'Khyber-Pakhtunkhwa',
  Sindh: 'Sindh',
  Punjab: 'Punjab',
  Balochistan: 'Balochistan',
}

function WaterSource({ irrigation, onIrrigationChange }) {
  const Wrapper = onIrrigationChange ? 'label' : 'div'

  return (
    <Wrapper className="rotation-select">
      <Droplet size={15} aria-hidden="true" />
      <span>Water source</span>
      {onIrrigationChange ? (
        <select value={irrigation} onChange={(event) => onIrrigationChange(event.target.value)}>
          <option value="rainfed">Rainfed</option>
          <option value="irrigated">Irrigated</option>
        </select>
      ) : <strong>{irrigation === 'irrigated' ? 'Irrigated' : 'Rainfed'}</strong>}
    </Wrapper>
  )
}

function SeasonalCrop({ crop, window }) {
  return (
    <section className={`rotation-crop rotation-${crop.season.toLowerCase()}`} aria-label={`${crop.season} crop`}>
      <p className="rotation-crop-season"><i aria-hidden="true" />{crop.season} · {crop.category}</p>
      <h3>{crop.name}</h3>
      <dl className="rotation-schedule-dates">
        <div><dt>Sow in</dt><dd>{MONTHS[window.plant - 1]}</dd></div>
        <div><dt>Harvest in</dt><dd>{MONTHS[window.harvest - 1]}</dd></div>
      </dl>
      <p className="rotation-crop-reason">{crop.reason ?? crop.fieldNote}</p>
    </section>
  )
}

function ScheduleCalendar({ schedule }) {
  return (
    <figure className="rotation-calendar">
      <figcaption><CalendarDays size={15} aria-hidden="true" />Example calendar</figcaption>
      <table>
        <thead>
          <tr>
            <td />
            {MONTHS.map((name) => (
              <th key={name} scope="col" aria-label={name}>
                <span className="rotation-month-full" aria-hidden="true">{name.slice(0, 3)}</span>
                <span className="rotation-month-short" aria-hidden="true">{name.slice(0, 1)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {['kharif', 'rabi'].map((season) => {
            const window = schedule[season]

            return (
              <tr key={season} className={`rotation-${season}`}>
                <th scope="row">{season === 'kharif' ? 'Kharif' : 'Rabi'}</th>
                {MONTHS.map((name, index) => {
                  const month = index + 1
                  const stage = month === window.plant ? 'Sow'
                    : month === window.harvest ? 'Harvest'
                      : windowIncludes(window, month) ? 'Growing' : 'Outside window'
                  return <td key={name} data-stage={stage} aria-label={stage} title={`${name} · ${stage}`}><i aria-hidden="true" /></td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="rotation-calendar-key">
        <span><i className="rotation-key-sow" aria-hidden="true" />Sow</span>
        <span><i className="rotation-key-grow" aria-hidden="true" />Growing</span>
        <span><i className="rotation-key-harvest" aria-hidden="true" />Harvest</span>
        {schedule.rabi.harvest < schedule.rabi.plant && <span className="rotation-calendar-rollover">Rabi harvest is the following year</span>}
      </div>
    </figure>
  )
}

function RotationDetails({ plan, soilStatus, location }) {
  const { kharif, rabi, schedule, fit, waterMm } = plan
  const province = PROVINCIAL_CALENDARS[location?.region]
  const localCalendar = province ? {
    label: `Pakistan Meteorological Department · ${location.region}`,
    url: `https://weather.gov.pk/namc/crop-calendar/${province}`,
  } : CROP_SOURCES.pmdCalendar
  const sources = [localCalendar, CROP_SOURCES.faoCalendar, CROP_SOURCES.faoWater]

  return (
    <article className="rotation-plan" id="rotation-selected-sequence" aria-labelledby="rotation-selected-heading">
      <h2 id="rotation-selected-heading" className="rotation-visually-hidden" aria-live="polite">{kharif.name} followed by {rabi.name}</h2>
      <div className="rotation-seasons">
        <SeasonalCrop crop={kharif} window={schedule.kharif} />
        <span className="rotation-season-arrow" aria-hidden="true"><ArrowRight size={17} /></span>
        <SeasonalCrop crop={rabi} window={schedule.rabi} />
      </div>
      <ScheduleCalendar schedule={schedule} />
      <dl className="rotation-measures">
        <div>
          <dt>Weakest crop fit</dt>
          <dd className={fit >= 70 ? 'rotation-fit-good' : 'rotation-fit-watch'}>
            <strong>{fit}<small>/100</small></strong>
            <span>{fit >= 70 ? 'Both crops recommended' : 'At least one crop at risk'}</span>
          </dd>
        </div>
        <div>
          <dt>Combined crop water benchmark</dt>
          <dd><strong>{waterMm.toLocaleString('en')}<small> mm</small></strong><span>Indicative growing-season total</span></dd>
        </div>
      </dl>
      {soilStatus === 'loading' && (
        <p className="rotation-inline-status" role="status"><LoaderCircle size={15} aria-hidden="true" />Crop fit will update when soil data arrives.</p>
      )}
      {soilStatus === 'unavailable' && (
        <p className="rotation-inline-status"><Info size={15} aria-hidden="true" />Crop fit uses climate and the selected water source. A soil estimate is unavailable.</p>
      )}
      <details className="rotation-method">
        <summary>How this sequence was screened <ChevronDown size={15} aria-hidden="true" /></summary>
        <p>Crop fit uses historical NASA POWER climate records and SoilGrids estimates where available. Sequences with overlapping months or a crop fit below 40 are excluded. Fit ranks by the weaker crop. Crop mix prioritizes different crop types, then a pulse.</p>
        <p>The water benchmark adds two indicative whole-season crop needs. Irrigation supply also depends on rainfall, delivery losses and field management. Confirm the cultivar, local dates and field conditions with agricultural extension.</p>
        <ul>
          {sources.map(({ url, label }) => (
            <li key={url}><a href={url} target="_blank" rel="noreferrer">{label} <ArrowUpRight size={12} aria-hidden="true" /></a></li>
          ))}
        </ul>
      </details>
    </article>
  )
}

function PlannerEmpty({ icon: Icon, title, children, loading }) {
  return (
    <section className="rotation-empty" role={loading ? 'status' : undefined}>
      <span><Icon className={loading ? 'rotation-spinner' : undefined} size={21} aria-hidden="true" /></span>
      <div><h2>{title}</h2><p>{children}</p></div>
    </section>
  )
}

function emptyPlanner({ crops, irrigation, isLoading, hasCountry, supportedCountry }) {
  if (hasCountry && !supportedCountry) {
    return <PlannerEmpty icon={MapPin} title="Crop rotation coverage is limited to Pakistan">Analyze a location in Pakistan to compare its Kharif and Rabi crops.</PlannerEmpty>
  }
  if (isLoading) {
    return <PlannerEmpty icon={LoaderCircle} title="Loading rotation inputs" loading>Sequences will appear as soon as historical temperature and rainfall are available.</PlannerEmpty>
  }
  if (!crops.some((crop) => Number.isFinite(crop.score))) {
    return <PlannerEmpty icon={Info} title="Crop inputs are unavailable">This planner needs seasonal climate records and local crop calendars to screen a sequence.</PlannerEmpty>
  }
  return (
    <PlannerEmpty icon={CalendarDays} title="No two-season sequence passed screening">
      Both crops need a fit score of at least 40 and separate growing windows.
      {irrigation === 'rainfed' && ' If your field has dependable irrigation, change the water source to reassess.'}
    </PlannerEmpty>
  )
}

export default function RotationPlanner({ advisory, location, irrigation = 'rainfed', onIrrigationChange, isLoading, soilStatus }) {
  const [priority, setPriority] = useState('fit')
  const [selection, setSelection] = useState(null)
  const crops = advisory?.crops ?? EMPTY_CROPS
  const rotations = useMemo(() => buildRotations(crops), [crops])
  const ranked = useMemo(() => rankRotations(rotations, priority), [rotations, priority])
  const place = [location?.name, location?.country].filter(Boolean).join(', ')
  const locationKey = location ? `${location.id ?? place}:${location.lat},${location.lon}` : ''
  const countryValues = [location?.countryCode, location?.country].filter(Boolean)
  const supportedCountry = countryValues.some((country) => ['pk', 'pakistan', 'پاکستان'].includes(String(country).trim().toLowerCase()))
  const matchingSelection = selection?.locationKey === locationKey && selection.irrigation === irrigation
  const plan = (matchingSelection && ranked.find(({ id }) => id === selection.id)) || ranked[0]

  return (
    <section className="rotation-view" aria-labelledby="rotation-heading">
      <header className="rotation-heading">
        <div>
          {place && <p className="rotation-location"><MapPin size={13} aria-hidden="true" />{place}</p>}
          <h1 id="rotation-heading">Rotation planner</h1>
          <p>Compare Kharif and Rabi sequences using seasonal climate, local crop calendars and the water available to your field.</p>
        </div>
        {(!countryValues.length || supportedCountry) && <WaterSource irrigation={irrigation} onIrrigationChange={onIrrigationChange} />}
      </header>

      {plan ? (
        <div className="rotation-workspace">
          <section className="rotation-options" aria-labelledby="rotation-options-heading">
            <div className="rotation-options-heading">
              <h2 id="rotation-options-heading">Crop sequences</h2>
              <p>{ranked.length} {ranked.length === 1 ? 'sequence' : 'sequences'} passed screening</p>
            </div>
            <label className="rotation-priority">
              <span>Rank by</span>
              <select value={priority} onChange={(event) => {
                setPriority(event.target.value)
                setSelection(null)
              }}>
                {PRIORITIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <ul className="rotation-option-list" key={`${locationKey}|${irrigation}|${priority}`}>
              {ranked.map((entry) => (
                <li key={entry.id}>
                  <button type="button" aria-pressed={entry.id === plan.id} aria-controls="rotation-selected-sequence" onClick={() => setSelection({ id: entry.id, locationKey, irrigation })}>
                    <span className="rotation-option-name">
                      {entry.kharif.name}<ArrowRight size={12} aria-hidden="true" /><span className="rotation-visually-hidden"> followed by </span>{entry.rabi.name}
                    </span>
                    <span className="rotation-option-info">
                      <span>{entry.fit}/100 fit</span>
                      <span>{entry.waterMm.toLocaleString('en')} mm</span>
                      {entry.includesPulse && <span className="rotation-option-pulse">Pulse</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <RotationDetails plan={plan} soilStatus={soilStatus} location={location} />
        </div>
      ) : emptyPlanner({ crops, irrigation, isLoading, hasCountry: countryValues.length > 0, supportedCountry })}
    </section>
  )
}
