import * as THREE from './three.module.min.js';

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SANDHYA = new Date('2026-11-15T17:01:00+05:30');

const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 70, 330);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2000);

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ---------------------------------------------------------------------------
// Ghat layout
// ---------------------------------------------------------------------------
const STEPS = 8, STEP_D = 1.25, STEP_H = 0.3;
const TOP = STEPS * STEP_H;               // promenade height
const PROM_Z = STEPS * STEP_D;            // where the promenade starts
const EYE = 1.6;

function groundY(z) {
  if (z >= PROM_Z) return TOP;
  if (z >= 0) return (Math.floor(z / STEP_D) + 1) * STEP_H;
  return Math.max(-0.75, z * 0.4);
}

// ---------------------------------------------------------------------------
// Sky + sun
// ---------------------------------------------------------------------------
const SKY_KEYS = [ // elevation (deg) -> zenith, horizon, sun colour, sun strength, ambient
  { e: -14, z: 0x04061a, h: 0x10173a, s: 0x000000, si: 0.0, a: 0.16 },
  { e: -6,  z: 0x141a46, h: 0x6b2f4a, s: 0xff5a2a, si: 0.0, a: 0.25 },
  { e: -1,  z: 0x2a3470, h: 0xe0613a, s: 0xff6a2a, si: 0.6, a: 0.42 },
  { e: 3,   z: 0x3d5591, h: 0xff9a4a, s: 0xff8a3a, si: 1.0, a: 0.6 },
  { e: 9,   z: 0x4f78b8, h: 0xf7c486, s: 0xffb466, si: 1.2, a: 0.8 },
];
const sky = { elev: 4, az: -32 };
const cA = new THREE.Color(), cB = new THREE.Color();
function sampleSky(elev) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && elev > SKY_KEYS[i + 1].e) i++;
  const k0 = SKY_KEYS[i], k1 = SKY_KEYS[i + 1];
  const t = clamp((elev - k0.e) / (k1.e - k0.e), 0, 1);
  const mix = (a, b, out) => out.copy(cA.setHex(a)).lerp(cB.setHex(b), t);
  return {
    zen: mix(k0.z, k1.z, new THREE.Color()),
    hor: mix(k0.h, k1.h, new THREE.Color()),
    sun: mix(k0.s, k1.s, new THREE.Color()),
    si: lerp(k0.si, k1.si, t),
    amb: lerp(k0.a, k1.a, t),
  };
}
function sunVector(elev, az, out = new THREE.Vector3()) {
  const e = THREE.MathUtils.degToRad(elev), a = THREE.MathUtils.degToRad(az);
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

const skyUniforms = {
  zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() },
  stars: { value: 0 }, time: { value: 0 },
};
const skyMesh = new THREE.Mesh(
  new THREE.SphereGeometry(900, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 zenith, horizon, sunDir, sunColor; uniform float stars, time; varying vec3 vDir;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float up = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(up, 0.45));
        if (d.y < 0.0) col = horizon * 0.55;
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.7);
        col += mix(sunColor, vec3(1.0, 0.85, 0.55), 0.35) * smoothstep(0.99955, 0.99975, s) * 2.6;
        if (stars > 0.0 && d.y > 0.0) {
          vec3 cell = floor(d * 360.0);
          float r = h3(cell);
          float tw = 0.6 + 0.4 * sin(time * 2.0 + r * 50.0);
          col += vec3(0.9, 0.92, 1.0) * step(0.9972, r) * stars * smoothstep(0.0, 0.25, d.y) * tw * 1.4;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
);
skyMesh.frustumCulled = false;
scene.add(skyMesh);

const hemi = new THREE.HemisphereLight(0xffffff, 0x3a2a20, 0.6);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
scene.add(sunLight);
const ghatGlow = new THREE.PointLight(0xffa040, 0, 40, 1.6); // warm diya wash at night
ghatGlow.position.set(0, 3, 4);
scene.add(ghatGlow);

