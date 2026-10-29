// Mavericks wave prototype: one set of the 11 December 2015 swell breaking on the real reef.
// Local frame: origin at Mavericks as published (37.4915 N, 122.5083 W); x east, y north (metres).
// three.js: X = x, Y = up, Z = -y.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Breaker, LIP, LIP_TIP, CREST, NP } from './breaker.js';
import { common, oceanMaterial, waveMaterial, PALETTE, puffMaterial, puffAtlas } from './water.js';
import { Reflection } from './reflect.js';
import * as Swell from './swell.js';
import { Board, buildRider } from './rider.js';
import { Sound } from './sound.js';
import { buildLandmarks } from './landmarks.js';

const $ = id => document.getElementById(id);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the day: ?day=2017-01-21 (one of data/days.json); the default is 11 December 2015
const DAY = new URLSearchParams(location.search).get('day');
const [wave, tmeta, tbuf, dayList] = await Promise.all([
  fetch(DAY && /^[0-9-]+$/.test(DAY) ? `data/days/${DAY}.json` : 'data/wave.json').then(r => r.ok ? r.json() : fetch('data/wave.json').then(q => q.json())),
  fetch('data/terrain.json').then(r => r.json()),
  fetch('data/terrain.bin').then(r => r.arrayBuffer()),
  fetch('data/days.json').then(r => r.json()).catch(() => []),
]);
const terr = new Float32Array(tbuf);
const SEA = wave.tide_m_navd88;                         // water level, m above NAVD88

// ---- numbers from the wave model and the descriptions of the break ----
const C = wave.set_wave.speed_m_s;                      // how fast a breaking wave travels
const T = wave.buoy.period_s;
const HSET = wave.set_wave.height_m;
const NSET = 4;                                         // at most four waves in a set (one strip each)
const A = THREE.MathUtils.degToRad(wave.travel_deg_ccw_from_east);
const DIR = [Math.cos(A), Math.sin(A)], NRM = [-Math.sin(A), Math.cos(A)];
// the takeoff ("the Corner"): the north end of the model's break line on the 2015 run, 67 m east and
// 45 m north of the published spot. It is a place on the reef, so on other days (swells from other
// directions) it stays there and only the wave's frame turns round it.
const CORNER = [67.2, 44.5];
const U_PK = CORNER[0] * DIR[0] + CORNER[1] * DIR[1], V_PK = CORNER[0] * NRM[0] + CORNER[1] * NRM[1];
const DUDV = 2.0;                                       // the break point runs 1 m along the crest per 2 m the wave travels
const WALL = 220;                                       // metres of wall to the south before the channel
const LEFT = 90;                                        // the short left to the north
const U0 = -460, U_END = 1300;
const PEEL = C / DUDV;

// ---- terrain lookups ----
function elev(x, y) {                                   // m above NAVD88
  const fx = (x - tmeta.x0) / tmeta.cell, fy = (y - tmeta.y0) / tmeta.cell;
  if (fx < 0 || fy < 0 || fx >= tmeta.nx - 1 || fy >= tmeta.ny - 1) return -60;
  const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, n = tmeta.nx;
  return terr[j * n + i] * (1 - a) * (1 - b) + terr[j * n + i + 1] * a * (1 - b) +
         terr[(j + 1) * n + i] * (1 - a) * b + terr[(j + 1) * n + i + 1] * a * b;
}
const toXY = (u, v) => [DIR[0] * u + NRM[0] * v, DIR[1] * u + NRM[1] * v];
const W3 = (x, y, h) => new THREE.Vector3(x, h, -y);

// ---- renderer, scene, sky ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Quality steps: 2 full (sharp, all the spray), 1 medium, 0 low (for phones and slow laptops).
// The game starts at the step that suits the device and moves down a step while frames are slow
// (and back up when there is room); ?quality=0, 1 or 2 fixes it.
const QP = new URLSearchParams(location.search).get('quality');
const coarse = matchMedia('(pointer: coarse)').matches;
const Q = { level: QP !== null ? +QP : coarse ? 1 : 2, fixed: QP !== null, fx: 1 };
function setQuality(l) {
  Q.level = Math.max(0, Math.min(2, l));
  renderer.setPixelRatio([0.75, Math.min(devicePixelRatio, 1.25), Math.min(devicePixelRatio, 2)][Q.level]);
  renderer.setSize(innerWidth, innerHeight);
  Q.fx = [0.35, 0.65, 1][Q.level];
  if (typeof refl !== 'undefined') refl.setScale(PALETTE.reflectSize[Q.level]);
}
setQuality(Q.level);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 30000);

const el = THREE.MathUtils.degToRad(wave.sun.elevation_deg), az = THREE.MathUtils.degToRad(wave.sun.azimuth_deg);
const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
common.uSunDir.value.copy(sunDir);
common.uSea.value = SEA;

const sky = new Sky(); sky.scale.setScalar(20000);
Object.assign(sky.material.uniforms, {});
sky.material.uniforms.turbidity.value = PALETTE.haze.turbidity;
sky.material.uniforms.rayleigh.value = PALETTE.haze.rayleigh;
sky.material.uniforms.mieCoefficient.value = PALETTE.haze.mie;
sky.material.uniforms.mieDirectionalG.value = 0.8;
sky.material.uniforms.sunPosition.value.copy(sunDir);
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
const skyScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000);
for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = sky.material.uniforms[k].value;
sky2.material.uniforms.sunPosition.value.copy(sunDir); skyScene.add(sky2);
scene.environment = pmrem.fromScene(skyScene).texture;

const sun = new THREE.DirectionalLight(0xffe2c4, 2.2); sun.position.copy(sunDir).multiplyScalar(1000); scene.add(sun);
scene.add(new THREE.HemisphereLight(0x9ab8d8, 0x4a4030, 0.6));
// the same haze over the cliffs, rocks and surfer as over the water (the sky dome stays clear of it)
scene.fog = new THREE.FogExp2(common.uFogColor.value.clone(), PALETTE.haze.fogDensity);

// ---- terrain: land and rocks (the seabed is under the opaque sea) ----
{
  const S = 2, nx = Math.floor((tmeta.nx - 1) / S) + 1, ny = Math.floor((tmeta.ny - 1) / S) + 1;
  const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3);
  const cSand = new THREE.Color(0.62, 0.55, 0.42), cRock = new THREE.Color(0.32, 0.29, 0.25),
        cScrub = new THREE.Color(0.36, 0.38, 0.22), cWet = new THREE.Color(0.18, 0.16, 0.13), c = new THREE.Color();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = tmeta.x0 + i * S * tmeta.cell, y = tmeta.y0 + j * S * tmeta.cell, z = terr[(j * S) * tmeta.nx + i * S];
    const k = j * nx + i; pos[3 * k] = x; pos[3 * k + 1] = Math.max(z, SEA - 30); pos[3 * k + 2] = -y;
    const dzx = elev(x + 6, y) - elev(x - 6, y), dzy = elev(x, y + 6) - elev(x, y - 6);
    const slope = Math.hypot(dzx, dzy) / 12;
    const above = z - SEA;
    if (above < 0.8) c.copy(cWet);
    else if (slope > 0.7) c.copy(cRock);
    else if (above < 4 && slope < 0.25) c.copy(cSand);
    else c.copy(cScrub).lerp(cRock, smooth(0.35, 0.7, slope));
    c.multiplyScalar(0.9 + 0.2 * Math.sin(x * 0.37 + y * 0.21) * Math.sin(y * 0.13));
    col[3 * k] = c.r; col[3 * k + 1] = c.g; col[3 * k + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = j * nx + i, b = a + 1, c2 = a + nx, d = c2 + 1; idx.push(a, b, c2, b, d, c2);   // faces up (north is -z)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.5 })));
}

// ---- the rocks inside the break and the station on Pillar Point (landmarks.js) ----
const marks = buildLandmarks(scene, { elev, W3, sea: SEA });

// ---- depth and foam maps for the water shaders ----
{
  const n = 512, data = new Uint8Array(n * n);
  const x0 = tmeta.x0, y0 = tmeta.y0, w = (tmeta.nx - 1) * tmeta.cell, h = (tmeta.ny - 1) * tmeta.cell;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = SEA - elev(x0 + (i + 0.5) / n * w, y0 + (j + 0.5) / n * h);
    data[j * n + i] = Math.max(0, Math.min(255, Math.round(d / 40 * 255)));
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  common.uDepth.value = tex; common.uDepthRect.value.set(x0, y0, w, h);
}
const FOAM = { n: 512, x0: -900, y0: -1300, size: 2000 };
FOAM.f = new Float32Array(FOAM.n * FOAM.n); FOAM.b = new Uint8Array(FOAM.n * FOAM.n);
FOAM.tex = new THREE.DataTexture(FOAM.b, FOAM.n, FOAM.n, THREE.RedFormat);
FOAM.tex.magFilter = FOAM.tex.minFilter = THREE.LinearFilter; FOAM.tex.needsUpdate = true;
common.uFoam.value = FOAM.tex; common.uFoamRect.value.set(FOAM.x0, FOAM.y0, FOAM.size, FOAM.size);
function stamp(x, y, amount, r = 2) {
  const s = FOAM.n / FOAM.size, ci = Math.round((x - FOAM.x0) * s), cj = Math.round((y - FOAM.y0) * s);
  for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
    if (i < 0 || j < 0 || i >= FOAM.n || j >= FOAM.n) continue;
    const k = j * FOAM.n + i; if (FOAM.f[k] < amount) FOAM.f[k] = amount;
  }
}

