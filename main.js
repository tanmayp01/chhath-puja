import * as THREE from './three.module.min.js';

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SANDHYA = new Date('2026-11-15T17:01:00+05:30');
const SAVE_KEY = 'chhath-ghat-v2';

const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 70, 330);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const angleTo = (from, to) => { const d = to - from; return Math.atan2(Math.sin(d), Math.cos(d)); };

// ---------------------------------------------------------------------------
// Ghat layout
// ---------------------------------------------------------------------------
const STEPS = 8, STEP_D = 1.25, STEP_H = 0.3;
const TOP = STEPS * STEP_H;               // promenade height
const PROM_Z = STEPS * STEP_D;            // where the promenade starts

function groundY(z) {
  if (z >= PROM_Z) return TOP;
  if (z >= 0) return (Math.floor(z / STEP_D) + 1) * STEP_H;
  return Math.max(-0.75, z * 0.4);
}

// key places
const RING = { x: 0, z: -1.6 };
const SABZI = { x: 24, z: PROM_Z + 4 };
const FRUIT = { x: -24, z: PROM_Z + 4 };
const SOOP = { x: -10, z: PROM_Z + 4 };
const CHULHA = { x: 38, z: PROM_Z + 6 };
const WOOD = { x: 45, z: PROM_Z + 8.5 };

// ---------------------------------------------------------------------------
// Sky + sun
// ---------------------------------------------------------------------------
const SKY_KEYS = [ // elevation (deg) -> zenith, horizon, sun colour, sun strength, ambient
  { e: -14, z: 0x04061a, h: 0x10173a, s: 0x000000, si: 0.0, a: 0.16 },
  { e: -6,  z: 0x141a46, h: 0x6b2f4a, s: 0xff5a2a, si: 0.0, a: 0.25 },
  { e: -1,  z: 0x2a3470, h: 0xe0613a, s: 0xff6a2a, si: 0.6, a: 0.42 },
  { e: 3,   z: 0x3d5591, h: 0xff9a4a, s: 0xff8a3a, si: 1.0, a: 0.6 },
  { e: 9,   z: 0x4f78b8, h: 0xf7c486, s: 0xffb466, si: 1.2, a: 0.8 },
  { e: 20,  z: 0x3d7fd6, h: 0xf0d3a8, s: 0xffe2b8, si: 1.2, a: 0.95 },
];
const sky = { elev: 14, az: 32 };
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
const fireLight = new THREE.PointLight(0xff7a1a, 0, 8, 1.5); // chulha
fireLight.position.set(CHULHA.x, TOP + 1, CHULHA.z - 0.2);
scene.add(fireLight);

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
// Glow points (diya flames, bulbs) — one draw call per set
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
  stoneA: M(0xc9a77c), stoneB: M(0xb8946a), prom: M(0xa98a68), mud: M(0x6b5a45), plaster: M(0xc49a6c),
  cane: M(0x5d8a2a), caneTop: M(0x7fae3a), red: M(0xc81e1e), yellow: M(0xf2b705), clay: M(0xa0522d),
  bamboo: M(0xd4a55a), banana: M(0xf3d34a), orange: M(0xf28c28), lime: M(0x9ccc3c), coconut: M(0x6b4423),
  thekua: M(0x9a5b22), wood: M(0x6b4a2b), log: M(0x5a3d22), skin: M(0x8d5a3b), hair: M(0x1c1410), white: M(0xf3efe6),
  brass: M(0xc9a23a, { metalness: 0.6, roughness: 0.35 }), sack: M(0xd8c39a), lauki: M(0x7cb342), soot: M(0x2a1d16),
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
const signs = [];
function sign(lines, x, y, z, w = 3.2, h = 1, bg = '#7c2d12') {
  // two back-to-back planes so the text reads correctly from both sides
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(lines, bg), toneMapped: false });
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const back = front.clone(); back.rotation.y = Math.PI;
  g.add(front, back); g.position.set(x, y, z);
  scene.add(g);
  signs.push(() => { mat.map = signTexture(lines, bg); mat.needsUpdate = true; });
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
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(130, 6).rotateX(-Math.PI / 2), mats.mud);
  bed.position.set(0, -0.6, -2.5);
  scene.add(bed);
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
  place(box(10, 10, 8, mats.farTree), 70, 6, -282);
  place(new THREE.Mesh(new THREE.ConeGeometry(5, 14, 4), mats.farTree), 70, 18, -282);
}

function makeTree(x, z, s = 1) {
  place(cyl(0.25 * s, 0.4 * s, 4 * s, mats.trunk, 7), x, TOP + 2 * s, z);
  for (let i = 0; i < 4; i++) place(sph(rand(1.6, 2.4) * s, mats.leaf, 8), x + rand(-1.4, 1.4) * s, TOP + rand(4, 5.6) * s, z + rand(-1.2, 1.2) * s);
  addCollider(x, z, 0.8 * s);
}

const lightGlow = new Glow(400);  // bulb strings + windows, brighter at night
const diyaGlow = new Glow(700);   // diyas on the steps, fade in at dusk

function buildPromenade() {
  const walls = [0xf2d7a7, 0xe9b77c, 0xd98e73, 0xf4e2c1, 0xcfa86e, 0xe4c49b];
  for (let x = -52; x <= 52; x += rand(7, 10)) {
    if (Math.abs(x) < 9) continue;
    const w = rand(5.5, 7.5), h = rand(5, 10), d = 7;
    const hse = box(w, h, d, M(pick(walls)));
    place(hse, x, TOP + h / 2, PROM_Z + 17 + rand(0, 3));
    for (let wy = 2; wy < h - 1; wy += 2.6) for (let wx = -w / 2 + 1.3; wx < w / 2 - 0.8; wx += 2.2) {
      if (Math.random() < 0.55) lightGlow.add(x + wx, TOP + wy, hse.position.z - d / 2 - 0.05, 0xffc06b, 0.7);
    }
  }
  // temple of Surya Dev
  place(box(10, 3.5, 8, M(0xf3e7d3)), 0, TOP + 1.75, PROM_Z + 18);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 4.2, 9, 8), M(0xf0c987)), 0, TOP + 8, PROM_Z + 18.5);
  place(sph(0.6, mats.yellow, 10), 0, TOP + 13, PROM_Z + 18.5);
  place(new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), mats.cloth), 0.8, TOP + 14, PROM_Z + 18.5);
  place(new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false })), 0, TOP + 2.2, PROM_Z + 13.95);
  lightGlow.add(-1.8, TOP + 1.2, PROM_Z + 13.8, 0xffb04a, 1.4);
  lightGlow.add(1.8, TOP + 1.2, PROM_Z + 13.8, 0xffb04a, 1.4);
  addCollider(0, PROM_Z + 18, 6);

  for (const [x, z] of [[-34, 26], [-16, 27], [16, 27], [-46, 22], [48, 23]]) makeTree(x, z, rand(0.9, 1.2));

  // welcome arch
  for (const sx of [-4.5, 4.5]) { place(cyl(0.18, 0.2, 5.2, mats.bamboo, 6), sx, TOP + 2.6, PROM_Z + 1.2); addCollider(sx, PROM_Z + 1.2, 0.3); }
  sign([{ text: 'छठ घाट', size: 64 }, { text: 'Jai Chhathi Maiya', size: 34, font: '600 34px "Mukta", sans-serif' }], 0, TOP + 4.6, PROM_Z + 1.2, 8, 1.6, '#b91c1c');
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    place(sph(0.1, i % 2 ? mats.orange : mats.yellow, 6), lerp(-4.4, 4.4, t), TOP + 3.75 - Math.sin(Math.PI * t) * 0.5, PROM_Z + 1.1);
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

