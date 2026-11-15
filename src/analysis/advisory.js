import { CROPS, CROP_SOURCES } from '../data/crops.js';

const HEAT_SOURCE = {
  label: 'CDC · Heat and outdoor workers',
  url: 'https://www.cdc.gov/heat-health/risk-factors/heat-and-outdoor-workers.html',
};
const DENGUE_SOURCE = {
  label: 'WHO · Dengue',
  url: 'https://www.who.int/en/news-room/fact-sheets/detail/dengue-and-severe-dengue',
};
const WATER_SOURCE = {
  label: 'CDC · Safe water after flooding',
  url: 'https://www.cdc.gov/floods/safety/reentering-your-flooded-home-safety.html',
};
const DROUGHT_SOURCE = {
  label: 'National Weather Service · Drought types',
  url: 'https://www.weather.gov/safety/drought-types',
};
export const ADVISORY_SOURCES = [
  ...Object.values(CROP_SOURCES),
  HEAT_SOURCE, DENGUE_SOURCE, WATER_SOURCE, DROUGHT_SOURCE,
];

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_PER_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const sum = (values) => values.reduce((total, value) => total + value, 0);

function normalsFor(climate, key, months = ALL_MONTHS) {
  const entries = months.map((month) => ({ month, value: climate?.normals?.[key]?.[month - 1] }));
  return entries.every(({ value }) => Number.isFinite(value)) ? entries : null;
}

function seasonalMean(entries) {
  if (!entries) return null;
  const days = entries.map(({ month }) => DAYS_PER_MONTH[month - 1]);
  return sum(entries.map(({ value }, index) => value * days[index])) / sum(days);
}

function peakEntry(entries) {
  if (!entries || !entries.length) return null;
  return entries.reduce((best, entry) => entry.value > best.value ? entry : best, entries[0]);
}

function outsideRange(value, [min, max]) {
  return Math.max(min - value, 0, value - max);
}

function soilFit(crop, soil) {
  const hasPh = Number.isFinite(soil?.ph);
  const hasTexture = Boolean(soil?.texture && !/unknown|unavailable/i.test(soil.texture));
  const phDifference = hasPh ? outsideRange(soil.ph, crop.ph) : null;
  const texture = hasTexture ? soil.texture.toLowerCase() : '';
  const preferred = crop.textures.some((name) => name.toLowerCase() === texture);
  const summary = [
    hasPh && (phDifference
      ? `Soil pH ${soil.ph.toFixed(1)} is outside the reference range of ${crop.ph.join('–')}.`
      : `Soil pH ${soil.ph.toFixed(1)} fits the reference range.`),
    hasTexture && (preferred
      ? `${soil.texture} is a preferred texture.`
      : `Check drainage and tilth in ${texture} soil.`),
  ].filter(Boolean).join(' ');

  return {
    rating: (hasPh ? 10 * clamp(1 - phDifference / 1.5) : 0)
      + (hasTexture ? (preferred ? 10 : 4) : 0),
    possible: (hasPh ? 10 : 0) + (hasTexture ? 10 : 0),
    concern: phDifference >= 0.7,
    summary: summary || 'A local soil estimate is unavailable.',
  };
}

function waterFit(crop, rainfall, irrigation) {
  const total = Math.round(rainfall);
  const ratio = rainfall / crop.waterMm;
  if (irrigation === 'irrigated') {
    return {
      rating: (crop.managedWater ? 17 : 24) + 6 * clamp(ratio),
      cap: crop.managedWater ? 69 : 100,
      reason: crop.managedWater
        ? `The growing window averages ${total} mm of rain. Verify seasonal irrigation capacity and field management.`
        : `The growing window averages ${total} mm of rain. This score assumes dependable irrigation.`,
    };
  }

  const minimum = crop.droughtTolerant ? 0.2 : 0.3;
  const preferred = crop.droughtTolerant ? 0.55 : 0.75;
  return {
    rating: 30 * clamp(ratio) * (crop.managedWater ? 0.55 : 1),
    cap: crop.managedWater ? 37 : ratio < minimum ? 32 + 6 * ratio / minimum
      : ratio < preferred ? 50 + 19 * (ratio - minimum) / (preferred - minimum) : 100,
    reason: `${total} mm of typical growing-season rain versus a ${crop.waterMm} mm water benchmark.`
      + (crop.managedWater ? ' This crop requires a dependable water supply.' : ''),
  };
}