// ---- the sea and the set ----
// the detailed sea round the reef (moves with the background swell) and a flat sheet beyond it
const oceanNear = new THREE.Mesh(new THREE.PlaneGeometry(2 * Swell.HALF, 2 * Swell.HALF, 560, 560), oceanMaterial(NSET, true));
oceanNear.rotation.x = -Math.PI / 2; oceanNear.position.set(Swell.CENTER[0], SEA, -Swell.CENTER[1]);
oceanNear.frustumCulled = false; scene.add(oceanNear);
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), oceanMaterial(NSET, false));
ocean.rotation.x = -Math.PI / 2; ocean.position.y = SEA; scene.add(ocean);
const oceans = [ocean, oceanNear];
for (const o of oceans) o.material.uniforms.uDir.value.set(DIR[0], DIR[1]);
// reflections: the scene mirrored in the sea's flat surface, minus the sea and the sky dome
var refl = new Reflection(renderer, scene, SEA, [...oceans, sky]);
refl.setScale(PALETTE.reflectSize[Q.level]);
common.uCrest.value.set(NRM[0], NRM[1]);
// the background sea's height at a point, as the shader works it out
const bg = (x, y) => { const f = Swell.fade(SEA - elev(x, y), x, y); return f > 0 ? f * Swell.height(x, y, clock) : 0; };

const stations = [];
for (let v = -1300; v < -450; v += 20) stations.push(v);
for (let v = -450; v < -220; v += 5) stations.push(v);
for (let v = -220; v < 170; v += 3) stations.push(v);    // the wall and the peak, where the lip throws
for (let v = 170; v < 260; v += 5) stations.push(v);
for (let v = 260; v <= 900; v += 20) stations.push(v);
for (const o of oceans) o.material.uniforms.uVRange.value.set(stations[0] + 60, stations[stations.length - 1] - 60);
const wmat = waveMaterial();
const waves = Array.from({ length: NSET }, (_, k) => {
  const b = new Breaker(stations, wmat); b.k = k; b.H0 = HSET; b.t0 = k * T; b.off = false;
  b.broke = new Float64Array(stations.length);
  scene.add(b.mesh); return b;
});

// Each set is drawn afresh from the buoy's statistics. Wave heights at sea follow the Rayleigh
// distribution: the chance a wave is higher than h is exp(-2 (h/Hs)^2). A set is the big waves of
// that distribution, here those over 1.3 Hs (one wave in thirty), three or four in a row (the biggest usually in the
// middle), about one period apart. The model's set wave is H1/100 = 1.67 Hs, so a wave x Hs high
// at sea breaks x / 1.67 times as high as the model's set wave: from about 0.78 to 1.2 of it.
let clock = 0, setStart = 2, paused = false, speed = 1, lull = 30, setNo = 0;
function resetSet(t) {
  setStart = t; setNo++;
  const n = Math.random() < 0.6 ? 4 : 3;
  const x = Array.from({ length: n }, () => Math.min(2.0, Math.sqrt(1.69 - Math.log(Math.random()) / 2))).sort((a, b) => a - b);
  // smallest first and last, the biggest second or third
  const order = n === 4 ? [x[0], x[3], x[2], x[1]] : [x[1], x[2], x[0]];
  if (Math.random() < 0.4) [order[1], order[2]] = [order[2], order[1]];
  let t0 = 0;
  waves.forEach((b, k) => {
    b.broke.fill(NaN); b.off = k >= n;
    if (b.off) return;
    b.H0 = HSET * order[k] / 1.67; b.t0 = t0;
    t0 += T * (0.85 + 0.3 * Math.random());
  });
  lull = 20 + 25 * Math.random();                         // the wait after the set (it can be many minutes at the real spot)
}
resetSet(-14);

// height along the crest for wave of height H0 (station v), before shoaling and caps
function crestHeight(H0, v) {
  const south = V_PK - v;
  let f;
  if (south >= 0) f = south <= WALL ? 1 - 0.22 * south / WALL : 0.78 - 0.33 * smooth(0, 160, south - WALL);
  else f = -south <= LEFT ? 1 - 0.3 * smooth(0, LEFT, -south) : 0.7 - 0.2 * smooth(0, 200, -south - LEFT);
  f *= smooth(stations[0], stations[0] + 350, v) * smooth(stations[stations.length - 1], stations[stations.length - 1] - 350, v);
  return H0 * f;
}
// where along the travel each part of the crest starts to break. Past the ends of the wall and
// of the left the line carries on (so the wave's shape stays smooth along the crest), but those
// parts never break there: `real` is false.
function breakLine(v) {
  const south = V_PK - v;
  if (south >= 0) return south <= WALL ? { u: U_PK + DUDV * south, real: true } : { u: U_PK + DUDV * WALL + 3 * (south - WALL), real: false };
  return -south <= LEFT ? { u: U_PK + 0.8 * -south, real: true } : { u: U_PK + 0.8 * LEFT + 3 * (-south - LEFT), real: false };
}

// how hard each part breaks: full on the wall, fading toward the channel and along the short left
function breakPower(v) {
  const south = V_PK - v;
  if (south >= 0) return south <= WALL ? 1 - 0.85 * smooth(WALL - 70, WALL, south) : 0.15;
  return -south <= LEFT ? 1 - 0.9 * smooth(LEFT * 0.3, LEFT, -south) : 0.1;
}
// the wave breaking on the wall now, or else the next one coming in
function currentWave() {
  for (const b of waves) if (b.active && b.u < U_PK + DUDV * (WALL - 70)) return b;   // still on the strong part of the wall
  return null;
}
// the station (section) nearest a position along the crest
function stationAt(v) {
  let lo = 0, hi = stations.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (stations[m] <= v) lo = m; else hi = m; }
  return v - stations[lo] > stations[hi] - v ? hi : lo;
}
// height of the sea surface above the flat sea at a point (x east, y north); with `near`,
// the surface nearest that height where the water folds over (the face under the lip)
const FR = { dir: DIR, nrm: NRM, sea: SEA };
// Blended between the two sections either side of the point: taking the nearest one alone made
// the height jump each time the board crossed from one section to the next.
function surface(x, y, near) {
  const u = x * DIR[0] + y * DIR[1], v = x * NRM[0] + y * NRM[1];
  let lo = 0, hi = stations.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (stations[m] <= v) lo = m; else hi = m; }
  const a = Math.min(1, Math.max(0, (v - stations[lo]) / (stations[hi] - stations[lo])));
  let h = null;                                          // a strip's surface already includes the background sea
  for (const b of waves) {
    if (!b.active || Math.abs(u - b.u) > 150) continue;
    const y1 = b.heightAt(lo, u - b.u, FR, near), y3 = b.heightAt(hi, u - b.u, FR, near);
    const y2 = y1 === null ? y3 : y3 === null ? y1 : y1 * (1 - a) + y3 * a;
    if (y2 !== null && (h === null || (near === undefined ? y2 > h : Math.abs(y2 - near) < Math.abs(h - near)))) h = y2;
  }
  return h === null ? bg(x, y) : h;
}
// the wave at a point: which one, its section, how far ahead of its crest, its stage
function waveAt(x, y) {
  const u = x * DIR[0] + y * DIR[1], v = x * NRM[0] + y * NRM[1];
  const s = stationAt(v);
  let best = null;
  for (const b of waves) {
    if (!b.active || Math.abs(u - b.u) > 150) continue;
    if (!best || Math.abs(u - b.u) < Math.abs(best.xrel)) best = { b, s, v, xrel: u - b.u, tau: b.tau[s], H: b.H[s], power: breakPower(v) };
  }
  return best;
}
// the water's own forward motion under a wave. Shallow-water theory gives u = C eta / (depth + eta);
// near breaking the crest's water speeds up until it moves as fast as the wave (the kinematic
// definition of breaking), and in the whitewater it is carried along at about the wave's speed.
// A train of waves also has a slow flow back out to sea under its troughs, which cancels most
// of the forward drift: without it each set wave would carry a floating surfer some 30 m in.
function water(x, y, h) {
  const d = Math.max(1, SEA - elev(x, y));
  const wv = waveAt(x, y);
  let w = h > 0.2 ? C * h / (d + h) : 0;
  if (wv && wv.H > 1) {
    if (wv.xrel > -2) {                                           // the front of the wave, not its back
      const top = smooth(0.35, 0.9, h / wv.H);                     // the upper part of the wave
      const breaking = wv.tau < LIP ? smooth(-1.5, 0, wv.tau) : 1;
      w = Math.min(C, w * (1 + 1.3 * breaking * top));
    }
    w -= C * 0.12 * wv.H / (d + 0.5 * wv.H);                      // the return flow
  }
  return [DIR[0] * w, DIR[1] * w];
}

