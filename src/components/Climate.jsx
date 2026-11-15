import React, { useState } from 'react'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, CloudRain, Droplets, Info, Sun, Thermometer, Wind } from 'lucide-react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export const METRICS = [
  { id: 'T2M', label: 'Mean temperature', short: 'Temperature', unit: '°C', icon: Thermometer, color: '#cbed75', digits: 1 },
  { id: 'PRECTOTCORR', label: 'Annual rainfall', short: 'Rainfall', unit: 'mm', icon: CloudRain, color: '#85b4c7', digits: 0 },
  { id: 'RH2M', label: 'Relative humidity', short: 'Humidity', unit: '%', icon: Droplets, color: '#9eccbb', digits: 0 },
  { id: 'ALLSKY_SFC_SW_DWN', label: 'Solar radiation', short: 'Solar', unit: 'kWh/m²/day', icon: Sun, color: '#e8c57f', digits: 1 },
  { id: 'T2M_MAX', label: 'Annual maximum', short: 'Max temp', unit: '°C', icon: Thermometer, color: '#e8ac89', digits: 1 },
  { id: 'T2M_MIN', label: 'Annual minimum', short: 'Min temp', unit: '°C', icon: Thermometer, color: '#a0b6eb', digits: 1 },
  { id: 'WS2M', label: 'Wind speed', short: 'Wind', unit: 'm/s', icon: Wind, color: '#b9abed', digits: 1 },
]

const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—'
const withUnit = (value, metric, digits = metric.digits) => Number.isFinite(value)
  ? number(value, digits) + (metric.unit === '°C' || metric.unit === '%' ? '' : ' ') + metric.unit
  : '—'
const directionIcon = (value) => value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : ArrowRight
const trendRate = (trend, metric) => trend && Number.isFinite(trend.slopePerDecade)
  ? (trend.slopePerDecade > 0 ? '+' : '') + number(trend.slopePerDecade, metric.id === 'PRECTOTCORR' ? 1 : 2) + (metric.unit === '%' ? ' pp' : ' ' + metric.unit) + ' / decade'
  : 'Trend unavailable'

function annualMean(climate, id) {
  const points = Object.values(climate?.yearly?.[id] ?? {}).filter(Number.isFinite)
  return points.length ? points.reduce((sum, point) => sum + point, 0) / points.length : null
}

export function getPeriod(climate) {
  const years = Object.keys(climate?.yearly?.T2M ?? {})
  return years.length ? years[0] + '–' + years.at(-1) : '2001–2025'
}

export function MetricStrip({ climate, trends, selected, onSelect, all = false }) {
  return <div className={`metric-strip ${all ? 'metric-strip-all' : ''}`}>
    {METRICS.slice(0, all ? METRICS.length : 4).map((metric) => {
      const Icon = metric.icon
      const trend = trends?.[metric.id]
      const Direction = directionIcon(trend?.slopePerDecade)
      return <button key={metric.id} type="button" className={`metric-tile ${selected === metric.id ? 'metric-tile-active' : ''}`} onClick={() => onSelect(metric.id)} aria-pressed={selected === metric.id}>
        <span className="metric-top"><Icon size={17} style={{ color: metric.color }} />{metric.label}</span>
        <span className="metric-value">{withUnit(annualMean(climate, metric.id), metric)}</span>
        <span className="metric-change"><Direction size={14} style={{ color: trend?.isSignificant ? metric.color : undefined }} />{trendRate(trend, metric)}</span>
      </button>
    })}
  </div>
}

function ChartTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  return <div className="chart-tooltip">
    <strong>{label}</strong>
    <span>Annual value <b>{withUnit(point?.value, metric)}</b></span>
    <span>Fitted trend <b>{withUnit(point?.fit, metric)}</b></span>
  </div>
}

function climateInsight(id, trend) {
  if (!trend || !Number.isFinite(trend.slopePerDecade)) return 'A longer annual record is needed to estimate the direction of change.'
  if (!trend.isSignificant) return 'The annual record varies. The fitted trend did not meet the 5% significance threshold.'
  const rising = trend.slopePerDecade > 0
  if (id === 'PRECTOTCORR') return rising ? 'Annual rainfall increased over the record. Check when rainfall arrives before adjusting sowing dates.' : 'Annual rainfall declined over the record. Compare seasonal rainfall with crop water needs.'
  if (id === 'T2M_MAX' || id === 'T2M') return rising ? 'Temperatures increased over the record. Review when heat-sensitive crops flower and fill grain.' : 'Temperatures declined over the record. Compare seasonal averages with crop temperature requirements.'
  if (id === 'T2M_MIN') return rising ? 'Annual minimum temperatures increased. Daily observations are needed to count frost events.' : 'Annual minimum temperatures declined. Check daily observations before changing frost-sensitive planting windows.'
  return `The historical record shows a statistically significant ${rising ? 'increase' : 'decrease'}.`
}

