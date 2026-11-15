import { useEffect, useState } from 'react'
import { Cloud, CloudSun, Droplets, ExternalLink, RotateCcw, Thermometer, Waves } from 'lucide-react'
import { fetchAtmosphere } from '../api/atmosphere.js'

const REFRESH_INTERVAL = 15 * 60 * 1000
const STALE_AGE = 2 * REFRESH_INTERVAL
const VARIABLES = [
  { id: 'humidity', label: 'Relative humidity', unit: '%', icon: Droplets, color: '#a5cfdd' },
  { id: 'cloudCover', label: 'Cloud cover', unit: '%', icon: Cloud, color: '#d0dbe0' },
  { id: 'airTemperature', label: 'Air temperature', unit: '°C', icon: Thermometer, color: '#dfc88e' },
  { id: 'dewPoint', label: 'Dew point', unit: '°C', icon: Waves, color: '#a7cbbc' },
]

const ATMOSPHERE_STYLES = `
.local-atmosphere { container-type: inline-size; margin-top: 10px; background: linear-gradient(105deg,#172b3d,#111f2e 54%,#122333); border: 1px solid #2f465d; border-radius: 9px; }
.local-atmosphere .atmosphere-layout { display: grid; grid-template-columns: minmax(215px,1fr) minmax(0,2.6fr); align-items: stretch; min-height: 76px; }
.local-atmosphere .atmosphere-header { display: grid; align-content: center; gap: 4px; padding: 10px 13px; }
.local-atmosphere .atmosphere-heading { display: flex; gap: 7px; align-items: center; }
.local-atmosphere .atmosphere-heading svg { color: #ace3ea; }
.local-atmosphere h2 { color: #edf4fd; font-size: 14px; font-weight: 630; letter-spacing: -.02em; }
.local-atmosphere .atmosphere-source { display: flex; align-items: center; gap: 5px; width: max-content; color: #b1c9db; font-size: 10px; }
.local-atmosphere .atmosphere-source:hover { color: #d6f5fa; text-decoration: underline; }
.local-atmosphere .atmosphere-time { color: #a8bfd1; font: 9.5px/1.25 var(--mono); }
.local-atmosphere .atmosphere-readings { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); }
.local-atmosphere .atmosphere-reading { display: grid; gap: 5px; min-width: 0; align-content: center; padding: 10px 12px; border-left: 1px solid #2c445a; }
.local-atmosphere .atmosphere-reading-label { display: flex; align-items: center; gap: 5px; color: #c3d5e3; font-size: 10.5px; line-height: 1.2; }
.local-atmosphere .atmosphere-reading-label svg { color: var(--weather-tone); }
.local-atmosphere .atmosphere-value { display: grid; gap: 5px; color: #f0f6fd; font: 500 clamp(17px,2cqw,22px)/1 var(--mono); letter-spacing: -.06em; }
.local-atmosphere .atmosphere-value small { margin-left: 2px; font-size: .68em; color: #c1d1e1; letter-spacing: -.03em; }
.local-atmosphere .atmosphere-meter { display: block; background: #2d455c; border-radius: 3px; height: 2px; width: min(100%,94px); }
.local-atmosphere .atmosphere-meter i { display: block; width: var(--weather-value); height: 100%; border-radius: inherit; background: var(--weather-tone); }
.local-atmosphere .atmosphere-message { display:flex; align-items:center; flex-wrap:wrap; align-content:center; gap:5px 11px; padding: 12px; border-left:1px solid #2c445a; color:#bfd0de; font-size:11px; }
.local-atmosphere .atmosphere-retry { display:flex; gap:4px; align-items:center; padding:3px 5px; border:1px solid #42637a; border-radius:4px; color:#c2eaf1; font-size:10px; }
.local-atmosphere .atmosphere-retry:hover { background:#20364a; }
@container (max-width: 700px) {
  .local-atmosphere .atmosphere-layout { grid-template-columns: 1fr; min-height: 0; }
  .local-atmosphere .atmosphere-header { padding-block: 8px; }
  .local-atmosphere .atmosphere-reading, .local-atmosphere .atmosphere-message { border-top: 1px solid #2c445a; }
  .local-atmosphere .atmosphere-reading:first-child, .local-atmosphere .atmosphere-message { border-left: 0; }
}
@container (max-width: 420px) {
  .local-atmosphere .atmosphere-readings { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .local-atmosphere .atmosphere-reading:nth-child(odd) { border-left: 0; }
}
`