const DEPTH = new Float32Array(stations.length), DEPTH_S = new Float32Array(stations.length);
function updateWaves(t) {
  for (const b of waves) {
    const u = U0 + C * (t - setStart - b.t0);
    b.u = u;
    b.active = !b.off && u > U0 - 1 && u < U_END;
    b.mesh.visible = b.active;
    if (!b.active) continue;
    // depth under the crest, smoothed along it over about 40 m: the reef's ledge would otherwise
    // change the wave's width abruptly from one section to the next
    for (let s = 0; s < stations.length; s++) { const [x, y] = toXY(u, stations[s]); DEPTH[s] = SEA - elev(x, y); }
    for (let s = 0; s < stations.length; s++) {
      let sum = 0, n = 0;
      for (let j = s - 1; j >= 0 && stations[s] - stations[j] <= 20; j--) { sum += DEPTH[j]; n++; }
      for (let j = s; j < stations.length && stations[j] - stations[s] <= 20; j++) { sum += DEPTH[j]; n++; }
      DEPTH_S[s] = sum / n;
    }
    b.update({
      u, sea: SEA, dir: DIR, nrm: NRM, bg,
      section: (v, s) => {
        const depth = DEPTH_S[s];
        let H = crestHeight(b.H0, v);
        const bl = breakLine(v);
        if (isNaN(b.broke[s])) {
          if (bl.real && u >= bl.u) b.broke[s] = t - (u - bl.u) / C;   // the break on the reef
          // too shallow for it: it breaks here (on the wall itself only over the rocks inside, so the peel stays in order)
          else if (depth < H / 0.78 * (bl.real ? 0.6 : 0.95) && depth > 0.3 && u > -200) b.broke[s] = t;
        }
        let tau = isNaN(b.broke[s]) ? (u - bl.u) / C : t - b.broke[s];
        if (isNaN(b.broke[s]) && !bl.real && tau > -0.6) tau = -0.6 - (tau + 0.6) * 0.8;   // the channel: it backs off
        H *= 0.6 + 0.4 * smooth(-28, 0, tau);                        // shoaling up to the break
        return { H, tau, depth, power: breakPower(v) };
      },
    });
  }
  for (const o of oceans) {
    const bands = o.material.uniforms.uBands.value;
    waves.forEach((b, i) => bands[i].set(b.u, 152, b.active ? 1 : 0, 0));
  }
}