// ---------------------------------------------------------------------------
// River
// ---------------------------------------------------------------------------
const waterUniforms = {
  time: { value: 0 }, sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() },
  skyH: { value: new THREE.Color() }, skyZ: { value: new THREE.Color() }, deep: { value: new THREE.Color(0x0b2a33) },
  sunVis: { value: 1 }, glowAmt: { value: 0 },
};
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 300, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -150),
  new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform float time, sunVis, glowAmt; uniform vec3 sunDir, sunColor, skyH, skyZ, deep; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vW.xz; float t = time;
        float n1 = noise(p*vec2(0.25,0.6) + vec2(t*0.35, t*0.05));
        float n2 = noise(p*vec2(1.1,2.2) - vec2(t*0.6, -t*0.15));
        float n3 = noise(p*3.0 + vec2(t*0.9, t*0.3));
        vec3 N = normalize(vec3((n1-.5)*.28 + (n2-.5)*.22 + (n3-.5)*.08, 1.0, (n2-.5)*.45 + (n3-.5)*.12));
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, N);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 skyc = mix(skyH, skyZ, pow(max(R.y, 0.0), 0.45));
        vec3 col = mix(deep * (0.35 + 0.65*length(skyH)), skyc, clamp(fres * 1.1 + 0.2, 0.0, 1.0));
        float sd = max(dot(R, sunDir), 0.0);
        col += sunColor * sunVis * (pow(sd, 220.0) * 5.0 + pow(sd, 18.0) * 0.35);
        // warm shimmer from the diyas along the bank
        col += vec3(1.0, 0.55, 0.18) * glowAmt * smoothstep(-10.0, 0.0, vW.z) * pow(n2 * n3, 3.0) * 0.9;
        float dist = length(cameraPosition.xz - vW.xz);
        col = mix(col, skyH * 0.9, smoothstep(120.0, 300.0, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
);
scene.add(water);

// ---------------------------------------------------------------------------
// Glow points (diya flames, bulbs) — one draw call each set
// ---------------------------------------------------------------------------
const glowSets = [];
class Glow {
  constructor(cap) {
    this.cap = cap; this.n = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('phase', new THREE.BufferAttribute(new Float32Array(cap), 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.uniforms = { time: { value: 0 }, intensity: { value: 1 }, pr: { value: renderer.getPixelRatio() }, flicker: { value: 1 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 color; attribute float size; attribute float phase;
        uniform float time, pr, flicker; varying vec3 vC; varying float vF;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float f = 1.0 + flicker * 0.18 * sin(time*9.0 + phase*6.28) * sin(time*5.3 + phase*17.0);
          vF = f; vC = color;
          gl_PointSize = size * f * pr * (320.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float intensity; varying vec3 vC; varying float vF;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float core = smoothstep(0.3, 0.0, d);
          float glow = pow(1.0 - d, 2.4);
          vec3 col = vC * glow + vec3(1.0, 0.96, 0.85) * core * 0.9;
          gl_FragColor = vec4(col * intensity * vF, 1.0);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    glowSets.push(this);
  }
  add(x, y, z, color = 0xffa040, size = 0.5) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    const c = new THREE.Color(color);
    this.geo.attributes.position.setXYZ(i, x, y, z);
    this.geo.attributes.color.setXYZ(i, c.r, c.g, c.b);
    this.geo.attributes.size.setX(i, size);
    this.geo.attributes.phase.setX(i, Math.random());
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'phase']) this.geo.attributes[k].needsUpdate = true;
    return i;
  }
}

// ---------------------------------------------------------------------------
// Materials + helpers
// ---------------------------------------------------------------------------
const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
const mats = {
  stoneA: M(0xc9a77c), stoneB: M(0xb8946a), prom: M(0xa98a68), mud: M(0x6b5a45),
  cane: M(0x5d8a2a), caneTop: M(0x7fae3a), red: M(0xc81e1e), yellow: M(0xf2b705), clay: M(0xa0522d),
  bamboo: M(0xd4a55a), banana: M(0xf3d34a), orange: M(0xf28c28), lime: M(0x9ccc3c), coconut: M(0x6b4423),
  thekua: M(0x9a5b22), wood: M(0x6b4a2b), skin: M(0x8d5a3b), hair: M(0x1c1410), white: M(0xf3efe6),
  far: M(0x2b3326), farTree: M(0x1e2a1c), leaf: M(0x2f5d22), trunk: M(0x4a3628),
  cloth: M(0xe8590c, { side: THREE.DoubleSide }), clothY: M(0xf59f00, { side: THREE.DoubleSide }),
  ring: new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
};
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
const sph = (r, m, s = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, s, Math.max(6, s * 0.7 | 0)), m);
const place = (o, x, y, z) => { o.position.set(x, y, z); scene.add(o); return o; };

function signTexture(lines, bg = '#d9480f', fg = '#fff4e0', w = 512, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fcd34d'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.font = `${l.size || 56}px ${l.font || '"Yatra One", "Mukta", sans-serif'}`;
    g.fillText(l.text, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (l.gap || 60));
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function sign(lines, x, y, z, w = 3.2, h = 1, opts) {
  // two back-to-back planes so the text reads correctly from both sides
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(lines, opts?.bg, opts?.fg), toneMapped: false });
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const back = front.clone(); back.rotation.y = Math.PI;
  g.add(front, back); g.position.set(x, y, z); g.material = mat;
  scene.add(g);
  return g;
}

// colliders (circles on the xz plane)
const colliders = [];
const addCollider = (x, z, r) => colliders.push({ x, z, r });

// ---------------------------------------------------------------------------
// Build world
// ---------------------------------------------------------------------------
function buildGhat() {
  for (let i = 0; i < STEPS; i++) {
    const top = (i + 1) * STEP_H;
    const b = box(110, top + 1, STEP_D, i % 2 ? mats.stoneA : mats.stoneB);
    b.position.set(0, (top - 1) / 2, i * STEP_D + STEP_D / 2);
    scene.add(b);
  }
  const prom = box(130, 1, 40, mats.prom);
  prom.position.set(0, TOP - 0.5, PROM_Z + 20);
  scene.add(prom);
  // muddy riverbed visible at the edge
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(130, 6).rotateX(-Math.PI / 2), mats.mud);
  bed.position.set(0, -0.6, -2.5);
  scene.add(bed);
  // side walls
  for (const sx of [-55, 55]) place(box(2, TOP + 1.2, PROM_Z + 4, mats.stoneB), sx, (TOP + 1.2) / 2 - 0.6, PROM_Z / 2);
}

function buildFarBank() {
  const bank = box(900, 2, 60, mats.far); bank.position.set(0, 0.2, -290); scene.add(bank);
  const trunkGeo = new THREE.CylinderGeometry(0.6, 0.9, 6, 6);
  const crownGeo = new THREE.SphereGeometry(5, 8, 6);
  for (let i = 0; i < 70; i++) {
    const x = rand(-420, 420), z = rand(-275, -300), s = rand(0.8, 2.0);
    const c = new THREE.Mesh(crownGeo, mats.farTree); c.scale.set(s * rand(0.9, 1.5), s, s); c.position.set(x, 4 + s * 4, z); scene.add(c);
    const t = new THREE.Mesh(trunkGeo, mats.farTree); t.position.set(x, 3, z); scene.add(t);
  }
  // far temple silhouette
  place(box(10, 10, 8, mats.farTree), 70, 6, -282);
  const sh = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 4), mats.farTree); place(sh, 70, 18, -282);
}

function makeTree(x, z, s = 1) {
  const t = cyl(0.25 * s, 0.4 * s, 4 * s, mats.trunk, 7); place(t, x, TOP + 2 * s, z);
  for (let i = 0; i < 4; i++) {
    const c = sph(rand(1.6, 2.4) * s, mats.leaf, 8);
    place(c, x + rand(-1.4, 1.4) * s, TOP + rand(4, 5.6) * s, z + rand(-1.2, 1.2) * s);
  }
  addCollider(x, z, 0.8 * s);
}

const lightGlow = new Glow(400);  // bulb strings + windows, brighter at night
const diyaGlow = new Glow(700);   // diyas on the steps, fade in at dusk

