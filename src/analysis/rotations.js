const MONTH_COUNT = 12
const MINIMUM_CROP_SCORE = 40

function monthOffset(start, end) {
  return (end - start + MONTH_COUNT) % MONTH_COUNT
}

export function windowIncludes(window, month) {
  return monthOffset(window.plant, month) <= window.duration
}

function cropWindows(crop) {
  const { plantingMonths, harvestMonths, growthMonths } = crop
  const lastPlantIndex = plantingMonths.length - 1
  const lastHarvestIndex = harvestMonths.length - 1

  return plantingMonths.flatMap((plant, plantIndex) => (
    harvestMonths.flatMap((harvest, harvestIndex) => {
      const duration = monthOffset(plant, harvest)
      const window = { plant, harvest, duration }
      if (!growthMonths.every((month) => windowIncludes(window, month))) return []

      return [{
        ...window,
        distanceFromCenter: Math.abs(2 * plantIndex - lastPlantIndex)
          + Math.abs(2 * harvestIndex - lastHarvestIndex),
      }]
    })
  ))
}

function compatibleSchedule(kharifWindows, rabiWindows) {
  const schedules = kharifWindows.flatMap((kharif) => rabiWindows.flatMap((rabi) => {
    const rabiStart = monthOffset(kharif.plant, rabi.plant)
    const firstGap = rabiStart - kharif.duration - 1
    const secondGap = MONTH_COUNT - rabiStart - rabi.duration - 1
    if (firstGap < 0 || secondGap < 0) return []

    return [{
      kharif,
      rabi,
      firstGap,
      secondGap,
      distanceFromCenter: kharif.distanceFromCenter + rabi.distanceFromCenter,
    }]
  }))

  // Prefer dates near the middle of the reference windows and more turnaround
  // time when two schedules are equally close.
  schedules.sort((a, b) => a.distanceFromCenter - b.distanceFromCenter
    || Math.min(b.firstGap, b.secondGap) - Math.min(a.firstGap, a.secondGap))
  return schedules[0]
}

function hasReferenceMonths(months) {
  return Array.isArray(months) && months.length > 0
    && months.every((month) => Number.isInteger(month) && month >= 1 && month <= MONTH_COUNT)
}

export function buildRotations(crops = []) {
  const eligible = crops.filter((crop) => Number.isFinite(crop.score)
    && crop.score >= MINIMUM_CROP_SCORE
    && Number.isFinite(crop.waterMm)
    && hasReferenceMonths(crop.plantingMonths)
    && hasReferenceMonths(crop.harvestMonths)
    && hasReferenceMonths(crop.growthMonths))

  const kharifCrops = eligible.filter((crop) => crop.season === 'Kharif')
    .map((crop) => ({ crop, windows: cropWindows(crop) }))
  const rabiCrops = eligible.filter((crop) => crop.season === 'Rabi')
    .map((crop) => ({ crop, windows: cropWindows(crop) }))

  return kharifCrops.flatMap(({ crop: kharif, windows: kharifWindows }) => (
    rabiCrops.flatMap(({ crop: rabi, windows: rabiWindows }) => {
      const schedule = compatibleSchedule(kharifWindows, rabiWindows)
      if (!schedule) return []

      return [{
        id: `${kharif.id}-${rabi.id}`,
        kharif,
        rabi,
        schedule,
        fit: Math.min(kharif.score, rabi.score),
        totalScore: kharif.score + rabi.score,
        waterMm: kharif.waterMm + rabi.waterMm,
        includesPulse: kharif.category === 'Pulse' || rabi.category === 'Pulse',
        cropTypes: new Set([kharif.category, rabi.category]).size,
      }]
    })
  ))
}

export function rankRotations(rotations, priority) {
  const byFit = (a, b) => b.fit - a.fit || b.totalScore - a.totalScore
  const byWater = (a, b) => a.waterMm - b.waterMm
  const byMix = (a, b) => b.cropTypes - a.cropTypes || Number(b.includesPulse) - Number(a.includesPulse)
  const priorityOrder = {
    fit: byFit,
    water: byWater,
    diversity: byMix,
  }

  return [...rotations].sort((a, b) => (priorityOrder[priority] ?? byFit)(a, b)
    || byFit(a, b) || byWater(a, b) || byMix(a, b) || a.id.localeCompare(b.id))
}