// ---- spray ----
const MAXP = 7000;
const sp = { pos: new Float32Array(MAXP * 3), vel: new Float32Array(MAXP * 3), age: new Float32Array(MAXP), life: new Float32Array(MAXP), col: new Float32Array(MAXP * 4), next: 0 };
sp.age.fill(1e9);
const spGeo = new THREE.BufferGeometry();
spGeo.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3).setUsage(THREE.DynamicDrawUsage));
spGeo.setAttribute('color', new THREE.BufferAttribute(sp.col, 4).setUsage(THREE.DynamicDrawUsage));
const dot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const spray = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 3.2, map: dot, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
spray.frustumCulled = false; scene.add(spray);
function emit(p, vx, vy, vz, life) {
  const i = sp.next; sp.next = (sp.next + 1) % MAXP;
  sp.pos[3 * i] = p[0]; sp.pos[3 * i + 1] = p[1]; sp.pos[3 * i + 2] = p[2];
  sp.vel[3 * i] = vx; sp.vel[3 * i + 1] = vy; sp.vel[3 * i + 2] = vz; sp.age[i] = 0; sp.life[i] = life;
}
function updateSpray(dt) {
  const D = new THREE.Vector3(DIR[0], 0, -DIR[1]);
  for (const b of waves) {
    if (!b.active) continue;
    for (let s = 0; s < stations.length; s++) {
      const tau = b.tau[s], H = b.H[s];
      if (H < 3) continue;
      const rate = (tau > LIP - 0.25 && tau < LIP + 0.7) ? 70 : (tau > 0 && tau < LIP) ? 6 : (tau > LIP && tau < LIP + 9) ? 10 * Math.exp(-(tau - LIP) / 4) : 0;
      let n = rate * dt * (H / 12) * Q.fx; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      // feathering: as the crest stands up just before it pitches, wisps of spray tear off its
      // top and blow back over the wave on the light offshore wind
      const power = breakPower(stations[s]);
      const fr = tau > -2.5 && tau <= 0.3 && power > 0.4 ? 45 * smooth(-2.5, -0.4, tau) * power * PALETTE.crestSpray : 0;
      let nf = fr * dt * (H / 12) * Q.fx; nf = Math.floor(nf) + (Math.random() < nf % 1 ? 1 : 0);
      for (let q = 0; q < nf; q++) {
        const p = b.point(s, CREST + 2), along = (Math.random() - 0.5) * 3, back = -4 - Math.random() * 6;
        emit([p[0] + NRM[0] * along, p[1] + 0.3, p[2] - NRM[1] * along],
             D.x * back + (Math.random() - 0.5) * 1.5, 2 + Math.random() * 4, D.z * back + (Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 1.6);
      }
      for (let q = 0; q < n; q++) {
        const impact = tau > LIP - 0.25 && tau < LIP + 0.7;
        const p = b.point(s, impact ? LIP_TIP : (tau < LIP ? LIP_TIP : CREST));
        const up = impact ? 6 + Math.random() * 0.9 * H : tau < LIP ? 1 + Math.random() * 3 : 2 + Math.random() * 6;
        const fw = (impact ? 2 : -6) + Math.random() * 6;                 // light offshore wind blows crest spray back
        emit([p[0] + (Math.random() - 0.5) * 4, p[1], p[2] + (Math.random() - 0.5) * 4],
             D.x * fw + (Math.random() - 0.5) * 5, up, D.z * fw + (Math.random() - 0.5) * 5, 1.5 + Math.random() * 2.5);
      }
    }
  }
  for (let i = 0; i < MAXP; i++) {
    const a = (sp.age[i] += dt), L = sp.life[i];
    if (a > L) { sp.col[4 * i + 3] = 0; continue; }
    sp.vel[3 * i + 1] -= 9.81 * dt;
    const drag = Math.exp(-0.6 * dt);
    sp.vel[3 * i] *= drag; sp.vel[3 * i + 1] *= drag; sp.vel[3 * i + 2] *= drag;
    sp.pos[3 * i] += sp.vel[3 * i] * dt; sp.pos[3 * i + 1] += sp.vel[3 * i + 1] * dt; sp.pos[3 * i + 2] += sp.vel[3 * i + 2] * dt;
    if (sp.pos[3 * i + 1] < SEA) { sp.pos[3 * i + 1] = SEA; sp.vel[3 * i + 1] = 0; }
    const fade = Math.min(1, a / 0.2) * (1 - a / L);
    sp.col[4 * i] = sp.col[4 * i + 1] = sp.col[4 * i + 2] = 1; sp.col[4 * i + 3] = 0.55 * fade;
  }
  spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
}

// ---- mist: a soft cloud rising off the whitewater, drifting back on the light offshore wind ----
const MAXM = 2600;
const mi = { pos: new Float32Array(MAXM * 3), vel: new Float32Array(MAXM * 3), age: new Float32Array(MAXM).fill(1e9),
             life: new Float32Array(MAXM), col: new Float32Array(MAXM * 4), next: 0 };
const miGeo = new THREE.BufferGeometry();
miGeo.setAttribute('position', new THREE.BufferAttribute(mi.pos, 3).setUsage(THREE.DynamicDrawUsage));
miGeo.setAttribute('color', new THREE.BufferAttribute(mi.col, 4).setUsage(THREE.DynamicDrawUsage));
const mist = new THREE.Points(miGeo, new THREE.PointsMaterial({ size: 14, map: dot, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
mist.frustumCulled = false; scene.add(mist);
const BORE_FRONT = NP - 50 + 3;                          // a point on the whitewater's front shoulder
function updateMist(dt) {
  const D = new THREE.Vector3(DIR[0], 0, -DIR[1]);
  for (const b of waves) {
    if (!b.active) continue;
    for (let s = 0; s < stations.length; s++) {
      const tau = b.tau[s], H = b.H[s];
      if (H < 3 || !(tau > LIP - 0.2) || tau > LIP + 14) continue;
      const rate = (tau < LIP + 0.8 ? 10 : 3.5 * Math.exp(-(tau - LIP) / 6)) * (H / 12) * (stations[s + 1] !== undefined ? (stations[s + 1] - stations[s]) / 5 : 1);
      let n = rate * dt * Q.fx; n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      for (let q = 0; q < n; q++) {
        const p = b.point(s, Math.random() < 0.5 ? BORE_FRONT : CREST);
        const i = mi.next; mi.next = (mi.next + 1) % MAXM;
        mi.pos[3 * i] = p[0] + (Math.random() - 0.5) * 6; mi.pos[3 * i + 1] = p[1] + Math.random() * 2; mi.pos[3 * i + 2] = p[2] + (Math.random() - 0.5) * 6;
        const back = -2 - Math.random() * 3;
        mi.vel[3 * i] = D.x * back + (Math.random() - 0.5) * 2; mi.vel[3 * i + 1] = 1.5 + Math.random() * 3; mi.vel[3 * i + 2] = D.z * back + (Math.random() - 0.5) * 2;
        mi.age[i] = 0; mi.life[i] = 4 + Math.random() * 5;
      }
    }
  }
  const drag = Math.exp(-0.8 * dt);
  for (let i = 0; i < MAXM; i++) {
    const a = (mi.age[i] += dt), L = mi.life[i];
    if (a > L) { mi.col[4 * i + 3] = 0; continue; }
    mi.vel[3 * i + 1] = mi.vel[3 * i + 1] * drag - 0.3 * dt;
    mi.vel[3 * i] *= drag; mi.vel[3 * i + 2] *= drag;
    mi.pos[3 * i] += mi.vel[3 * i] * dt; mi.pos[3 * i + 1] += mi.vel[3 * i + 1] * dt; mi.pos[3 * i + 2] += mi.vel[3 * i + 2] * dt;
    const fade = Math.min(1, a / 0.8) * Math.pow(1 - a / L, 1.5);
    mi.col[4 * i] = mi.col[4 * i + 1] = mi.col[4 * i + 2] = 0.95; mi.col[4 * i + 3] = 0.16 * fade;
  }
  miGeo.attributes.position.needsUpdate = true; miGeo.attributes.color.needsUpdate = true;
}

// ---- foam puffs: big grainy clumps riding on the whitewater ----
// Each is pinned to a point of a broken section (from the foam top to the front of the bore),
// so it moves with the wave; it swells as the lip lands, boils gently, and fades as the
// whitewater ages. Its place, size and picture come from a fixed random number per wave,
// section and slot, so the same puffs stay put from frame to frame (and in a replay).
const PUFF_SLOTS = 3, MAXPUFF = 2400;
const PUFF_I0 = CREST, PUFF_I1 = NP - 20;               // the foam top to the bore's toe
const pf = { pos: new Float32Array(MAXPUFF * 3), size: new Float32Array(MAXPUFF), alpha: new Float32Array(MAXPUFF),
             cell: new Float32Array(MAXPUFF), rot: new Float32Array(MAXPUFF) };
const pfGeo = new THREE.BufferGeometry();
pfGeo.setAttribute('position', new THREE.BufferAttribute(pf.pos, 3).setUsage(THREE.DynamicDrawUsage));
for (const k of ['size', 'alpha', 'cell', 'rot']) pfGeo.setAttribute(k, new THREE.BufferAttribute(pf[k], 1).setUsage(THREE.DynamicDrawUsage));
const pfMat = puffMaterial(puffAtlas());
const puffs = new THREE.Points(pfGeo, pfMat);
puffs.frustumCulled = false; scene.add(puffs);
const hr = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
function updatePuffs(t) {
  let n = 0;
  const amt = PALETTE.puffs, slots = Math.max(1, Math.round(PUFF_SLOTS * Q.fx));
  if (amt > 0) for (const b of waves) {
    if (!b.active) continue;
    for (let s = 0; s < stations.length && n < MAXPUFF; s++) {
      const tau = b.tau[s], H = b.H[s];
      if (!(tau > LIP - 0.3) || tau > LIP + 16 || H < 2) continue;
      const grow = smooth(LIP - 0.3, LIP + 1.2, tau), age = Math.exp(-(tau - LIP) / 9);
      const gap = s + 1 < stations.length ? stations[s + 1] - stations[s] : 5;
      for (let j = 0; j < slots && n < MAXPUFF; j++) {
        const key = (setNo * 7 + b.k) * 100003 + s * 31 + j;
        const r1 = hr(key), r2 = hr(key + 0.37), r3 = hr(key + 0.71), r4 = hr(key + 0.13);
        const p = b.point(s, PUFF_I0 + Math.floor(r1 * (PUFF_I1 - PUFF_I0)));
        const side = (r2 - 0.5) * gap;                   // spread along the crest between sections
        pf.pos[3 * n] = p[0] + NRM[0] * side; pf.pos[3 * n + 2] = p[2] - NRM[1] * side;
        const sz = H * (0.35 + 0.4 * r3) * (0.5 + 0.5 * grow) * (1 + 0.12 * Math.sin(t * 1.3 + r4 * 6.28));
        pf.pos[3 * n + 1] = Math.max(p[1] + sz * 0.18, SEA + sz * 0.15);
        pf.size[n] = sz;
        pf.alpha[n] = amt * smooth(LIP - 0.3, LIP + 0.5, tau) * age * (0.55 + 0.45 * r4);
        pf.cell[n] = Math.floor(r2 * 4) % 4;
        pf.rot[n] = (r3 - 0.5) * 0.8 + 0.05 * Math.sin(t * 0.7 + r1 * 6.28);
        n++;
      }
    }
  }
  pfGeo.setDrawRange(0, n);
  for (const k of ['position', 'size', 'alpha', 'cell', 'rot']) pfGeo.attributes[k].needsUpdate = true;
  // sprite size in pixels per metre at one metre away
  pfMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

// ---- foam left behind ----
let foamTimer = 0;
function updateFoam(dt) {
  // white water round the rocks: some always (the background swell washing over them), a lot while
  // a broken wave runs through
  marks.wash(dt, clock, (x, y) => SEA + surface(x, y), r => {
    const u = r.x * DIR[0] + r.y * DIR[1];
    let a = 0.35 + 0.4 * Math.max(0, bg(r.x, r.y) / 0.8);
    for (const b of waves) if (b.active && u - b.u > -15 && u - b.u < 40) a = 1;
    return a;
  });
  for (const b of waves) {
    if (!b.active) continue;
    for (let s = 0; s < stations.length; s++) {
      const tau = b.tau[s]; if (!(tau > LIP - 0.3)) continue;
      const amt = Math.min(1, Math.exp(-(tau - LIP) / 30) * smooth(1.5, 6, b.H[s]) * 1.2);
      for (const i of [CREST, NP - 40, NP - 30]) { const p = b.point(s, i); stamp(p[0], -p[2], amt, 2); }
    }
  }
  foamTimer += dt;
  if (foamTimer > 0.1) {                                 // ten times a second: fade old foam, send the map
    const k = Math.exp(-foamTimer / 40);
    foamTimer = 0;
    for (let i = 0; i < FOAM.f.length; i++) { const f = FOAM.f[i] *= k; FOAM.b[i] = f >= 1 ? 255 : f * 255; }
    FOAM.tex.needsUpdate = true;
  }
}

// ---- views ----
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enabled = false;
const peakXY = toXY(U_PK, V_PK);
let view = 'cliff';
const cliff = (() => {                                  // the bluff on Pillar Point where people watch from
  let best = null;
  for (let x = -200; x < 1600; x += 12) for (let y = -300; y < 1400; y += 12) {
    const z = elev(x, y); if (z < SEA + 18) continue;
    const d = Math.hypot(x - peakXY[0], y - peakXY[1]);
    if (!best || d < best.d) best = { x, y, z, d };
  }
  return best;
})();
function setView(name) {
  view = name; controls.enabled = name === 'free';
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  const look = W3(peakXY[0] + 40, peakXY[1] - 60, SEA + 6);
  if (name === 'cliff') { camera.position.copy(W3(cliff.x, cliff.y, cliff.z + 2)); camera.fov = 16; camera.lookAt(look); }   // a long lens, as photographers there use
  if (name === 'channel') { const [x, y] = toXY(240, V_PK - WALL - 140); camera.position.copy(W3(x, y, SEA + 5)); camera.fov = 45; camera.lookAt(W3(peakXY[0], peakXY[1] - 60, SEA + 8)); }
  if (name === 'lineup') { const [x, y] = toXY(U_PK - 70, V_PK - 25); camera.position.copy(W3(x, y, SEA + 1.2)); camera.fov = 60; camera.lookAt(W3(x - 400, y + 30, SEA + 6)); }
  if (name === 'aerial') { camera.position.copy(W3(peakXY[0] - 380, peakXY[1] - 520, SEA + 210)); camera.fov = 50; camera.lookAt(W3(peakXY[0] + 260, peakXY[1] + 160, SEA)); }
  if (name === 'ride') camera.fov = 72;
  if (name === 'surf') { camera.fov = 62; camInit = false; }
  $('ride').hidden = $('pad').hidden = $('gauges').hidden = name !== 'surf';
  rider.group.visible = name === 'surf';
  if (name === 'free') { controls.target.copy(look); }
  camera.updateProjectionMatrix();
}
const rideCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ok: false };
function updateRide(dt) {
  // follow the curl of the wave now breaking: stand on the face just ahead of it, look back in
  let best = null;
  const b = currentWave();
  if (b) for (let s = 0; s < stations.length; s++) {
    const tau = b.tau[s], v = stations[s];
    if (v > V_PK || V_PK - v > WALL) continue;
    if (tau > 0.2 && tau < 1.8 && (!best || v < best.v)) best = { b, s, v };
  }
  if (!best) return;
  // stand on the open face ahead of the curl, look back along the wave into it
  const aheadV = best.v - 45;
  const Hb = best.b.H[best.s];
  const [ax, ay] = toXY(best.b.u + 1.3 * Hb, aheadV);
  const hs = surface(ax, ay);
  const pos = W3(ax, ay, SEA + Math.max(hs, 0) + 2.2);
  const curl = best.b.point(Math.min(stations.length - 1, best.s + 3), LIP_TIP);
  const look = new THREE.Vector3(...curl).add(new THREE.Vector3(DIR[0], 0, -DIR[1]).multiplyScalar(-0.5 * Hb)); look.y -= 3;
  if (!rideCam.ok) { rideCam.pos.copy(pos); rideCam.look.copy(look); rideCam.ok = true; }
  const k = 1 - Math.exp(-dt * 4); rideCam.pos.lerp(pos, k); rideCam.look.lerp(look, k);
  camera.position.copy(rideCam.pos); camera.lookAt(rideCam.look);
}

// ---- the surfer ----
const rider = buildRider(); scene.add(rider.group);
const board = new Board();
const keys = {};
const touch = { left: false, right: false, paddle: false };
let best = 0;
try { best = +localStorage.getItem('mavericks:best') || 0; } catch {}
function toLineup(out = 30) {
  if (typeof $ === 'function' && $('replayBtn')) $('replayBtn').hidden = true;
  // sitting 30 m outside the Corner, facing the shore, as the set comes. Closer in, the first wave
  // of the set sucks you up its face; each wave that passes under you pushes you a few metres in.
  const [x, y] = toXY(U_PK - out, V_PK + 4);
  board.reset(x, y, A);
  board.msg = 'Sitting just outside the Corner. A set will come: when the wave you want is close behind you, paddle (↑) toward the shore. Waves you let go push you in: turn round and paddle back out between them.';
}
toLineup();
addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === 'r' || e.key === 'R') toLineup();
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key] = false; });
for (const [id, k] of [['padL', 'left'], ['padR', 'right'], ['padP', 'paddle']]) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { touch[k] = true; el.classList.add('held'); el.setPointerCapture?.(e.pointerId); e.preventDefault(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { touch[k] = false; el.classList.remove('held'); });
  el.addEventListener('contextmenu', e => e.preventDefault());
}
$('padBack').onclick = () => toLineup();
let assistOn = true;
$('assist').onclick = () => { assistOn = !assistOn; $('assist').classList.toggle('on', assistOn); };

