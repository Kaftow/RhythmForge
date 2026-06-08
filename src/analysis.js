import { fft, hannWindow } from "./fft.js";

const FRAME_SIZE = 1024;
const HOP_SIZE = 256;
const LANE_BANDS = [
  { minHz: 0, maxHz: 180 },
  { minHz: 180, maxHz: 700 },
  { minHz: 700, maxHz: 2400 },
  { minHz: 2400, maxHz: 12000 },
];
const DIFFICULTY_SETTINGS = {
  easy: {
    peakFloor: 0.32,
    peakMultiplier: 2.2,
    minGapSeconds: 0.32,
    activationFloor: 0.04,
    activationMultiplier: 1.0,
    usagePenalty: 0.01,
    maxNotesPerPeak: 2,
    chordThreshold: 0.98,
    gridSubdivisions: 1,
  },
  normal: {
    peakFloor: 0.26,
    peakMultiplier: 2.0,
    minGapSeconds: 0.26,
    activationFloor: 0.028,
    activationMultiplier: 0.85,
    usagePenalty: 0.008,
    maxNotesPerPeak: 2,
    chordThreshold: 0.93,
    gridSubdivisions: 2,
  },
  hard: {
    peakFloor: 0.18,
    peakMultiplier: 1.8,
    minGapSeconds: 0.2,
    activationFloor: 0.02,
    activationMultiplier: 0.8,
    usagePenalty: 0.006,
    maxNotesPerPeak: 2,
    chordThreshold: 0.72,
    gridSubdivisions: 4,
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mixToMono(audioBuffer) {
  const { numberOfChannels, length } = audioBuffer;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] / numberOfChannels;
    }
  }
  return mono;
}

function buildLaneBins(sampleRate, paddedSize) {
  const nyquist = sampleRate / 2;
  return LANE_BANDS.map((band) => {
    const minHz = Math.max(0, band.minHz);
    const maxHz = Math.min(nyquist, band.maxHz);
    const minBin = clamp(Math.floor((minHz / sampleRate) * paddedSize), 0, paddedSize / 2 - 1);
    const maxBin = clamp(Math.ceil((maxHz / sampleRate) * paddedSize), minBin + 1, paddedSize / 2);
    return { minBin, maxBin };
  });
}

function spectralFeatures(frame, sampleRate, window, laneBins) {
  const size = frame.length;
  const paddedSize = 1 << Math.ceil(Math.log2(size));
  const input = new Float64Array(paddedSize);
  for (let i = 0; i < size; i += 1) {
    input[i] = frame[i] * window[i];
  }
  const { real, imag } = fft(input);
  const magnitudes = new Float64Array(paddedSize / 2);
  const laneScores = new Float64Array(laneBins.length);
  let weighted = 0;
  let magnitudeSum = 0;

  for (let i = 0; i < paddedSize / 2; i += 1) {
    const magnitude = Math.hypot(real[i], imag[i]);
    magnitudes[i] = magnitude;
    const frequency = (i * sampleRate) / paddedSize;
    weighted += frequency * magnitude;
    magnitudeSum += magnitude;

    for (let lane = 0; lane < laneBins.length; lane += 1) {
      const { minBin, maxBin } = laneBins[lane];
      if (i < minBin || i >= maxBin) continue;
      laneScores[lane] += magnitude;
    }
  }

  for (let lane = 0; lane < laneScores.length; lane += 1) {
    const { minBin, maxBin } = laneBins[lane];
    const width = Math.max(1, maxBin - minBin);
    laneScores[lane] = Math.log1p(laneScores[lane] / width);
  }

  return {
    centroid: magnitudeSum > 0 ? weighted / magnitudeSum : 0,
    laneScores,
    magnitudes,
    totalMagnitude: magnitudeSum,
  };
}

function estimateBpm(peaks) {
  const intervals = [];
  for (let i = 1; i < peaks.length; i += 1) {
    const delta = peaks[i].time - peaks[i - 1].time;
    if (delta < 0.25 || delta > 1.2) continue;
    let bpm = 60 / delta;
    while (bpm < 70) bpm *= 2;
    while (bpm > 200) bpm /= 2;
    intervals.push(bpm);
  }
  const rounded = intervals.map((bpm) => Math.round(bpm / 2) * 2);
  return Math.round(median(rounded) || 120);
}

function detectPeaks(features, settings) {
  const onsetValues = features.map((f) => f.onset);
  const baseline = median(onsetValues) || 0;
  const threshold = Math.max(settings.peakFloor, baseline * settings.peakMultiplier);
  const peaks = [];

  for (let i = 1; i < features.length - 1; i += 1) {
    const current = features[i];
    const prev = features[i - 1];
    const next = features[i + 1];
    const isPeak =
      current.onset > threshold &&
      current.onset >= prev.onset &&
      current.onset >= next.onset;
    if (!isPeak) continue;

    const tooClose = peaks.length > 0 && current.time - peaks[peaks.length - 1].time < settings.minGapSeconds;
    if (tooClose) {
      if (current.onset > peaks[peaks.length - 1].onset) {
        peaks[peaks.length - 1] = current;
      }
      continue;
    }
    peaks.push(current);
  }

  return peaks;
}

