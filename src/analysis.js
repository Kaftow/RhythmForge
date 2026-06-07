import { fft, hannWindow } from "./fft.js";

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;

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

function spectralCentroid(frame, sampleRate, window) {
  const size = frame.length;
  const paddedSize = 1 << Math.ceil(Math.log2(size));
  const input = new Float64Array(paddedSize);
  for (let i = 0; i < size; i += 1) {
    input[i] = frame[i] * window[i];
  }
  const { real, imag } = fft(input);
  let weighted = 0;
  let magnitudeSum = 0;
  for (let i = 0; i < paddedSize / 2; i += 1) {
    const magnitude = Math.hypot(real[i], imag[i]);
    const frequency = (i * sampleRate) / paddedSize;
    weighted += frequency * magnitude;
    magnitudeSum += magnitude;
  }
  return magnitudeSum > 0 ? weighted / magnitudeSum : 0;
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

function detectPeaks(features) {
  const onsetValues = features.map((f) => f.onset);
  const baseline = median(onsetValues) || 0;
  const threshold = Math.max(0.12, baseline * 1.8);
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

    const tooClose = peaks.length > 0 && current.time - peaks[peaks.length - 1].time < 0.18;
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

function quantizeTime(time, beatLength, division) {
  const grid = beatLength / division;
  return Math.round(time / grid) * grid;
}

function chooseSector(feature, index) {
  const band = clamp(feature.centroid / 12000, 0, 0.9999);
  const mapped = Math.floor(band * 4);
  return (mapped + index) % 4;
}

export function analyzeAndGenerateChart(audioBuffer, difficulty = "normal") {
  const mono = mixToMono(audioBuffer);
  const window = hannWindow(FRAME_SIZE);
  const sampleRate = audioBuffer.sampleRate;
  const frameStepMs = (HOP_SIZE / sampleRate) * 1000;

  const features = [];
  let prevRms = 0;
  let prevEnergy = 0;

  for (let start = 0; start + FRAME_SIZE <= mono.length; start += HOP_SIZE) {
    let energy = 0;
    let rms = 0;
    const frame = new Float32Array(FRAME_SIZE);

    for (let i = 0; i < FRAME_SIZE; i += 1) {
      const sample = mono[start + i] || 0;
      frame[i] = sample;
      energy += sample * sample;
    }

    rms = Math.sqrt(energy / FRAME_SIZE);
    const centroid = spectralCentroid(frame, sampleRate, window);
    const diff = Math.max(0, rms - prevRms) + Math.max(0, energy - prevEnergy) * 0.02;
    const time = start / sampleRate;

    features.push({
      time,
      rms,
      energy,
      centroid,
      onset: diff,
    });

    prevRms = rms;
    prevEnergy = energy;
  }

  const maxOnset = Math.max(...features.map((feature) => feature.onset), 0.0001);
  for (const feature of features) {
    feature.onset = feature.onset / maxOnset;
  }

  let peaks = detectPeaks(features);
  if (difficulty === "easy") {
    peaks = peaks.filter((peak) => peak.onset >= 0.3);
  } else if (difficulty === "hard") {
    peaks = features.filter((feature) => feature.onset >= 0.14);
  }

  const bpm = estimateBpm(peaks.length > 1 ? peaks : features.filter((f) => f.onset > 0.2));
  const beatLength = 60 / bpm;
  const sectorCount = 4;
  const division = difficulty === "easy" ? 4 : difficulty === "hard" ? 16 : 8;

  const notes = [];
  let lastSector = -1;

  for (let i = 0; i < peaks.length; i += 1) {
    const peak = peaks[i];
    const snapped = quantizeTime(peak.time, beatLength, division);
    let sector = chooseSector(peak, i);
    if (sector === lastSector) {
      sector = (sector + 1) % sectorCount;
    }

    notes.push({
      id: `n_${i}_${Math.round(snapped * 1000)}`,
      type: "tap",
      sector,
      timeMs: Math.max(0, snapped * 1000),
    });

    lastSector = sector;
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