// the assist: with no steering, hold the middle of the face and run along the wall to the south.
// Over the ground that means moving with the wave (C toward the shore) and along it at the peel's
// speed: a heading about 27 degrees south of the wave's direction, a little lower when too high.
function assist(bd) {
  const w = waveAt(bd.x, bd.y); if (!w) return 0;
  const target = 0.5 * w.H;
  const k = Math.max(-0.35, Math.min(0.35, 0.05 * (target - w.xrel)));    // too high: go down; too low: go up
  // ahead of the curl: under a throwing lip (tau > 0 here), run harder along the line to get out
  const along = PEEL * (1.15 + 0.7 * Math.max(0, Math.min(2.5, w.tau + 0.6)));
  const dx = DIR[0] * C * (1 + k) - NRM[0] * along, dy = DIR[1] * C * (1 + k) - NRM[1] * along;
  let d = Math.atan2(dy, dx) - bd.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.max(-1, Math.min(1, d * 2.5));
}

// what the wave does to the surfer: catching it, the barrel, the wipeouts, the channel
const LANDING = (H, power) => Math.max(0.78 * H * power, 1.5) + 1;
function judge(dt) {
  const w = waveAt(board.x, board.y);
  const vAlong = board.vx * DIR[0] + board.vy * DIR[1];
  const vCrest = board.x * NRM[0] + board.y * NRM[1];
  if (board.mode === 'sit' || board.mode === 'paddle') {
    if (!w) return;
    // in: paddling toward the shore, on the face as it stands up to break (or carried that fast by
    // it): the wave picks you up; you pop up and drop with the speed the face gives you
    const toShore = Math.cos(board.heading - A) > 0.65;
    const pickedUp = board.mode === 'paddle' && toShore && vAlong > 1.5 && w.xrel > 0.12 * w.H && w.xrel < 1.1 * w.H &&
      board.h > 0.3 * w.H && w.tau > -4 && w.tau < 0.5 && w.power > 0.3;
    if (pickedUp || (board.mode === 'paddle' && w.xrel > 0.12 * w.H && w.xrel < 1.3 * w.H && board.h > 0.25 * w.H && w.tau < 0.6 && vAlong > 0.45 * C)) {
      board.mode = 'ride'; board.standT = 0;
      const sp = Math.max(board.speed, 0.92 * C);           // the drop: free fall down the top of the face
      board.vx = Math.cos(board.heading) * sp; board.vy = Math.sin(board.heading) * sp;
      board.ride = { start: clock, v0: vCrest, barrel: 0, wave: w.b.k + 1, H: w.b.H0, set: setNow() };
      board.msg = 'You\'re in! Stand up and go right (south) along the wall: ← and → steer.';
      return;
    }
    if (w.tau > -0.3 && w.tau < LIP + 0.4 && w.xrel > -4 && w.xrel < 0.45 * w.H && board.h > 0.6 * w.H && w.power > 0.4)
      return wipe('Over the falls: you were on the crest as it threw. Paddle earlier, or wait for the next one.');
    if (w.tau > LIP && w.xrel < LANDING(w.H, w.power) + 0.4 * w.H && w.xrel > -3 && board.h > 1)
      return wipe('Caught inside: the whitewater ran you over.');
  } else if (board.mode === 'ride') {
    const r = board.ride;
    r.dist = Math.max(0, r.v0 - vCrest);
    if (!w) return finish('The wave left you behind.', false);
    const land = LANDING(w.H, w.power);
    // in the barrel: the lip thrown well out over you (not just starting to pitch), you low on the face under it
    board.inBarrel = w.tau > 0.5 && w.tau < LIP && w.xrel > 0.2 * w.H && w.xrel < land && board.h < 0.75 * w.H;
    if (board.inBarrel) r.barrel += dt;
    if (w.tau > LIP - 0.15 && w.tau < LIP + 2 && w.xrel > -3 && w.xrel < land + 1.5)
      return wipe('The lip landed on you. Stay ahead of the curl: go along the wall sooner, or lower.');
    if (w.tau > LIP + 2 && w.xrel < land + 0.35 * w.H && w.xrel > -3)
      return wipe('Buried by the whitewater: the curl caught up with you.');
    if (w.xrel < -8) return r.dist > WALL - 30 ? finish('You kicked out over the back at the end of the wall!', true) : finish('You went over the back of the wave.', false);
    if (board.standT > 1.2 && board.speed < 3.5) return finish('You lost your speed and the wave went on without you.', false);
    if (vCrest < V_PK - WALL - 25) return finish('You made it to the channel!', true);
  } else if (board.mode === 'wipe' && board.wipeT > 3.5) {
    board.mode = 'out';
    board.msg += ' Press R (or "Back to the lineup") to paddle back out.';
  }
}
function wipe(msg) {
  if (board.ride) { board.ride.end = clock + 1.5; $('replayBtn').hidden = false; }
  board.mode = 'wipe'; board.wipeT = 0;
  board.msg = 'Wipeout! ' + msg + summary();
}
function finish(msg, made) {
  if (board.ride) { board.ride.end = clock; $('replayBtn').hidden = false; }
  board.mode = 'out';
  board.vx *= 0.3; board.vy *= 0.3;
  board.msg = msg + summary() + ' Press R (or "Back to the lineup") to paddle back out.';
  if (made && board.ride) {
    const score = board.ride.dist;
    if (score > best) { best = score; try { localStorage.setItem('mavericks:best', String(best)); } catch {} }
  }
}
function summary() {
  const r = board.ride; if (!r) return '';
  const t = clock - r.start;
  return ` Ride: ${t.toFixed(1)} s, ${Math.round(r.dist || 0)} m along the wall, top speed ${(board.topSpeed * 2.237).toFixed(0)} mph` +
    (r.barrel > 0.4 ? `, ${r.barrel.toFixed(1)} s in the barrel` : '') + '.';
}

