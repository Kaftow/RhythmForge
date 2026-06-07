import React, { useRef } from "react";
import "../styles/setup.css";

export function SetupScreen({
  difficulty,
  onDifficultyChange,
  onBack,
  onFileChange,
  onGenerateChart,
  onEnterPlay,
  songName,
  bpm,
  noteCount,
  accuracy,
  combo,
  score,
  chartReady,
  headline,
  subline,
}) {
  const fileInputRef = useRef(null);

  return (
    <section className="screen screen-setup setup-scene">
      <div className="setup-orb setup-orb-a" />
      <div className="setup-orb setup-orb-b" />
      <div className="setup-orb setup-orb-c" />

      <div className="setup-shell">
        <div className="setup-card jelly-card">
          <div className="setup-card-header">
            <button className="ghost" onClick={onBack}>
              Back
            </button>
            <div className="setup-kicker">Song Setup</div>
            <div className="setup-badge">Mode: 4K</div>
          </div>

          <div className="setup-copy">
            <h2>Upload a song, then generate a basic chart.</h2>
            <p>{headline}</p>
            <p>{subline}</p>
          </div>

          <label className="setup-upload" id="dropzone">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={(event) => onFileChange(event.target.files?.[0] || null)}
            />
            <span>Upload Song</span>
            <small>Click to select an audio file</small>
          </label>

          <div className="setup-controls">
            <label className="setup-field">
              <span>Difficulty</span>
              <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)}>
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <div className="setup-actions">
              <button onClick={onGenerateChart} disabled={!songName || songName === "None"}>
                Generate Chart
              </button>
              <button className="primary" onClick={onEnterPlay} disabled={!chartReady}>
                Enter Play
              </button>
            </div>
          </div>

          <div className="setup-metrics">
            <div className="metric-card">
              <span>Song</span>
              <strong>{songName}</strong>
            </div>
            <div className="metric-card">
              <span>BPM</span>
              <strong>{bpm}</strong>
            </div>
            <div className="metric-card">
              <span>Notes</span>
              <strong>{noteCount}</strong>
            </div>
            <div className="metric-card">
              <span>Accuracy</span>
              <strong>{accuracy}%</strong>
            </div>
            <div className="metric-card">
              <span>Combo</span>
              <strong>{combo}</strong>
            </div>
            <div className="metric-card">
              <span>Score</span>
              <strong>{score}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
