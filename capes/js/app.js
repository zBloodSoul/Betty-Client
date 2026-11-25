/**
 * app.js — Creatore di mantelli Betty: tela (pennello, gomma, secchiello, contagocce, testo, sfondi, immagini),
 * annulla/ripeti, anteprima 3D, esportazione .zip nel formato dei cosmetici Betty:
 *   <id>/cosmetic.json  { id, name, slot: "cape", texture, layout: "immagine", [animated, frames, fps], [style] }
 *   <id>/texture.png    il retro del mantello (10:16), oppure una striscia verticale di frame, oppure la GIF originale.
 * Il lavoro resta salvato nel browser (localStorage) per riprenderlo dopo.
 */
'use strict';

const W = 240, H = 384;          // 10×16 pixel del mantello a 24 texel per pixel
const SAVE_KEY = 'betty-cape-creator';
const $ = (id) => document.getElementById(id);

const art = document.createElement('canvas');
art.width = W; art.height = H;
const actx = art.getContext('2d', { willReadFrequently: true });
const stroke = document.createElement('canvas');
stroke.width = W; stroke.height = H;
const sctx = stroke.getContext('2d');
const view = $('view');
const vctx = view.getContext('2d');
const frameCanvas = document.createElement('canvas');   // quello che vede l'anteprima 3D (con effetto)
frameCanvas.width = W; frameCanvas.height = H;
const fctx = frameCanvas.getContext('2d');

const state = {
  tool: 'brush', color: '#ff8f9c', size: 10, opacity: 1,
  style: 'stoffa', effect: 'none', fps: 10,
  gif: null,          // { bytes, frames: [canvas], delays: [ms], total } se l'utente ha caricato una GIF
  keepGif: true
};

// ------------------------------------------------------------------ annulla / ripeti

