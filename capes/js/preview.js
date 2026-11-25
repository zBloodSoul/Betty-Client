/**
 * preview.js — Anteprima 3D del mantello (three.js r128) su un manichino Betty, in unità "pixel di Minecraft":
 * gambe 0–12, busto 12–24, testa 24–32; il giocatore guarda verso +z, il mantello è attaccato alle spalle dietro.
 * Stoffa: striscia divisa in 16 segmenti che ondeggiano (come "Stoffa che ondeggia" in gioco).
 * Pannello: lastra rigida spessa 1,4 che dondola appena.
 */
'use strict';

class CapePreview {
  /**
   * @param {HTMLElement} host contenitore
   * @param {HTMLCanvasElement} outer disegno del lato esterno (aggiornato da fuori; chiamare refresh())
   */
  constructor(host, outer) {
    this.host = host;
    this.outer = outer;
    this.inner = document.createElement('canvas');
    this.style = 'stoffa';
    this.yaw = Math.PI - 0.45;
    this.targetYaw = this.yaw;
    this.spin = false;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(r.domElement);

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
    this.camera.position.set(0, 24, 84);
    this.camera.lookAt(0, 16, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(20, 40, 30);
    scene.add(sun);
    const back = new THREE.DirectionalLight(0xb9aedb, 0.35);
    back.position.set(-20, 20, -40);
    scene.add(back);

    this.player = new THREE.Group();
    scene.add(this.player);
    this.buildMannequin();

    this.texOuter = new THREE.CanvasTexture(outer);
    this.texInner = new THREE.CanvasTexture(this.inner);
    for (const t of [this.texOuter, this.texInner]) {
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    }
    this.buildCloth();
    this.buildPanel();
    this.setStyle('stoffa');
    this.refresh();

    this.bindDrag();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.t0 = performance.now();
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  box(w, h, d, x, y, z, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    this.player.add(m);
    return m;
  }

  buildMannequin() {
    this.box(8, 8, 8, 0, 28, 0, 0xe9c58f);           // testa
    this.box(8.6, 3, 8.6, 0, 31, 0, 0x3a2d63);        // capelli
    this.box(8, 12, 4, 0, 18, 0, 0x3a2d63);           // busto
    this.box(4, 12, 4, -6, 18, 0, 0x2c2244);          // braccia
    this.box(4, 12, 4, 6, 18, 0, 0x2c2244);
    this.box(4, 12, 4, -2, 6, 0, 0x1a1226);           // gambe
    this.box(4, 12, 4, 2, 6, 0, 0x1a1226);
    // occhi, per capire dov'è il davanti
    this.box(1.4, 1, 0.3, -2, 28, 4.1, 0x1a1226);
    this.box(1.4, 1, 0.3, 2, 28, 4.1, 0x1a1226);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.02;
    this.player.add(floor);
  }

  /** Stoffa: piano 10×16 diviso in 16 righe; le posizioni si ricalcolano a ogni frame. */
  buildCloth() {
    const g = this.clothGeo = new THREE.PlaneGeometry(10, 16, 1, 16);
    // in frame() la colonna u = 0 (sinistra dell'immagine) va a +x: visto da dietro è la sinistra di chi guarda,
    // e il lato "davanti" del piano guarda fuori (-z). L'interno (BackSide) si vede specchiato, come la stoffa vera.
    this.clothOut = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.texOuter, side: THREE.FrontSide, transparent: true, alphaTest: 0.05 }));
    this.clothIn = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.texInner, side: THREE.BackSide, transparent: true, alphaTest: 0.05 }));
    this.cloth = new THREE.Group();
    this.cloth.add(this.clothOut, this.clothIn);
    this.player.add(this.cloth);
  }

  buildPanel() {
    const edge = new THREE.MeshLambertMaterial({ color: 0x231a36 });
    const mats = [edge, edge, edge, edge,
      new THREE.MeshBasicMaterial({ map: this.texInner }),   // +z (verso la schiena)
      new THREE.MeshBasicMaterial({ map: this.texOuter })];  // -z (fuori)
    const geo = new THREE.BoxGeometry(10, 16, 1.4);
    // faccia +z (vertici 16–19): u invertita, l'interno si vede specchiato come per la stoffa
    const uv = geo.attributes.uv;
    for (let i = 16; i < 20; i++) uv.setX(i, 1 - uv.getX(i));
    const box = new THREE.Mesh(geo, mats);
    box.position.set(0, -8, -0.7);
    this.panel = new THREE.Group();
    this.panel.position.set(0, 24, -2.1);
    this.panel.add(box);
    this.player.add(this.panel);
  }

  setStyle(style) {
    this.style = style;
    this.cloth.visible = style !== 'pannello';
    this.panel.visible = style === 'pannello';
  }

  /** Da chiamare quando il disegno cambia: aggiorna le texture (l'interno è lo stesso disegno, più scuro). */
  refresh() {
    const o = this.outer, c = this.inner;
    if (c.width !== o.width || c.height !== o.height) { c.width = o.width; c.height = o.height; }
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(o, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(10,6,20,0.45)';
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    this.texOuter.needsUpdate = true;
    this.texInner.needsUpdate = true;
  }

  view(name) {
    this.spin = false;
    this.targetYaw = name === 'front' ? 0.35 : name === 'side' ? Math.PI / 2 + 0.25 : Math.PI - 0.45;
  }

  bindDrag() {
    const el = this.renderer.domElement;
    let last = null;
    el.addEventListener('pointerdown', (e) => { last = e.clientX; this.spin = false; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (last === null) return;
      this.yaw += (e.clientX - last) * 0.012;
      this.targetYaw = this.yaw;
      last = e.clientX;
    });
    const up = () => { last = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const t = (performance.now() - this.t0) / 1000;
    if (this.spin) this.targetYaw += 0.008;
    this.yaw += (this.targetYaw - this.yaw) * 0.12;
    this.player.rotation.y = this.yaw;

    if (this.style === 'pannello') {
      this.panel.rotation.x = 0.1 + Math.sin(t * 1.6) * 0.025;
    } else {
      // ogni segmento si piega un po' di più del precedente: onda che scende verso il fondo
      const pos = this.clothGeo.attributes.position;
      let y = 24, z = -2.3;
      for (let row = 0; row <= 16; row++) {
        for (let col = 0; col < 2; col++) {
          const i = row * 2 + col;
          pos.setXYZ(i, col === 0 ? 5 : -5, y, z);
        }
        const k = row / 16;
        const ang = 0.12 + k * 0.1 + Math.sin(t * 3.2 - row * 0.42) * 0.12 * k;
        y -= Math.cos(ang);
        z -= Math.sin(ang);
      }
      pos.needsUpdate = true;
      this.clothGeo.computeBoundingSphere();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
