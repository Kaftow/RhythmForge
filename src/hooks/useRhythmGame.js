import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeAndGenerateChart } from "../analysis.js";
import { createRenderer } from "../render.js";

const JUDGE_WINDOWS = [
  { name: "Perfect", ms: 16, score: 300, color: "#ffffff" },
  { name: "Great", ms: 40, score: 200, color: "#67ddff" },
  { name: "Good", ms: 80, score: 100, color: "#69e4a4" },
  { name: "Miss", ms: 120, score: 0, color: "#ff6b84" },
];

function initialUi() {
  return {
    headline: "Welcome.",
    subline: "Start from the main menu, then upload a song in Setup.",
    songName: "None",
    bpm: "--",
    noteCount: "0",
    accuracy: "0",
    combo: "0",
    score: "0",
  };
}

function createGameState() {
  return {
    audioContext: null,
    audioBuffer: null,
    audioSource: null,
    sourceStartTime: 0,
    pausedAt: 0,
    isPlaying: false,
    chart: null,
    selectedFileName: "",
    headline: "Welcome.",
    subline: "Start from the main menu, then upload a song in Setup.",
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    totalJudges: 0,
    flash: 0,
    judgeText: null,
    effects: [],
    approachTimeMs: 1450,
    missWindowMs: 120,
    inputOffsetMs: 0,
  };
}

