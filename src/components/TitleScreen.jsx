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

          <div className="title-brand">
            <div className="brand-mark" />
          </div>

          <h1 className="title-wordmark">Rhythm Forge</h1>

          <div className="title-menu" role="menu" aria-label="Title menu">
            <button className="title-menu-item primary" onClick={onStart} role="menuitem">
              <span className="title-menu-label">Start</span>
            </button>
            <button className="title-menu-item" onClick={onSettings} role="menuitem">
              <span className="title-menu-label">Setting</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
