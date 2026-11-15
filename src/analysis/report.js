import { jsPDF } from 'jspdf'
import { getPeriod, METRICS } from '../components/Climate.jsx'

const titleInk = [28, 46, 30]
const mutedInk = [72, 88, 73]
const ascii = (value = '') => String(value).replaceAll('–', '-').replaceAll('—', '-').replaceAll('−', '-').replaceAll('’', "'").replaceAll('²', '2').replaceAll('·', '|')
const finite = (value, precision = 1) => Number.isFinite(value) ? value.toFixed(precision) : 'Unavailable'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export async function downloadReport({ location, climate, soil, trends, advisory, irrigation }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `FieldShift farm outlook - ${location.name}`, creator: 'FieldShift' })
  const left = 17
  const right = 193
  let y = 17

  function text(value, x, top, { size = 10, style = 'normal', color = titleInk } = {}) {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    doc.text(ascii(value), x, top)
  }

  function paragraph(value, options = {}) {
    doc.setFont('helvetica', options.style || 'normal')
    doc.setFontSize(options.size || 10)
    const lines = doc.splitTextToSize(ascii(value), right - left)
    if (y + lines.length * 3.7 > 268) { doc.addPage(); y = 18 }
    text(lines.join('\n'), left, y, options)
    y += lines.length * 3.7 + 1.2
  }

  function section(name) {
    if (y > 247) { doc.addPage(); y = 18 }
    y += 4
    text(name, left, y, { size: 14, style: 'bold' })
    y += 5
    doc.setDrawColor(193, 207, 185)
    doc.line(left, y, right, y)
    y += 6
  }

  doc.setFillColor(231, 241, 212)
  doc.rect(0, 0, 210, 43, 'F')
  text('FIELDSHIFT / FARM CLIMATE OUTLOOK', left, y, { size: 10, style: 'bold', color: mutedInk })
  text(location.name, left, y + 12, { size: 23, style: 'bold' })
  const region = [location.region, location.country].filter(Boolean).join(', ')
  text(`${region}  |  ${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}  |  ${getPeriod(climate)}`, left, y + 21, { size: 10, color: mutedInk })
  y = 47

  section('Climate baseline')
  for (const metric of METRICS) {
    const values = Object.values(climate.yearly?.[metric.id] ?? {}).filter(Number.isFinite)
    const average = values.length ? values.reduce((total, value) => total + value, 0) / values.length : null
    const slope = trends?.[metric.id]?.slopePerDecade
    text(metric.label, left, y, { style: 'bold', size: 9.5 })
    text(withUnit(average, metric.unit), 89, y, { size: 9.5 })
    text(Number.isFinite(slope) ? `${slope > 0 ? '+' : ''}${finite(slope, 2)} ${metric.unit === '%' ? 'pp' : metric.unit} / decade` : 'Trend unavailable', 131, y, { size: 8.5, color: mutedInk })
    y += 5.6
  }
  paragraph('Historical annual values from NASA POWER agroclimatology. Annual rainfall is a sum of monthly totals. Trend rates describe the selected historical record.', { color: mutedInk, size: 9 })

  section('Surface soil')
  if (soil) {
    const depth = soil.depth || '0-15 cm'
    paragraph(`${soil.texture} | pH ${finite(soil.ph)} | ${depth} | ${finite(soil.organicCarbon)} g/kg organic carbon`)
    paragraph(`Sand ${finite(soil.sand, 0)}% / silt ${finite(soil.silt, 0)}% / clay ${finite(soil.clay, 0)}%. SoilGrids estimates represent a modeled grid cell.`, { size: 9, color: mutedInk })
  } else {
    paragraph('SoilGrids is unavailable for this location.', { color: mutedInk })
  }

  section('Crop shortlist')
  const cropOptions = advisory?.crops?.filter((item) => Number.isFinite(item.score)).slice().sort((a, b) => b.score - a.score).slice(0, 3) ?? []
  if (!cropOptions.length) paragraph(advisory?.cropNote || 'No crop matches available.', { color: mutedInk })
  else {
    paragraph(irrigation === 'irrigated' ? 'Water setting: dependable irrigation' : 'Water setting: rainfed', { color: mutedInk, size: 9 })
    for (const crop of cropOptions) {
      const reference = crop.plantingMonths?.map((month) => MONTHS[month - 1]).join(', ')
      paragraph(`${crop.name} | ${crop.score}/100 | ${crop.season} | Planting: ${reference || 'unavailable'}`, { style: 'bold', size: 9.5 })
      paragraph(crop.reason, { size: 9, color: mutedInk })
    }
  }

  section('Seasonal signals')
  for (const risk of advisory?.risks ?? []) {
    paragraph(`${risk.name} | ${risk.signal}`, { style: 'bold', size: 9.5 })
    paragraph(risk.description, { color: mutedInk, size: 9 })
  }
  paragraph('Use local observations, water availability and current advisories before making field decisions.', { size: 9, color: mutedInk })

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setDrawColor(193, 207, 185)
    doc.line(left, 279, right, 279)
    text('Sources: NASA POWER | ISRIC SoilGrids | OpenStreetMap contributors', left, 285, { size: 8, color: mutedInk })
    text(`${page} / ${pages}`, 179, 285, { size: 8, color: mutedInk })
  }
  const fileSlug = location.name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'outlook'
  doc.save(`fieldshift-${fileSlug}-report.pdf`)
}

function withUnit(value, unit) {
  return Number.isFinite(value) ? `${finite(value, unit === 'mm' ? 0 : 1)} ${unit}` : 'Unavailable'
}