function timeLabel(validAt, timeZone) {
  const options = {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset',
  }
  try {
    return new Intl.DateTimeFormat('en', { ...options, timeZone: timeZone || 'UTC' }).format(validAt)
  } catch {
    return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(validAt)
  }
}

function WeatherReading({ variable, value }) {
  const { label, icon: Icon, color, unit } = variable
  const percent = unit === '%'
  const available = value !== null

  return <div className="atmosphere-reading" style={{ '--weather-tone': color }}>
    <dt className="atmosphere-reading-label"><Icon size={13} aria-hidden="true" />{label}</dt>
    <dd className="atmosphere-value">
      {available ? <span>{percent ? value.toFixed(0) : value.toFixed(1)}<small>{unit}</small></span> : <span aria-label="Unavailable">—</span>}
      {percent && available && <div className="atmosphere-meter" aria-hidden="true" style={{ '--weather-value': `${value}%` }}><i /></div>}
    </dd>
  </div>
}

export default function LocalAtmosphere({ location }) {
  const { lat, lon } = location
  const key = `${lat},${lon}`
  const [result, setResult] = useState({ key: '', status: 'loading', data: null })
  const [retry, setRetry] = useState(0)
  const matching = result.key === key
  const data = matching ? result.data : null
  const status = matching ? result.status : 'loading'

  useEffect(() => {
    const controller = new AbortController()
    let loading = false

    async function update() {
      if (loading || controller.signal.aborted) return
      loading = true
      try {
        const data = await fetchAtmosphere(lat, lon, { signal: controller.signal })
        if (!controller.signal.aborted) setResult({ key, status: 'ready', data })
      } catch {
        if (!controller.signal.aborted) setResult((previous) => ({
          key, status: 'unavailable', data: previous.key === key ? previous.data : null,
        }))
      } finally {
        loading = false
      }
    }

    function refreshVisible() {
      if (document.visibilityState === 'visible') update()
    }

    update()
    const timer = window.setInterval(refreshVisible, REFRESH_INTERVAL)
    document.addEventListener('visibilitychange', refreshVisible)

    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [lat, lon, key, retry])

  function retryWeather() {
    setResult({ key, status: 'loading', data: null })
    setRetry((attempts) => attempts + 1)
  }

  const stale = data && (Math.abs(Date.now() - data.validAt) > STALE_AGE || status === 'unavailable')

  return <section className="local-atmosphere" aria-labelledby="local-atmosphere-heading" aria-busy={status === 'loading'}>
    <style>{ATMOSPHERE_STYLES}</style>
    <div className="atmosphere-layout">
      <header className="atmosphere-header">
        <div className="atmosphere-heading"><CloudSun size={16} aria-hidden="true" /><h2 id="local-atmosphere-heading">{stale ? 'Latest weather estimate' : 'Current conditions'}</h2></div>
        <a href="https://open-meteo.com/en/docs" className="atmosphere-source" target="_blank" rel="noopener">Open-Meteo weather model <ExternalLink size={9} aria-hidden="true" /></a>
        {data && <time className="atmosphere-time" dateTime={new Date(data.validAt).toISOString()}>{timeLabel(data.validAt, data.timeZone)}</time>}
      </header>
      {data ? <dl className="atmosphere-readings">
        {VARIABLES.map((variable) => <WeatherReading key={variable.id} variable={variable} value={data[variable.id]} />)}
      </dl> : <div className="atmosphere-message" role="status">
        <span>{status === 'loading' ? 'Loading local weather…' : 'Local weather is temporarily unavailable.'}</span>
        {status === 'unavailable' && <button type="button" className="atmosphere-retry" onClick={retryWeather}><RotateCcw size={11} aria-hidden="true" /> Retry</button>}
      </div>}
    </div>
  </section>
}
