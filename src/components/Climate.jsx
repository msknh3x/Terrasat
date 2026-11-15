import React, { useId, useState } from 'react'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CloudRain, Droplets, ExternalLink, Info, LoaderCircle, Sun, Thermometer, Wind } from 'lucide-react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './climate.css'

export const METRICS = [
  { id: 'T2M', label: 'Mean temperature', short: 'Temperature', unit: '°C', icon: Thermometer, color: '#f4bd76', digits: 1 },
  { id: 'PRECTOTCORR', label: 'Annual rainfall', short: 'Rainfall', unit: 'mm', icon: CloudRain, color: '#8be2ed', digits: 0 },
  { id: 'RH2M', label: 'Relative humidity', short: 'Humidity', unit: '%', icon: Droplets, color: '#a8ce9e', digits: 0 },
  { id: 'ALLSKY_SFC_SW_DWN', label: 'Solar radiation', short: 'Solar', unit: 'kWh/m²/day', icon: Sun, color: '#eed38a', digits: 1 },
  { id: 'T2M_MAX', label: 'Annual maximum', short: 'Max temp', unit: '°C', icon: Thermometer, color: '#f1a18a', digits: 1 },
  { id: 'T2M_MIN', label: 'Annual minimum', short: 'Min temp', unit: '°C', icon: Thermometer, color: '#aebffd', digits: 1 },
  { id: 'WS2M', label: 'Wind speed', short: 'Wind', unit: 'm/s', icon: Wind, color: '#c6b4ed', digits: 1 },
]

const number = (value, digits = 1) => Number.isFinite(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—'

const withUnit = (value, metric, digits = metric.digits) => Number.isFinite(value)
  ? number(value, digits) + (metric.unit === '°C' || metric.unit === '%' ? '' : ' ') + metric.unit
  : 'Unavailable'

const directionIcon = (value) => value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : ArrowRight
const trendRate = (trend, metric) => Number.isFinite(trend?.slopePerDecade)
  ? (trend.slopePerDecade > 0 ? '+' : '') + number(trend.slopePerDecade, metric.id === 'PRECTOTCORR' ? 1 : 2)
    + (metric.unit === '%' ? ' pp' : ' ' + metric.unit) + ' / decade'
  : 'Trend unavailable'

function annualPoints(climate, id) {
  return Object.entries(climate?.yearly?.[id] ?? {})
    .map(([year, value]) => ({ year: Number(year), value }))
    .filter(({ year, value }) => Number.isInteger(year) && Number.isFinite(value))
    .sort((a, b) => a.year - b.year)
}

export function getPeriod(climate) {
  const years = annualPoints(climate, 'T2M')
  if (!years.length) return '2001–2025'
  return years[0].year === years.at(-1).year ? String(years[0].year) : years[0].year + '–' + years.at(-1).year
}

function Sparkline({ points }) {
  if (points.length < 2) return null

  const values = points.map(({ value }) => value)
  const bottom = Math.min(...values)
  const span = Math.max(Math.max(...values) - bottom, 0.01)
  const firstYear = points[0].year
  const length = points.at(-1).year - firstYear
  const path = points.map(({ year, value }, index) => {
    const x = 2 + ((year - firstYear) / length) * 80
    const y = 26 - ((value - bottom) / span) * 23
    const command = index && year === points[index - 1].year + 1 ? 'L' : 'M'
    return command + x.toFixed(2) + ',' + y.toFixed(2)
  }).join(' ')

  return <svg viewBox="0 0 84 29" className="telemetry-sparkline" aria-hidden="true" focusable="false">
    <path d="M2 27H82" className="telemetry-spark-reference" />
    <path d={path} className="telemetry-spark-trace" />
  </svg>
}

export function MetricStrip({ climate, trends, selected, onSelect, all = false, isLoading = false }) {
  return <div className="telemetry-strip" role="group" aria-label="Historical climate variables" aria-busy={isLoading}>
    {METRICS.slice(0, all ? METRICS.length : 4).map((metric) => {
      const Icon = metric.icon
      const trend = trends?.[metric.id]
      const points = annualPoints(climate, metric.id)
      const mean = points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : null
      const Direction = directionIcon(trend?.slopePerDecade)

      return <button key={metric.id} type="button" className="telemetry-channel" style={{ '--channel': metric.color }} onClick={() => onSelect(metric.id)} aria-pressed={selected === metric.id}>
        <span className="telemetry-channel-label"><Icon size={15} aria-hidden="true" />{metric.label}</span>
        <span className="telemetry-readout">
          {isLoading
            ? <span className="telemetry-skeleton" aria-label="Loading value" />
            : Number.isFinite(mean)
              ? <span className="telemetry-value">{number(mean, metric.digits)}<span>{metric.unit}</span></span>
              : <span className="telemetry-value telemetry-value-empty" aria-label="Unavailable">—</span>}
          {!isLoading && <Sparkline points={points} />}
        </span>
        <span className="telemetry-channel-rate">
          {!isLoading && Number.isFinite(trend?.slopePerDecade) && <Direction size={13} aria-hidden="true" />}
          {isLoading ? 'Loading history' : trendRate(trend, metric)}
        </span>
      </button>
    })}
  </div>
}

function ChartTooltip({ active, payload, label, metric, showFit }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload

  return <div className="telemetry-tooltip">
    <strong>{label}</strong>
    <span>Annual value <b>{withUnit(point?.value, metric)}</b></span>
    {showFit && Number.isFinite(point?.fit) && <span>Fitted value <b>{withUnit(point.fit, metric)}</b></span>}
  </div>
}

function climateInsight(id, trend) {
  if (!Number.isFinite(trend?.pValue)) return 'A longer annual record is needed to assess the trend.'
  if (!trend.isSignificant) return 'The fitted trend is inconclusive at the 5% significance threshold. Year-to-year variability still matters for planting decisions.'
  const rising = trend.slopePerDecade > 0

  if (id === 'PRECTOTCORR') return rising
    ? 'Annual rainfall increased over the record. Check when that rain falls before adjusting sowing dates.'
    : 'Annual rainfall declined over the record. Compare seasonal rainfall with crop water needs.'
  if (id === 'T2M_MAX' || id === 'T2M') return rising
    ? 'Temperatures increased over the record. Review when heat-sensitive crops flower and fill grain.'
    : 'Temperatures declined over the record. Compare seasonal averages with crop temperature needs.'
  if (id === 'T2M_MIN') return rising
    ? 'Annual minimum temperatures increased. Daily observations are needed to count frost events.'
    : 'Annual minimum temperatures declined. Check daily observations before changing frost-sensitive planting windows.'
  if (id === 'RH2M') return rising
    ? 'Average relative humidity increased. Check how humidity and rainfall coincide during the growing season.'
    : 'Average relative humidity declined. Check seasonal moisture alongside rainfall to plan irrigation.'
  if (id === 'ALLSKY_SFC_SW_DWN') return rising
    ? 'Solar radiation increased. Review shade and crop water demand during the brightest months.'
    : 'Solar radiation declined. Compare the growing-season light profile with crop requirements.'

  return rising
    ? 'Average wind speed increased over the record. Review exposed plots before placing wind-sensitive crops.'
    : 'Average wind speed declined over the record. Use local gust forecasts for short-term field decisions.'
}

function axisScale(values) {
  const floor = Math.min(...values)
  const ceiling = Math.max(...values)
  const span = Math.max(ceiling - floor, 0.2)
  const scale = 10 ** Math.floor(Math.log10(span / 4))
  const target = span / (4 * scale)
  const step = (target < 2 ? 2 : target < 5 ? 5 : 10) * scale
  const min = Math.floor((floor - .09 * span) / step) * step
  const max = Math.ceil((ceiling + .09 * span) / step) * step
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => Number((min + step * i).toPrecision(9)))

  return { domain: [min, max], ticks, digits: Math.max(0, -Math.floor(Math.log10(step))) }
}