function buildPromenade() {
  // houses and the temple along the back
  const walls = [0xf2d7a7, 0xe9b77c, 0xd98e73, 0xf4e2c1, 0xcfa86e, 0xe4c49b];
  for (let x = -52; x <= 52; x += rand(7, 10)) {
    if (Math.abs(x) < 9) continue;
    const w = rand(5.5, 7.5), h = rand(5, 10), d = 7;
    const hse = box(w, h, d, M(walls[(Math.random() * walls.length) | 0]));
    place(hse, x, TOP + h / 2, PROM_Z + 17 + rand(0, 3));
    for (let wy = 2; wy < h - 1; wy += 2.6) for (let wx = -w / 2 + 1.3; wx < w / 2 - 0.8; wx += 2.2) {
      if (Math.random() < 0.55) lightGlow.add(x + wx, TOP + wy, hse.position.z - d / 2 - 0.05, 0xffc06b, 0.7);
    }
  }
  // temple of Surya Dev
  const base = box(10, 3.5, 8, M(0xf3e7d3)); place(base, 0, TOP + 1.75, PROM_Z + 18);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 4.2, 9, 8), M(0xf0c987)); place(sh, 0, TOP + 8, PROM_Z + 18.5);
  const kalash = sph(0.6, mats.yellow, 10); place(kalash, 0, TOP + 13, PROM_Z + 18.5);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), mats.cloth); place(flag, 0.8, TOP + 14, PROM_Z + 18.5);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }));
  place(sunDisc, 0, TOP + 2.2, PROM_Z + 13.95);
  lightGlow.add(-1.8, TOP + 1.2, PROM_Z + 13.8, 0xffb04a, 1.4);
  lightGlow.add(1.8, TOP + 1.2, PROM_Z + 13.8, 0xffb04a, 1.4);
  addCollider(0, PROM_Z + 18, 6);

  for (const [x, z] of [[-34, 26], [-16, 27], [16, 27], [36, 26], [-46, 22], [46, 22]]) makeTree(x, z, rand(0.9, 1.2));

  // welcome arch
  for (const sx of [-4.5, 4.5]) { place(cyl(0.18, 0.2, 5.2, mats.bamboo, 6), sx, TOP + 2.6, PROM_Z + 1.2); addCollider(sx, PROM_Z + 1.2, 0.3); }
  const banner = sign([{ text: 'छठ घाट', size: 64 }, { text: 'Jai Chhathi Maiya', size: 34, font: '600 34px "Mukta", sans-serif' }], 0, TOP + 4.6, PROM_Z + 1.2, 8, 1.6, { bg: '#b91c1c' });
  banner.userData.rebuild = () => { banner.material.map = signTexture([{ text: 'छठ घाट', size: 64 }, { text: 'Jai Chhathi Maiya', size: 34, font: '600 34px "Mukta", sans-serif' }], '#b91c1c'); };
  signs.push(banner);
  // marigold garland on the arch
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, x = lerp(-4.4, 4.4, t), y = TOP + 3.75 - Math.sin(Math.PI * t) * 0.5;
    place(sph(0.1, i % 2 ? mats.orange : mats.yellow, 6), x, y, PROM_Z + 1.1);
  }

  // bamboo poles with bulb strings along the edge of the promenade
  const bulbCols = [0xffd166, 0xff6b3d, 0x7bdc65, 0xffd166, 0x5cc8ff];
  const poles = [];
  for (let x = -50; x <= 50; x += 10) { poles.push(x); if (Math.abs(x) < 6) continue; place(cyl(0.08, 0.1, 4.2, mats.bamboo, 6), x, TOP + 2.1, PROM_Z + 0.4); }
  for (let p = 0; p < poles.length - 1; p++) {
    for (let i = 1; i < 16; i++) {
      const t = i / 16;
      lightGlow.add(lerp(poles[p], poles[p + 1], t), TOP + 4 - Math.sin(Math.PI * t) * 0.9, PROM_Z + 0.4, bulbCols[i % bulbCols.length], 0.32);
    }
  }
}

// --- people ---------------------------------------------------------------
const people = [];
const SAREES = [0xf59f00, 0xe8590c, 0xd6336c, 0xfab005, 0xc92a2a, 0xf76707, 0x2b8a3e];
function makeSoop(withFruit = true) {
  const g = new THREE.Group();
  const s = cyl(0.36, 0.3, 0.05, mats.bamboo, 14); s.scale.z = 0.8; g.add(s);
  if (withFruit) {
    const add = (m, r, x, z, y = 0.06) => { const f = sph(r, m, 8); f.position.set(x, y, z); g.add(f); };
    add(mats.orange, 0.07, -0.12, 0.05); add(mats.lime, 0.06, 0.1, 0.08); add(mats.coconut, 0.09, 0.02, -0.1, 0.08);
    add(mats.thekua, 0.06, 0.14, -0.08, 0.04); add(mats.red, 0.05, -0.15, -0.1);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.14, 3, 6), mats.banana); b.rotation.z = Math.PI / 2; b.position.set(-0.02, 0.06, 0.12 - i * 0.04); g.add(b); }
    const flame = sph(0.03, new THREE.MeshBasicMaterial({ color: 0xffd27a }), 6); flame.position.set(0.0, 0.1, 0.02); g.add(flame);
  }
  return g;
}
function makePerson({ x, z, saree = true, color, holding = false, faceSun = true }) {
  const g = new THREE.Group();
  const col = color ?? SAREES[(Math.random() * SAREES.length) | 0];
  const clothMat = M(col);
  if (saree) {
    const skirt = cyl(0.17, 0.34, 1.0, clothMat, 12); skirt.position.y = 0.5; g.add(skirt);
    const torso = cyl(0.15, 0.17, 0.5, clothMat, 10); torso.position.y = 1.25; g.add(torso);
    const pallu = box(0.08, 0.7, 0.32, M(0xc92a2a)); pallu.position.set(0.14, 1.15, 0); pallu.rotation.z = -0.25; g.add(pallu);
  } else {
    const dhoti = cyl(0.17, 0.22, 0.9, mats.white, 10); dhoti.position.y = 0.45; g.add(dhoti);
    const kurta = cyl(0.17, 0.2, 0.62, M(col), 10); kurta.position.y = 1.2; g.add(kurta);
  }
  const head = sph(0.13, mats.skin, 12); head.position.y = 1.65; g.add(head);
  const hair = sph(0.135, mats.hair, 12); hair.scale.set(1, 0.7, 1); hair.position.set(0, 1.7, 0.03); g.add(hair);
  if (saree) { const sin = box(0.02, 0.02, 0.08, mats.red); sin.position.set(0, 1.78, -0.1); g.add(sin); }
  let soop = null;
  if (holding) { soop = makeSoop(); soop.position.set(0, 1.35, -0.32); soop.rotation.x = -0.25; g.add(soop); }
  g.position.set(x, groundY(z), z);
  g.rotation.y = faceSun ? rand(-0.25, 0.25) : Math.PI + rand(-0.6, 0.6);
  scene.add(g);
  people.push({ g, soop, base: g.position.y, phase: Math.random() * 6.28 });
  addCollider(x, z, 0.45);
  return g;
}
function buildPeople() {
  // vratins standing in the water
  const inWater = [-30, -24, -19, -13, -8, 6, 11, 15, 21, 27, 33];
  for (const x of inWater) makePerson({ x: x + rand(-1, 1), z: rand(-2.2, -1.2), holding: true, saree: Math.random() > 0.15 });
  // families on the steps
  for (let i = 0; i < 26; i++) {
    let x = rand(-44, 44); if (Math.abs(x) < 3) x += 6;
    const z = rand(0.4, PROM_Z - 1);
    makePerson({ x, z, saree: Math.random() > 0.45, faceSun: Math.random() > 0.3 });
  }
  for (let i = 0; i < 10; i++) {
    const x = rand(-44, 44), z = rand(PROM_Z + 3, PROM_Z + 9);
    if (Math.abs(x - 24) < 4 || Math.abs(x + 24) < 4 || Math.abs(x + 10) < 4 || Math.abs(x) < 5) continue;
    makePerson({ x, z, saree: Math.random() > 0.5, faceSun: Math.random() > 0.5 });
  }
}