export function useRhythmGame() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const stateRef = useRef(createGameState());
  const rafRef = useRef(0);
  const lastFrameRef = useRef(performance.now());

  const [scene, setScene] = useState("title");
  const [difficulty, setDifficulty] = useState("normal");
  const [ui, setUi] = useState(initialUi);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inputOffsetMs, setInputOffsetMsState] = useState(0);

  const syncUi = useCallback(() => {
    const s = stateRef.current;
    const accuracy = s.totalJudges > 0 ? Math.round((s.hits / s.totalJudges) * 100) : 0;

    setUi({
      headline: s.headline,
      subline: s.subline,
      songName: s.selectedFileName || "None",
      bpm: s.chart ? String(s.chart.bpm) : "--",
      noteCount: s.chart ? String(s.chart.notes.length) : "0",
      accuracy: String(accuracy),
      combo: String(s.combo),
      score: String(s.score),
    });
  }, []);

  const setHeadline = useCallback((headline, subline = "") => {
    stateRef.current.headline = headline;
    stateRef.current.subline = subline;
    setUi((prev) => ({ ...prev, headline, subline }));
  }, []);

  const ensureAudioContext = useCallback(() => {
    const state = stateRef.current;
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return state.audioContext;
  }, []);

  const stopAudio = useCallback((keepPosition = true) => {
    const state = stateRef.current;
    if (state.audioSource) {
      try {
        state.audioSource.stop();
      } catch {
        // ignore double stop
      }
      state.audioSource.disconnect();
      state.audioSource = null;
    }
    if (!keepPosition) {
      state.pausedAt = 0;
    }
    state.isPlaying = false;
  }, []);

  const getPlaybackTime = useCallback(() => {
    const state = stateRef.current;
    if (!state.audioContext) return 0;
    if (state.isPlaying) {
      return (state.audioContext.currentTime - state.sourceStartTime) * 1000;
    }
    return state.pausedAt;
  }, []);

  const openTitle = useCallback(() => {
    if (stateRef.current.isPlaying) {
      stateRef.current.pausedAt = getPlaybackTime();
      stopAudio(true);
    }
    setScene("title");
    setSettingsOpen(false);
    setHeadline("Welcome.", "Start from the main menu, then upload a song in Setup.");
  }, [getPlaybackTime, stopAudio, setHeadline]);

  const openSetup = useCallback(() => {
    if (stateRef.current.isPlaying) {
      stateRef.current.pausedAt = getPlaybackTime();
      stopAudio(true);
    }
    setScene("setup");
    setSettingsOpen(false);
    const hasChart = !!stateRef.current.chart;
    setHeadline(
      hasChart ? "Chart ready." : "Upload a song.",
      hasChart ? "Enter Play to start the 4K downscroll stage." : "Choose an audio file and generate a basic 4K chart."
    );
  }, [getPlaybackTime, stopAudio, setHeadline]);

  const openPlay = useCallback(() => {
    if (!stateRef.current.chart) return;
    setScene("play");
    setSettingsOpen(false);
    setHeadline("Ready.", "Use D F J K to hit the four lanes.");
  }, [setHeadline]);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const judgeNote = useCallback((deltaMs) => {
    const abs = Math.abs(deltaMs);
    const result = JUDGE_WINDOWS.find((window) => abs <= window.ms) || JUDGE_WINDOWS[JUDGE_WINDOWS.length - 1];
    if (result.name === "Miss") return null;
    return result;
  }, []);

  const triggerJudgeText = useCallback((text, color) => {
    const state = stateRef.current;
    state.judgeText = { text, color, alpha: 1, age: 0, duration: 0.7 };
    state.flash = 1;
    state.effects.push({ age: 0, duration: 0.55, color, lineWidth: 4 });
  }, []);

  const findBestNote = useCallback((sector, timeMs) => {
    const state = stateRef.current;
    if (!state.chart) return null;
    let best = null;
    let bestDelta = Infinity;
    for (const note of state.chart.notes) {
      if (note.state !== "pending" || note.sector !== sector) continue;
      const delta = Math.abs(timeMs - note.timeMs);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = note;
      }
    }
    return best;
  }, []);

  const resetPlayback = useCallback(() => {
    const state = stateRef.current;
    stopAudio(false);
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.hits = 0;
    state.totalJudges = 0;
    state.flash = 0;
    state.judgeText = null;
    state.effects = [];
    if (state.chart) {
      for (const note of state.chart.notes) {
        note.state = "pending";
      }
    }
    setHeadline("Ready.", "Press Play to start from the beginning.");
    syncUi();
  }, [setHeadline, stopAudio, syncUi]);

  const generateChart = useCallback(() => {
    const state = stateRef.current;
    if (!state.audioBuffer) return;
    const result = analyzeAndGenerateChart(state.audioBuffer, difficulty);
    state.chart = {
      bpm: result.bpm,
      mode: result.mode,
      difficulty: result.difficulty,
      notes: result.notes.map((note) => ({ ...note, state: "pending" })),
      durationMs: result.durationMs,
    };
    state.approachTimeMs = 1450;
    state.missWindowMs = 120;
    resetPlayback();
    setHeadline("Chart generated.", "Basic 4K tap notes are ready.");
    syncUi();
  }, [difficulty, resetPlayback, setHeadline, syncUi]);

  const loadFile = useCallback(
    async (file) => {
      if (!file) return;
      const ctx = ensureAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const state = stateRef.current;
      state.audioBuffer = audioBuffer;
      state.selectedFileName = file.name;
      state.pausedAt = 0;
      state.score = 0;
      state.combo = 0;
      state.maxCombo = 0;
      state.hits = 0;
      state.totalJudges = 0;
      state.flash = 0;
      state.effects = [];
      state.judgeText = null;
      setHeadline("Audio loaded.", "Generating a basic 4K chart.");
      syncUi();
      generateChart();
    },
    [ensureAudioContext, generateChart, setHeadline, syncUi]
  );

  const startPlayback = useCallback(
    (startMs = stateRef.current.pausedAt) => {
      const state = stateRef.current;
      if (!state.audioBuffer) return;
      const ctx = ensureAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      stopAudio(true);

      const source = ctx.createBufferSource();
      source.buffer = state.audioBuffer;
      source.connect(ctx.destination);
      source.start(0, startMs / 1000);
      source.onended = () => {
        if (state.isPlaying) {
          state.pausedAt = 0;
          state.isPlaying = false;
          setHeadline("Song finished.", "Go back to Setup or upload another song.");
          syncUi();
        }
      };

      state.audioSource = source;
      state.sourceStartTime = ctx.currentTime - startMs / 1000;
      state.pausedAt = startMs;
      state.isPlaying = true;
      setHeadline("Playing.", "Use D F J K to hit the four lanes.");
      syncUi();
    },
    [ensureAudioContext, setHeadline, stopAudio, syncUi]
  );

  const togglePlayback = useCallback(() => {
    if (!stateRef.current.chart) return;
    if (stateRef.current.isPlaying) {
      stateRef.current.pausedAt = getPlaybackTime();
      stopAudio(true);
      setHeadline("Paused.", "Press Play to resume.");
    } else {
      startPlayback(stateRef.current.pausedAt);
    }
    syncUi();
  }, [getPlaybackTime, setHeadline, startPlayback, stopAudio, syncUi]);

  const enterPlay = useCallback(() => {
    if (!stateRef.current.chart) return;
    openPlay();
    syncUi();
  }, [openPlay, syncUi]);

  const onKeyDown = useCallback(
    (event) => {
      if (event.repeat) return;
      if (event.code === "Space" && scene === "play") {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (event.code === "Enter" && scene === "title") {
        openSetup();
        return;
      }
      if (scene !== "play" || !stateRef.current.isPlaying || !stateRef.current.chart) return;

      const map = new Map([
        ["KeyD", 0],
        ["KeyF", 1],
        ["KeyJ", 2],
        ["KeyK", 3],
      ]);
      const sector = map.get(event.code);
      if (sector === undefined) return;

      const now = getPlaybackTime() - stateRef.current.inputOffsetMs;
      const note = findBestNote(sector, now);
      if (!note) return;

      const delta = now - note.timeMs;
      const judge = judgeNote(delta);
      if (!judge) return;

      note.state = "hit";
      stateRef.current.score += judge.score;
      stateRef.current.combo += 1;
      stateRef.current.hits += 1;
      stateRef.current.totalJudges += 1;
      stateRef.current.maxCombo = Math.max(stateRef.current.maxCombo, stateRef.current.combo);
      triggerJudgeText(judge.name, judge.color);
      syncUi();
    },
    [findBestNote, getPlaybackTime, judgeNote, openSetup, scene, syncUi, togglePlayback, triggerJudgeText]
  );

  const updateMisses = useCallback((now) => {
    const state = stateRef.current;
    if (!state.chart) return;
    for (const note of state.chart.notes) {
      if (note.state !== "pending") continue;
      if (now > note.timeMs + state.missWindowMs) {
        note.state = "miss";
        state.combo = 0;
        state.totalJudges += 1;
        triggerJudgeText("Miss", "#ff6b84");
        syncUi();
      }
    }
  }, [syncUi, triggerJudgeText]);

  const updateEffects = useCallback((dt) => {
    const state = stateRef.current;
    state.flash = Math.max(0, state.flash - dt * 2.8);
    if (state.judgeText) {
      state.judgeText.age += dt;
      state.judgeText.alpha = Math.max(0, 1 - state.judgeText.age / state.judgeText.duration);
      if (state.judgeText.age > state.judgeText.duration) {
        state.judgeText = null;
      }
    }
    state.effects = state.effects
      .map((effect) => ({ ...effect, age: effect.age + dt }))
      .filter((effect) => effect.age < effect.duration);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    rendererRef.current = createRenderer(canvas);
    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      rendererRef.current?.resize(width, height);
    };

    resize();
    window.addEventListener("resize", resize);

    const loop = (now) => {
      const dt = Math.min(0.033, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      if (scene === "play") {
        const timeMs = getPlaybackTime();
        if (stateRef.current.isPlaying) {
          updateMisses(timeMs - stateRef.current.inputOffsetMs);
        }
        updateEffects(dt);

        rendererRef.current?.draw({
          timeMs: timeMs - stateRef.current.inputOffsetMs,
          notes: stateRef.current.chart ? stateRef.current.chart.notes : [],
          effects: stateRef.current.effects,
          flash: stateRef.current.flash,
          judgeText: stateRef.current.judgeText,
          sectorCount: 4,
          approachTimeMs: stateRef.current.approachTimeMs,
          missWindowMs: stateRef.current.missWindowMs,
          bpm: stateRef.current.chart ? stateRef.current.chart.bpm : 0,
          mode: "4K Downscroll",
          difficulty: stateRef.current.chart ? stateRef.current.chart.difficulty : difficulty,
          songTitle: stateRef.current.selectedFileName || "No Song Loaded",
        });
      }

      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [canvasRef, difficulty, getPlaybackTime, scene, updateEffects, updateMisses]);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  useEffect(() => {
    if (scene === "play") {
      setUi((prev) => ({
        ...prev,
        headline: "Ready.",
        subline: "Use D F J K to hit the four lanes.",
      }));
    }
  }, [scene]);

  return {
    scene,
    difficulty,
    setDifficulty,
    settingsOpen,
    inputOffsetMs,
    setInputOffsetMs: (value) => {
      setInputOffsetMsState(value);
      stateRef.current.inputOffsetMs = value;
    },
    canvasRef,
    openTitle,
    openSetup,
    openPlay,
    openSettings,
    closeSettings,
    handleFileChange: loadFile,
    generateChart,
    enterPlay,
    togglePlayback,
    resetPlayback,
    songName: ui.songName,
    bpm: ui.bpm,
    noteCount: ui.noteCount,
    accuracy: ui.accuracy,
    combo: ui.combo,
    score: ui.score,
    headline: ui.headline,
    subline: ui.subline,
    isPlaying: stateRef.current.isPlaying,
    chartReady: !!stateRef.current.chart,
  };
}