// move the surfer, a fixed step at a time
let acc = 0;
function updateSurfer(dt) {
  acc += dt;
  const input = {
    turn: ((keys.ArrowLeft || keys.a || keys.A || touch.left) ? 1 : 0) - ((keys.ArrowRight || keys.d || keys.D || touch.right) ? 1 : 0),
    paddle: !!(keys.ArrowUp || keys.w || keys.W || keys[' '] || touch.paddle),
  };
  const env = { surface, water };
  while (acc >= 1 / 120) {
    acc -= 1 / 120;
    if (board.mode !== 'out') board.step(1 / 120, input, env, assistOn ? assist : null);
    else board.step(1 / 120, { turn: input.turn, paddle: false }, env, null);
    judge(1 / 120);
  }
}
// place the model on the water, tilted with the surface and leaning into turns
const _f = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Matrix4();
let poseP = 0, tuckP = 0, crouchP = 0.35;
function placeSurfer(dt) {
  const riding = board.mode === 'ride';
  // the pop-up takes about 0.7 s; lying down again (after a ride) a little longer
  poseP = riding ? Math.min(1, poseP + dt / 0.7) : Math.max(0, poseP - dt / 1.2);
  // low on the drop, lower still under the lip; otherwise bent more in the turns
  const crouch = riding && board.standT < 1.6 ? 0.9 : 0.35 + 0.35 * Math.abs(board.steer);
  crouchP += (crouch - crouchP) * Math.min(1, dt * 4);
  tuckP += ((riding && board.inBarrel ? 1 : 0) - tuckP) * Math.min(1, dt * 5);
  const f = frameNow();
  placeFrom(f);
  if (dt > 0 && !replay) record(f);
}
// the surfer's state as a plain record: drawn now, and kept for the replay
function frameNow() {
  const wiped = board.mode === 'wipe' || (board.mode === 'out' && board.wipeT > 0);
  return { t: clock, x: board.x, y: board.y, h: board.h, hd: board.heading, steer: board.steer, vx: board.vx, vy: board.vy, hx: board.hx || 0, hy: board.hy || 0,
    riding: board.mode === 'ride', wiped, wipeT: board.wipeT, hide: board.mode === 'out' && board.wipeT > 0,
    paddling: board.mode === 'paddle', pop: wiped ? 1 : poseP, crouch: crouchP, tuck: tuckP };
}
function placeFrom(f) {
  _n.set(-f.hx, 1, f.hy).normalize();
  _f.set(Math.cos(f.hd), 0, -Math.sin(f.hd));
  _f.addScaledVector(_n, -_f.dot(_n)).normalize();
  _r.crossVectors(_f, _n);
  _m.makeBasis(_f, _n, _r);
  rider.group.quaternion.setFromRotationMatrix(_m);
  if (f.riding) rider.group.rotateX(-f.steer * 0.35);
  if (f.wiped) { rider.group.rotateZ(f.wipeT * 4.0); rider.group.rotateX(f.wipeT * 2.3); }
  rider.group.position.copy(W3(f.x, f.y, SEA + f.h + 0.03));
  rider.group.visible = !f.hide;
  rider.pose({ pop: f.pop, t: f.t, paddling: f.paddling, crouch: f.crouch, lean: f.riding ? -f.steer : 0, tuck: f.tuck, flail: f.wiped ? 1 : 0 });
}
// spray thrown off the rail in a turn (a fan up and out from the tail, more the harder and faster
// the turn), and a faint foam line left on the water behind the board
const MAXR = 900;
const rs = { pos: new Float32Array(MAXR * 3), vel: new Float32Array(MAXR * 3), age: new Float32Array(MAXR).fill(1e9), life: new Float32Array(MAXR), col: new Float32Array(MAXR * 4), next: 0 };
const rsGeo = new THREE.BufferGeometry();
rsGeo.setAttribute('position', new THREE.BufferAttribute(rs.pos, 3).setUsage(THREE.DynamicDrawUsage));
rsGeo.setAttribute('color', new THREE.BufferAttribute(rs.col, 4).setUsage(THREE.DynamicDrawUsage));
const railSpray = new THREE.Points(rsGeo, new THREE.PointsMaterial({ size: 0.28, map: dot, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
railSpray.frustumCulled = false; scene.add(railSpray);
function emitRail(p, vx, vy, vz, life) {
  const i = rs.next; rs.next = (rs.next + 1) % MAXR;
  rs.pos.set(p, 3 * i); rs.vel[3 * i] = vx; rs.vel[3 * i + 1] = vy; rs.vel[3 * i + 2] = vz; rs.age[i] = 0; rs.life[i] = life;
}
let trailT = 0;
function boardSprayParticles(dt) {
  for (let i = 0; i < MAXR; i++) {
    const a = (rs.age[i] += dt), L = rs.life[i];
    if (a > L) { rs.col[4 * i + 3] = 0; continue; }
    rs.vel[3 * i + 1] -= 9.81 * dt;
    for (let k = 0; k < 3; k++) rs.pos[3 * i + k] += rs.vel[3 * i + k] * dt;
    rs.col[4 * i] = rs.col[4 * i + 1] = rs.col[4 * i + 2] = 1; rs.col[4 * i + 3] = 0.65 * Math.min(1, a / 0.05) * (1 - a / L);
  }
  rsGeo.attributes.position.needsUpdate = true; rsGeo.attributes.color.needsUpdate = true;
}
function boardSpray(dt) {
  boardSprayParticles(dt);
  if (board.mode !== 'ride' || poseP < 0.6) return;
  railFrom({ x: board.x, y: board.y, h: board.h, hd: board.heading, steer: board.steer, vx: board.vx, vy: board.vy }, dt);
  const f = [Math.cos(board.heading), Math.sin(board.heading)];
  if ((trailT += dt) > 0.05) { trailT = 0; stamp(board.x - f[0] * 1.6, board.y - f[1] * 1.6, 0.2 + 0.4 * Math.abs(board.steer), 0); }
}
function railFrom(b, dt) {
  const f = [Math.cos(b.hd), Math.sin(b.hd)];
  const vx0 = b.vx ?? f[0] * 20, vy0 = b.vy ?? f[1] * 20, sp = Math.hypot(vx0, vy0);
  const board = { x: b.x, y: b.y, h: b.h, steer: b.steer, vx: vx0, vy: vy0 };
  const side = board.steer > 0 ? -1 : 1;                 // the outside of the turn
  const out = [-f[1] * side, f[0] * side];
  let n = (sp / 15) * (15 + 380 * Math.abs(board.steer)) * dt * Q.fx;
  n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const back = 0.6 + Math.random() * 1.2;               // from the tail half of the rail
    const x = board.x - f[0] * back + out[0] * 0.3, y = board.y - f[1] * back + out[1] * 0.3;
    const kick = sp * (0.25 + 0.35 * Math.random()) * (0.3 + Math.abs(board.steer));
    const vx = out[0] * kick - f[0] * sp * 0.15 + board.vx * 0.5, vy = out[1] * kick - f[1] * sp * 0.15 + board.vy * 0.5;
    emitRail([x, SEA + board.h + 0.1, -y], vx, 1.5 + Math.random() * (2 + 5 * Math.abs(board.steer)), -vy, 0.6 + Math.random() * 0.8);
  }
}
// the follow camera: behind the surfer; while riding, a little toward the shore so the face shows
const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3();
let camInit = false;
function updateSurfCam(dt) {
  const f = [Math.cos(board.heading), Math.sin(board.heading)];
  const riding = board.mode === 'ride';
  // lying on the board with a wave close behind: look back over your shoulder at it
  let lookBack = false;
  if (board.mode === 'sit' || board.mode === 'paddle') {
    const u = board.x * DIR[0] + board.y * DIR[1];
    for (const b of waves) if (b.active && u - b.u > 8 && u - b.u < 170) lookBack = true;
  }
  let cx, cy, ch;
  if (lookBack) {
    cx = board.x + DIR[0] * 9; cy = board.y + DIR[1] * 9; ch = SEA + board.h + 4;
    lookGoal.copy(W3(board.x - DIR[0] * 40, board.y - DIR[1] * 40, SEA + board.h + 4));
  } else if (riding) {
    // following along the line: up the wall behind the surfer, a little toward the shore, looking down the line
    cx = board.x + NRM[0] * 13 + DIR[0] * 7; cy = board.y + NRM[1] * 13 + DIR[1] * 7; ch = SEA + board.h + 2.5;
    lookGoal.copy(W3(board.x - NRM[0] * 10 + DIR[0] * 1, board.y - NRM[1] * 10 + DIR[1] * 1, SEA + board.h - 0.5));
  } else {
    cx = board.x - f[0] * 11; cy = board.y - f[1] * 11; ch = SEA + board.h + 3.2;
    lookGoal.copy(W3(board.x + f[0] * 8, board.y + f[1] * 8, SEA + board.h + 1.2));
  }
  camGoal.copy(W3(cx, cy, ch));
  if (!camInit) { camera.position.copy(camGoal); camInit = true; }
  const k = 1 - Math.exp(-dt * 5);
  camera.position.lerp(camGoal, k);
  // never under the water, also while swinging round
  const floor = SEA + surface(camera.position.x, -camera.position.z, board.h) + 1.6;   // the face being ridden, not the lip above it
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(lookGoal);
}
function rideHud() {
  const sp = board.speed * 2.237;
  const state = { sit: 'sitting', paddle: 'paddling', ride: 'riding', wipe: 'wiped out', out: 'done' }[board.mode];
  let warn = '';
  if (board.mode === 'sit' || board.mode === 'paddle') {
    const w = waveAt(board.x, board.y);
    let next = null;
    for (const b of waves) if (b.active) { const u = board.x * DIR[0] + board.y * DIR[1]; if (b.u < u && (!next || b.u > next.u)) next = b; }
    if (next) {
      const u = board.x * DIR[0] + board.y * DIR[1], d = u - next.u;
      if (d < 70 && d > 10) warn = `Wave ${next.k + 1} is ${Math.round(d)} m behind you: paddle now!`;
      else if (d <= 150 && d >= 70) warn = `Wave ${next.k + 1} (${next.H0.toFixed(0)} m) coming, ${Math.round(d)} m out.`;
    }
  }
  $('rideState').textContent = `${state}, ${sp.toFixed(0)} mph` + (board.ride && board.mode === 'ride' ? `, ${Math.round(board.ride.dist || 0)} m along the wall` : '') +
    (best ? ` · best ${Math.round(best)} m` : '');
  $('rideMsg').textContent = warn || board.msg;
  gauges(sp);
}
// the large gauges at the lower left: speed, top speed, the wave where you are, the ride so far
let gLast = '';
function gauges(mph) {
  const r = board.ride, w = waveAt(board.x, board.y), riding = board.mode === 'ride';
  const t = r ? Math.min(clock, r.end ?? clock) - r.start : 0;
  const H = w && Math.abs(w.xrel) < 150 ? w.H : null;
  const vals = [
    mph.toFixed(0), `${(mph * 1.609).toFixed(0)} km/h`,
    board.topSpeed > 0 ? `${(board.topSpeed * 2.237).toFixed(0)} mph` : '–',
    H ? `${(H * 3.281).toFixed(0)} ft (${H.toFixed(1)} m)` : '–',
    r ? `${Math.round(r.dist || 0)} of ${WALL} m` : '–',
    r ? `${t.toFixed(1)} s` : '–',
    r ? `${r.barrel.toFixed(1)} s` : '–',
  ];
  const key = vals.join('|') + (riding && board.inBarrel);
  if (key === gLast) return;
  gLast = key;
  ['gSpeed', 'gKmh', 'gTop', 'gWave', 'gDist', 'gTime', 'gBarrel'].forEach((id, i) => { $(id).textContent = vals[i]; });
  const inB = riding && !!board.inBarrel;
  $('gauges').classList.toggle('barrel', inB);
  $('gBarrelNow').hidden = !inB;
}

// ---- interface ----
document.title = `Mavericks, ${wave.label || '11 December 2015'}`;
$('title').textContent = `Mavericks, ${wave.label || '11 December 2015, morning'}`;
if (dayList.length) {
  $('day').innerHTML = dayList.map(d => `<option value="${d.day}">${d.label}: buoy ${d.Hs_m} m, sets about ${Math.round(d.set_m)} m</option>`).join('');
  $('day').value = wave.day || dayList[0].day;
  $('day').onchange = () => { const q = new URLSearchParams(location.search); q.set('day', $('day').value); q.delete('t'); location.search = q.toString(); };
} else $('day').hidden = true;
$('buoy').textContent = `${wave.buoy.Hs_m} m at ${wave.buoy.period_s} s from ${wave.buoy.from_deg}° (Half Moon Bay buoy 46012); tide ${wave.tide_m_above_MLLW} m above low water`;
$('note').textContent = `Seabed: NOAA's 3 m survey. Size, speed and where it breaks: the wave model run on that swell. ` +
  `Peels right (south) along a ${WALL} m wall, as published. The break point runs at ${PEEL.toFixed(1)} m/s, so a surfer must go about ` +
  `${Math.hypot(C, PEEL).toFixed(0)} m/s (${(Math.hypot(C, PEEL) * 2.237).toFixed(0)} mph).`;
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { rideCam.ok = false; setView(b.dataset.view); $('bar').classList.remove('open'); $('menu').setAttribute('aria-expanded', 'false'); });
renderer.domElement.addEventListener('pointerdown', () => { $('bar').classList.remove('open'); $('menu').setAttribute('aria-expanded', 'false'); });
$('menu').onclick = () => { const o = $('bar').classList.toggle('open'); $('menu').setAttribute('aria-expanded', String(o)); };
// the menu sits just under the panel at the top left, whatever its height
new ResizeObserver(() => document.body.style.setProperty('--hudH', $('hud').offsetHeight + 'px')).observe($('hud'));
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => {
  speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
});
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; };
$('nextset').onclick = () => resetSet(clock + 1);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); refl.resize(); AQ.skip = 1000; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

