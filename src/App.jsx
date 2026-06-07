import React from "react";
import { useRhythmGame } from "./hooks/useRhythmGame.js";
import { TitleScreen } from "./components/TitleScreen.jsx";
import { SetupScreen } from "./components/SetupScreen.jsx";
import { PlayScreen } from "./components/PlayScreen.jsx";
import { SettingsModal } from "./components/SettingsModal.jsx";

export function App() {
  const game = useRhythmGame();

  return (
    <>
      {game.scene === "title" && (
        <TitleScreen
          onStart={game.openSetup}
          onSettings={game.openSettings}
        />
      )}

      {game.scene === "setup" && (
        <SetupScreen
          difficulty={game.difficulty}
          onDifficultyChange={game.setDifficulty}
          onBack={game.openTitle}
          onFileChange={game.handleFileChange}
          onGenerateChart={game.generateChart}
          onEnterPlay={game.enterPlay}
          songName={game.songName}
          bpm={game.bpm}
          noteCount={game.noteCount}
          accuracy={game.accuracy}
          combo={game.combo}
          score={game.score}
          chartReady={game.chartReady}
          headline={game.headline}
          subline={game.subline}
        />
      )}

      {game.scene === "play" && (
        <PlayScreen
          canvasRef={game.canvasRef}
          onBack={game.openSetup}
          onPlayToggle={game.togglePlayback}
          onReset={game.resetPlayback}
          isPlaying={game.isPlaying}
          songName={game.songName}
          bpm={game.bpm}
          combo={game.combo}
          score={game.score}
          headline={game.headline}
          subline={game.subline}
        />
      )}

      <SettingsModal
        open={game.settingsOpen}
        inputOffsetMs={game.inputOffsetMs}
        onClose={game.closeSettings}
        onInputOffsetChange={game.setInputOffsetMs}
      />
    </>
  );
}
