import React from "react";
import "../styles/play.css";

export function PlayScreen({
  canvasRef,
  onBack,
  onPlayToggle,
  onRestart,
  isPlaying,
  songName,
  bpm,
  accuracy,
  maxCombo,
  score,
}) {
  return (
    <section className="screen screen-play">
      <header className="playbar">
        <div className="playbar-left">
          <button className="ghost" onClick={onBack}>
            Back
          </button>
          <button className="primary" onClick={onPlayToggle}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button onClick={onRestart}>Restart</button>
        </div>
      </header>

      <main className="stage">
        <canvas ref={canvasRef} id="gameCanvas" width="1280" height="720" />
        <div className="overlay">
          <div className="status-panel">
            <div className="song-title">{songName}</div>
            <div className="status-meta">
              <div>
                <span>BPM</span>
                <strong>{bpm}</strong>
              </div>
              <div>
                <span>Score</span>
                <strong>{score}</strong>
              </div>
              <div>
                <span>Acc</span>
                <strong>{accuracy}%</strong>
              </div>
              <div>
                <span>Max Combo</span>
                <strong>{maxCombo}</strong>
              </div>
            </div>
          </div>

        </div>
      </main>
    </section>
  );
}