const undoStack = [], redoStack = [];
function snapshot() {
  undoStack.push(actx.getImageData(0, 0, W, H));
  if (undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
  updateUndo();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(actx.getImageData(0, 0, W, H));
  actx.putImageData(undoStack.pop(), 0, 0);
  changed();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(actx.getImageData(0, 0, W, H));
  actx.putImageData(redoStack.pop(), 0, 0);
  changed();
}
function updateUndo() {
  $('undo').disabled = !undoStack.length;
  $('redo').disabled = !redoStack.length;
}

// ------------------------------------------------------------------ disegno

function redraw() {
  vctx.clearRect(0, 0, W, H);
  vctx.drawImage(art, 0, 0);
  vctx.drawImage(stroke, 0, 0);
}

let saveTimer = 0;
function changed() {
  redraw();
  updateUndo();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

function toCanvas(e) {
  const r = view.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}

let path = null;
function drawPath() {
  sctx.clearRect(0, 0, W, H);
  if (!path) return;
  sctx.save();
  sctx.lineCap = 'round';
  sctx.lineJoin = 'round';
  sctx.lineWidth = state.size;
  sctx.strokeStyle = state.tool === 'eraser' ? '#000' : state.color;
  sctx.fillStyle = sctx.strokeStyle;
  if (path.length === 1) {
    sctx.beginPath();
    sctx.arc(path[0][0], path[0][1], state.size / 2, 0, Math.PI * 2);
    sctx.fill();
  } else {
    sctx.beginPath();
    sctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) sctx.lineTo(path[i][0], path[i][1]);
    sctx.stroke();
  }
  sctx.restore();
}

/** Il tratto si disegna su un foglio a parte e si unisce alla fine: l'opacità resta uniforme anche dove si sovrappone. */
function commitStroke() {
  actx.save();
  actx.globalAlpha = state.opacity;
  if (state.tool === 'eraser') actx.globalCompositeOperation = 'destination-out';
  actx.drawImage(stroke, 0, 0);
  actx.restore();
  sctx.clearRect(0, 0, W, H);
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function floodFill(x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const img = actx.getImageData(0, 0, W, H), d = img.data;
  const at = (i) => [d[i], d[i + 1], d[i + 2], d[i + 3]];
  const start = at((y * W + x) * 4);
  const [r, g, b] = hexToRgb(state.color), a = Math.round(state.opacity * 255);
  const tol = 40;
  const same = (i) => Math.abs(d[i] - start[0]) + Math.abs(d[i + 1] - start[1]) + Math.abs(d[i + 2] - start[2]) + Math.abs(d[i + 3] - start[3]) <= tol;
  if (start[0] === r && start[1] === g && start[2] === b && start[3] === a) return;
  const seen = new Uint8Array(W * H);
  const stack = [x, y];
  while (stack.length) {
    const py = stack.pop(), px = stack.pop();
    const p = py * W + px;
    if (px < 0 || py < 0 || px >= W || py >= H || seen[p]) continue;
    seen[p] = 1;
    if (!same(p * 4)) continue;
    // mescola il colore sopra quello che c'era (opacità < 100%)
    const k = a / 255, i = p * 4;
    d[i] = Math.round(r * k + d[i] * (1 - k));
    d[i + 1] = Math.round(g * k + d[i + 1] * (1 - k));
    d[i + 2] = Math.round(b * k + d[i + 2] * (1 - k));
    d[i + 3] = Math.max(d[i + 3], a);
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  actx.putImageData(img, 0, 0);
}

function pickColor(x, y) {
  const p = actx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  if (p[3] === 0) return;
  setColor('#' + [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
}

function placeText(x, y) {
  const text = $('text').value.trim();
  if (!text) return;
  actx.save();
  actx.globalAlpha = state.opacity;
  actx.fillStyle = state.color;
  actx.textAlign = 'center';
  actx.textBaseline = 'middle';
  const px = Math.max(10, state.size * 2.4);
  actx.font = `800 ${px}px Archivo, "Segoe UI", sans-serif`;
  // il testo non esce dal mantello: si rimpicciolisce se è troppo largo
  const k = Math.min(1, (W - 16) / Math.max(1, actx.measureText(text).width));
  actx.font = `800 ${px * k}px Archivo, "Segoe UI", sans-serif`;
  actx.shadowColor = 'rgba(0,0,0,0.35)';
  actx.shadowBlur = 4;
  actx.shadowOffsetY = 2;
  actx.fillText(text, x, y);
  actx.restore();
}

view.addEventListener('pointerdown', (e) => {
  if (state.gif && state.keepGif) return;
  const [x, y] = toCanvas(e);
  if (state.tool === 'picker') { pickColor(x, y); return; }
  snapshot();
  if (state.tool === 'fill') { floodFill(x, y); changed(); return; }
  if (state.tool === 'text') { placeText(x, y); changed(); return; }
  view.setPointerCapture(e.pointerId);
  path = [[x, y]];
  drawPath();
  redrawWithStroke();
});
view.addEventListener('pointermove', (e) => {
  if (!path) return;
  path.push(toCanvas(e));
  drawPath();
  redrawWithStroke();
});
function endStroke() {
  if (!path) return;
  path = null;
  commitStroke();
  changed();
}
view.addEventListener('pointerup', endStroke);
view.addEventListener('pointercancel', endStroke);

/** Durante il tratto: la gomma si vede come trasparenza, il pennello con la sua opacità. */
function redrawWithStroke() {
  vctx.clearRect(0, 0, W, H);
  vctx.drawImage(art, 0, 0);
  vctx.save();
  vctx.globalAlpha = state.opacity;
  if (state.tool === 'eraser') vctx.globalCompositeOperation = 'destination-out';
  vctx.drawImage(stroke, 0, 0);
  vctx.restore();
}

// ------------------------------------------------------------------ sfondi e immagini

const PRESETS = [
  ['Betty', '#3a2d63', '#ff8f9c', 'v'], ['Night', '#07040f', '#45277a', 'v'], ['Sunset', '#ffd27a', '#c2162c', 'v'],
  ['Mint', '#0e3b3a', '#8fe3b0', 'd'], ['Ocean', '#0b1e4a', '#38b6ff', 'r'], ['Fire', '#2a0a10', '#ff7a2a', 'v'],
  ['Lilac', '#b9aedb', '#ffffff', 'r'], ['Gold', '#6e4a0e', '#ffe9a8', 'd'], ['Graphite', '#1a1a1f', '#5a5a66', 'h']
];

function gradient(ctx, a, b, dir) {
  let g;
  if (dir === 'h') g = ctx.createLinearGradient(0, 0, W, 0);
  else if (dir === 'd') g = ctx.createLinearGradient(0, 0, W, H);
  else if (dir === 'r') g = ctx.createRadialGradient(W / 2, H / 2, 8, W / 2, H / 2, H * 0.62);
  else g = ctx.createLinearGradient(0, 0, 0, H);
  if (dir === 'r') { g.addColorStop(0, b); g.addColorStop(1, a); } else { g.addColorStop(0, a); g.addColorStop(1, b); }
  return g;
}

function applyBackground() {
  snapshot();
  actx.save();
  actx.globalCompositeOperation = 'destination-over';
  actx.fillStyle = gradient(actx, $('bgA').value, $('bgB').value, $('bgDir').value);
  actx.fillRect(0, 0, W, H);
  actx.restore();
  changed();
}

function addStars() {
  snapshot();
  const seed = Math.random() * 1000;
  for (let i = 0; i < 40; i++) {
    const r = (3 + rand(i, seed + 4) * 7) * (rand(i, seed + 5) < 0.8 ? 0.5 : 1.2);
    actx.save();
    actx.globalAlpha = 0.55 + rand(i, seed + 6) * 0.45;
    sparkle(actx, rand(i, seed + 1) * W, rand(i, seed + 2) * H, r, 1);
    actx.restore();
  }
  changed();
}

function drawFitted(ctx, img, iw, ih) {
  const k = $('fit').value === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
  const w = iw * k, h = ih * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

let lastImage = null;   // ultima immagine caricata: cambiando "Adatta" si ridisegna
async function loadFile(file) {
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
  state.gif = null;
  if (isGif && 'ImageDecoder' in window) {
    try { state.gif = await decodeGif(bytes); } catch (e) { state.gif = null; }
  } else if (isGif) {
    state.gif = { bytes, frames: null };
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: file.type || 'image/png' }));
  const img = new Image();
  img.onload = () => {
    lastImage = img;
    snapshot();
    actx.clearRect(0, 0, W, H);
    drawFitted(actx, img, img.naturalWidth, img.naturalHeight);
    changed();
    updateGifUi();
  };
  img.onerror = () => setMsg('This image could not be read.', 'err');
  img.src = url;
}

/** GIF animata → frame già adattati alla tela (servono all'anteprima; nel .zip va la GIF originale). */
async function decodeGif(bytes) {
  const dec = new ImageDecoder({ data: bytes, type: 'image/gif' });
  await dec.tracks.ready;
  const n = Math.min(dec.tracks.selectedTrack.frameCount, 200);
  const frames = [], delays = [];
  for (let i = 0; i < n; i++) {
    const { image } = await dec.decode({ frameIndex: i });
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    drawFitted(c.getContext('2d'), image, image.displayWidth, image.displayHeight);
    frames.push(c);
    delays.push(Math.max(20, (image.duration || 100000) / 1000));
    image.close();
  }
  dec.close();
  return { bytes, frames, delays, total: delays.reduce((s, d) => s + d, 0) };
}

function updateGifUi() {
  const has = !!state.gif;
  $('gifRow').hidden = !has;
  const keep = has && state.keepGif;
  $('gifHint').hidden = !keep;
  $('gifHint').textContent = keep
    ? 'The GIF goes into the cape as it is (it should already be 10:16). Untick to draw on it.'
    : '';
  $('effect').disabled = keep;
  view.style.cursor = keep ? 'not-allowed' : '';
}

// ------------------------------------------------------------------ anteprima animata

let preview = null;
function previewFrame(now) {
  if (state.gif && state.keepGif && state.gif.frames) {
    const g = state.gif;
    let t = now % g.total, i = 0;
    while (i < g.frames.length - 1 && t >= g.delays[i]) t -= g.delays[i++];
    fctx.clearRect(0, 0, W, H);
    fctx.drawImage(g.frames[i], 0, 0);
  } else if (state.effect !== 'none' && !(state.gif && state.keepGif)) {
    const period = (EFFECT_FRAMES / state.fps) * 1000;
    const phase = Math.floor(((now % period) / period) * EFFECT_FRAMES) / EFFECT_FRAMES; // stessi scatti del gioco
    applyEffect(fctx, view, state.effect, phase);
  } else {
    fctx.clearRect(0, 0, W, H);
    fctx.drawImage(view, 0, 0);
  }
  if (preview) preview.refresh();
  requestAnimationFrame(previewFrame);
}

// ------------------------------------------------------------------ esportazione

function slug(name) {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return s || 'my_cape';
}

function canvasBytes(c) {
  return new Promise((resolve) => c.toBlob(async (b) => resolve(new Uint8Array(await b.arrayBuffer())), 'image/png'));
}

async function exportZip() {
  const name = $('name').value.trim() || 'My cape';
  const id = slug(name);
  const json = { id, name, slot: 'cape', texture: 'texture.png', layout: 'immagine' };
  let tex;
  if (state.gif && state.keepGif) {
    json.texture = 'texture.gif';
    tex = state.gif.bytes;
  } else if (state.effect !== 'none') {
    const strip = document.createElement('canvas');
    strip.width = W; strip.height = H * EFFECT_FRAMES;
    const sc = strip.getContext('2d');
    const one = document.createElement('canvas');
    one.width = W; one.height = H;
    const oc = one.getContext('2d');
    for (let i = 0; i < EFFECT_FRAMES; i++) {
      applyEffect(oc, art, state.effect, i / EFFECT_FRAMES);
      sc.drawImage(one, 0, i * H);
    }
    tex = await canvasBytes(strip);
    Object.assign(json, { animated: true, frames: EFFECT_FRAMES, fps: state.fps });
  } else {
    tex = await canvasBytes(art);
  }
  if (state.style === 'pannello') json.style = 'pannello';
  const enc = new TextEncoder();
  const zip = makeZip([
    { name: `${id}/cosmetic.json`, data: enc.encode(JSON.stringify(json, null, 2) + '\n') },
    { name: `${id}/${json.texture}`, data: tex }
  ]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zip);
  a.download = `${id}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  setMsg(`Downloaded ${id}.zip: extract it into %APPDATA%\\.betty\\cosmetics`, 'ok');
}

function setMsg(text, kind) {
  const m = $('exportMsg');
  m.textContent = text;
  m.className = 'hint ' + (kind || '');
}

// ------------------------------------------------------------------ salvataggio nel browser

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      art: art.toDataURL('image/png'), name: $('name').value, style: state.style, effect: state.effect, fps: state.fps,
      color: state.color, bgA: $('bgA').value, bgB: $('bgB').value, bgDir: $('bgDir').value
    }));
  } catch (e) { /* spazio pieno o archivio bloccato: si lavora lo stesso */ }
}

function restore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
  if (!s) { defaultArt(); return; }
  if (s.name) $('name').value = s.name;
  for (const k of ['bgA', 'bgB', 'bgDir']) if (s[k]) $(k).value = s[k];
  if (s.color) setColor(s.color);
  if (s.style) setStyle(s.style);
  if (s.effect) { state.effect = s.effect; $('effect').value = s.effect; }
  if (s.fps) { state.fps = s.fps; $('fps').value = String(s.fps); }
  updateId();
  const img = new Image();
  img.onload = () => { actx.drawImage(img, 0, 0); redraw(); };
  img.onerror = defaultArt;
  img.src = s.art;
}

/** Primo avvio: un mantello Betty di esempio, così l'anteprima non è vuota. */
function defaultArt() {
  actx.fillStyle = gradient(actx, '#3a2d63', '#ff8f9c', 'v');
  actx.fillRect(0, 0, W, H);
  for (let i = 0; i < 28; i++) {
    actx.save();
    actx.globalAlpha = 0.5 + rand(i, 9) * 0.5;
    sparkle(actx, rand(i, 7) * W, rand(i, 8) * H * 0.7, 3 + rand(i, 10) * 5, 1);
    actx.restore();
  }
  actx.fillStyle = '#f6e3bf';
  actx.textAlign = 'center';
  actx.font = '800 54px Archivo, "Segoe UI", sans-serif';
  actx.fillText('B', W / 2, H * 0.62);
  redraw();
}

// ------------------------------------------------------------------ interfaccia

function setTool(t) {
  state.tool = t;
  for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('on', b.dataset.tool === t);
  $('textRow').hidden = t !== 'text';
}
function setColor(c) {
  state.color = c;
  $('color').value = c;
}
function setStyle(s) {
  state.style = s;
  for (const b of document.querySelectorAll('#style button')) b.classList.toggle('on', b.dataset.style === s);
  if (preview) preview.setStyle(s);
}
function updateId() { $('idOut').textContent = slug($('name').value); }

function initUi() {
  setStyle(state.style);
  for (const b of document.querySelectorAll('#tools button')) b.addEventListener('click', () => setTool(b.dataset.tool));
  for (const b of document.querySelectorAll('#style button')) b.addEventListener('click', () => { setStyle(b.dataset.style); save(); });

  const sw = $('swatches');
  for (const c of ['#ffffff', '#f6e3bf', '#e9c58f', '#ff8f9c', '#d9606f', '#b9aedb', '#3a2d63', '#1a1226',
    '#ff4d4d', '#ffb640', '#ffe58a', '#8fe3b0', '#38b6ff', '#4f6cff', '#a64dff', '#000000']) {
    const b = document.createElement('button');
    b.style.background = c;
    b.title = c;
    b.setAttribute('aria-label', 'Color ' + c);
    b.addEventListener('click', () => setColor(c));
    sw.appendChild(b);
  }
  const pr = $('presets');
  for (const [label, a, b, dir] of PRESETS) {
    const btn = document.createElement('button');
    btn.textContent = label;
    const lum = (h) => { const [r, g, bl] = hexToRgb(h); return 0.299 * r + 0.587 * g + 0.114 * bl; };
    if ((lum(a) + lum(b)) / 2 > 150) btn.style.color = '#1a1226', btn.style.textShadow = 'none';
    btn.style.background = dir === 'r' ? `radial-gradient(${b}, ${a})` : `linear-gradient(${dir === 'h' ? '90deg' : dir === 'd' ? '135deg' : '180deg'}, ${a}, ${b})`;
    btn.addEventListener('click', () => { $('bgA').value = a; $('bgB').value = b; $('bgDir').value = dir; applyBackground(); });
    pr.appendChild(btn);
  }

  $('color').addEventListener('input', (e) => setColor(e.target.value));
  $('size').addEventListener('input', (e) => { state.size = +e.target.value; $('sizeOut').textContent = e.target.value; });
  $('opacity').addEventListener('input', (e) => { state.opacity = e.target.value / 100; $('opacityOut').textContent = e.target.value + '%'; });
  $('bgApply').addEventListener('click', applyBackground);
  $('stars').addEventListener('click', addStars);
  $('file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('fit').addEventListener('change', async () => {
    if (!lastImage) return;
    snapshot();
    actx.clearRect(0, 0, W, H);
    drawFitted(actx, lastImage, lastImage.naturalWidth, lastImage.naturalHeight);
    if (state.gif && state.gif.frames) state.gif = await decodeGif(state.gif.bytes);
    changed();
  });
  $('keepGif').addEventListener('change', (e) => { state.keepGif = e.target.checked; updateGifUi(); });
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('clear').addEventListener('click', () => { snapshot(); actx.clearRect(0, 0, W, H); state.gif = null; lastImage = null; updateGifUi(); changed(); });
  $('name').addEventListener('input', () => { updateId(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); });
  $('effect').addEventListener('change', (e) => { state.effect = e.target.value; save(); });
  $('fps').addEventListener('change', (e) => { state.fps = +e.target.value; save(); });
  $('export').addEventListener('click', () => exportZip().catch((e) => setMsg('Download failed: ' + e.message, 'err')));

  const views = { viewBack: 'back', viewSide: 'side', viewFront: 'front' };
  const segOn = (id) => { for (const k of [...Object.keys(views), 'spin']) $(k).classList.toggle('on', k === id); };
  for (const [id, v] of Object.entries(views)) $(id).addEventListener('click', () => { if (preview) preview.view(v); segOn(id); });
  $('spin').addEventListener('click', () => { if (preview) preview.spin = true; segOn('spin'); });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type=text]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const keys = { b: 'brush', e: 'eraser', f: 'fill', i: 'picker', t: 'text' };
    if (keys[e.key.toLowerCase()]) setTool(keys[e.key.toLowerCase()]);
  });
}

// ------------------------------------------------------------------ avvio

initUi();
updateUndo();
updateId();
(document.fonts ? document.fonts.load('800 20px Archivo') : Promise.resolve()).catch(() => {}).then(restore);
try {
  if (window.THREE) {
    preview = new CapePreview($('preview'), frameCanvas);
    preview.setStyle(state.style);
    $('noGl').remove();
  }
} catch (e) {
  preview = null;
}
requestAnimationFrame(previewFrame);