// --- diyas on the steps ---------------------------------------------------
const clayCup = new THREE.CylinderGeometry(0.07, 0.045, 0.05, 8);
function buildStepDiyas() {
  const cups = new THREE.InstancedMesh(clayCup, mats.clay, 520);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < STEPS && n < 520; i++) {
    const z = i * STEP_D + 0.15, y = (i + 1) * STEP_H;
    for (let x = -50; x < 50; x += rand(0.5, 2.6)) {
      if (Math.random() < 0.35 || n >= 520) continue;
      m4.makeTranslation(x, y + 0.025, z);
      cups.setMatrixAt(n++, m4);
      diyaGlow.add(x, y + 0.12, z, 0xff9a2a, 0.42);
    }
  }
  cups.count = n;
  scene.add(cups);
}

// --- kosi (sugarcane canopy with diyas) ------------------------------------
const kosis = [];
function makeKosi(x, z) {
  const y = groundY(z), g = new THREE.Group();
  const caneGeo = new THREE.CylinderGeometry(0.035, 0.045, 3.2, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, r = 0.75;
    const cane = new THREE.Mesh(caneGeo, mats.cane);
    cane.position.set(Math.cos(a) * r * 0.55, 1.5, Math.sin(a) * r * 0.55);
    cane.rotation.z = Math.cos(a) * 0.24; cane.rotation.x = -Math.sin(a) * 0.24;
    g.add(cane);
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.1, 4), mats.caneTop);
      leaf.position.set(Math.cos(a) * 0.05, 3.2, Math.sin(a) * 0.05);
      leaf.rotation.set(rand(-0.9, 0.9), rand(0, 6), rand(-0.9, 0.9));
      g.add(leaf);
    }
  }
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 12), mats.red); tie.position.y = 2.4; tie.rotation.x = Math.PI / 2; g.add(tie);
  const cloth = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.2, 5, 1, true), mats.clothY); cloth.position.y = 1.85; g.add(cloth);
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mats.clay); pot.scale.y = 0.85; pot.position.y = 0.18; g.add(pot);
  const glow = new Glow(12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = new THREE.Mesh(clayCup, mats.clay); d.position.set(Math.cos(a) * 0.5, 0.03, Math.sin(a) * 0.5); g.add(d);
    glow.add(x + Math.cos(a) * 0.5, y + 0.14, z + Math.sin(a) * 0.5, 0xffa53a, 0.5);
  }
  glow.add(x, y + 0.5, z, 0xffb04a, 0.8);
  glow.uniforms.intensity.value = 0;
  const daura = cyl(0.36, 0.26, 0.28, mats.bamboo, 12); daura.position.set(1.0, 0.14, 0.3); g.add(daura);
  const top = makeSoop(); top.position.set(1.0, 0.3, 0.3); g.add(top);
  g.position.set(x, y, z);
  scene.add(g);
  addCollider(x, z, 0.9);
  const k = { x, z, glow, lit: false, level: 0 };
  kosis.push(k);
  return k;
}

// --- stalls ----------------------------------------------------------------
const signs = [];
function makeStall(x, z, title, sub, color, goods) {
  const y = TOP;
  const table = box(3.6, 0.9, 1.3, mats.wood); place(table, x, y + 0.45, z);
  for (const sx of [-1.8, 1.8]) for (const sz of [-0.7, 1.1]) place(cyl(0.06, 0.06, 2.6, mats.bamboo, 6), x + sx, y + 1.3, z + sz);
  const roof = box(4.2, 0.08, 2.4, M(color, { side: THREE.DoubleSide })); roof.rotation.x = -0.18; place(roof, x, y + 2.7, z + 0.2);
  const s = sign([{ text: title, size: 58 }, { text: sub, size: 30, font: '600 30px "Mukta", sans-serif', gap: 64 }], x, y + 2.15, z - 0.75, 3.2, 0.9, { bg: '#7c2d12' });
  s.userData.rebuild = () => { s.material.map = signTexture([{ text: title, size: 58 }, { text: sub, size: 30, font: '600 30px "Mukta", sans-serif', gap: 64 }], '#7c2d12'); };
  signs.push(s);
  goods(x, y + 0.9, z);
  lightGlow.add(x - 1.6, y + 2.45, z - 0.6, 0xffe08a, 0.9);
  lightGlow.add(x + 1.6, y + 2.45, z - 0.6, 0xffe08a, 0.9);
  addCollider(x - 1, z, 1.1); addCollider(x + 1, z, 1.1);
}

function buildStalls() {
  makeStall(24, PROM_Z + 5, 'ठेकुआ', 'Thekua & Prasad', 0xe8590c, (x, y, z) => {
    const disc = new THREE.CylinderGeometry(0.11, 0.11, 0.035, 10);
    const tray = new THREE.InstancedMesh(disc, mats.thekua, 60); const m4 = new THREE.Matrix4(); let n = 0;
    for (const ox of [-1.1, 0, 1.1]) {
      place(cyl(0.48, 0.48, 0.04, mats.bamboo, 16), x + ox, y + 0.02, z);
      for (let i = 0; i < 18; i++) { const a = rand(0, 6.28), r = rand(0, 0.36); m4.makeTranslation(x + ox + Math.cos(a) * r, y + 0.06 + (i > 12 ? 0.035 : 0), z + Math.sin(a) * r); tray.setMatrixAt(n++, m4); }
    }
    tray.count = n; scene.add(tray);
  });
  makeStall(-24, PROM_Z + 5, 'फल · गन्ना', 'Fruit & Sugarcane', 0x2b8a3e, (x, y, z) => {
    for (let i = 0; i < 14; i++) place(sph(0.11, [mats.orange, mats.lime, mats.banana, mats.coconut][i % 4], 8), x + rand(-1.4, 1.4), y + 0.11, z + rand(-0.4, 0.4));
    for (let i = 0; i < 9; i++) { const c = cyl(0.04, 0.05, 3, mats.cane, 6); c.rotation.z = rand(-0.25, 0.25); place(c, x + 2.1 + rand(-0.2, 0.3), y + 0.6, z + rand(-0.5, 0.5)); }
  });
  makeStall(-10, PROM_Z + 5, 'सूप · दउरा', 'Soop & Daura', 0xb45309, (x, y, z) => {
    for (let i = 0; i < 4; i++) { const s = makeSoop(false); s.rotation.x = -0.9; s.position.set(x - 1.2 + i * 0.8, y + 0.3, z + 0.2); scene.add(s); }
    for (const ox of [-0.8, 0.8]) place(cyl(0.34, 0.24, 0.3, mats.bamboo, 12), x + ox, y + 0.15, z - 0.3);
  });
}