function hud() {
  // the wave breaking on the wall now, or else the next one coming in
  const s = stations.findIndex(v => v >= V_PK);
  const now = currentWave();
  if (!now) { $('wave').textContent = 'lull: waiting for the next set'; return; }
  const ft = (now.H0 * 3.281).toFixed(0);
  const state = now.tau[s] < 0 ? 'coming in' : 'breaking';
  $('wave').textContent = `wave ${now.k + 1} of ${waves.filter(b => !b.off).length}, ${now.H0.toFixed(1)} m (${ft} ft) at the peak, ${state}; travelling ${C} m/s`;
}

// ---- sound ----
// the listener is the camera: how loud the breaking waves are depends on how near and how big
const sound = new Sound();
try { sound.on = localStorage.getItem('mavericks:sound') !== 'off'; } catch {}
$('sound').textContent = sound.on ? 'Sound on' : 'Sound off'; $('sound').classList.toggle('on', sound.on);
$('sound').onclick = () => {
  sound.setOn(!sound.on); $('sound').textContent = sound.on ? 'Sound on' : 'Sound off'; $('sound').classList.toggle('on', sound.on);
  try { localStorage.setItem('mavericks:sound', sound.on ? 'on' : 'off'); } catch {}
};
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => sound.start(), { capture: true });
const _cp = new THREE.Vector3();
function listen(dt) {
  _cp.copy(camera.position);
  let roar = 0, hiss = 0; const impacts = [];
  for (const b of waves) {
    if (!b.active) { b.prevTau = null; continue; }
    const prev = b.prevTau || (b.prevTau = new Float32Array(stations.length).fill(NaN));
    for (let s = 0; s < stations.length; s += 2) {
      const tau = b.tau[s], H = b.H[s];
      if (!(tau > -0.5) || tau > LIP + 25 || H < 1.5) { prev[s] = tau; continue; }
      const p = b.point(s, CREST), d = Math.hypot(p[0] - _cp.x, p[1] - _cp.y, p[2] - _cp.z);
      const near = 1 / (1 + (d / 120) ** 2), size = H / 13 * breakPower(stations[s]);
      const w = (stations[Math.min(s + 2, stations.length - 1)] - stations[s]) / 6;   // per 3 m of crest
      roar += w * size * near * (tau < 0 ? 0 : tau < LIP ? 0.4 * tau / LIP : Math.exp(-(tau - LIP) / 8));
      hiss += w * size * near * (tau > LIP ? Math.exp(-(tau - LIP) / 12) : 0);
      if (prev[s] < LIP && tau >= LIP) impacts.push(Math.min(1, size * (1.2 / (1 + (d / 60) ** 1.5))));
      prev[s] = tau;
    }
  }
  const surfing = view === 'surf';
  sound.update(dt, {
    roar: 1 - Math.exp(-roar / 1.5), hiss: 1 - Math.exp(-hiss / 2), impacts,
    speed: surfing && board.mode === 'ride' ? board.speed : 0, steer: surfing ? Math.abs(board.steer) : 0,
    paddling: surfing && board.mode === 'paddle', underwater: surfing && board.mode === 'wipe' && board.wipeT < 3,
    sea: view === 'cliff' || view === 'aerial' ? 0.6 : 1,
  });
}

