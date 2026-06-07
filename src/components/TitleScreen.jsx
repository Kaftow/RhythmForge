import React from "react";
import "../styles/title.css";

export function TitleScreen({ onStart, onSettings }) {
  return (
    <section className="screen screen-title title-scene">
      <div className="title-orb title-orb-a" />
      <div className="title-orb title-orb-b" />
      <div className="title-orb title-orb-c" />

      <div className="title-shell">
        <div className="title-card jelly-card">
          <div className="title-card-glow" />
          <div className="title-card-grid" />
          <div className="title-card-sheen" />

          <div className="title-topline">
            <div className="brand">
              <div className="brand-mark" />
              <div>
                <div className="eyebrow">Ring Rhythm</div>
                <div className="title">4K Downscroll Rhythm Game</div>
              </div>
            </div>

            <div className="title-badge">English UI</div>
          </div>

          <div className="title-actions title-actions-center">
            <button className="primary" onClick={onStart}>
              Start
            </button>
            <button onClick={onSettings}>Setting</button>
          </div>
        </div>
      </div>
    </section>
  );
}