function refinePeakTime(features, index, hopSeconds) {
  const prev = features[index - 1]?.onset ?? features[index].onset;
  const current = features[index].onset;
  const next = features[index + 1]?.onset ?? features[index].onset;
  const denom = prev - 2 * current + next;
  if (Math.abs(denom) < 1e-8) return features[index].time;
  const offset = clamp(0.5 * (prev - next) / denom, -1, 1);
  return features[index].time + offset * hopSeconds;
}

function estimateGridPhase(peaks, beatLength, step) {
  if (!peaks.length) return 0;

  const searchStep = Math.max(0.002, Math.min(0.01, step / 64));
  const tolerance = Math.min(step * 0.45, 0.07);
  const samplePeaks = peaks
    .slice()
    .sort((a, b) => b.onset - a.onset)
    .slice(0, Math.min(32, peaks.length));

  let bestPhase = 0;
  let bestScore = -Infinity;

  for (let phase = 0; phase < step; phase += searchStep) {
    let score = 0;
    for (const peak of samplePeaks) {
      const wrapped = ((peak.time - phase) % step + step) % step;
      const distance = Math.min(wrapped, step - wrapped);
      if (distance > tolerance) continue;
      score += peak.onset * (1 - distance / tolerance);
    }

    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }

  return bestPhase;
}

function findLocalPeak(features, targetTime, windowSeconds) {
  if (!features.length) return null;

  let low = 0;
  let high = features.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (features[mid].time < targetTime) low = mid + 1;
    else high = mid - 1;
  }

  const step = features[1] ? Math.abs(features[1].time - features[0].time) : 0.01;
  const radius = Math.max(2, Math.ceil(windowSeconds / Math.max(step, 0.001)) + 2);
  const start = Math.max(0, low - radius);
  const end = Math.min(features.length - 1, low + radius);

  let best = null;
  let bestDistance = Infinity;
  for (let i = start; i <= end; i += 1) {
    const feature = features[i];
    const distance = Math.abs(feature.time - targetTime);
    if (distance > windowSeconds) continue;
    if (!best || feature.onset > best.onset || (feature.onset === best.onset && distance < bestDistance)) {
      best = feature;
      bestDistance = distance;
    }
  }

  return best;
}

function averageLaneScores(features, index, radius = 1) {
  const laneCount = features[index].laneScores.length;
  const scores = new Float64Array(laneCount);
  let totalWeight = 0;

  for (let offset = -radius; offset <= radius; offset += 1) {
    const feature = features[index + offset];
    if (!feature) continue;
    const weight = 1 - Math.abs(offset) / (radius + 1);
    totalWeight += weight;
    for (let lane = 0; lane < laneCount; lane += 1) {
      scores[lane] += feature.laneScores[lane] * weight;
    }
  }

  for (let lane = 0; lane < laneCount; lane += 1) {
    scores[lane] = totalWeight > 0 ? scores[lane] / totalWeight : 0;
  }

  return scores;
}

function buildLaneStats(features) {
  const laneCount = features[0]?.laneScores.length ?? 4;
  const stats = [];

  for (let lane = 0; lane < laneCount; lane += 1) {
    const values = features.map((feature) => feature.laneScores[lane]);
    const baseline = median(values);
    const spread = median(values.map((value) => Math.abs(value - baseline))) || Math.max(0.01, baseline * 0.25);
    stats.push({
      baseline,
      spread,
    });
  }

  return stats;
}

