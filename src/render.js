function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const num = Number.parseInt(value, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  const state = {
    width: canvas.width,
    height: canvas.height,
  };

  function resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.width = width;
    state.height = height;
  }

  function drawBackground(time) {
    const { width, height } = state;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#061018");
    gradient.addColorStop(1, "#0b1320");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glowX = width * 0.68 + Math.sin(time * 0.0003) * 36;
    const glowY = height * 0.24 + Math.cos(time * 0.0002) * 22;
    const glow = ctx.createRadialGradient(glowX, glowY, 20, glowX, glowY, 280);
    glow.addColorStop(0, "rgba(103, 221, 255, 0.14)");
    glow.addColorStop(1, "rgba(103, 221, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  function drawPlayfield(scene) {
    const { width, height } = state;
    const fieldWidth = Math.min(width * 0.42, 520);
    const fieldHeight = height * 0.9;
    const left = width * 0.5 - fieldWidth * 0.5;
    const top = height * 0.04;
    const laneWidth = fieldWidth / 4;
    const judgeY = height * 0.82;
    const spawnY = height * 0.08;
    const laneNames = ["D", "F", "J", "K"];
    const now = scene.timeMs;
    const approachTime = scene.approachTimeMs;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, left, top, fieldWidth, fieldHeight, 22);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(103, 221, 255, 0.14)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      const x = left + laneWidth * i;
      ctx.beginPath();
      ctx.moveTo(x, top + 10);
      ctx.lineTo(x, judgeY + 20);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(103, 221, 255, 0.55)";
    ctx.lineWidth = 7;
    ctx.shadowBlur = 24;
    ctx.shadowColor = "rgba(103, 221, 255, 0.4)";
    ctx.beginPath();
    ctx.moveTo(left + 10, judgeY);
    ctx.lineTo(left + fieldWidth - 10, judgeY);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "600 12px Avenir Next, Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 4; i += 1) {
      const laneCenter = left + laneWidth * (i + 0.5);
      ctx.fillText(laneNames[i], laneCenter, judgeY + 24);
    }
    ctx.restore();

    if (scene.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = scene.flash;
      ctx.fillStyle = "rgba(255,255,255,0.42)";
      ctx.fillRect(left, judgeY - 6, fieldWidth, 12);
      ctx.restore();
    }

    drawLanes(scene, left, top, fieldWidth, laneWidth, spawnY, judgeY, approachTime, now);
    drawFx(scene, left, judgeY, fieldWidth);
    drawHud(scene, left, top, fieldWidth, judgeY);
  }

  function drawLanes(scene, left, top, fieldWidth, laneWidth, spawnY, judgeY, approachTime, now) {
    for (const note of scene.notes) {
      if (note.state === "hit" || note.state === "miss") continue;
      const delta = note.timeMs - now;
      if (delta > approachTime || delta < -scene.missWindowMs) continue;

      const progress = clamp(1 - delta / approachTime, 0, 1);
      const y = lerp(spawnY, judgeY, progress);
      const x = left + laneWidth * note.sector;
      const size = laneWidth * 0.7;
      const height = lerp(18, 28, progress);
      const alpha = note.state === "active" ? 1 : 0.92;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(x + laneWidth * 0.5, y);

      const noteGradient = ctx.createLinearGradient(0, -height, 0, height);
      noteGradient.addColorStop(0, "rgba(255,255,255,0.95)");
      noteGradient.addColorStop(0.45, "rgba(103, 221, 255, 0.95)");
      noteGradient.addColorStop(1, "rgba(158, 123, 255, 0.95)");

      ctx.fillStyle = noteGradient;
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(103, 221, 255, 0.52)";
      ctx.globalAlpha = alpha;
      roundRect(ctx, -size * 0.5, -height * 0.5, size, height, 8);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFx(scene, left, judgeY, fieldWidth) {
    const { width, height } = state;
    const centerX = left + fieldWidth / 2;

    for (const fx of scene.effects) {
      const life = clamp(1 - fx.age / fx.duration, 0, 1);
      const pulseHeight = lerp(10, 140, 1 - life);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = life;
      ctx.strokeStyle = hexToRgba(fx.color, 0.8);
      ctx.lineWidth = fx.lineWidth;
      ctx.beginPath();
      ctx.moveTo(left, judgeY - pulseHeight);
      ctx.lineTo(left + fieldWidth, judgeY - pulseHeight);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = life * 0.35;
      ctx.fillStyle = hexToRgba(fx.color, 0.6);
      ctx.fillRect(centerX - 4, judgeY - pulseHeight - 8, 8, 16);
      ctx.restore();
    }

    if (scene.judgeText) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = scene.judgeText.color;
      ctx.globalAlpha = scene.judgeText.alpha;
      ctx.font = "700 38px Avenir Next, Segoe UI, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(scene.judgeText.text, width / 2, judgeY - 60);
      ctx.restore();
    }
  }

  function drawHud(scene, left, top, fieldWidth, judgeY) {
    const { width, height } = state;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 18px Avenir Next, Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(scene.songTitle || "No Song Loaded", 28, height - 34);

    ctx.textAlign = "right";
    ctx.fillText(`${scene.bpm} BPM`, width - 28, height - 34);

    ctx.fillStyle = "rgba(160, 176, 195, 0.8)";
    ctx.font = "500 13px Avenir Next, Segoe UI, system-ui, sans-serif";
    ctx.fillText(`Mode: ${scene.mode}  |  Difficulty: ${scene.difficulty.toUpperCase()}`, width - 28, height - 14);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, fieldWidth, judgeY - top);
    ctx.restore();
  }

  function draw(scene) {
    drawBackground(scene.timeMs);
    drawPlayfield(scene);
  }

  return { resize, draw };
}
