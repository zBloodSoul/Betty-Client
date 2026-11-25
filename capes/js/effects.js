/**
 * effects.js — Effetti animati del mantello. Ogni effetto disegna il disegno (src) su ctx a una "fase" 0..1:
 * fase 0 e fase 1 sono uguali, così l'animazione gira in loop senza scatti. Gli stessi frame vanno
 * nell'anteprima e nella striscia PNG esportata.
 */
'use strict';

const EFFECT_FRAMES = 12;

/** Numero pseudo-casuale fisso (stesse stelle a ogni frame). */
function rand(i, s) {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Stella a 4 punte centrata in (x, y). */
function sparkle(ctx, x, y, r, alpha) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

/** Colora solo dove il disegno non è trasparente (il bordo del mantello resta pulito). */
function overlay(ctx, w, h, paint) {
  const tmp = overlay.c || (overlay.c = document.createElement('canvas'));
  tmp.width = w;
  tmp.height = h;
  const t = tmp.getContext('2d');
  t.clearRect(0, 0, w, h);
  paint(t);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(ctx.canvas, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

function applyEffect(ctx, src, effect, phase) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  const T = phase * Math.PI * 2;
  if (effect === 'rainbow') {
    ctx.filter = `hue-rotate(${Math.round(phase * 360)}deg)`;
    ctx.drawImage(src, 0, 0, w, h);
    ctx.filter = 'none';
    return;
  }
  ctx.drawImage(src, 0, 0, w, h);
  if (effect === 'sparkle') {
    for (let i = 0; i < 26; i++) {
      const a = Math.pow(Math.max(0, Math.sin(T + rand(i, 3) * 6.283)), 4);
      sparkle(ctx, rand(i, 1) * w, rand(i, 2) * h, (3 + rand(i, 4) * 6) * (0.6 + a * 0.6) * (w / 240), a);
    }
  } else if (effect === 'shine') {
    // banda di luce diagonale che attraversa il mantello
    const p = -0.4 + phase * 1.8;
    overlay(ctx, w, h, (t) => {
      const g = t.createLinearGradient(0, 0, w, h);
      const s = (v) => Math.min(1, Math.max(0, v));
      g.addColorStop(s(p - 0.12), 'rgba(255,255,255,0)');
      g.addColorStop(s(p), 'rgba(255,255,255,0.55)');
      g.addColorStop(s(p + 0.12), 'rgba(255,255,255,0)');
      t.fillStyle = g;
      t.fillRect(0, 0, w, h);
    });
  } else if (effect === 'pulse') {
    const a = (1 - Math.cos(T)) / 2;
    overlay(ctx, w, h, (t) => {
      t.fillStyle = `rgba(255,255,255,${(a * 0.28).toFixed(3)})`;
      t.fillRect(0, 0, w, h);
    });
  }
}