function chooseLanesForPeak(feature, laneStats, laneUsage, settings) {
  const candidates = [];
  for (let lane = 0; lane < feature.laneScores.length; lane += 1) {
    const activation = feature.laneScores[lane] - laneStats[lane].baseline;
    const threshold = Math.max(settings.activationFloor, laneStats[lane].spread * settings.activationMultiplier);
    const score = activation - threshold - laneUsage[lane] * settings.usagePenalty;
    candidates.push({ lane, activation, threshold, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  const bestScore = candidates[0]?.score ?? 0;
  const dynamicMaxNotes =
    settings.maxNotesPerPeak === 1
      ? 1
      : feature.peakOnset >= settings.chordThreshold
        ? settings.maxNotesPerPeak
        : 1;
  const scoreMargin = feature.peakOnset >= settings.chordThreshold ? 0.08 : 0.04;

  const chosen = [];
  for (const candidate of candidates) {
    if (candidate.activation < candidate.threshold) continue;
    if (chosen.length && candidate.score < bestScore - scoreMargin) continue;
    if (chosen.length >= dynamicMaxNotes) break;
    chosen.push(candidate);
  }

  if (!chosen.length && candidates[0].activation >= candidates[0].threshold) {
    chosen.push(candidates[0]);
  }

  return chosen.map((candidate) => candidate.lane);
}

export function analyzeAndGenerateChart(audioBuffer, difficulty = "normal") {
  const mono = mixToMono(audioBuffer);
  const window = hannWindow(FRAME_SIZE);
  const sampleRate = audioBuffer.sampleRate;
  const frameStepMs = (HOP_SIZE / sampleRate) * 1000;
  const laneBins = buildLaneBins(sampleRate, FRAME_SIZE);
  const settings = DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.normal;

  const features = [];
  let prevMagnitudes = null;
  let prevRms = 0;

  for (let start = 0; start + FRAME_SIZE <= mono.length; start += HOP_SIZE) {
    let energy = 0;
    const frame = new Float32Array(FRAME_SIZE);

    for (let i = 0; i < FRAME_SIZE; i += 1) {
      const sample = mono[start + i] || 0;
      frame[i] = sample;
      energy += sample * sample;
    }

    const rms = Math.sqrt(energy / FRAME_SIZE);
    const { centroid, laneScores, magnitudes, totalMagnitude } = spectralFeatures(frame, sampleRate, window, laneBins);
    let flux = 0;
    if (prevMagnitudes) {
      for (let i = 0; i < magnitudes.length; i += 1) {
        flux += Math.max(0, magnitudes[i] - prevMagnitudes[i]);
      }
    }
    const diff = (flux / Math.max(1e-6, totalMagnitude)) + Math.max(0, rms - prevRms) * 0.25;
    const time = (start + FRAME_SIZE / 2) / sampleRate;

    features.push({
      index: features.length,
      time,
      rms,
      energy,
      centroid,
      onset: diff,
      laneScores: Array.from(laneScores),
    });

    prevMagnitudes = magnitudes;
    prevRms = rms;
  }

  if (!features.length) {
    return {
      bpm: 120,
      features: [],
      notes: [],
      mode: "4k-downscroll",
      difficulty,
      durationMs: audioBuffer.duration * 1000,
      frameStepMs,
    };
  }

  const maxOnset = Math.max(...features.map((feature) => feature.onset), 0.0001);
  for (const feature of features) {
    feature.onset = feature.onset / maxOnset;
  }

  let peaks = detectPeaks(features, settings);
  if (difficulty === "easy") {
    peaks = peaks.filter((peak) => peak.onset >= 0.3);
  } else if (difficulty === "hard") {
    peaks = peaks.filter((peak) => peak.onset >= 0.14);
  }

  const bpm = estimateBpm(peaks.length > 1 ? peaks : features.filter((f) => f.onset > 0.2));
  const notes = [];
  const laneStats = buildLaneStats(features);
  const laneUsage = new Array(laneStats.length).fill(0);
  const beatLength = 60 / bpm;
  const step = beatLength / settings.gridSubdivisions;
  const phase = estimateGridPhase(peaks.length > 0 ? peaks : features.filter((f) => f.onset > 0.2), beatLength, step);
  const gateWindow = Math.min(step * 0.45, 0.07);
  const onsetThreshold = Math.max(settings.peakFloor * 0.65, 0.12);
  const usedPeakIndices = new Set();

  for (let candidateTime = phase; candidateTime < audioBuffer.duration; candidateTime += step) {
    const localPeak = findLocalPeak(features, candidateTime, gateWindow);
    if (!localPeak || localPeak.onset < onsetThreshold) continue;

    const peakIndex = localPeak.index ?? features.indexOf(localPeak);
    if (usedPeakIndices.has(peakIndex)) continue;

    const refinedTime = Math.max(0, refinePeakTime(features, peakIndex, HOP_SIZE / sampleRate));
    const localScores = averageLaneScores(features, peakIndex, 1);
    const pseudoFeature = { laneScores: Array.from(localScores), peakOnset: localPeak.onset };
    const selectedLanes = chooseLanesForPeak(pseudoFeature, laneStats, laneUsage, settings);
    if (!selectedLanes.length) continue;

    for (const sector of selectedLanes) {
      notes.push({
        id: `n_${notes.length}_${sector}_${Math.round(refinedTime * 1000)}`,
        type: "tap",
        sector,
        timeMs: refinedTime * 1000,
      });
      laneUsage[sector] += 1;
    }

    usedPeakIndices.add(peakIndex);
  }

  notes.sort((a, b) => a.timeMs - b.timeMs);

  return {
    bpm,
    features,
    notes,
    mode: "4k-downscroll",
    difficulty,
    durationMs: audioBuffer.duration * 1000,
    frameStepMs,
  };
}