function scoreCrop(crop, climate, trends, soil, irrigation) {
  const thermal = normalsFor(climate, 'T2M', crop.growthMonths);
  const heat = normalsFor(climate, 'T2M_MAX_AVG', crop.growthMonths);
  const rain = normalsFor(climate, 'PRECTOTCORR', crop.growthMonths);

  const seasonalTemp = seasonalMean(thermal);
  const seasonalRain = rain ? sum(rain.map(({ value }) => value)) : null;
  const result = { ...crop, seasonalTemp, seasonalRain };
  if (!thermal || !rain) {
    const reason = 'Seasonal temperature and rainfall records are incomplete.';
    return { ...result, score: null, status: 'insufficient-data', reason, reasons: [reason] };
  }

  const peak = heat?.reduce((warmest, entry) => entry.value > warmest.value ? entry : warmest);
  const wettest = rain.reduce((wettest, entry) => entry.value > wettest.value ? entry : wettest);
  const heatExcess = peak ? Math.max(0, peak.value - crop.hotMax) : 0;
  const tempDifference = outsideRange(seasonalTemp, crop.temperature);
  const [tempMin, tempMax] = crop.temperature;
  const tempCenter = (tempMin + tempMax) / 2;
  const tempOffset = clamp(Math.abs(seasonalTemp - tempCenter) / ((tempMax - tempMin) / 2));
  const soilConditions = soilFit(crop, soil);
  const water = waterFit(crop, seasonalRain, irrigation);
  const warming = trends?.T2M_MAX?.isSignificant && trends.T2M_MAX.direction === 'increasing';
  const drying = trends?.PRECTOTCORR?.isSignificant && trends.PRECTOTCORR.direction === 'decreasing';
  const heatPressure = warming && peak && peak.value > crop.hotMax - 2;
  const waterPressure = drying && water.cap < 100 && irrigation === 'rainfed';
  const drainageAdjustment = crop.wetSensitive ? 15 * clamp((wettest.value - 150) / 100) : 0;
  const adjustment = (heatPressure ? 4 : 0) + (waterPressure ? 4 : 0) + drainageAdjustment;
  const availablePoints = (peak ? 80 : 65) + soilConditions.possible;
  const weightedFit = (35 - 4 * tempOffset) * clamp(1 - tempDifference / 8)
    + (peak ? 15 * clamp(1 - heatExcess / 9) : 0)
    + water.rating + soilConditions.rating;
  const confidenceReduction = (100 - availablePoints) * 0.35;
  let score = Math.round(clamp(weightedFit * 100 / availablePoints - adjustment - confidenceReduction, 0, water.cap));

  if (tempDifference >= 8 || heatExcess >= 10) score = Math.min(score, 38);
  else if (heatExcess >= 4 || tempDifference >= 4 || soilConditions.concern || drainageAdjustment >= 10) {
    score = Math.min(score, 69);
  }

  const status = score >= 70 ? 'recommended' : score >= 40 ? 'at-risk' : 'not-recommended';
  const tempReason = `${seasonalTemp.toFixed(1)}°C average in the growing window, `
    + (tempDifference ? 'outside' : 'within')
    + ` the ${crop.temperature.join('–')}°C reference range.`;
  const heatReason = heatExcess > 0
    && `${MONTH_NAMES[peak.month - 1]} daily highs average ${peak.value.toFixed(1)}°C, above the ${crop.hotMax}°C screening threshold.`;
  const drainageReason = drainageAdjustment > 0
    && `${MONTH_NAMES[wettest.month - 1]} averages ${Math.round(wettest.value)} mm of rain. Check drainage for this waterlogging-sensitive crop.`;
  const reasons = [
    tempDifference >= 4 && tempReason,
    water.cap < 100 && water.reason,
    heatReason,
    drainageReason,
    soilConditions.concern && soilConditions.summary,
    tempDifference < 4 && tempReason,
    water.cap === 100 && water.reason,
    !soilConditions.concern && soilConditions.summary,
    heatPressure && 'Historical annual temperature peaks are rising. Review the cultivar’s heat tolerance.',
    waterPressure && 'Historical annual rainfall is declining, adding pressure to rainfed production.',
    crop.fieldNote,
  ].filter(Boolean);

  return { ...result, score, status, reason: reasons[0], reasons, soilSummary: soilConditions.summary };
}