// --- aangan with chulha, and the mango-wood pile -----------------------------
const fireGlow = new Glow(4);
let pot;
function buildAangan() {
  const { x, z } = CHULHA, y = TOP;
  place(box(6, 0.12, 5, mats.plaster), x, y + 0.06, z);
  // low mud wall on three sides
  place(box(6, 0.7, 0.25, mats.plaster), x, y + 0.35, z + 2.5);
  place(box(0.25, 0.7, 5, mats.plaster), x + 3, y + 0.35, z);
  // chulha: clay block with a dark mouth
  place(box(1.0, 0.5, 0.8, mats.clay), x, y + 0.37, z);
  place(box(0.45, 0.28, 0.05, mats.soot), x, y + 0.3, z - 0.41);
  pot = sph(0.32, mats.brass, 14); pot.scale.y = 0.75; place(pot, x, y + 0.82, z);
  place(cyl(0.3, 0.3, 0.06, mats.brass, 14), x, y + 1.0, z);
  fireGlow.add(x, y + 0.32, z - 0.45, 0xff6a1a, 0.9);
  fireGlow.add(x - 0.12, y + 0.4, z - 0.42, 0xffa040, 0.6);
  fireGlow.uniforms.intensity.value = 0.6;
  // a few things around: a grinding stone, a brass lota, a jute mat
  place(box(1.6, 0.03, 1.0, M(0xb08a4a)), x - 1.8, y + 0.14, z + 0.6);
  place(cyl(0.12, 0.09, 0.22, mats.brass, 10), x + 0.9, y + 0.23, z + 0.3);
  sign([{ text: 'आँगन', size: 64 }, { text: 'Aangan · Chulha', size: 30, font: '600 30px "Mukta", sans-serif', gap: 64 }], x, y + 1.9, z + 2.55, 2.6, 0.8, '#7c2d12');
  addCollider(x, z, 0.8);
  // mango wood
  for (let i = 0; i < 9; i++) {
    const l = cyl(0.09, 0.11, 1.6, mats.log, 7);
    l.rotation.z = Math.PI / 2; l.rotation.y = rand(-0.3, 0.3);
    place(l, WOOD.x + rand(-0.3, 0.3), TOP + 0.12 + (i % 3) * 0.17, WOOD.z + (i / 3 | 0) * 0.2 - 0.2);
  }
  sign([{ text: 'आम की लकड़ी', size: 46 }, { text: 'Mango wood', size: 30, font: '600 30px "Mukta", sans-serif', gap: 56 }], WOOD.x, TOP + 1.3, WOOD.z - 0.6, 1.8, 0.56, '#3f6212');
  addCollider(WOOD.x, WOOD.z, 0.7);
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
function buildBody(saree, col) {
  const g = new THREE.Group();
  const clothMat = M(col);
  if (saree) {
    const skirt = cyl(0.17, 0.34, 1.0, clothMat, 12); skirt.position.y = 0.5; g.add(skirt);
    const torso = cyl(0.15, 0.17, 0.5, clothMat, 10); torso.position.y = 1.25; g.add(torso);
    const pallu = box(0.08, 0.7, 0.32, M(0xc92a2a)); pallu.position.set(0.14, 1.15, 0); pallu.rotation.z = -0.25; g.add(pallu);
  } else {
    const dhoti = cyl(0.17, 0.22, 0.9, mats.white, 10); dhoti.position.y = 0.45; g.add(dhoti);
    const kurta = cyl(0.17, 0.2, 0.62, clothMat, 10); kurta.position.y = 1.2; g.add(kurta);
  }
  const head = sph(0.13, mats.skin, 12); head.position.y = 1.65; g.add(head);
  const hair = sph(0.135, mats.hair, 12); hair.scale.set(1, 0.7, 1); hair.position.set(0, 1.7, 0.03); g.add(hair);
  if (saree) { const sin = box(0.02, 0.02, 0.08, mats.red); sin.position.set(0, 1.78, -0.1); g.add(sin); }
  return g;
}
const F_NAMES = ['Chachi', 'Dadi', 'Bua', 'Mausi', 'Didi', 'Bhabhi', 'Nani', 'Kaki'];
const M_NAMES = ['Chacha', 'Dada', 'Bhaiya', 'Mama', 'Fufa', 'Nana', 'Kaka', 'Babu'];
function makePerson({ x, z, saree = true, color, holding = false, faceSun = true, talk = false }) {
  const col = color ?? pick(SAREES);
  const g = buildBody(saree, col);
  let soop = null;
  if (holding) { soop = makeSoop(); soop.position.set(0, 1.35, -0.32); soop.rotation.x = -0.25; g.add(soop); }
  g.position.set(x, groundY(z), z);
  g.rotation.y = faceSun ? rand(-0.25, 0.25) : Math.PI + rand(-0.6, 0.6);
  scene.add(g);
  const p = { g, soop, base: g.position.y, phase: Math.random() * 6.28, talk, name: pick(saree ? F_NAMES : M_NAMES), x, z, gotPrasad: false, turn: null };
  people.push(p);
  addCollider(x, z, 0.45);
  return p;
}
function buildPeople() {
  const inWater = [-30, -24, -19, -13, -8, 6, 11, 15, 21, 27, 33];
  for (const x of inWater) makePerson({ x: x + rand(-1, 1), z: rand(-2.2, -1.2), holding: true, saree: Math.random() > 0.15 });
  for (let i = 0; i < 24; i++) {
    let x = rand(-44, 44); if (Math.abs(x) < 3) x += 6;
    const z = rand(0.6, PROM_Z - 1);
    if (Math.abs(x - RING.x) < 2.5 && z < 2) continue;
    makePerson({ x, z, saree: Math.random() > 0.45, faceSun: Math.random() > 0.3, talk: true });
  }
  for (let i = 0; i < 14; i++) {
    const x = rand(-44, 44), z = rand(PROM_Z + 3, PROM_Z + 9);
    if ([SABZI, FRUIT, SOOP, CHULHA, WOOD].some((s) => Math.abs(x - s.x) < 4.5) || Math.abs(x) < 5) continue;
    makePerson({ x, z, saree: Math.random() > 0.5, faceSun: Math.random() > 0.5, talk: true });
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
  const kpot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mats.clay); kpot.scale.y = 0.85; kpot.position.y = 0.18; g.add(kpot);
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
  kosis.push({ x, z, glow, lit: false, level: 0 });
}

// --- stalls ----------------------------------------------------------------
function makeStall({ x, z }, title, sub, color, goods) {
  const y = TOP;
  place(box(3.6, 0.9, 1.3, mats.wood), x, y + 0.45, z);
  for (const sx of [-1.8, 1.8]) for (const sz of [-0.7, 1.1]) place(cyl(0.06, 0.06, 2.6, mats.bamboo, 6), x + sx, y + 1.3, z + sz);
  const roof = box(4.2, 0.08, 2.4, M(color, { side: THREE.DoubleSide })); roof.rotation.x = -0.18; place(roof, x, y + 2.7, z + 0.2);
  sign([{ text: title, size: 58 }, { text: sub, size: 30, font: '600 30px "Mukta", sans-serif', gap: 64 }], x, y + 2.15, z - 0.75, 3.2, 0.9);
  goods(x, y + 0.9, z);
  lightGlow.add(x - 1.6, y + 2.45, z - 0.6, 0xffe08a, 0.9);
  lightGlow.add(x + 1.6, y + 2.45, z - 0.6, 0xffe08a, 0.9);
  addCollider(x - 1, z, 1.1); addCollider(x + 1, z, 1.1);
}

function buildStalls() {
  makeStall(SABZI, 'सब्ज़ी · अनाज', 'Sabzi & Anaj', 0xe8590c, (x, y, z) => {
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), mats.lauki); l.rotation.z = Math.PI / 2; l.rotation.y = rand(-0.4, 0.4); place(l, x - 1.1 + rand(-0.3, 0.3), y + 0.09 + (i > 3 ? 0.15 : 0), z + rand(-0.35, 0.35)); }
    for (const [ox, m] of [[0.2, mats.sack], [0.9, M(0x7a4a1c)], [1.5, mats.white]]) { const s = cyl(0.26, 0.3, 0.5, m, 10); place(s, x + ox, y + 0.25, z); }
  });
  makeStall(FRUIT, 'फल · गन्ना', 'Fruit & Sugarcane', 0x2b8a3e, (x, y, z) => {
    for (let i = 0; i < 14; i++) place(sph(0.11, [mats.orange, mats.lime, mats.banana, mats.coconut][i % 4], 8), x + rand(-1.4, 1.4), y + 0.11, z + rand(-0.4, 0.4));
    for (let i = 0; i < 9; i++) { const c = cyl(0.04, 0.05, 3, mats.cane, 6); c.rotation.z = rand(-0.25, 0.25); place(c, x + 2.1 + rand(-0.2, 0.3), y + 0.6, z + rand(-0.5, 0.5)); }
  });
  makeStall(SOOP, 'सूप · दउरा', 'Soop & Daura', 0xb45309, (x, y, z) => {
    for (let i = 0; i < 4; i++) { const s = makeSoop(false); s.rotation.x = -0.9; s.position.set(x - 1.2 + i * 0.8, y + 0.3, z + 0.2); scene.add(s); }
    for (const ox of [-0.8, 0.8]) place(cyl(0.34, 0.24, 0.3, mats.bamboo, 12), x + ox, y + 0.15, z - 0.3);
  });
}

