import React from "react";
import "../styles/play.css";

export function PlayScreen({
  canvasRef,
  onBack,
  onPlayToggle,
  onReset,
  isPlaying,
  songName,
  bpm,
  combo,
  score,
  headline,
  subline,
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
          <button onClick={onReset}>Reset</button>
        </div>

        <div className="playbar-right">
          <div><span>Song</span><strong>{songName}</strong></div>
          <div><span>BPM</span><strong>{bpm}</strong></div>
          <div><span>Score</span><strong>{score}</strong></div>
          <div><span>Combo</span><strong>{combo}</strong></div>
        </div>
      </header>

      <main className="stage">
        <canvas ref={canvasRef} id="gameCanvas" width="1280" height="720" />
        <div className="overlay">
          <div className="headline">{headline}</div>
          <div className="subline">{subline}</div>
        </div>
      </main>
    </section>
  );
}