function TrendSummary({ trend, metric }) {
  const p = trend?.pValue
  const pLabel = Number.isFinite(p) ? p < .001 ? 'p < 0.001' : 'p = ' + number(p, 3) : null
  const significance = pLabel ? trend.isSignificant ? 'Significant' : 'Inconclusive' : 'Insufficient years'

  return <div className="telemetry-trend">
    <dl>
      <div><dt>Decadal trend</dt><dd>{trendRate(trend, metric)}</dd></div>
      <div><dt>Trend test</dt><dd><span className={trend?.isSignificant ? 'telemetry-significant' : ''}>{significance}</span>{pLabel && <small>{pLabel}</small>}</dd></div>
    </dl>
    <p><Info size={14} aria-hidden="true" />{climateInsight(metric.id, trend)}</p>
  </div>
}

function RecordPlot({ points, metric, trend, showFit }) {
  const chartId = 'telemetry-fill-' + useId().replace(/[^a-z0-9-]/gi, '')
  const fitByYear = new Map((trend?.years ?? []).map((year, index) => [Number(year), trend.trendLine?.[index]]))
  const valuesByYear = new Map(points.map(({ year, value }) => [year, value]))
  const firstYear = points[0].year
  const lastYear = points.at(-1).year
  const data = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
    const year = firstYear + index
    return { year, value: valuesByYear.get(year) ?? null, fit: fitByYear.get(year) ?? null }
  })
  const values = data.flatMap((point) => [point.value, point.fit]).filter(Number.isFinite)
  const { domain, ticks, digits } = axisScale(values)
  const xTicks = data.filter(({ year }) => year === firstYear || year === lastYear || year % 5 === 0).map(({ year }) => year)
  const axisTick = { fill: '#a0b2c7', fontSize: 10, fontFamily: 'IBM Plex Mono' }
  const axisDomain = firstYear === lastYear ? [firstYear - 1, lastYear + 1] : [firstYear, lastYear]

  return <>
    <div className="telemetry-plot" aria-label={metric.label + ' annual values from ' + firstYear + ' to ' + lastYear}>
      <span className="telemetry-axis-unit">{metric.unit}</span>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
        <ComposedChart data={data} margin={{ top: 15, right: 12, bottom: 2, left: 0 }} accessibilityLayer>
          <defs><linearGradient id={chartId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={metric.color} stopOpacity={.23} /><stop offset="100%" stopColor={metric.color} stopOpacity={.02} />
          </linearGradient></defs>
          <CartesianGrid stroke="#28394d" strokeDasharray="2 5" />
          <XAxis dataKey="year" type="number" domain={axisDomain} ticks={xTicks} interval="preserveStartEnd" minTickGap={19} tickMargin={11} tickLine={false} axisLine={{ stroke: '#34465c' }} tick={axisTick} />
          <YAxis width={51} domain={domain} ticks={ticks} tickFormatter={(value) => number(value, digits)} tickMargin={8} tickLine={false} axisLine={false} allowDataOverflow tick={axisTick} />
          <Tooltip cursor={{ stroke: '#87a7b6', strokeDasharray: '4 4' }} content={<ChartTooltip metric={metric} showFit={showFit} />} />
          <Area type="linear" dataKey="value" stroke={metric.color} strokeWidth={2.15} fill={`url(#${chartId})`} isAnimationActive={false} dot={points.length === 1 ? { r: 3, fill: metric.color } : false} activeDot={{ r: 4.5, fill: metric.color, stroke: '#081421', strokeWidth: 2 }} />
          {showFit && <Line type="linear" dataKey="fit" stroke="#c4d0df" strokeWidth={1.4} strokeDasharray="5 4" connectNulls dot={false} activeDot={false} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <div className="telemetry-key">
      <span><i /> Annual values</span>
      {showFit && <span><i className="telemetry-key-fit" /> Linear fit</span>}
      <span className="telemetry-coverage">{points.length} complete {points.length === 1 ? 'year' : 'years'}</span>
    </div>
  </>
}

export function ClimateChart({ climate, trends, selected, onSelect, isLoading = false, location, error }) {
  const headingId = useId()
  const [showFit, setShowFit] = useState(true)
  const metric = METRICS.find((item) => item.id === selected) ?? METRICS[0]
  const trend = trends?.[metric.id]
  const points = annualPoints(climate, metric.id)
  const fitAvailable = Number.isFinite(trend?.slopePerDecade) && points.length > 1
  const locationName = typeof location === 'string' ? location : location?.name
  const errorMessage = typeof error === 'string' ? error : error?.message
  const subtitle = points.length
    ? `${metric.label}${locationName ? ' in ' + locationName : ''}, ${points[0].year}${points.length > 1 ? '–' + points.at(-1).year : ''}`
    : metric.label + (locationName ? ' in ' + locationName : '')

  return <section className="telemetry-chart" aria-labelledby={headingId} aria-busy={isLoading} style={{ '--channel': metric.color }}>
    <header className="telemetry-chart-head">
      <div>
        <h2 id={headingId}>Climate history</h2>
        <p>{subtitle}</p>
      </div>
      <a className="telemetry-source" href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">
        {climate?.mode === 'snapshot' ? 'NASA POWER archive' : 'NASA POWER'}<ExternalLink size={11} aria-hidden="true" />
      </a>
    </header>
    <div className="telemetry-controls">
      <div className="telemetry-tabs" role="group" aria-label="Climate variable">
        {METRICS.map((item) => <button key={item.id} type="button" aria-pressed={metric.id === item.id} style={{ '--tab-color': item.color }} onClick={() => onSelect(item.id)}>{item.short}</button>)}
      </div>
      {fitAvailable && <button type="button" className="telemetry-fit-toggle" aria-pressed={showFit} onClick={() => setShowFit(!showFit)}><Activity size={13} aria-hidden="true" /> Trend line</button>}
    </div>
    {isLoading ? <div className="telemetry-empty" role="status"><LoaderCircle size={20} aria-hidden="true" /><span>Loading the NASA POWER record…</span></div>
      : points.length ? <>
        <RecordPlot points={points} metric={metric} trend={trend} showFit={fitAvailable && showFit} />
        <TrendSummary trend={trend} metric={metric} />
      </> : <div className="telemetry-empty"><Info size={18} aria-hidden="true" /><span>{errorMessage || 'Annual values are unavailable for this variable.'}</span></div>}
  </section>
}