// --- arghya ring -------------------------------------------------------------
const ARGHYA = { x: 0, z: -1.6 };
const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48).rotateX(-Math.PI / 2), mats.ring);
ring.position.set(ARGHYA.x, 0.03, ARGHYA.z);
scene.add(ring);
const ringGlow = new Glow(1); ringGlow.add(ARGHYA.x, 0.3, ARGHYA.z, 0xffb347, 2.4);

// ---------------------------------------------------------------------------
// Floating diyas on the river
// ---------------------------------------------------------------------------
const floatGlow = new Glow(160);
const floaters = [];
const leafBoat = new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
const boatMat = M(0x3f6d22, { side: THREE.DoubleSide });
function launchDiya(x, z, mine = false) {
  if (floaters.length >= 150) { const old = floaters.shift(); scene.remove(old.mesh); }
  const mesh = new THREE.Mesh(leafBoat, boatMat); mesh.scale.y = 0.4; mesh.rotation.x = Math.PI;
  mesh.position.set(x, 0.02, z); scene.add(mesh);
  floaters.push({ mesh, x, z, vx: rand(0.35, 0.55), vz: rand(-0.35, -0.18), ph: Math.random() * 6.28, mine });
}
function updateFloaters(dt, t) {
  const pos = floatGlow.geo.attributes.position, size = floatGlow.geo.attributes.size;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.x += f.vx * dt; f.z += f.vz * dt; f.vz *= 0.9995;
    if (f.z < -60 || f.x > 120) { scene.remove(f.mesh); floaters.splice(i, 1); continue; }
    const bob = Math.sin(t * 1.6 + f.ph) * 0.03;
    f.mesh.position.set(f.x, bob, f.z);
  }
  floaters.forEach((f, i) => { pos.setXYZ(i, f.x, f.mesh.position.y + 0.14, f.z); size.setX(i, f.mine ? 0.75 : 0.55); });
  for (let i = 0; i < floaters.length; i++) floatGlow.geo.attributes.color.setXYZ(i, 1, 0.6, 0.18);
  floatGlow.n = floaters.length;
  floatGlow.geo.setDrawRange(0, floaters.length);
  pos.needsUpdate = size.needsUpdate = floatGlow.geo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Particles: arghya stream + marigold petals
// ---------------------------------------------------------------------------
const pourGeo = new THREE.BufferGeometry();
const POUR_N = 260;
pourGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POUR_N * 3), 3));
const pour = new THREE.Points(pourGeo, new THREE.PointsMaterial({ color: 0xfff1d6, size: 0.06, transparent: true, opacity: 0.9, depthWrite: false }));
pour.visible = false; pour.frustumCulled = false; scene.add(pour);
const pourP = Array.from({ length: POUR_N }, () => ({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));

const PET_N = 500;
const petGeo = new THREE.BufferGeometry();
petGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PET_N * 3), 3));
petGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PET_N * 3), 3));
const petalTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 14, 9, 0.5, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
})();
const petals = new THREE.Points(petGeo, new THREE.PointsMaterial({ size: 0.11, map: petalTex, alphaTest: 0.5, vertexColors: true, depthWrite: false }));
petals.visible = false; petals.frustumCulled = false; scene.add(petals);
const petP = [];
function startPetals() {
  petP.length = 0;
  const col = petGeo.attributes.color, c = new THREE.Color();
  for (let i = 0; i < PET_N; i++) {
    petP.push({ x: player.x + rand(-14, 14), y: rand(4, 16), z: player.z + rand(-16, -2), s: rand(0.6, 1.4), ph: rand(0, 6.28) });
    c.setHex([0xf59f00, 0xff8c00, 0xffd43b, 0xe8590c][i % 4]); col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true; petals.visible = true;
}

// ---------------------------------------------------------------------------
// Player + input
// ---------------------------------------------------------------------------
const player = { x: 0, z: 14, y: TOP + EYE, yaw: 0, pitch: -0.06, speed: 4.2 };
const keys = new Set();
let started = false, uiOpen = false;
addEventListener('keydown', (e) => {
  if (!started || uiOpen) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.add(k); e.preventDefault(); }
  if ((k === 'e' || k === ' ' || k === 'enter') && !e.repeat) { e.preventDefault(); interact(); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

// drag to look (mouse + touch on the canvas)
let lookId = null, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', (e) => { if (!started) return; lookId = e.pointerId; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookId) return;
  const s = e.pointerType === 'touch' ? 0.006 : 0.0042;
  player.yaw -= (e.clientX - lx) * s; player.pitch = clamp(player.pitch - (e.clientY - ly) * s, -1.1, 1.0);
  lx = e.clientX; ly = e.clientY;
});
const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);

// virtual joystick
const joy = $('#joy'), knob = joy.querySelector('i');
const joyV = { x: 0, y: 0 }; let joyId = null;
joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); });
joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; joyV.x = joyV.y = 0; knob.style.transform = ''; };
joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const m = Math.hypot(dx, dy), max = r.width / 2 - 10;
  if (m > max) { dx *= max / m; dy *= max / m; }
  joyV.x = dx / max; joyV.y = dy / max;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
$('#act').addEventListener('click', () => interact());

const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function updatePlayer(dt) {
  let mx = 0, mz = 0;
  if (keys.has('w') || keys.has('arrowup')) mz += 1;
  if (keys.has('s') || keys.has('arrowdown')) mz -= 1;
  if (keys.has('a')) mx -= 1;
  if (keys.has('d')) mx += 1;
  if (keys.has('arrowleft')) player.yaw += 1.8 * dt;
  if (keys.has('arrowright')) player.yaw -= 1.8 * dt;
  mx += joyV.x; mz -= joyV.y;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const inWater = player.z < 0;
  const sp = player.speed * (keys.has('shift') ? 1.7 : 1) * (inWater ? 0.55 : 1);
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  let nx = player.x + (fwd.x * mz + right.x * mx) * sp * dt;
  let nz = player.z + (fwd.z * mz + right.z * mx) * sp * dt;
  nx = clamp(nx, -52, 52); nz = clamp(nz, -2.8, PROM_Z + 11);
  for (const c of colliders) {
    const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), min = c.r + 0.35;
    if (d < min && d > 0.0001) { nx = c.x + (dx / d) * min; nz = c.z + (dz / d) * min; }
  }
  const moving = Math.hypot(nx - player.x, nz - player.z) > 0.001;
  player.x = nx; player.z = nz;
  const targetY = groundY(player.z) + EYE;
  player.y = lerp(player.y, targetY, 1 - Math.exp(-10 * dt));
  const bob = moving && !reduceMotion ? Math.sin(performance.now() * 0.011) * 0.03 : 0;
  camera.position.set(player.x, player.y + bob, player.z);
  camera.rotation.set(0, 0, 0);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
}