// ---- the replay ----
// Every frame in the Surf view is kept (the last minute). After a ride the replay plays it again at
// half speed, from 3 s before the take-off to 3 s after the end, with the same set of waves
// rebuilt from the same numbers, seen from the cliff, from the channel, or from the water.
const rec = [];
let replay = null;
function record(f) {
  rec.push(f);
  while (rec.length && rec[0].t < clock - 60) rec.shift();
}
function setNow() { return { setStart, lull, waves: waves.map(b => ({ H0: b.H0, t0: b.t0, off: b.off, broke: Float64Array.from(b.broke) })) }; }
function setRestore(st, keepBroke) {
  setStart = st.setStart; lull = st.lull;
  waves.forEach((b, i) => { const w = st.waves[i]; b.H0 = w.H0; b.t0 = w.t0; b.off = w.off; if (keepBroke) b.broke.set(w.broke); else b.broke.fill(NaN); });
}
function frameAt(t) {
  let lo = 0, hi = rec.length - 1;
  if (t <= rec[0].t) return rec[0]; if (t >= rec[hi].t) return rec[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rec[m].t <= t) lo = m; else hi = m; }
  const a = rec[lo], b = rec[hi], k = (t - a.t) / Math.max(1e-6, b.t - a.t), o = { ...a };
  for (const key of ['x', 'y', 'h', 'vx', 'vy', 'steer', 'hx', 'hy', 'wipeT', 'pop', 'crouch', 'tuck']) o[key] = a[key] + (b[key] - a[key]) * k;
  o.hd = a.hd + Math.atan2(Math.sin(b.hd - a.hd), Math.cos(b.hd - a.hd)) * k; o.t = t;
  return o;
}
const RCAMS = ['water', 'cliff', 'channel'];
function startReplay() {
  const r = board.ride; if (!r || !r.set || !rec.length || replay) return;
  const t0 = Math.max(r.start - 3, rec[0].t), t1 = Math.min(r.end + 3, rec[rec.length - 1].t);
  if (t1 - t0 < 1) return;
  replay = { t: t0, t0, t1, rate: 0.5, cam: 'auto', back: { clock, set: setNow() }, camPos: null };
  setRestore(r.set, false);
  $('replayBar').hidden = false; $('pad').hidden = true; $('ride').hidden = true; $('gauges').hidden = true;
  showReplayButtons();
}
function endReplay() {
  if (!replay) return;
  clock = replay.back.clock; setRestore(replay.back.set, true);
  replay = null; camInit = false;
  $('replayBar').hidden = true; $('pad').hidden = $('ride').hidden = $('gauges').hidden = view !== 'surf';
}
function showReplayButtons() {
  document.querySelectorAll('[data-rcam]').forEach(b => b.classList.toggle('on', b.dataset.rcam === replay.cam));
  $('rslow').classList.toggle('on', replay.rate < 1);
}
document.querySelectorAll('[data-rcam]').forEach(b => b.onclick = () => { if (replay) { replay.cam = b.dataset.rcam; replay.camPos = null; showReplayButtons(); } });
$('rslow').onclick = () => { if (replay) { replay.rate = replay.rate < 1 ? 1 : 0.5; showReplayButtons(); } };
$('rexit').onclick = () => endReplay();
$('replayBtn').onclick = () => startReplay();
addEventListener('keydown', e => { if (e.key === 'v' || e.key === 'V') replay ? endReplay() : startReplay(); if (e.key === 'Escape') endReplay(); });
const _look = new THREE.Vector3(), _goal = new THREE.Vector3();
function replayCamera(f, dt) {
  let cam = replay.cam;
  if (cam === 'auto') cam = RCAMS[Math.min(2, Math.floor(3 * (replay.t - replay.t0) / (replay.t1 - replay.t0)))];
  if (cam !== replay.lastCam) { replay.lastCam = cam; replay.camPos = null; }
  _look.copy(W3(f.x, f.y, SEA + f.h + 1));
  if (cam === 'cliff' || cam === 'channel') {
    // a long lens on a tripod: fixed place, turning to follow, zoomed so the wave fills the frame
    if (!replay.camPos) replay.camPos = cam === 'cliff' ? W3(cliff.x, cliff.y, cliff.z + 2) : (() => { const [x, y] = toXY(240, V_PK - WALL - 140); return W3(x, y, SEA + 5); })();
    camera.position.copy(replay.camPos);
    if (cam === 'channel') camera.position.y = SEA + surface(camera.position.x, -camera.position.z) + 5;
    const d = camera.position.distanceTo(_look);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(20 / d));   // about 40 m across at the surfer
  } else {
    // from the water: a photographer on a ski, on the shoulder ahead, staying level with the surfer
    const H = (waveAt(f.x, f.y) || { H: 10 }).H;
    const [gx, gy] = [f.x - NRM[0] * 45 + DIR[0] * 1.2 * H, f.y - NRM[1] * 45 + DIR[1] * 1.2 * H];
    _goal.copy(W3(gx, gy, SEA + Math.max(0, surface(gx, gy)) + 2.5));
    if (!replay.camPos) replay.camPos = _goal.clone();
    replay.camPos.lerp(_goal, 1 - Math.exp(-dt * 3));
    camera.position.copy(replay.camPos);
    camera.fov = 58;
  }
  camera.updateProjectionMatrix();
  camera.lookAt(_look);
}
function stepReplay(dtReal) {
  const dt = paused ? 0 : dtReal * replay.rate;
  replay.t += dt;
  if (replay.t >= replay.t1) { endReplay(); return; }
  clock = replay.t;
  common.uTime.value = clock;
  updateWaves(clock); updatePuffs(clock);
  if (dt > 0) { updateSpray(dt); updateMist(dt); updateFoam(dt); boardSprayParticles(dt); }
  const f = frameAt(replay.t);
  placeFrom(f);
  // rail spray, as it was thrown
  if (dt > 0 && f.riding && f.pop > 0.6) railFrom(f, dt);
  replayCamera(f, Math.max(dt, 0.016));
  $('replayTime').textContent = `${(replay.t - replay.t0).toFixed(1)} / ${(replay.t1 - replay.t0).toFixed(1)} s`;
  if (dt > 0) listen(dt);
  refl.update(camera);
  renderer.render(scene, camera);
}

// ---- loop ----
// address options: ?t=35 (start the clock there), &view=aerial, &pause=1
const P = new URLSearchParams(location.search);
if (P.has('t')) clock = +P.get('t');
if (P.has('pause')) { paused = true; $('pause').textContent = 'Play'; }
setView(P.get('view') || 'surf');
$('loading').remove(); $('hud').hidden = false; $('bar').hidden = false;
let last = performance.now(), cpuMs = 0;
// automatic quality: the frame time averaged over 3 s; below about 36 frames a second, a step down;
// above about 58 with a step to spare, one up (once only, so it never see-saws)
const AQ = { t: 0, n: 0, sum: 0, wentUp: false, skip: 2000 };
function adapt(ms) {
  if (Q.fixed || document.hidden || ms > 250) return;
  if ((AQ.skip -= ms) > 0) return;                       // let loading settle first
  AQ.sum += ms; AQ.n++;
  if (AQ.sum < 3000) return;
  const avg = AQ.sum / AQ.n; AQ.sum = AQ.n = 0;
  if (avg > 28 && Q.level > 0) { setQuality(Q.level - 1); AQ.skip = 1000; }
  else if (avg < 17 && Q.level < 2 && !AQ.wentUp && !coarse) { setQuality(Q.level + 1); AQ.wentUp = true; AQ.skip = 1000; }
}
window.__mav = { get clock() { return clock; }, set clock(v) { clock = v; }, waves, setView, resetSet, stations, camera, controls, cliff, elev, marks, W3,
  board, keys, toLineup, waveAt, surface, toXY,
  pause(p) { paused = p; }, get cpuMs() { return cpuMs; }, Q, setQuality, sound, refl,
  get assistOn() { return assistOn; }, set assistOn(v) { assistOn = v; $('assist').classList.toggle('on', v); },
  // for tests: run the game without drawing, `ctl(state)` pressing keys each frame (1/30 s), until it returns true
  sim(ctl, maxT = 60) {
    const t0 = clock, dt = 1 / 30;
    while (clock - t0 < maxT) {
      clock += dt;
      if (waves.every(b => b.off || U0 + C * (clock - setStart - b.t0) > U_END)) resetSet(clock + lull);
      updateWaves(clock); updateSurfer(dt);
      if (ctl({ clock, board, wave: waveAt(board.x, board.y), keys, DIR, NRM, A, C, PEEL })) break;
    }
    return { clock, mode: board.mode, msg: board.msg, ride: board.ride && { ...board.ride, t: clock - board.ride.start }, top: board.topSpeed };
  } };
renderer.setAnimationLoop(() => {
  const nowMs = performance.now(); let dt = Math.min(0.05, (nowMs - last) / 1000);
  adapt(nowMs - last); last = nowMs;
  if (replay) return stepReplay(dt);
  if (paused) dt = 0; else dt *= speed;
  clock += dt;
  common.uTime.value = clock;
  if (waves.every(b => b.off || U0 + C * (clock - setStart - b.t0) > U_END)) resetSet(clock + lull);
  const c0 = performance.now();
  updateWaves(clock); updatePuffs(clock);
  if (dt > 0) { updateSpray(dt); updateMist(dt); updateFoam(dt); }
  cpuMs = cpuMs * 0.95 + (performance.now() - c0) * 0.05;
  if (view === 'surf') {
    if (dt > 0) { updateSurfer(dt); boardSpray(dt); }
    placeSurfer(Math.max(dt, 0.016));
    updateSurfCam(Math.max(dt, 0.016));
    rideHud();
  }
  if (view === 'ride') updateRide(Math.max(dt, 0.016));
  if (view === 'lineup' || view === 'channel') {        // on a board or a boat: rise and fall with the swell
    const x = camera.position.x, y = -camera.position.z;
    const target = SEA + surface(x, y) + (view === 'lineup' ? 1.2 : 5);
    camera.position.y += (target - camera.position.y) * Math.min(1, 6 * Math.max(dt, 0.016));
  }
  if (view === 'free') controls.update();
  hud();
  if (dt > 0) listen(dt);
  refl.update(camera);
  renderer.render(scene, camera);
});
