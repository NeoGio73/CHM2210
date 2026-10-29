// Landmarks NOAA's survey cannot give: the rocks on the inside of the break, which its bare-earth
// model smooths to about a metre above the water, and Pillar Point Air Force Station on the
// headland (a bare-earth model has no buildings).
//
// Where: Sail Rock from the Coast Guard's rule for the contest (33 CFR 100.1106 and the 2014
// Federal Register notice: 37°29′34″ N, 122°30′02″ W), the rocks round it, Mushroom Rock and every
// dome and building from public satellite pictures (Esri World Imagery), read off in metres.
// What they look like: published descriptions ("the large Sail Rock", "the round Mushroom Rock",
// the Boneyard's broken rocks; the station's white "golf ball"). Heights above the water are
// chosen: no survey gives them. Local frame as everywhere: x east, y north, metres from the
// published spot.
import * as THREE from 'three';

// pixel positions in the satellite pictures turned into local metres
const fromSail = (px, py) => [683 + (px - 673) * 0.237, 142 - (py - 284) * 0.237];      // 0.24 m a pixel, marker on Sail Rock
const fromStation = (px, py) => [744 + (px - 588) * 0.474, 711 - (py - 731) * 0.474];  // 0.47 m a pixel, marker on the station's listed point

// ---- rocks ----
// kind: 'sail' a tall slab that narrows to a ridge, 'mushroom' a round cap overhanging a narrower
// neck (the sea wears the foot), 'block' a broken lump
export const ROCKS = [
  { name: 'Sail Rock', kind: 'sail', at: fromSail(735, 255), len: 16, wid: 7, top: 10, turn: 0.5 },
  { name: 'Sail Rock (its north block)', kind: 'block', at: fromSail(705, 210), len: 9, wid: 7, top: 4.5, turn: 1.1 },
  { name: 'Mushroom Rock', kind: 'mushroom', at: fromSail(455, 430), len: 8, wid: 7.5, top: 4.2, turn: 0.2 },
  // the Boneyard: the broken rocks between and round them
  { kind: 'block', at: fromSail(540, 270), len: 8, wid: 6.5, top: 2.6, turn: 0.3 },
  { kind: 'block', at: fromSail(603, 262), len: 5, wid: 4, top: 1.8, turn: 2.0 },
  { kind: 'block', at: fromSail(770, 300), len: 10, wid: 7, top: 3.2, turn: 0.9 },
  { kind: 'block', at: fromSail(790, 230), len: 6, wid: 5, top: 2.2, turn: 1.6 },
  { kind: 'block', at: fromSail(650, 330), len: 4, wid: 3, top: 1.2, turn: 0.7 },
  { kind: 'block', at: fromSail(530, 480), len: 5, wid: 4, top: 0.9, turn: 2.4 },
  { kind: 'block', at: fromSail(712, 640), len: 4, wid: 3.5, top: 1.0, turn: 1.2 },
  { kind: 'block', at: fromSail(860, 160), len: 7, wid: 5, top: 2.0, turn: 0.4 },
];

// smooth bumpy noise from a few sines (no texture needed); seed varies it per rock
function bumps(x, y, z, seed) {
  return 0.5 * Math.sin(1.7 * x + 2.3 * seed) * Math.sin(1.3 * y + seed) +
    0.3 * Math.sin(3.1 * z + 1.1 * x + seed * 0.7) +
    0.2 * Math.sin(5.3 * y - 4.1 * z + seed * 1.9) * Math.sin(4.7 * x + seed);
}