// ---------------------------------------------------------------------------
// Story / phases
// ---------------------------------------------------------------------------
// sandhya -> setting -> night -> (dawning) -> usha -> rising -> done
let phase = 'sandhya';
let anim = null; // { from:{elev,az}, to:{elev,az}, t, dur, done }
function animateSky(elev, az, dur, done) { anim = { from: { ...sky }, to: { elev, az }, t: 0, dur, done }; }

const PHASES = {
  sandhya: ['Day 3 · Sun, 15 Nov 2026', 'Sandhya Arghya', 'Walk to the glowing ring in the water'],
  night: ['Raat · Kosi bharai', 'The ghat stays awake', 'Light a kosi, float a diya, or wait for dawn'],
  usha: ['Day 4 · Mon, 16 Nov 2026', 'Usha Arghya', 'Bhor ho gayi. Back to the ring for the dawn arghya'],
  done: ['Paran', 'Vrat sampann', 'Wander the ghat as long as you like'],
};
function setPhaseUI(p) {
  const [k, v, s] = PHASES[p];
  $('#phK').textContent = k; $('#phV').textContent = v; $('#phS').textContent = s;
}

let toastTimer;
function toast(main, sub = '', ms = 4200) {
  const el = $('#toast');
  el.innerHTML = '';
  el.append(main);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.append(s); }
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}

// ---------------------------------------------------------------------------
// Basket (souvenirs)
// ---------------------------------------------------------------------------
const ITEMS = [
  { id: 'sandhya', e: '🌇', n: 'Sandhya Arghya', d: 'Offered to the setting sun' },
  { id: 'usha', e: '🌄', n: 'Usha Arghya', d: 'Offered to the rising sun' },
  { id: 'diya', e: '🪔', n: 'Floating diya', d: 'Set a diya afloat on the river' },
  { id: 'kosi', e: '✨', n: 'Kosi bharai', d: 'Lit the diyas under a sugarcane canopy' },
  { id: 'thekua', e: '🍪', n: 'Thekua', d: 'Prasad from the thekua stall' },
  { id: 'ganna', e: '🎋', n: 'Ganna & phal', d: 'Sugarcane and fruit for the daura' },
  { id: 'soop', e: '🧺', n: 'Soop', d: 'A bamboo soop from the craft stall' },
];
const got = new Set();
function renderBasket() {
  const grid = $('#basketGrid'); grid.innerHTML = '';
  for (const it of ITEMS) {
    const d = document.createElement('div'); d.className = 'item' + (got.has(it.id) ? ' got' : '');
    d.innerHTML = `<span class="e" aria-hidden="true">${it.e}</span><div><b></b><small></small></div>`;
    d.querySelector('b').textContent = it.n; d.querySelector('small').textContent = got.has(it.id) ? it.d : 'Not yet collected';
    grid.append(d);
  }
  $('#basketSum').textContent = `${got.size} of ${ITEMS.length} blessings collected`;
  $('#basketBar').style.width = `${(got.size / ITEMS.length) * 100}%`;
  $('#badge').textContent = got.size;
}
function collect(id) {
  if (got.has(id)) return false;
  got.add(id); renderBasket(); sfx.bell();
  return true;
}

// ---------------------------------------------------------------------------
// Interactables
// ---------------------------------------------------------------------------
const interactables = [];
function interactable(x, z, r, label, action) { interactables.push({ x, z, r, label, action }); }

function setupInteractions() {
  interactable(ARGHYA.x, ARGHYA.z, 2.2, () => {
    if (anim) return '';
    if (phase === 'sandhya') return 'Offer Sandhya Arghya to the setting sun';
    if (phase === 'night') return 'Keep jaagran till dawn';
    if (phase === 'usha') return 'Offer Usha Arghya to the rising sun';
    return 'Float a diya';
  }, () => {
    if (anim) return;
    if (phase === 'sandhya') offerArghya('sandhya');
    else if (phase === 'night') goToDawn();
    else if (phase === 'usha') offerArghya('usha');
    else floatMine();
  });
  // anywhere along the water's edge: float a diya
  interactables.push({ edge: true, r: 0, label: () => 'Float a diya on the river', action: floatMine });
  for (const k of kosis) {
    interactable(k.x, k.z, 2.0, () => (k.lit ? '' : 'Light the kosi diyas'), () => {
      if (k.lit) return; k.lit = true; sfx.chime();
      if (collect('kosi')) toast('Kosi jal gayi ✨', 'Diyas under the sugarcane canopy, for a wish fulfilled.');
    });
  }
  interactable(24, PROM_Z + 4, 2.6, () => (got.has('thekua') ? 'Thekua le liya. Aur lo?' : 'Take thekua prasad'), () => {
    if (collect('thekua')) toast('Thekua mila!', 'Wheat, jaggery and ghee, pressed with a wooden mould.'); else toast('Prasad baantne se badhta hai', 'Share it with someone nearby.', 2600);
  });
  interactable(-24, PROM_Z + 4, 2.6, () => (got.has('ganna') ? '' : 'Pick sugarcane and fruit'), () => {
    if (collect('ganna')) toast('Ganna aur phal liye', 'Banana, coconut, gagal nimbu and a tall sugarcane.');
  });
  interactable(-10, PROM_Z + 4, 2.6, () => (got.has('soop') ? '' : 'Buy a bamboo soop'), () => {
    if (collect('soop')) toast('Soop le liya 🧺', 'Hand-woven by bamboo craftspeople, used only for Chhath.');
  });
}

let nearest = null;
function updatePrompt() {
  nearest = null; let best = Infinity;
  for (const it of interactables) {
    let d;
    if (it.edge) {
      if (player.z > 1.4 || Math.hypot(player.x - ARGHYA.x, player.z - ARGHYA.z) < 2.4) continue;
      d = 1.5;
    } else {
      d = Math.hypot(player.x - it.x, player.z - it.z);
      if (d > it.r) continue;
    }
    const label = it.label();
    if (label && d < best) { best = d; nearest = { it, label }; }
  }
  const p = $('#prompt');
  if (nearest && !uiOpen) { $('#promptText').textContent = nearest.label; p.classList.add('on'); }
  else p.classList.remove('on');
  $('#act').classList.toggle('ready', !!nearest);
}
function interact() { if (nearest && !uiOpen) nearest.it.action(); }

