import { PARAMETERS } from '../api/nasaPower.js'

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531,
  -176.6150291621406, 12.507343278686905, -0.13857109526572,
  9.984369578019572e-6, 1.5056327351493116e-7,
]

function logGamma(value) {
  const z = value - 1
  let series = 0.99999999999980993
  for (const [index, term] of LANCZOS.entries()) series += term / (z + index + 1)
  const t = z + LANCZOS.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series)
}

function betaFraction(a, b, x) {
  const minimum = 1e-30
  const safe = (value) => Math.abs(value) < minimum ? minimum : value
  let c = 1
  let d = 1 / safe(1 - (a + b) * x / (a + 1))
  let product = d

  for (let step = 1; step <= 150; step += 1) {
    const twiceStep = 2 * step
    let term = step * (b - step) * x / ((a - 1 + twiceStep) * (a + twiceStep))
    d = 1 / safe(1 + term * d)
    c = safe(1 + term / c)
    product *= d * c

    term = -(a + step) * (a + b + step) * x / ((a + twiceStep) * (a + 1 + twiceStep))
    d = 1 / safe(1 + term * d)
    c = safe(1 + term / c)
    const adjustment = d * c
    product *= adjustment
    if (Math.abs(adjustment - 1) < 1e-12) break
  }
  return product
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x))
  const value = x < (a + 1) / (a + b + 2)
    ? front * betaFraction(a, b, x) / a
    : 1 - front * betaFraction(b, a, 1 - x) / b
  return Math.max(0, Math.min(1, value))
}

export function analyzeTrend(yearlyData = {}) {
  const points = Object.entries(yearlyData)
    .map(([year, value]) => [Number(year), value])
    .filter(([year, value]) => Number.isInteger(year) && Number.isFinite(value))
    .sort(([yearA], [yearB]) => yearA - yearB)
  const years = points.map(([year]) => year)
  const values = points.map(([, value]) => value)
  const count = points.length

  if (count < 2) {
    return {
      slope: null,
      slopePerDecade: null,
      pValue: null,
      rSquared: null,
      isSignificant: false,
      direction: 'unavailable',
      totalChange: null,
      years,
      values,
      trendLine: [...values],
    }
  }

  const meanYear = years.reduce((total, year) => total + year, 0) / count
  const meanValue = values.reduce((total, value) => total + value, 0) / count
  const spread = points.reduce((total, [year]) => total + (year - meanYear) ** 2, 0)
  const covariance = points.reduce((total, [year, value]) => total + (year - meanYear) * (value - meanValue), 0)
  const slope = covariance / spread
  const trendLine = years.map((year) => meanValue + slope * (year - meanYear))
  const residual = values.reduce((total, value, index) => total + (value - trendLine[index]) ** 2, 0)
  const variation = values.reduce((total, value) => total + (value - meanValue) ** 2, 0)
  const degrees = count - 2
  const tSquared = degrees > 0 && residual > 0 ? slope ** 2 * spread * degrees / residual : null
  let pValue = null
  if (degrees > 0) {
    pValue = tSquared === null ? Number(slope === 0) : regularizedBeta(degrees / (degrees + tSquared), degrees / 2, 0.5)
  }
  return {
    slope,
    slopePerDecade: slope * 10,
    pValue,
    rSquared: variation > 0 ? Math.max(0, 1 - residual / variation) : 0,
    isSignificant: pValue !== null && pValue < 0.05,
    direction: Math.abs(slope) < 1e-10 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing',
    totalChange: slope * (years.at(-1) - years[0]),
    years,
    values,
    trendLine,
  }
}

export function analyzeAllTrends(climateData) {
  return Object.fromEntries(PARAMETERS.map((parameter) => [
    parameter,
    analyzeTrend((climateData?.yearly ?? climateData)?.[parameter]),
  ]))
}