// --- arghya ring + quest marker ----------------------------------------------
const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48).rotateX(-Math.PI / 2), mats.ring);
ring.position.set(RING.x, 0.03, RING.z);
scene.add(ring);
const ringGlow = new Glow(1); ringGlow.add(RING.x, 0.3, RING.z, 0xffb347, 2.4);

const marker = new THREE.Group();
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 14, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
beam.position.y = 7; marker.add(beam);
const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xffc04d, toneMapped: false }));
gem.scale.y = 1.5; marker.add(gem);
scene.add(marker);

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
  const pos = floatGlow.geo.attributes.position, size = floatGlow.geo.attributes.size, col = floatGlow.geo.attributes.color;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.x += f.vx * dt; f.z += f.vz * dt;
    if (f.z < -60 || f.x > 120) { scene.remove(f.mesh); floaters.splice(i, 1); continue; }
    f.mesh.position.set(f.x, Math.sin(t * 1.6 + f.ph) * 0.03, f.z);
  }
  floaters.forEach((f, i) => { pos.setXYZ(i, f.x, f.mesh.position.y + 0.14, f.z); size.setX(i, f.mine ? 0.75 : 0.55); col.setXYZ(i, 1, 0.6, 0.18); });
  floatGlow.n = floaters.length;
  floatGlow.geo.setDrawRange(0, floaters.length);
  pos.needsUpdate = size.needsUpdate = col.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Particles: arghya stream / splash, marigold petals
// ---------------------------------------------------------------------------
const pourGeo = new THREE.BufferGeometry();
const POUR_N = 260;
pourGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POUR_N * 3), 3));
const pour = new THREE.Points(pourGeo, new THREE.PointsMaterial({ color: 0xfff1d6, size: 0.06, transparent: true, opacity: 0.9, depthWrite: false }));
pour.frustumCulled = false; scene.add(pour);
const pourP = Array.from({ length: POUR_N }, () => ({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
let pourUntil = 0;
function splash(x, z, n = 80) {
  let k = 0;
  for (const p of pourP) {
    if (p.life > 0) continue;
    const a = rand(0, 6.28), s = rand(0.5, 1.6);
    Object.assign(p, { x, y: 0.05, z, vx: Math.cos(a) * s, vy: rand(1.5, 3.2), vz: Math.sin(a) * s, life: 1.2 });
    if (++k >= n) break;
  }
}

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
    petP.push({ x: player.x + rand(-14, 14), y: rand(4, 16), z: player.z + rand(-16, 4), s: rand(0.6, 1.4), ph: rand(0, 6.28) });
    c.setHex([0xf59f00, 0xff8c00, 0xffd43b, 0xe8590c][i % 4]); col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true; petals.visible = true;
}

// ---------------------------------------------------------------------------
// Player (third person)
// ---------------------------------------------------------------------------
const player = { x: 0, z: 14, y: TOP, yaw: 0, pitch: 0.28, speed: 4.4, gender: 'f', name: '', facing: 0, walk: 0, action: null };
let avatar = null, avatarSoop = null;
const g = (f, m) => (player.gender === 'f' ? f : m); // gendered Hindi
function buildAvatar() {
  if (avatar) scene.remove(avatar);
  avatar = buildBody(player.gender === 'f', player.gender === 'f' ? 0xfab005 : 0xe8590c);
  avatarSoop = makeSoop(); avatarSoop.position.set(0, 1.25, -0.34); avatarSoop.rotation.x = -0.2; avatarSoop.visible = false;
  avatar.add(avatarSoop);
  scene.add(avatar);
}

const keys = new Set();
let started = false, uiOpen = false;
addEventListener('keydown', (e) => {
  if (cookState) { if (['e', ' ', 'enter'].includes(e.key.toLowerCase()) && !e.repeat) { e.preventDefault(); cookHit(); } return; }
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
  const s = e.pointerType === 'touch' ? 0.007 : 0.0045;
  player.yaw -= (e.clientX - lx) * s; player.pitch = clamp(player.pitch + (e.clientY - ly) * s, -0.15, 1.1);
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

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), camTarget = new THREE.Vector3();
function updatePlayer(dt, t) {
  let mx = 0, mz = 0;
  if (!player.action && !uiOpen) {
    if (keys.has('w') || keys.has('arrowup')) mz += 1;
    if (keys.has('s') || keys.has('arrowdown')) mz -= 1;
    if (keys.has('a')) mx -= 1;
    if (keys.has('d')) mx += 1;
    if (keys.has('arrowleft')) player.yaw += 1.8 * dt;
    if (keys.has('arrowright')) player.yaw -= 1.8 * dt;
    mx += joyV.x; mz -= joyV.y;
  }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const inWater = player.z < 0;
  const sp = player.speed * (keys.has('shift') ? 1.7 : 1) * (inWater ? 0.55 : 1);
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const dx = (fwd.x * mz + right.x * mx), dz = (fwd.z * mz + right.z * mx);
  let nx = player.x + dx * sp * dt, nz = player.z + dz * sp * dt;
  nx = clamp(nx, -52, 52); nz = clamp(nz, -2.8, PROM_Z + 11);
  for (const c of colliders) {
    const ddx = nx - c.x, ddz = nz - c.z, d = Math.hypot(ddx, ddz), min = c.r + 0.35;
    if (d < min && d > 0.0001) { nx = c.x + (ddx / d) * min; nz = c.z + (ddz / d) * min; }
  }
  const moving = len > 0.05;
  player.x = nx; player.z = nz;
  if (moving) player.facing += angleTo(player.facing, Math.atan2(-dx, -dz)) * (1 - Math.exp(-12 * dt));
  player.walk = moving ? player.walk + dt * sp * 2.2 : 0;
  player.y = lerp(player.y, groundY(player.z), 1 - Math.exp(-12 * dt));

  // avatar pose
  let dip = 0;
  if (player.action?.type === 'dip') {
    const a = player.action, k = (t - a.start) / a.dur;
    dip = Math.max(0, Math.sin(k * Math.PI * 3)) * 0.9;
  }
  avatar.position.set(player.x, player.y - dip + (moving && !reduceMotion ? Math.abs(Math.sin(player.walk)) * 0.05 : 0), player.z);
  avatar.rotation.set(0, player.facing, moving ? Math.sin(player.walk) * 0.05 : 0);
  avatarSoop.visible = !!player.action && player.action.type === 'arghya';
  if (avatarSoop.visible) avatarSoop.position.y = 1.25 + Math.min(1, (t - player.action.start) / 1.2) * 0.45;

  // camera: orbit behind the avatar, kept above water and steps
  const dist = 4.6;
  camTarget.set(player.x, player.y + 1.45 - dip * 0.5, player.z);
  const cx = camTarget.x - fwd.x * dist * Math.cos(player.pitch);
  const cz = camTarget.z - fwd.z * dist * Math.cos(player.pitch);
  let cy = camTarget.y + dist * Math.sin(player.pitch) + 0.2;
  cy = Math.max(cy, groundY(cz) + 0.4, 0.35);
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.exp(-14 * dt));
  camera.lookAt(camTarget);
}

// ---------------------------------------------------------------------------
// Days and tasks
// ---------------------------------------------------------------------------
const DAYS = [
  {
    n: 1, title: 'Nahay Khay', date: 'Fri, 13 Nov 2026', sky: { elev: 16, az: 32 }, song: 'L-lzSCH50Cg', start: { x: 0, z: 8.6 },
    desc: 'Chhath begins with purity. A holy dip in the river, then one simple sattvik meal: kaddu-bhaat, cooked with ghee and sendha namak.',
    tasks: [
      { id: 'snan', t: 'Take a holy dip in the river' },
      { id: 'lauki', t: 'Buy lauki (kaddu) at the Sabzi stall' },
      { id: 'kaddu', t: 'Cook kaddu-bhaat at the chulha', needs: ['lauki'] },
    ],
    done: 'Snan ho gaya, kaddu-bhaat ban gaya. The house smells of ghee and the festival has begun.',
  },
  {
    n: 2, title: 'Kharna', date: 'Sat, 14 Nov 2026', sky: { elev: 5, az: -32 }, song: 'DG8F-csoRAQ', start: { x: 30, z: 16 },
    desc: 'A full day of fasting, broken at dusk with rasiya: jaggery kheer cooked on mango wood. Share the prasad with neighbours, and the 36-hour nirjala vrat begins.',
    tasks: [
      { id: 'lakdi', t: 'Collect mango wood by the big tree' },
      { id: 'gur', t: 'Get gur and chawal at the Anaj stall' },
      { id: 'kheer', t: 'Cook rasiya-kheer on the chulha', needs: ['lakdi', 'gur'] },
      { id: 'share', t: 'Share Kharna prasad with 3 neighbours', needs: ['kheer'], count: 3 },
    ],
    done: 'Kharna ka prasad sabko mila. From now till Usha Arghya, the vrat is nirjala: not even a sip of water.',
  },
  {
    n: 3, title: 'Sandhya Arghya', date: 'Sun, 15 Nov 2026', sky: { elev: 9, az: -32 }, song: 'knZ8b5YnQiY', start: { x: 30, z: 16 },
    desc: 'The big day. Fry thekua, pack the daura with fruit and sugarcane, carry it to the ghat and offer arghya to the setting sun. At night, light the kosi.',
    tasks: [
      { id: 'atta', t: 'Get atta and gur at the Anaj stall' },
      { id: 'thekua', t: 'Fry thekua at the chulha', needs: ['atta'] },
      { id: 'phal', t: 'Pick fruit and sugarcane' },
      { id: 'soop', t: 'Buy a bamboo soop and daura' },
      { id: 'sandhya', t: 'Offer Sandhya Arghya at the glowing ring', needs: ['thekua', 'phal', 'soop'] },
      { id: 'kosi', t: 'Light a kosi on the steps', needs: ['sandhya'] },
      { id: 'diya', t: 'Float a diya on the river', needs: ['sandhya'] },
    ],
    done: 'Kosi jal rahi hai, diye beh rahe hain. The ghat stays awake all night with songs. Bhor hone wali hai…',
  },
  {
    n: 4, title: 'Usha Arghya', date: 'Mon, 16 Nov 2026', sky: { elev: -3, az: 32 }, song: 'j9G3caThH98', start: { x: 0, z: 5 },
    desc: 'Before first light, back in the water. Offer arghya to the rising sun, then share prasad and break the fast: paran.',
    tasks: [
      { id: 'usha', t: 'Offer Usha Arghya to the rising sun' },
      { id: 'paran', t: 'Paran: share prasad with someone', needs: ['usha'] },
    ],
  },
];
const state = { day: 0, done: new Set(), share: 0 };
const curDay = () => DAYS[state.day];
const isDone = (id) => state.done.has(id);
const ready = (task) => (task.needs || []).every(isDone);
function currentTask() { return curDay().tasks.find((t) => !isDone(t.id) && ready(t)) || null; }

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ g: player.gender, name: player.name, day: state.day, done: [...state.done], share: state.share })); } catch { /* storage blocked */ }
}
function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; }
}

