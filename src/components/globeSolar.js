// NOAA's fractional-year approximation gives the point where the Sun is overhead.
export function solarPoint(date = new Date()) {
  const year = date.getUTCFullYear()
  const yearStart = Date.UTC(year, 0, 1)
  const yearLength = Date.UTC(year + 1, 0, 1) - yearStart
  const fraction = 2 * Math.PI * (date.getTime() - yearStart - 43_200_000) / yearLength
  const c1 = Math.cos(fraction)
  const s1 = Math.sin(fraction)
  const c2 = Math.cos(2 * fraction)
  const s2 = Math.sin(2 * fraction)
  const equation = 229.18 * (0.000075 + 0.001868 * c1 - 0.032077 * s1 - 0.014615 * c2 - 0.040849 * s2)
  const declination = 0.006918 - 0.399912 * c1 + 0.070257 * s1 - 0.006758 * c2 + 0.000907 * s2
    - 0.002697 * Math.cos(3 * fraction) + 0.00148 * Math.sin(3 * fraction)
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60
  const longitude = (720 - minutes - equation) / 4

  return { lat: declination * 180 / Math.PI, lng: ((longitude + 180) % 360 + 360) % 360 - 180 }
}

const TO_RADIANS = Math.PI / 180
const DAY_NIGHT_PHASE = 48 * TO_RADIANS
const wrapLongitude = (longitude) => ((longitude + 180) % 360 + 360) % 360 - 180

export const OVERVIEW_DRIFT = { degrees: 8, duration: 16000 }

export function dayNightView(date = new Date(), preferredLongitude = -103) {
  const position = solarPoint(date)
  const overviewLatitude = Math.max(19, Math.min(32, position.lat + 47))
  const latitude = overviewLatitude * TO_RADIANS
  const sunLatitude = position.lat * TO_RADIANS
  const offsetCosine = (Math.cos(DAY_NIGHT_PHASE) - Math.sin(latitude) * Math.sin(sunLatitude))
    / (Math.cos(latitude) * Math.cos(sunLatitude))
  const maxOffset = Math.acos(Math.max(-1, Math.min(1, offsetCosine))) / TO_RADIANS
  const preferredOffset = wrapLongitude(preferredLongitude - position.lng)
  // Show the reference longitude whenever it lies within the illuminated view.
  // The lighting itself always uses the Sun's current position.
  const offset = Math.min(maxOffset, Math.abs(preferredOffset)) * Math.sign(preferredOffset)
  return { lat: overviewLatitude, lng: wrapLongitude(position.lng + offset) }
}