export function ClimateChart({ climate, trends, selected, onSelect }) {
  const [showFit, setShowFit] = useState(true)
  const metric = METRICS.find((item) => item.id === selected) ?? METRICS[0]
  const trend = trends?.[metric.id]
  const fitByYear = new Map((trend?.years ?? []).map((year, index) => [Number(year), trend.trendLine?.[index]]))
  const data = Object.entries(climate?.yearly?.[metric.id] ?? {}).map(([year, value]) => ({ year: Number(year), value, fit: fitByYear.get(Number(year)) }))
  const values = data.flatMap((point) => [point.value, point.fit]).filter(Number.isFinite)
  const floor = values.length ? Math.min(...values) : 0
  const ceiling = values.length ? Math.max(...values) : 1
  const span = Math.max(ceiling - floor, 0.2)
  const scale = 10 ** Math.floor(Math.log10(span / 4))
  const step = (span / 4 / scale < 2 ? 2 : span / 4 / scale < 5 ? 5 : 10) * scale
  const min = Math.floor((floor - .09 * span) / step) * step
  const max = Math.ceil((ceiling + .09 * span) / step) * step
  const yTicks = Array.from({length: Math.round((max - min) / step) + 1}, (_, i) => Number((min + step * i).toPrecision(9)))
  const xTicks = data.filter((point, index) => index === 0 || index === data.length - 1 || point.year % 5 === 0).map((point) => point.year)
  const axisFormat = (value) => number(value, Math.max(0, -Math.floor(Math.log10(step))))

  return <section className="panel chart-panel" aria-labelledby="climate-chart-title">
    <div className="panel-head">
      <div><h2 id="climate-chart-title">Climate history</h2><p>{metric.label} over the {getPeriod(climate)} record</p></div>
      <button type="button" className="trend-toggle" aria-pressed={showFit} onClick={() => setShowFit(!showFit)}><Activity size={15} /> <span>Trend line</span><span className={`switch-track ${showFit ? 'is-on' : ''}`} aria-hidden="true"><i /></span></button>
    </div>
    <div className="chart-tabs" aria-label="Climate variable">
      {METRICS.map((item) => <button key={item.id} type="button" aria-pressed={metric.id === item.id} className={metric.id === item.id ? 'chart-tab-active' : ''} onClick={() => onSelect(item.id)}>{item.short}</button>)}
    </div>
    {data.length ? <>
      <div className="chart-graphic" aria-label={metric.label + ' annual values from ' + data[0].year + ' to ' + data.at(-1).year}>
        <span className="chart-unit">{metric.unit}</span>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={166}>
          <ComposedChart data={data} margin={{ top: 13, right: 11, bottom: 5, left: 0 }}>
            <defs><linearGradient id="chart-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={metric.color} stopOpacity={.25} /><stop offset="100%" stopColor={metric.color} stopOpacity={.015} />
            </linearGradient></defs>
            <CartesianGrid stroke="#303b31" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="year" ticks={xTicks} interval="preserveStartEnd" minTickGap={21} tickMargin={12} tickLine={false} axisLine={false} tick={{ fill: '#a0ad9d', fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
            <YAxis width={47} domain={[min, max]} ticks={yTicks} tickFormatter={axisFormat} tickMargin={8} tickLine={false} axisLine={false} allowDataOverflow tick={{ fill: '#a0ad9d', fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
            <Tooltip cursor={{ stroke: '#9dab94', strokeDasharray: '3 4' }} content={<ChartTooltip metric={metric} />} />
            <Area type="linear" dataKey="value" stroke={metric.color} strokeWidth={2.2} fill="url(#chart-area-fill)" isAnimationActive={false} dot={false} activeDot={{ r: 5, fill: metric.color, stroke: '#1b241c', strokeWidth: 2 }} />
            {showFit && <Line type="linear" dataKey="fit" stroke="#b7bda5" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-key">
        <span><i style={{ background: metric.color }} /> Annual values</span>
        {showFit && <span><i className="dashed" /> Fitted trend</span>}
        <span className="chart-rate">{trendRate(trend, metric)}</span>
      </div>
      <div className="chart-explainer"><Info size={15} /><span>{climateInsight(metric.id, trend)}</span></div>
    </> : <div className="chart-empty">No annual values are available for this metric.</div>}
  </section>
}