function buildRisks(climate, trends) {
  const rain = normalsFor(climate, 'PRECTOTCORR');
  const highs = normalsFor(climate, 'T2M_MAX');
  const lows = normalsFor(climate, 'T2M_MIN');
  const annualRain = rain ? sum(rain.map(({ value }) => value)) : null;
  const rainTrend = trends?.PRECTOTCORR;
  const drying = rainTrend?.direction === 'decreasing' && rainTrend.isSignificant;
  const wetter = rainTrend?.direction === 'increasing' && rainTrend.isSignificant;
  const peakRain = rain?.reduce((wettest, entry) => entry.value > wettest.value ? entry : wettest);
  const peakHeat = highs?.reduce((warmest, entry) => entry.value > warmest.value ? entry : warmest);
  const peakCold = lows?.reduce((coldest, entry) => entry.value < coldest.value ? entry : coldest);
  const warming = trends?.T2M_MAX?.direction === 'increasing' && trends.T2M_MAX.isSignificant;
  const heatLevel = !peakHeat ? 'unknown'
    : peakHeat.value >= 42 ? 'elevated' : peakHeat.value >= 36 || warming ? 'watch' : 'limited';
  const signal = (entry, suffix, digits = 0) => entry
    ? `${MONTH_NAMES[entry.month - 1]} · ${entry.value.toFixed(digits)}${suffix}`
    : 'Monthly data unavailable';

  return [
    {
      id: 'heat', name: 'Heat stress', level: heatLevel,
      signal: signal(peakHeat, '°C', 1),
      description: peakHeat
        ? 'Historical average of the hottest month’s temperature peaks. Check local forecasts during crop flowering and grain fill.'
        : 'A local forecast can help identify short periods of heat stress.',
    },
    {
      id: 'drought', name: 'Water shortage', level: annualRain === null ? 'unknown'
        : (annualRain < 300 || drying) ? 'elevated' : (annualRain < 600 ? 'watch' : 'limited'),
      signal: annualRain === null ? 'Rainfall data unavailable' : `${Math.round(annualRain)} mm/year`,
      description: drying
        ? 'Historical annual rainfall has declined. Check field moisture and irrigation supply before sowing.'
        : 'Typical annual rainfall provides regional context. Check field moisture and irrigation availability.',
      source: DROUGHT_SOURCE,
    },
    {
      id: 'flood', name: 'Heavy-rain exposure', level: !peakRain ? 'unknown'
        : peakRain.value >= 180 ? 'elevated' : peakRain.value >= 100 || wetter ? 'watch' : 'limited',
      signal: signal(peakRain, ' mm'),
      description: 'Wettest month by historical average. Local flood warnings and field drainage determine near-term exposure.',
    },
    {
      id: 'frost', name: 'Cold exposure', level: !peakCold ? 'unknown'
        : peakCold.value <= 0 ? 'elevated' : peakCold.value <= 5 ? 'watch' : 'limited',
      signal: signal(peakCold, '°C', 1),
      description: 'Historical average of the coldest month’s minimum temperatures. Check the daily forecast for frost.',
    },
  ];
}