// one rock as a mesh, its foot at y = 0 (sunk below the water by the caller), its top at r.top + sink
function rockGeometry(r, seed, sink) {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const H = r.top + sink;
  const dark = new THREE.Color(0.07, 0.065, 0.06), mid = new THREE.Color(0.17, 0.155, 0.14),
        weed = new THREE.Color(0.10, 0.12, 0.07), guano = new THREE.Color(0.62, 0.60, 0.55), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = (y + 1) / 2;                                    // 0 at the foot, 1 at the top
    let rx = r.len / 2, rz = r.wid / 2;
    let prof = 1;                                             // how tall the rock is at this point along its length
    if (r.kind === 'sail') {                                  // seen side on, a triangle with its peak toward one end
      const t = Math.pow(h, 0.9);
      rx *= 1 - 0.25 * t; rz *= 1 - 0.75 * t;
      prof = Math.max(0.12, 1 - Math.abs(x - 0.3) / 1.35);
    } else if (r.kind === 'mushroom') {                       // a neck under a round, overhanging cap
      const neck = 0.62 + 0.38 * THREE.MathUtils.smoothstep(h, 0.3, 0.62);
      const cap = h > 0.62 ? Math.sqrt(Math.max(0, 1 - ((h - 0.62) / 0.38) ** 2)) * 0.25 + 0.75 : 1;
      rx *= neck * cap; rz *= neck * cap;
    } else {                                                  // a lump, flatter on top
      const t = h * h;
      rx *= 1 - 0.35 * t; rz *= 1 - 0.35 * t;
    }
    const n = bumps(x * 2, y * 2, z * 2, seed) + 0.45 * bumps(x * 6, y * 6, z * 6, seed + 5);   // broad lumps and sharp edges
    const k = 1 + 0.18 * n;
    let X = x * rx * k, Z = z * rz * k, Y = h * H * prof * (1 + 0.08 * n);
    Y = Math.max(Y, h * sink);                                // the part under the water keeps its full width
    if (r.kind !== 'mushroom' && h > 0.85) Y -= (h - 0.85) * H * 0.25 * (1 + Math.sin(7 * x + seed));   // a broken top, not a dome
    // turn the rock about the vertical
    const cs = Math.cos(r.turn), sn = Math.sin(r.turn);
    p.setXYZ(i, X * cs - Z * sn, Y, X * sn + Z * cs);
    // colour: dark and weedy where the sea covers it, grey rock above, whitened by birds on top
    const above = Y - sink;
    if (above < 0.6) c.copy(weed).lerp(dark, 0.5 + 0.5 * Math.sin(seed + 9 * x));
    else c.copy(dark).lerp(mid, THREE.MathUtils.smoothstep(above, 0.6, 3.5));
    if (r.kind === 'sail' && above > r.top - 2.2) c.lerp(guano, 0.55 * THREE.MathUtils.smoothstep(above, r.top - 2.2, r.top - 0.8));
    c.multiplyScalar(0.85 + 0.3 * (0.5 + 0.5 * bumps(5 * x, 5 * y, 5 * z, seed + 3)));
    col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---- the station ----
// [px, py] in the satellite picture, then size: domes by diameter, buildings by length, width,
// height and turn (radians, anticlockwise from east)
const DOMES = [   // white radomes; the big one ("the golf ball") stands on a drum
  { at: fromStation(787, 637), d: 18.5, base: 5 },
  { at: fromStation(720, 752), d: 13, base: 2.5 },
  { at: fromStation(622, 740), d: 9.5, base: 2 },
  { at: fromStation(705, 857), d: 9, base: 2 },
  { at: fromStation(757, 910), d: 9, base: 2 },
  { at: fromStation(923, 764), d: 7.5, base: 1.5 },
  { at: fromStation(880, 842), d: 6, base: 1.5 },
];
const DARK_DOMES = [ { at: fromStation(748, 735), d: 11.5, base: 2.5 } ];    // a grey one beside the second dome
const BUILDINGS = [
  { at: fromStation(730, 628), l: 43, w: 16, h: 6, turn: 0.38, c: 0xe8e6df },
  { at: fromStation(615, 700), l: 18, w: 33, h: 9, turn: 0.0, c: 0xd9d8d2 },
  { at: fromStation(768, 697), l: 14, w: 16, h: 5, turn: 0.55, c: 0xb9a48a },
  { at: fromStation(812, 722), l: 22, w: 11, h: 5, turn: 0.45, c: 0xc79a78 },
  { at: fromStation(816, 780), l: 22, w: 12, h: 5, turn: 0.0, c: 0xc7c6c0 },
  { at: fromStation(780, 780), l: 15, w: 10, h: 4.5, turn: 0.0, c: 0xc49674 },
  { at: fromStation(818, 748), l: 9, w: 8, h: 4, turn: 0.0, c: 0xdcdcd6 },
  { at: fromStation(848, 752), l: 8, w: 7, h: 3.5, turn: 0.0, c: 0xdcdcd6 },
  { at: fromStation(813, 842), l: 15, w: 12, h: 5, turn: 0.0, c: 0xd2d0c8 },
  { at: fromStation(905, 740), l: 16, w: 8, h: 4, turn: 0.5, c: 0xb58f72 },
  { at: fromStation(770, 822), l: 9, w: 7, h: 3.5, turn: 0.0, c: 0xdedcd4 },
];

// build everything; elev(x, y) gives the ground (m above NAVD88), W3 the three.js point, sea the
// water level. Returns { rocks: [{x, y, r}] } for the foam round the rocks.
export function buildLandmarks(scene, { elev, W3, sea }) {
  const group = new THREE.Group(); group.name = 'landmarks';
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.4, flatShading: true });
  const rocks = [];
  ROCKS.forEach((r, i) => {
    const [x, y] = r.at;
    const sink = Math.max(3, sea - elev(x, y) + 1);          // down to the seabed, at least 3 m
    const m = new THREE.Mesh(rockGeometry(r, 1.3 + i * 2.17, sink), rockMat);
    m.position.copy(W3(x, y, sea - sink));
    m.name = r.name || 'Boneyard rock';
    group.add(m);
    rocks.push({ x, y, r: Math.max(r.len, r.wid) / 2, big: r.top > 3 });
  });

  // white water round each rock: two flat patches of foam lying on the sea, turning slowly in
  // opposite directions so it churns; the rock stands up through them
  const foamTex = (() => {
    const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // soft blobs of foam, most of them just outside the rock, fewer further out
    for (let b = 0; b < 140; b++) {
      const a = rnd() * 6.283, d = 0.3 + 0.55 * Math.pow(rnd(), 1.6), rad = (0.04 + 0.1 * rnd()) * (1.2 - d);
      const x = n / 2 * (1 + d * Math.cos(a)), y = n / 2 * (1 + d * Math.sin(a)), R = rad * n;
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(255,255,255,${0.35 + 0.4 * rnd()})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 6.283); g.fill();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  for (const r of rocks) {
    r.a = 0.4; r.patches = [];
    for (let k = 0; k < 2; k++) {
      const s = r.r * (k ? 3.4 : 2.6) + 3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s),
        new THREE.MeshBasicMaterial({ map: foamTex, color: 0xd9e1e5, transparent: true, depthWrite: false, opacity: 0.4 }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
      group.add(m); r.patches.push(m);
    }
  }

  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55, envMapIntensity: 0.8 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8c8f92, roughness: 0.5, envMapIntensity: 0.8 });
  const drum = new THREE.MeshStandardMaterial({ color: 0xd6d4cc, roughness: 0.8 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9 });
  const ground = (x, y, rad) => {                               // the lowest ground under a footprint, so nothing floats
    let g = Infinity;
    for (let a = 0; a < 8; a++) g = Math.min(g, elev(x + rad * Math.cos(a * 0.785), y + rad * Math.sin(a * 0.785)));
    return Math.min(g, elev(x, y));
  };
  for (const [list, mat] of [[DOMES, white], [DARK_DOMES, grey]]) for (const d of list) {
    const [x, y] = d.at, R = d.d / 2, g0 = ground(x, y, R);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.9, d.base + (elev(x, y) - g0) + 0.5, 32), drum);
    base.position.copy(W3(x, y, g0 - 0.5 + (d.base + (elev(x, y) - g0) + 0.5) / 2));
    // a radome is most of a sphere: cut off where it meets its drum
    const cut = Math.acos(-0.5);                                 // the sphere's lower part, below 0.5 R down, is hidden
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 24, 0, Math.PI * 2, 0, cut), mat);
    dome.position.copy(W3(x, y, elev(x, y) + d.base + R * 0.5));
    group.add(base, dome);
  }
  for (const b of BUILDINGS) {
    const [x, y] = b.at, g0 = ground(x, y, Math.max(b.l, b.w) / 2);
    const top = elev(x, y) + b.h;
    const wall = new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.85 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.l, top - g0 + 0.5, b.w), [wall, wall, roof, wall, wall, wall]);   // faces: +x, -x, top, bottom, +z, -z
    box.position.copy(W3(x, y, g0 - 0.5 + (top - g0 + 0.5) / 2));
    box.rotation.y = b.turn;
    group.add(box);
  }
  // a lattice mast beside the long building
  {
    const [x, y] = fromStation(700, 600), g0 = elev(x, y);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 24, 6), grey);
    mast.position.copy(W3(x, y, g0 + 12));
    group.add(mast);
  }
  scene.add(group);
  // each frame: seaAt(x, y) the water's height there, amountFor(rock) how white the water round it
  // is now (0..1); the foam builds quickly and fades slowly
  function wash(dt, t, seaAt, amountFor) {
    for (const r of rocks) {
      const want = amountFor(r);
      r.a += (want - r.a) * Math.min(1, dt * (want > r.a ? 3 : 0.4));
      const h = seaAt(r.x, r.y) + 0.06;
      r.patches.forEach((m, k) => {
        m.position.copy(W3(r.x, r.y, h + 0.03 * k));
        m.rotation.z = (k ? -0.07 : 0.05) * t + k * 1.7;
        m.material.opacity = Math.min(1, r.a * (k ? 0.75 : 1));
      });
    }
  }
  return { group, rocks, wash };
}