let lastFloat = 0;
function floatMine() {
  const now = performance.now();
  if (now - lastFloat < 700) return; lastFloat = now;
  launchDiya(player.x - Math.sin(player.yaw) * 1.2, Math.min(player.z - 1.2, -0.6), true);
  sfx.chime();
  if (collect('diya')) toast('Diya pravahit 🪔', 'Your diya joins the river of lights.');
}

function offerArghya(kind) {
  sfx.shankh();
  // face the sun
  const target = Math.atan2(-sunVector(sky.elev, sky.az).x, -sunVector(sky.elev, sky.az).z);
  turnTo = { from: player.yaw, to: target, t: 0 };
  pourUntil = performance.now() + 3200;
  pour.visible = true;
  if (kind === 'sandhya') {
    toast('Sandhya Arghya arpit 🌇', 'Thanks to Surya Dev for the day that was.', 5000);
    collect('sandhya');
    setTimeout(() => {
      phase = 'setting';
      animateSky(-14, -32, reduceMotion ? 0.5 : 12, () => {
        phase = 'night'; setPhaseUI('night'); $('#skip').classList.add('on');
        toast('Raat ho gayi', 'Kosi bharai time. The ghat glows all night.');
      });
    }, 2600);
  } else {
    toast('Usha Arghya arpit 🌄', 'The vrat is complete. Jai Chhathi Maiya!', 5000);
    collect('usha');
    setTimeout(() => {
      phase = 'rising';
      animateSky(6, 32, reduceMotion ? 0.5 : 9, () => {
        phase = 'done'; setPhaseUI('done');
        startPetals();
        setTimeout(() => { $('#finale').classList.add('on'); uiOpen = true; }, 1800);
      });
    }, 2200);
  }
}
function goToDawn() {
  if (phase !== 'night' || anim) return;
  $('#skip').classList.remove('on');
  toast('Jaagran…', 'Songs on the ghat through the night. Bhor hone wali hai.', 4000);
  phase = 'dawning';
  sky.az = 32;
  animateSky(-2.5, 32, reduceMotion ? 0.5 : 9, () => {
    phase = 'usha'; setPhaseUI('usha');
    toast('Bhor ho gayi 🌄', 'Go back to the ring in the water before the sun rises.');
  });
}
$('#skip').addEventListener('click', goToDawn);

let turnTo = null, pourUntil = 0;
function updatePour(dt) {
  const active = performance.now() < pourUntil;
  const pos = pourGeo.attributes.position;
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  let alive = 0;
  for (let i = 0; i < POUR_N; i++) {
    const p = pourP[i];
    if (p.life <= 0 && active && Math.random() < 0.5) {
      p.x = camera.position.x + fwd.x * 0.6 + rand(-0.03, 0.03); p.y = camera.position.y - 0.25; p.z = camera.position.z + fwd.z * 0.6 + rand(-0.03, 0.03);
      p.vx = fwd.x * 0.8 + rand(-0.1, 0.1); p.vy = rand(0.2, 0.5); p.vz = fwd.z * 0.8 + rand(-0.1, 0.1); p.life = 1.4;
    }
    if (p.life > 0) {
      p.life -= dt; p.vy -= 6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0) p.life = 0;
      alive++;
    }
    pos.setXYZ(i, p.x, p.life > 0 ? p.y : -50, p.z);
  }
  pos.needsUpdate = true;
  pour.visible = alive > 0;
}

// ---------------------------------------------------------------------------
// Sound (synthesised, no files)
// ---------------------------------------------------------------------------
const sfx = (() => {
  let ctx = null, master = null, muted = false;
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    // river: filtered brown noise
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.22;
    src.connect(lp).connect(g).connect(master); src.start();
    // a soft tanpura-like drone
    for (const [f, v] of [[110, 0.025], [165, 0.016], [220, 0.012]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = v;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rand(0.08, 0.2);
      const lg = ctx.createGain(); lg.gain.value = v * 0.6; lfo.connect(lg).connect(og.gain);
      o.connect(og).connect(master); o.start(); lfo.start();
    }
  }
  function tone(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  return {
    init,
    bell() { [880, 1320, 2210, 2960].forEach((f, i) => tone(f, 2.2 - i * 0.4, 'sine', 0.12 / (i + 1))); },
    chime() { tone(1568, 1.2, 'sine', 0.07); tone(2093, 1.0, 'sine', 0.05, 0.08); },
    shankh() {
      if (!ctx || muted) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = 233; o2.frequency.value = 234.5;
      o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(233, t + 0.6);
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.7); g.gain.setValueAtTime(0.16, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(f); o2.connect(f); f.connect(g).connect(master); o.start(t); o2.start(t); o.stop(t + 3.3); o2.stop(t + 3.3);
    },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
  };
})();
$('#muteBtn').addEventListener('click', () => {
  const m = sfx.toggle();
  $('#muteBtn').setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  $('#muteBtn').style.opacity = m ? 0.5 : 1;
});

// ---------------------------------------------------------------------------
// Drawers, countdown, finale
// ---------------------------------------------------------------------------
let lastFocus = null;
function openDrawer(id) {
  lastFocus = document.activeElement;
  $('#' + id).classList.add('on'); $('#scrim').classList.add('on'); uiOpen = true; keys.clear();
  if (id === 'basket') renderBasket();
  setTimeout(() => $('#' + id + ' [data-close]').focus(), 50);
}
function closeDrawers() {
  document.querySelectorAll('.drawer.on').forEach((d) => d.classList.remove('on'));
  $('#scrim').classList.remove('on');
  uiOpen = $('#finale').classList.contains('on');
  lastFocus?.focus?.();
}
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.open)));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDrawers));
$('#scrim').addEventListener('click', closeDrawers);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawers(); });

$('#stayBtn').addEventListener('click', () => { $('#finale').classList.remove('on'); uiOpen = false; });
$('#shareBtn').addEventListener('click', async () => {
  const data = { title: 'Chhath Ghat Online', text: 'Ghat chaloge mere saath? Offer arghya on a 3D Chhath ghat.', url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(location.href); $('#shareBtn').textContent = 'Link copied'; }
  } catch { /* share sheet dismissed */ }
});