function renderQuest() {
  const d = curDay();
  $('#qK').textContent = `Din ${d.n} · ${d.date}`;
  $('#qV').textContent = d.title;
  const cur = currentTask();
  const ol = $('#qList'); ol.innerHTML = '';
  for (const t of d.tasks) {
    const li = document.createElement('li');
    li.textContent = t.count ? `${t.t} (${Math.min(state.share, t.count)}/${t.count})` : t.t;
    if (isDone(t.id)) li.className = 'done';
    else if (t === cur) li.className = 'cur';
    ol.append(li);
  }
}
const quest = $('#quest');
if (innerWidth < 600) { quest.classList.add('collapsed'); $('#qToggle').setAttribute('aria-expanded', 'false'); }
$('#qToggle').addEventListener('click', () => {
  const c = quest.classList.toggle('collapsed');
  $('#qToggle').setAttribute('aria-expanded', String(!c));
});

function complete(id) {
  if (isDone(id)) return false;
  state.done.add(id);
  sfx.bell();
  renderQuest(); save();
  if (curDay().tasks.every((t) => isDone(t.id))) setTimeout(dayComplete, 2600);
  return true;
}

function nearestUnlitKosi() {
  let best = null, bd = Infinity;
  for (const k of kosis) { if (k.lit) continue; const d = Math.hypot(k.x - player.x, k.z - player.z); if (d < bd) { bd = d; best = k; } }
  return best;
}
function nearestTalker(filter = () => true) {
  let best = null, bd = Infinity;
  for (const p of people) { if (!p.talk || !filter(p)) continue; const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
function taskTarget(task) {
  if (!task) return null;
  switch (task.id) {
    case 'snan': case 'sandhya': case 'usha': case 'diya': return RING;
    case 'lauki': case 'gur': case 'atta': return SABZI;
    case 'phal': return FRUIT;
    case 'soop': return SOOP;
    case 'kaddu': case 'kheer': case 'thekua': return CHULHA;
    case 'lakdi': return WOOD;
    case 'kosi': return nearestUnlitKosi();
    case 'share': return nearestTalker((p) => !p.gotPrasad);
    case 'paran': return nearestTalker();
  }
  return null;
}

// --- day flow ---------------------------------------------------------------
let anim = null;
function animateSky(elev, az, dur, done) { anim = { from: { ...sky }, to: { elev, az }, t: 0, dur: reduceMotion ? 0.3 : dur, done }; }

function openModal(id) { $('#' + id).classList.add('on'); uiOpen = true; keys.clear(); setTimeout(() => $('#' + id + ' .btn')?.focus(), 60); }
function closeModal(id) { $('#' + id).classList.remove('on'); uiOpen = document.querySelector('.modal.on, .drawer.on') !== null; }

function startDay(i, { fresh = true } = {}) {
  state.day = i;
  if (fresh) { for (const t of DAYS[i].tasks) state.done.delete(t.id); if (i === 1) state.share = 0; }
  const d = DAYS[i];
  sky.elev = d.sky.elev; sky.az = d.sky.az; anim = null;
  // the world remembers what happened on earlier days
  const sandhyaDone = isDone('sandhya') || i === 3;
  kosis.forEach((k, j) => { k.lit = i === 3 ? j % 2 === 0 : (i === 2 && isDone('kosi') && j === 0); });
  if (i === 2 && sandhyaDone && isDone('sandhya')) { sky.elev = -14; }
  people.forEach((p) => { p.gotPrasad = false; });
  player.x = d.start.x; player.z = d.start.z; player.y = groundY(player.z); player.yaw = 0; player.facing = 0; player.pitch = 0.28;
  petals.visible = false;
  renderQuest(); save();
  $('#dayEyebrow').textContent = `Din ${d.n} · ${d.date}`;
  $('#dayTitle').textContent = d.title;
  $('#dayDesc').textContent = d.desc;
  const ul = $('#dayTasks'); ul.innerHTML = '';
  d.tasks.forEach((t) => { const li = document.createElement('li'); li.textContent = t.t; ul.append(li); });
  const s = SONGS.find((x) => x.id === d.song);
  $('#daySong').textContent = `${s.title} · ${s.by}`;
  $('#daySong').onclick = () => { playSong(s.id); };
  openModal('dayCard');
}
$('#dayGo').addEventListener('click', () => {
  closeModal('dayCard');
  const d = curDay();
  const hi = player.name ? `, ${player.name}` : '';
  setTimeout(() => toast(`Din ${d.n}: ${d.title}`, `Follow the golden light${hi}. Your tasks are at the top left.`), 300);
});

function dayComplete() {
  const d = curDay();
  if (d.n === 4) return finale();
  $('#doneEyebrow').textContent = `Din ${d.n} sampann`;
  $('#doneTitle').textContent = pick(['Shabaash!', 'Bahut badhiya!', 'Jai Chhathi Maiya!']);
  $('#doneDesc').textContent = d.done;
  $('#nextDay').textContent = `Din ${d.n + 1}: ${DAYS[d.n].title} →`;
  openModal('doneCard');
}
$('#nextDay').addEventListener('click', () => { closeModal('doneCard'); startDay(state.day + 1); });

function finale() {
  startPetals();
  $('#finText').textContent = `Four days, two arghyas, and a lot of thekua. ${player.name ? player.name + ', your' : 'Your'} vrat is complete. Ghar se door ho, par Chhathi Maiya ka aashirwad saath hai. Chhath Mahaparv ki hardik shubhkamnayein!`;
  setTimeout(() => openModal('finale'), 1800);
}
$('#stayBtn').addEventListener('click', () => closeModal('finale'));
$('#shareBtn').addEventListener('click', async () => {
  const data = { title: 'Chhath Ghat Online', text: 'Ghar nahi ja paaye? Chhath ke chaaron din yahan manao, online ghat pe.', url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(location.href); $('#shareBtn').textContent = 'Link copied'; }
  } catch { /* share sheet dismissed */ }
});
document.querySelectorAll('[data-wish]').forEach((b) => b.addEventListener('click', () => {
  const who = player.name ? `– ${player.name}` : '';
  const msg = `Chhath Mahaparv ki hardik shubhkamnayein! 🌅🙏\nIs baar ghar nahi aa ${g('payi', 'paya')}, par online ghat pe arghya diya aur aap sabko yaad kiya. Chhathi Maiya sabki manokamna puri karein. ${who}\n${location.href}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
}));

// ---------------------------------------------------------------------------
// Toasts and speech
// ---------------------------------------------------------------------------
let toastTimer, sayTimer;
function toast(main, sub = '', ms = 4200) {
  const el = $('#toast');
  el.innerHTML = '';
  el.append(main);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.append(s); }
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}
function say(who, text, ms = 5200) {
  $('#sayWho').textContent = who; $('#sayText').textContent = text;
  $('#say').classList.add('on');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => $('#say').classList.remove('on'), ms);
}

const LINES = () => {
  const n = player.name || g('beti', 'beta');
  return [
    `Kahan se aaye ho, ${n}? Bangalore? Arre, ghar nahi ja paaye to kya, ghat to yahin hai!`,
    `Maa ko video call karna arghya ke time. Woh bahut khush hongi.`,
    `Is baar train ki ticket nahi mili… waiting 187! Isliye hum bhi online ghat aa gaye.`,
    `Thekua ka secret? Atta, gur, ghee… aur dher saara pyaar.`,
    `Sharda Sinha ji ka geet bajao, tab lagta hai Chhath aa gaya. Upar geet wala button dabao!`,
    `Chhathi Maiya sabki manokamna puri karein. Jai ho!`,
    `Seedhiyon pe dhyan se, ${n}. Bahut phislan hai.`,
    `Pichhli baar Patna mein itni bheed thi ki ghat tak pahunchne mein ek ghanta laga.`,
    `Prasad mein ganna zaroor rakhna. Bachche sabse pehle wahi uthate hain!`,
    `Daura sar pe uthake ghat tak le jaana, isse bada punya kuch nahi.`,
    `Kosi bharai dekhi hai kabhi raat mein? Itne diye, jaise taare zameen pe utar aaye.`,
    `${g('Tum', 'Tum')} jahan bhi ho, Chhath ka suraj wahi hai. Arghya dil se dena.`,
    `Ghar ki yaad aa rahi hai? Chalo, ek thekua kha lo, thoda accha lagega.`,
  ];
};
function talkTo(p) {
  p.turn = Math.atan2(player.x - p.x, player.z - p.z) + Math.PI;
  say(p.name, pick(LINES()));
  sfx.chime();
}

// ---------------------------------------------------------------------------
// Cooking mini-game
// ---------------------------------------------------------------------------
const RECIPES = {
  kaddu: { title: 'Kaddu-bhaat', steps: ['Chawal dhoye ✓', 'Lauki aur chana dal daali ✓', 'Ghee aur sendha namak, ban gaya! ✓'], msg: ['Kaddu-bhaat taiyaar 🍚', 'Simple, sattvik, and full of ghee.'] },
  kheer: { title: 'Rasiya-kheer', steps: ['Aam ki lakdi jalayi ✓', 'Doodh mein chawal pakaye ✓', 'Gur milaya, rasiya taiyaar! ✓'], msg: ['Rasiya-kheer ban gayi 🍮', 'Now share the Kharna prasad with 3 neighbours.'] },
  thekua: { title: 'Thekua', steps: ['Atta, gur aur ghee goondha ✓', 'Saanche pe sundar chhaap ✓', 'Ghee mein sunahra tala! ✓'], msg: ['Thekua taiyaar! 🍪', 'Crisp outside, soft inside. Just like home.'] },
};
let cookState = null;
const MISS = ['Thoda jal gaya! Phir se 😅', 'Arre, kachcha reh gaya! Ek baar aur', 'Dhyan se! Golden zone pe rokna hai'];
function cook(id) {
  const r = RECIPES[id];
  cookState = { id, hits: 0, t: 0, speed: 1.6, zone: 0, w: 22, raf: 0, last: performance.now() };
  $('#cookTitle').textContent = r.title;
  $('#cookStep').textContent = 'Stop the needle in the golden zone, 3 times';
  $('#cookHint').textContent = isTouch ? 'Tap "Abhi!" when the needle is in the gold' : 'Press E or Space when the needle is in the gold';
  [...$('#cookDots').children].forEach((d) => d.classList.remove('on'));
  newZone();
  openModal('cook');
  fireGlow.uniforms.intensity.value = 1.6;
  const loop = (now) => {
    if (!cookState) return;
    const dt = (now - cookState.last) / 1000; cookState.last = now;
    cookState.t += dt * cookState.speed;
    cookState.pos = (Math.sin(cookState.t * 2.2) + 1) / 2 * 100;
    $('#cookNeedle').style.left = cookState.pos + '%';
    cookState.raf = requestAnimationFrame(loop);
  };
  cookState.raf = requestAnimationFrame(loop);
}
function newZone() {
  cookState.zone = rand(8, 92 - cookState.w);
  $('#cookZone').style.left = cookState.zone + '%';
  $('#cookZone').style.width = cookState.w + '%';
}
function cookHit() {
  const c = cookState; if (!c) return;
  const r = RECIPES[c.id];
  if (c.pos >= c.zone - 1.5 && c.pos <= c.zone + c.w + 1.5) {
    $('#cookDots').children[c.hits].classList.add('on');
    $('#cookStep').textContent = r.steps[c.hits];
    c.hits++; sfx.chime();
    if (c.hits >= 3) {
      cancelAnimationFrame(c.raf); cookState = null;
      setTimeout(() => {
        closeModal('cook'); fireGlow.uniforms.intensity.value = 0.6;
        complete(c.id); toast(...r.msg);
        if (c.id === 'kheer') animateSky(-10, -32, 8); // dusk falls over Kharna
      }, 900);
      return;
    }
    c.speed += 0.45; c.w = Math.max(11, c.w - 4); newZone();
  } else {
    $('#cookStep').textContent = pick(MISS);
    const bar = $('#cookBar'); bar.classList.remove('miss'); void bar.offsetWidth; bar.classList.add('miss');
  }
}
$('#cookBtn').addEventListener('click', cookHit);

// ---------------------------------------------------------------------------
// Rituals
// ---------------------------------------------------------------------------
function faceSun() {
  const s = sunVector(Math.max(sky.elev, 0), sky.az);
  const target = Math.atan2(-s.x, -s.z);
  player.facing = target;
  player.turnCam = { from: player.yaw, to: target, t: 0 };
}
function dip() {
  player.action = { type: 'dip', start: clock.elapsedTime, dur: 3.2 };
  faceSun();
  const counts = ['Ek!', 'Do!', 'Teen!'];
  counts.forEach((c, i) => setTimeout(() => { toast(c, '', 900); splash(player.x, player.z, 60); sfx.splash(); }, 400 + i * 1060));
  setTimeout(() => {
    player.action = null;
    complete('snan');
    toast('Ganga snan sampann 💧', `${g('Pavitra ho gayi', 'Pavitra ho gaye')}. Now for the kaddu-bhaat.`);
  }, 3400);
}
function offerArghya(kind) {
  sfx.shankh();
  faceSun();
  player.action = { type: 'arghya', start: clock.elapsedTime };
  pourUntil = performance.now() + 3200;
  if (kind === 'sandhya') {
    toast('Sandhya Arghya arpit 🌇', 'Thanks to Surya Dev for the day that was.', 5000);
    setTimeout(() => {
      player.action = null;
      animateSky(-14, -32, 12, () => {
        complete('sandhya');
        toast('Raat ho gayi 🌙', 'Kosi bharai time. Light a kosi and float a diya.');
      });
    }, 2600);
  } else {
    toast('Usha Arghya arpit 🌄', 'Ugi he Suruj Dev! The vrat is nearly complete.', 5000);
    setTimeout(() => {
      player.action = null;
      animateSky(6, 32, 9, () => {
        complete('usha');
        toast('Ab paran karo 🙏', 'Share prasad with someone on the ghat to break the fast.');
      });
    }, 2200);
  }
}
let lastFloat = 0;
function floatMine() {
  const now = performance.now();
  if (now - lastFloat < 700) return; lastFloat = now;
  launchDiya(player.x - Math.sin(player.facing) * 1.0, Math.min(player.z - 1.0, -0.6), true);
  sfx.chime();
  if (state.day === 2 && complete('diya')) toast('Diya pravahit 🪔', 'Your diya joins the river of lights.');
}

// ---------------------------------------------------------------------------
// Interactables
// ---------------------------------------------------------------------------
const interactables = [];
function interactable(pos, r, label, action) { interactables.push({ pos, r, label, action }); }
const dayN = () => curDay().n;
const busy = () => !!anim || !!player.action;

function setupInteractions() {
  interactable(RING, 2.2, () => {
    if (busy()) return '';
    const n = dayN();
    if (n === 1) return isDone('snan') ? '' : 'Take a holy dip (snan)';
    if (n === 3) {
      if (!isDone('sandhya')) return ready(DAYS[2].tasks[4]) ? 'Offer Sandhya Arghya' : 'Daura not ready yet';
      return 'Float a diya';
    }
    if (n === 4) return isDone('usha') ? 'Float a diya' : 'Offer Usha Arghya';
    return '';
  }, () => {
    if (busy()) return;
    const n = dayN();
    if (n === 1 && !isDone('snan')) dip();
    else if (n === 3 && !isDone('sandhya')) {
      if (ready(DAYS[2].tasks[4])) offerArghya('sandhya');
      else toast('Daura abhi khaali hai', 'First fry thekua, pick fruit and sugarcane, and buy a soop.');
    } else if (n === 4 && !isDone('usha')) offerArghya('usha');
    else floatMine();
  });
  // anywhere along the water's edge after dusk on Day 3: float a diya
  interactables.push({ edge: true, label: () => ((dayN() === 3 && isDone('sandhya')) || (dayN() === 4 && isDone('usha')) ? 'Float a diya' : ''), action: floatMine });

  for (const k of kosis) {
    interactable(k, 2.0, () => (dayN() === 3 && isDone('sandhya') && !k.lit ? 'Light the kosi diyas' : ''), () => {
      k.lit = true; sfx.chime();
      if (complete('kosi')) toast('Kosi jal gayi ✨', 'Diyas under the sugarcane canopy, for a wish fulfilled.');
    });
  }
  interactable(SABZI, 2.6, () => {
    const n = dayN();
    if (n === 1 && !isDone('lauki')) return 'Buy lauki';
    if (n === 2 && !isDone('gur')) return 'Get gur and chawal';
    if (n === 3 && !isDone('atta')) return 'Get atta and gur';
    return 'Chat with the sabzi-wale bhaiya';
  }, () => {
    const n = dayN();
    if (n === 1 && complete('lauki')) toast('Lauki mil gayi 🥒', 'Sabse taaza kaddu, sirf aapke liye.');
    else if (n === 2 && complete('gur')) toast('Gur aur chawal liye', 'Naya gur, ekdum meetha.');
    else if (n === 3 && complete('atta')) toast('Atta aur gur liye', 'Thekua ka saaman taiyaar.');
    else say('Sabzi-wale Bhaiya', pick(['Aaj sab kuch taaza hai! Kal phir aana.', 'Chhath mein daam nahi badhaye, Chhathi Maiya dekh rahi hain!', 'Ghar se door ho? Koi baat nahi, yahan sab apne hain.']));
  });
  interactable(FRUIT, 2.6, () => (dayN() === 3 && !isDone('phal') ? 'Pick fruit and sugarcane' : 'Chat with the phal-wali didi'), () => {
    if (dayN() === 3 && complete('phal')) toast('Ganna aur phal liye 🍌', 'Banana, coconut, gagal nimbu and a tall sugarcane.');
    else say('Phal-wali Didi', pick(['Sandhya Arghya ke din aana, sabse accha ganna rakha hai.', 'Gagal nimbu itna bada kahin nahi milega!', 'Kela, nariyal, singhara… sab Chhath ke liye.']));
  });
  interactable(SOOP, 2.6, () => (dayN() === 3 && !isDone('soop') ? 'Buy a soop and daura' : 'Chat with the soop-wale chacha'), () => {
    if (dayN() === 3 && complete('soop')) toast('Soop aur daura liye 🧺', 'Hand-woven bamboo, used only for Chhath.');
    else say('Soop-wale Chacha', pick(['Yeh soop mere dada ji ke zamane se isi tarah bunte hain.', 'Bans ka soop, haath ka bana. Plastic nahi chalega Chhath mein!']));
  });
  interactable(WOOD, 2.2, () => (dayN() === 2 && !isDone('lakdi') ? 'Collect mango wood' : ''), () => {
    if (complete('lakdi')) toast('Aam ki lakdi li 🪵', 'Kharna is always cooked on mango wood.');
  });
  interactable(CHULHA, 2.4, () => {
    const t = currentTask();
    const n = dayN();
    const id = n === 1 ? 'kaddu' : n === 2 ? 'kheer' : n === 3 ? 'thekua' : null;
    if (!id || isDone(id)) return '';
    const task = curDay().tasks.find((x) => x.id === id);
    return ready(task) ? `Cook ${RECIPES[id].title}` : 'Chulha: ingredients missing';
  }, () => {
    const n = dayN();
    const id = n === 1 ? 'kaddu' : n === 2 ? 'kheer' : 'thekua';
    const task = curDay().tasks.find((x) => x.id === id);
    if (ready(task)) cook(id);
    else toast('Saaman abhi nahi hai', n === 1 ? 'Get lauki from the Sabzi stall first.' : n === 2 ? 'You need mango wood, and gur and chawal.' : 'Get atta and gur first.');
  });
  // people
  for (const p of people.filter((q) => q.talk)) {
    interactable(p, 1.9, () => {
      if (dayN() === 2 && isDone('kheer') && !isDone('share') && !p.gotPrasad) return `Give Kharna prasad to ${p.name}`;
      if (dayN() === 4 && isDone('usha') && !isDone('paran')) return `Share prasad with ${p.name}`;
      return `Talk to ${p.name}`;
    }, () => {
      if (dayN() === 2 && isDone('kheer') && !isDone('share') && !p.gotPrasad) {
        p.gotPrasad = true; state.share++;
        p.turn = Math.atan2(player.x - p.x, player.z - p.z) + Math.PI;
        say(p.name, pick(['Kharna ka prasad! Jeete raho. 🙏', 'Waah, rasiya mein gur ekdum sahi hai!', 'Chhathi Maiya sab accha karein. Bahut dhanyavaad!']));
        sfx.chime();
        if (state.share >= 3) complete('share'); else { renderQuest(); save(); }
      } else if (dayN() === 4 && isDone('usha') && !isDone('paran')) {
        p.turn = Math.atan2(player.x - p.x, player.z - p.z) + Math.PI;
        say(p.name, `Thekua? Haan haan! Vrat sampann hua, ${player.name || g('beti', 'beta')}. Jai Chhathi Maiya!`);
        complete('paran');
      } else talkTo(p);
    });
  }
}

let nearest = null;
function updatePrompt() {
  nearest = null; let best = Infinity;
  for (const it of interactables) {
    let d;
    if (it.edge) {
      if (player.z > 1.4 || Math.hypot(player.x - RING.x, player.z - RING.z) < 2.4) continue;
      d = 1.5;
    } else {
      d = Math.hypot(player.x - it.pos.x, player.z - it.pos.z);
      if (d > it.r) continue;
    }
    const label = it.label();
    if (label && d < best) { best = d; nearest = { it, label }; }
  }
  const p = $('#prompt');
  if (nearest && !uiOpen && !player.action) { $('#promptText').textContent = nearest.label; p.classList.add('on'); }
  else p.classList.remove('on');
  $('#act').classList.toggle('ready', !!nearest);
}
function interact() { if (nearest && !uiOpen && !player.action) nearest.it.action(); }

// ---------------------------------------------------------------------------
// Songs (official YouTube embeds, nothing bundled)
// ---------------------------------------------------------------------------
const SONGS = [
  { id: 'L-lzSCH50Cg', title: 'Kartik Mahinwan Ke', by: 'Sharda Sinha', day: 1 },
  { id: 'DG8F-csoRAQ', title: 'Pahile Pahil Chhathi Maiya', by: 'Sharda Sinha', day: 2 },
  { id: 'knZ8b5YnQiY', title: 'Kelwa Ke Paat Par', by: 'Sharda Sinha', day: 3 },
  { id: 'Eyq7vfxu4iA', title: 'Kaanch Hi Baans Ke Bahangiya', by: 'Anuradha Paudwal', day: 3 },
  { id: 'j74EcjyN1WQ', title: 'Ho Deenanath', by: 'Sharda Sinha', day: 3 },
  { id: 'j9G3caThH98', title: 'Uthau Suruj Bhaile Bihaan', by: 'Sharda Sinha', day: 4 },
  { id: 'CqKat91cXWs', title: 'Ugihein Sooraj Gosaiyan Hey', by: 'Sharda Sinha', day: 4 },
  { id: 'x9_3sARy_Kw', title: 'Hey Chhathi Maiya', by: 'Sharda Sinha' },
];
function renderSongs(cur) {
  const ul = $('#songList'); ul.innerHTML = '';
  SONGS.forEach((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.className = 'song' + (s.id === cur ? ' cur' : '');
    b.innerHTML = `<span class="n">${s.id === cur ? '♪' : i + 1}</span><span><b></b><small></small></span>${s.day ? `<span class="tag">Din ${s.day}</span>` : ''}`;
    b.querySelector('b').textContent = s.title; b.querySelector('small').textContent = s.by;
    b.addEventListener('click', () => playSong(s.id));
    li.append(b); ul.append(li);
  });
}
function playSong(id) {
  const s = SONGS.find((x) => x.id === id);
  const box = $('#player');
  box.innerHTML = '';
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  f.title = `${s.title} by ${s.by}`;
  f.allow = 'autoplay; encrypted-media; picture-in-picture';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.allowFullscreen = true;
  box.append(f);
  renderSongs(id);
  $('#npTitle').textContent = `${s.title} · ${s.by}`;
  $('#nowPlaying').hidden = false;
  $('#geetBtn').classList.add('playing');
  sfx.drone(false);
  if (!$('#geet').classList.contains('on')) openDrawer('geet');
}
renderSongs();

// ---------------------------------------------------------------------------
// Sound (synthesised ambience; songs come from YouTube)
// ---------------------------------------------------------------------------
const sfx = (() => {
  let ctx = null, master = null, droneGain = null, muted = false;
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g0 = ctx.createGain(); g0.gain.value = 0.22;
    src.connect(lp).connect(g0).connect(master); src.start();
    droneGain = ctx.createGain(); droneGain.gain.value = 1; droneGain.connect(master);
    for (const [f, v] of [[110, 0.025], [165, 0.016], [220, 0.012]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = v;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rand(0.08, 0.2);
      const lg = ctx.createGain(); lg.gain.value = v * 0.6; lfo.connect(lg).connect(og.gain);
      o.connect(og).connect(droneGain); o.start(); lfo.start();
    }
  }
  function tone(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  return {
    init,
    bell() { [880, 1320, 2210, 2960].forEach((f, i) => tone(f, 2.2 - i * 0.4, 'sine', 0.12 / (i + 1))); },
    chime() { tone(1568, 1.2, 'sine', 0.07); tone(2093, 1.0, 'sine', 0.05, 0.08); },
    splash() {
      if (!ctx || muted) return;
      const len = ctx.sampleRate * 0.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.7;
      const gn = ctx.createGain(); gn.gain.value = 0.4;
      s.connect(f).connect(gn).connect(master); s.start();
    },
    shankh() {
      if (!ctx || muted) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), o2 = ctx.createOscillator(), gn = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'sawtooth'; o2.frequency.value = 234.5;
      o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(233, t + 0.6);
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.16, t + 0.7); gn.gain.setValueAtTime(0.16, t + 2.2); gn.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(f); o2.connect(f); f.connect(gn).connect(master); o.start(t); o2.start(t); o.stop(t + 3.3); o2.stop(t + 3.3);
    },
    drone(on) { if (droneGain) droneGain.gain.value = on ? 1 : 0; },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
  };
})();
$('#muteBtn').addEventListener('click', () => {
  const m = sfx.toggle();
  $('#muteBtn').setAttribute('aria-label', m ? 'Unmute ambient sound' : 'Mute ambient sound');
  $('#muteBtn').style.opacity = m ? 0.5 : 1;
});

// ---------------------------------------------------------------------------
// Drawers, support, countdown
// ---------------------------------------------------------------------------
let lastFocus = null;
function openDrawer(id) {
  lastFocus = document.activeElement;
  document.querySelectorAll('.drawer.on').forEach((d) => d.classList.remove('on'));
  $('#' + id).classList.add('on'); $('#scrim').classList.add('on'); uiOpen = true; keys.clear();
  setTimeout(() => $('#' + id + ' [data-close]').focus(), 50);
}
function closeDrawers() {
  document.querySelectorAll('.drawer.on').forEach((d) => d.classList.remove('on'));
  $('#scrim').classList.remove('on');
  uiOpen = document.querySelector('.modal.on') !== null;
  lastFocus?.focus?.();
}
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.open)));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDrawers));
$('#scrim').addEventListener('click', closeDrawers);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawers(); });

if (isTouch) $('#upiLink').style.display = 'inline-flex';
$('#copyUpi').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#upiId').textContent); $('#copyUpi').textContent = 'Copied'; }
  catch { $('#copyUpi').textContent = 'Select and copy the ID'; }
  setTimeout(() => { $('#copyUpi').textContent = 'Copy UPI ID'; }, 2200);
});

function updateCountdown() {
  const ms = SANDHYA - Date.now();
  const intro = $('#introCount');
  if (ms <= 0) {
    intro.innerHTML = '<b>Jai Chhathi Maiya!</b> Chhath 2026 is here';
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
  sunLight.color.copy(s.sun);
  sunLight.intensity = Math.max(0, sunV.y) * 6 * s.si + smooth(-3, 2, sky.elev) * 0.6;
  hemi.color.copy(s.zen).lerp(cA.setHex(0xffe0b0), 0.5);
  hemi.groundColor.setHex(0x3a2418);
  hemi.intensity = s.amb * 1.6 + 0.12;
  ghatGlow.intensity = night * 16;
  diyaGlow.uniforms.intensity.value = 0.25 + night * 1.0;
  lightGlow.uniforms.intensity.value = 0.08 + night * 1.0;
  floatGlow.uniforms.intensity.value = 0.6 + night * 0.6;
  ringGlow.uniforms.intensity.value = 0.6 + night * 0.4;
  fireLight.intensity = fireGlow.uniforms.intensity.value * (2 + night * 6);
  return night;
}

function updatePour(dt) {
  const active = performance.now() < pourUntil;
  const pos = pourGeo.attributes.position;
  const fx = -Math.sin(player.facing), fz = -Math.cos(player.facing);
  for (let i = 0; i < POUR_N; i++) {
    const p = pourP[i];
    if (p.life <= 0 && active && Math.random() < 0.5) {
      Object.assign(p, { x: player.x + fx * 0.45 + rand(-0.03, 0.03), y: player.y + 1.6, z: player.z + fz * 0.45 + rand(-0.03, 0.03), vx: fx * 0.7 + rand(-0.1, 0.1), vy: rand(0.2, 0.5), vz: fz * 0.7 + rand(-0.1, 0.1), life: 1.4 });
    }
    if (p.life > 0) {
      p.life -= dt; p.vy -= 6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0) p.life = 0;
    }
    pos.setXYZ(i, p.x, p.life > 0 ? p.y : -50, p.z);
  }
  pos.needsUpdate = true;
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
  for (const gs of glowSets) gs.uniforms.time.value = t;
  for (const k of kosis) { k.level = lerp(k.level, k.lit ? 1 : 0, 1 - Math.exp(-3 * dt)); k.glow.uniforms.intensity.value = k.level * (0.7 + night); }
  ring.material.opacity = 0.45 + 0.35 * Math.sin(t * 2.4);
  ring.scale.setScalar(1 + 0.05 * Math.sin(t * 2.4));
  for (const p of people) {
    p.g.position.y = p.base + Math.sin(t * 0.9 + p.phase) * 0.012;
    if (p.soop) p.soop.position.y = 1.35 + Math.max(0, Math.sin(t * 0.5 + p.phase)) * 0.25;
    if (p.turn != null) { p.g.rotation.y += angleTo(p.g.rotation.y, p.turn) * Math.min(1, dt * 6); }
  }
  ambientTimer -= dt;
  if (night > 0.4 && ambientTimer <= 0) { ambientTimer = rand(0.6, 1.6); launchDiya(rand(-40, 30), rand(-1.6, -0.8)); }
  updateFloaters(dt, t);
  if (petals.visible) {
    const pos = petGeo.attributes.position;
    petP.forEach((p, i) => { p.y -= p.s * dt * 0.9; if (p.y < 0) p.y = rand(10, 16); pos.setXYZ(i, p.x + Math.sin(t * p.s + p.ph) * 0.6, p.y, p.z + Math.cos(t * 0.7 + p.ph) * 0.4); });
    pos.needsUpdate = true;
  }
  // quest marker over the next task
  const target = started ? taskTarget(currentTask()) : null;
  marker.visible = !!target && !player.action;
  if (target) {
    const ty = target === RING ? 0 : groundY(target.z) + (target.talk ? 0.6 : 0);
    marker.position.set(target.x, ty, target.z);
    gem.position.y = 2.6 + Math.sin(t * 2.5) * 0.18; gem.rotation.y = t * 1.5;
    beam.material.opacity = 0.12 + 0.06 * Math.sin(t * 3);
  }
  if (started) {
    if (player.turnCam) {
      const tc = player.turnCam; tc.t = Math.min(1, tc.t + dt / 1.2);
      player.yaw = tc.from + angleTo(tc.from, tc.to) * ease(tc.t);
      player.pitch = lerp(player.pitch, 0.12, 0.05);
      if (tc.t >= 1) player.turnCam = null;
    }
    updatePlayer(dt, t);
    updatePour(dt);
    updatePrompt();
  } else {
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
buildGhat(); buildFarBank(); buildPromenade(); buildAangan(); buildStepDiyas();
makeKosi(-17, 5.6); makeKosi(-5, 3.4); makeKosi(8, 6.4); makeKosi(19, 4.1); makeKosi(31, 7.0); makeKosi(-30, 6.2);
buildStalls(); buildPeople(); setupInteractions();
camera.rotation.order = 'YXZ';
requestAnimationFrame(frame);

Promise.race([document.fonts.load('48px "Yatra One"', 'छठ घाट'), new Promise((r) => setTimeout(r, 2500))])
  .catch(() => {})
  .finally(() => {
    signs.forEach((fn) => fn());
    $('#loading').textContent = '';
    $('#startBtn').disabled = false;
  });
if (isTouch) $('#hintDesk').textContent = 'Left thumb to walk · drag to look · tap the button to interact';

const saved = load();
if (saved && saved.day != null) {
  $('#continueBtn').hidden = false;
  $('#continueBtn').textContent = `Continue: Din ${saved.day + 1}`;
}

function enterGhat() {
  sfx.init();
  started = true;
  buildAvatar();
  $('#intro').classList.add('hide');
  $('#who').classList.add('hide');
  $('#hud').classList.add('on');
}

// who are you
document.querySelectorAll('.who-opt').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.who-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  player.gender = b.dataset.g;
}));
$('#startBtn').addEventListener('click', () => {
  $('#intro').classList.add('hide');
  $('#who').classList.remove('hide');
  setTimeout(() => document.querySelector('.who-opt[aria-pressed="true"]').focus(), 50);
});
$('#whoGo').addEventListener('click', () => {
  player.name = $('#nameIn').value.trim().slice(0, 24);
  state.done.clear(); state.share = 0;
  enterGhat();
  startDay(0);
});
$('#continueBtn').addEventListener('click', () => {
  player.gender = saved.g || 'f'; player.name = saved.name || '';
  state.done = new Set(saved.done || []); state.share = saved.share || 0;
  enterGhat();
  startDay(clamp(saved.day, 0, 3), { fresh: false });
  // resume the sky if the day's arghya was already offered
  if (saved.day === 2 && state.done.has('sandhya')) sky.elev = -14;
  if (saved.day === 3 && state.done.has('usha')) sky.elev = 6;
  if (saved.day === 1 && state.done.has('kheer')) sky.elev = -10;
});

// test hook
window.__ghat = { player, state, get day() { return state.day; }, startDay, complete, kosis, people };
