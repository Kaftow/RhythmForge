import React from "react";
import "../styles/modal.css";

export function SettingsModal({ open, inputOffsetMs, onClose, onInputOffsetChange }) {
  if (!open) return null;

  return (
    <div className="modal" aria-hidden="false" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <div className="eyebrow">Settings</div>
            <div className="modal-title">Input Offset</div>
          </div>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <label className="setting-field">
          <span>Offset (ms)</span>
          <input
            type="number"
            min="-300"
            max="300"
            step="1"
            value={inputOffsetMs}
            onChange={(event) => onInputOffsetChange(Number(event.target.value) || 0)}
          />
        </label>

        <p className="setting-note">
          Use this if hits feel early or late. The value shifts hit judgment timing only.
        </p>
      </div>
    </div>
  );
}