function updateCountdown() {
  const ms = SANDHYA - Date.now();
  const intro = $('#introCount');
  if (ms <= 0) {
    intro.innerHTML = '<b>Jai Chhathi Maiya!</b> Chhath 2026 has arrived';
    $('#bigCount').innerHTML = '<div style="grid-column:1/-1"><b>Jai Chhathi Maiya</b><span>Chhath is here</span></div>';
    return;
  }
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  intro.innerHTML = `Sandhya Arghya in <b>${d}d ${h}h ${m}m</b>`;
  const cells = $('#bigCount').querySelectorAll('b');
  [d, h, m, s].forEach((v, i) => { cells[i].textContent = String(v).padStart(2, '0'); });
}
updateCountdown(); setInterval(updateCountdown, 1000);

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
const sunV = new THREE.Vector3();
function applySky() {
  const s = sampleSky(sky.elev);
  sunVector(sky.elev, sky.az, sunV);
  const night = smooth(2, -9, sky.elev);
  skyUniforms.zenith.value.copy(s.zen); skyUniforms.horizon.value.copy(s.hor);
  skyUniforms.sunDir.value.copy(sunV); skyUniforms.sunColor.value.copy(s.sun).multiplyScalar(s.si);
  skyUniforms.stars.value = smooth(-5, -12, sky.elev);
  waterUniforms.sunDir.value.copy(sunV); waterUniforms.sunColor.value.copy(s.sun);
  waterUniforms.skyH.value.copy(s.hor); waterUniforms.skyZ.value.copy(s.zen);
  waterUniforms.sunVis.value = smooth(-2.5, 1, sky.elev) * s.si;
  waterUniforms.glowAmt.value = night;
  scene.fog.color.copy(s.hor).multiplyScalar(0.85);
  sunLight.position.copy(sunV).multiplyScalar(100);
  sunLight.color.copy(s.sun.r + s.sun.g > 0 ? s.sun : cA.setHex(0x000000));
  sunLight.intensity = Math.max(0, sunV.y) * 6 * s.si + smooth(-3, 2, sky.elev) * 0.6;
  hemi.color.copy(s.zen).lerp(cA.setHex(0xffe0b0), 0.5);
  hemi.groundColor.setHex(0x3a2418);
  hemi.intensity = s.amb * 1.6 + 0.12;
  ghatGlow.intensity = night * 16;
  // lights
  diyaGlow.uniforms.intensity.value = 0.25 + night * 1.0;
  lightGlow.uniforms.intensity.value = 0.08 + night * 1.0;
  floatGlow.uniforms.intensity.value = 0.6 + night * 0.6;
  ringGlow.uniforms.intensity.value = 0.6 + night * 0.4;
  return night;
}

const clock = new THREE.Clock();
let ambientTimer = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (anim) {
    anim.t += dt / anim.dur;
    const k = ease(Math.min(anim.t, 1));
    sky.elev = lerp(anim.from.elev, anim.to.elev, k); sky.az = lerp(anim.from.az, anim.to.az, k);
    if (anim.t >= 1) { const d = anim.done; anim = null; d?.(); }
  }
  const night = applySky();
  skyUniforms.time.value = t; waterUniforms.time.value = t;
  for (const g of glowSets) g.uniforms.time.value = t;
  for (const k of kosis) { k.level = lerp(k.level, k.lit ? 1 : 0, 1 - Math.exp(-3 * dt)); k.glow.uniforms.intensity.value = k.level * (0.7 + night); }
  ring.material.opacity = 0.45 + 0.35 * Math.sin(t * 2.4);
  ring.scale.setScalar(1 + 0.05 * Math.sin(t * 2.4));
  ring.visible = ringGlow.points.visible = phase !== 'done';
  for (const p of people) {
    p.g.position.y = p.base + Math.sin(t * 0.9 + p.phase) * 0.012;
    if (p.soop) p.soop.position.y = 1.35 + Math.max(0, Math.sin(t * 0.5 + p.phase)) * 0.25;
  }
  // devotees keep floating diyas after dusk
  ambientTimer -= dt;
  if (night > 0.4 && ambientTimer <= 0) { ambientTimer = rand(0.6, 1.6); launchDiya(rand(-40, 30), rand(-1.6, -0.8)); }
  updateFloaters(dt, t);
  if (petals.visible) {
    const pos = petGeo.attributes.position;
    petP.forEach((p, i) => { p.y -= p.s * dt * 0.9; if (p.y < 0) p.y = rand(10, 16); pos.setXYZ(i, p.x + Math.sin(t * p.s + p.ph) * 0.6, p.y, p.z + Math.cos(t * 0.7 + p.ph) * 0.4); });
    pos.needsUpdate = true;
  }
  if (started) {
    if (!uiOpen) updatePlayer(dt);
    if (turnTo) {
      turnTo.t = Math.min(1, turnTo.t + dt / 1.2);
      let diff = turnTo.to - turnTo.from; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.yaw = turnTo.from + diff * ease(turnTo.t);
      player.pitch = lerp(player.pitch, 0.08, 0.05);
      if (turnTo.t >= 1) turnTo = null;
    }
    updatePour(dt);
    updatePrompt();
  } else {
    // slow cinematic drift behind the landing card
    camera.position.set(Math.sin(t * 0.05) * 10, TOP + 1.2, PROM_Z - 0.6);
    camera.rotation.set(-0.05, Math.sin(t * 0.05) * 0.12, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildGhat(); buildFarBank(); buildPromenade(); buildStepDiyas();
makeKosi(-17, 5.6); makeKosi(-5, 3.4); makeKosi(8, 6.4); makeKosi(19, 4.1); makeKosi(31, 7.0); makeKosi(-30, 6.2);
buildStalls(); buildPeople(); setupInteractions(); renderBasket(); setPhaseUI('sandhya');
camera.rotation.order = 'YXZ';
requestAnimationFrame(frame);

// Redraw Devanagari signs once the display font is ready
Promise.race([document.fonts.load('48px "Yatra One"', 'छठ घाट'), new Promise((r) => setTimeout(r, 2500))])
  .catch(() => {})
  .finally(() => {
    signs.forEach((s) => s.userData.rebuild?.());
    $('#loading').textContent = '';
    $('#startBtn').disabled = false;
  });
if (isTouch) $('#hintDesk').textContent = 'Left thumb to walk · drag to look · tap the button to interact';

$('#startBtn').addEventListener('click', () => {
  sfx.init();
  started = true;
  $('#intro').classList.add('hide');
  $('#hud').classList.add('on');
  player.y = groundY(player.z) + EYE;
  setTimeout(() => toast('Ghat pe swagat hai 🙏', 'Walk down the steps to the glowing ring in the water.'), 600);
});
// URL hook for screenshots/tests: ?phase=night|usha|done
window.__ghat = { player, get phase() { return phase; }, got, kosis, floaters };
const q = new URLSearchParams(location.search).get('phase');
if (q === 'night') { sky.elev = -14; phase = 'night'; setPhaseUI('night'); $('#skip').classList.add('on'); }
if (q === 'usha') { sky.elev = -2.5; sky.az = 32; phase = 'usha'; setPhaseUI('usha'); }