function buildHealth(climate, risks) {
  const heat = risks.find(({ id }) => id === 'heat') || { level: 'unknown', signal: 'Monthly data unavailable' };
  const flood = risks.find(({ id }) => id === 'flood');
  const drought = risks.find(({ id }) => id === 'drought');

  const humidity = seasonalMean(normalsFor(climate, 'RH2M'));
  const meanTemp = seasonalMean(normalsFor(climate, 'T2M'));
  const peakHeat = peakEntry(normalsFor(climate, 'T2M_MAX'));
  const peakRain = peakEntry(normalsFor(climate, 'PRECTOTCORR'));
  const t2mNormals = normalsFor(climate, 'T2M');
  const rhNormals = normalsFor(climate, 'RH2M');
  const precNormals = normalsFor(climate, 'PRECTOTCORR');

  // 1. Mosquito-borne disease (Dengue / Vector transmission climate suitability)
  let vectorLevel = 'unknown';
  let vectorSignal = 'Local surveillance needed';
  let vectorDesc = 'Check public health advisories for local dengue activity and prevention guidance.';

  if (meanTemp !== null && humidity !== null && t2mNormals && (rhNormals || precNormals)) {
    const vectorMonths = ALL_MONTHS.filter((m) => {
      const temp = t2mNormals[m - 1]?.value ?? 0;
      const rain = precNormals?.[m - 1]?.value ?? 0;
      const rh = rhNormals?.[m - 1]?.value ?? 0;
      return temp >= 21 && (rain >= 50 || rh >= 55);
    });

    const peakVectorRain = peakRain?.value ?? 0;
    const peakVectorTemp = peakHeat?.value ?? meanTemp;

    if (vectorMonths.length >= 2 || (peakVectorRain >= 100 && peakVectorTemp >= 28)) {
      vectorLevel = 'elevated';
      const monthsLabel = vectorMonths.length >= 2
        ? `${MONTH_NAMES[vectorMonths[0] - 1]}–${MONTH_NAMES[vectorMonths[vectorMonths.length - 1] - 1]}`
        : `${MONTH_NAMES[(peakRain?.month ?? 7) - 1]}`;
      vectorSignal = `${monthsLabel} · Elevated vector climate`;
      vectorDesc = 'Warm temperatures and monsoon rainfall create favorable conditions for mosquito breeding and dengue transmission. Remove standing field water and check local public health alerts.';
    } else if (vectorMonths.length >= 1 || (peakVectorTemp >= 24 && (humidity >= 45 || peakVectorRain >= 40))) {
      vectorLevel = 'watch';
      const activeMonth = vectorMonths.length >= 1
        ? MONTH_NAMES[vectorMonths[0] - 1]
        : MONTH_NAMES[(peakRain?.month ?? 7) - 1];
      vectorSignal = `${activeMonth} · Seasonal vector watch`;
      vectorDesc = 'Seasonal warmth and humidity support localized mosquito activity. Ensure field drainage and follow vector prevention measures.';
    } else {
      vectorLevel = 'limited';
      vectorSignal = meanTemp < 18 ? 'Cool climate · Low vector activity' : `${Math.round(humidity)}% humidity · Low vector signal`;
      vectorDesc = 'Historical thermal and precipitation ranges limit prolonged mosquito breeding cycles and virus incubation.';
    }
  }

  // 2. Respiratory exposure (Particulate dust, low humidity, or high humidity stress)
  let airLevel = 'unknown';
  const healthHumidity = humidity === null ? 'Humidity data unavailable' : `${Math.round(humidity)}% average humidity`;
  let airSignal = healthHumidity;
  let airDesc = 'Check local air-quality readings for dust, smoke, and particulate pollution.';

  if (humidity !== null) {
    const h = Math.round(humidity);
    if (h < 35 || (drought?.level === 'elevated' && h < 45)) {
      airLevel = 'elevated';
      airSignal = `${h}% average humidity · Arid & dusty`;
      airDesc = 'Very low humidity and dry soil conditions increase airborne dust, particulate matter, and respiratory strain during tillage and harvest. Use dust masks during field operations.';
    } else if (h < 50 || h > 75) {
      airLevel = 'watch';
      airSignal = h < 50 ? `${h}% average humidity · Dry air sensitivity` : `${h}% average humidity · High humidity`;
      airDesc = h < 50
        ? 'Lower ambient humidity promotes particulate dust elevation during outdoor farm tasks. Check local air-quality readings.'
        : 'High humidity can trap airborne allergens and heighten respiratory fatigue during warm field shifts.';
    } else {
      airLevel = 'limited';
      airSignal = `${h}% average humidity · Moderate range`;
      airDesc = 'Ambient humidity stays in a moderate range that helps suppress airborne agricultural dust. Check local readings during harvest.';
    }
  }

  // 3. Water safety after flooding (Flood inundation runoff into wellheads)
  let waterLevel = 'unknown';
  let waterSignal = 'Local water testing needed';
  let waterDesc = 'After flooding, follow local safe-water guidance and test affected wells before use.';

  if (flood?.level && flood.level !== 'unknown') {
    if (flood.level === 'elevated') {
      waterLevel = 'elevated';
      waterSignal = `${flood.signal} · High flood runoff`;
      waterDesc = 'Elevated heavy-rain exposure indicates a significant risk of flood runoff contaminating shallow wells and irrigation sources. Test and disinfect affected drinking water supplies after floods.';
    } else if (flood.level === 'watch') {
      waterLevel = 'watch';
      waterSignal = `${flood.signal} · Seasonal flood watch`;
      waterDesc = 'Seasonal rain peaks can compromise unprotected wellheads and shallow aquifers. Maintain sealed wellheads and test well water if inundation occurs.';
    } else {
      waterLevel = 'limited';
      waterSignal = `${flood.signal} · Low flood risk`;
      waterDesc = 'Low historical rainfall peaks make flood-induced well contamination unlikely under standard conditions. Maintain routine well protection.';
    }
  }

  return [
    {
      id: 'heat-illness', name: 'Outdoor heat exposure', level: heat.level, signal: heat.signal,
      description: 'Use local heat alerts to plan water, shade and rest breaks during hot outdoor shifts.',
      source: HEAT_SOURCE,
    },
    {
      id: 'vector', name: 'Mosquito-borne disease', level: vectorLevel, signal: vectorSignal,
      description: vectorDesc,
      source: DENGUE_SOURCE,
    },
    {
      id: 'air', name: 'Respiratory exposure', level: airLevel, signal: airSignal,
      description: airDesc,
    },
    {
      id: 'water-safety', name: 'Water safety after flooding', level: waterLevel, signal: waterSignal,
      description: waterDesc,
      source: WATER_SOURCE,
    },
    {
      id: 'work-planning', name: 'Field work planning', level: heat.level, signal: heat.signal,
      description: 'Use daily conditions to schedule strenuous work for cooler hours during hot periods.',
      source: HEAT_SOURCE,
    },
  ];
}

function isPakistan(location) {
  return [location?.countryCode, location?.country].some((value) =>
    ['pk', 'pakistan', 'پاکستان'].includes(String(value || '').trim().toLowerCase()),
  );
}

export function buildAdvisory(climateData, trends, soilData, location, { irrigation = 'rainfed' } = {}) {
  const crops = CROPS.map((crop) => scoreCrop(crop, climateData, trends, soilData, irrigation))
    .sort((first, second) => (second.score ?? -1) - (first.score ?? -1) || first.name.localeCompare(second.name));
  const risks = buildRisks(climateData, trends);
  const health = buildHealth(climateData, risks);
  const calendar = crops.map(({ id, name, status, season, plantingMonths, growthMonths, harvestMonths, source }) => ({
    id, name, status, season, plantingMonths, growthMonths, harvestMonths, source,
  }));

  return {
    crops, risks, health, calendar,
    cropNote: 'Screening scores compare historical growing conditions with crop reference ranges. '
      + (soilData
        ? 'Check cultivar, field moisture and a soil test before committing.'
        : 'Scores use climate and the selected water source while the soil estimate is unavailable.'),
    calendarNote: 'Planting and harvest windows are reference ranges. Confirm dates with local agricultural extension services.',
  };
}
