// One breaking wave: a strip of cross-sections along the crest, rebuilt every frame.
//
// Each cross-section is a single curve that can fold over itself, so the lip can throw
// forward and land (the barrel). From the back of the wave to the front it runs:
//   back slope -> crest -> top of the lip out to its tip -> underside of the lip back in
//   -> the face inside the barrel -> the flat water ahead.
// Before breaking the lip has no length and the curve is an ordinary wave crest.
//
// Time for a section: tau = seconds since that section started to break (negative before).
//   tau < 0      the wave shoals and its front steepens (a solitary-wave shape)
//   0 .. LIP     the lip throws forward and falls (about the free-fall time of the crest)
//   LIP .. +     the lip has landed: whitewater (a bore) that shrinks as it runs inshore
// The peel: sections south of the peak start breaking later, so the break point runs
// along the crest.

import * as THREE from 'three';

const NB = 40, NL = 22, NF = 50;          // points: back, lip (each side), front
export const NP = NB + 2 * NL + NF;
// the strip runs from XB metres behind the crest to XF ahead (160 at Mavericks). Where the waves
// come closer together than the strip is wide, neighbouring strips overlap and fight over the
// same water: setStripHalfWidth() narrows them (Teahupo'o's waves are about 250 m apart).
export let XB = 160, XF = 160;
export function setStripHalfWidth(m) { XB = XF = m; }
export let LIP = 2.8;                      // seconds for the lip to throw and land
// The lip's shape, per spot (setLipShape): how far forward it throws (share of the wave's height),
// how thick it is at its root, and how far the trough in front of the barrel drops below the
// flat sea (share of the height). Mavericks: 0.78, 0.11, none. Teahupo'o (Shand 2024): a lip
// about half the wave's height thick, and a trough sucked below sea level in front of it.
export const SHAPE = { throw: 0.78, thick: 0.11, trough: 0 };
export function setLipShape(s) { if (s.lip_s) LIP = s.lip_s; for (const k of ['throw', 'thick', 'trough']) if (s[k] != null) SHAPE[k] = s[k]; }

const sech2 = x => { const c = Math.cosh(x); return 1 / (c * c); };
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function bez(p0, p1, p2, p3, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

// Fill px, py (metres, x forward from the crest, y up from the flat sea), foam and thin (0..1)
// for one section of height H (crest above the flat sea) in water `depth` deep at time tau.
// power (0..1): how hard this part of the crest breaks; less toward the channel, where the wave backs off.
// fx (optional, 2 per point): how much foam lace the point carries, and how much of the lip's
// falling curtain (white streaks running down the thrown sheet of water).
export function profile(H, depth, tau, px, py, foam, thin, power = 1, fx = null) {
  const h = Math.max(depth, H / 0.78, 2);
  const sigma = Math.min(70, Math.max(10, Math.sqrt(4 * h * h * h / (3 * Math.max(H, 0.3)))));  // solitary-wave width
  const steep = smooth(-7, 0, tau) * (0.4 + 0.6 * power);   // front steepening
  const lam = clamp01(tau / LIP);                        // how far the lip has thrown, 0..1
  const lamS = lam * lam * (3 - 2 * lam) * power;
  const bore = smooth(LIP - 0.2, LIP + 2.5, tau) * (0.3 + 0.7 * power);   // lip landed -> whitewater
  const decay = tau > LIP ? 1 - power * 0.55 * (1 - Math.exp(-(tau - LIP) / 7)) : 1;   // weak breakers shrink less
  const Hc = H * decay;
  const whiteAge = tau > LIP ? Math.exp(-(tau - LIP) / 18) : 0;
  // lace: foam lines spread over the face as the curl comes near (the sections just ahead of
  // the break point) and stay in the barrel, fading as the whitewater takes over
  const laceS = smooth(-4, 0, tau) * (1 - 0.8 * bore) * (0.4 + 0.6 * power);
  const curtS = lamS * (1 - bore);                       // the lip is a falling sheet
  const setFx = (k, l, c) => { if (fx) { fx[2 * k] = l; fx[2 * k + 1] = c; } };

  // Over deep water the wave's shape is broad (sigma up to 70 m): at the strip's ends it still stood
  // a metre or so above the open sea, a step the board fell off and the eye saw as a line. Its
  // height now fades to nothing over the outer part of the strip, so a strip always meets the sea.
  const edge = x => x < 0 ? 1 - smooth(0.55 * XB, 0.95 * XB, -x) : 1 - smooth(0.55 * XF, 0.95 * XF, x);

  let k = 0;
  // back slope, denser toward the crest
  for (let i = 0; i < NB; i++, k++) {
    const q = i / (NB - 1), x = -XB * (1 - q) * (1 - q);
    px[k] = x; py[k] = Hc * sech2(x / sigma) * edge(x);
    foam[k] = bore * whiteAge * smooth(-25, 0, x) * 0.9;
    thin[k] = 0;
    setFx(k, laceS * smooth(-0.6 * Hc, 0, x) * 0.6, 0);
  }
  // the lip: centreline from the crest to the tip, then the two sides
  const C0 = [0, Hc];
  // the throw: how far out the lip goes. A longer throw also arcs higher before it falls, and the
  // barrel's inside wall (below) reaches further out to meet it, so the tube grows with it.
  // At Mavericks' 0.78 everything is as it was.
  const TH = SHAPE.throw, TX = TH / 0.78, lift = Math.max(0, TX - 1);
  const T = [TH * Hc * lamS, Hc + 0.14 * Hc * lamS - 1.06 * Hc * lamS * lamS];
  const P1 = [0.38 * TX * Hc * lamS, Hc + (0.13 + 0.22 * lift) * Hc * lamS], P2 = [T[0] + 0.06 * Hc * lamS, T[1] + (0.42 + 0.3 * lift) * Hc * lamS];
  const t0 = SHAPE.thick * Hc * Math.sqrt(lamS);
  const cl = [], nrm = [];
  for (let i = 0; i < NL; i++) {
    const q = (i + 1) / NL;
    const p = bez(C0, P1, P2, T, q), p2 = bez(C0, P1, P2, T, Math.min(1, q + 0.01)), p1 = bez(C0, P1, P2, T, Math.max(0, q - 0.01));
    let dx = p2[0] - p1[0], dy = p2[1] - p1[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    cl.push(p); nrm.push([-dy, dx]);                     // left of the direction of the lip = its top
  }
  // the bore the breaking front collapses into once the lip has landed, as a curve B(p), p 0..1:
  // a foam top sloping from the crest down to where the lip landed, a rounded front face,
  // then a toe of foam running out ahead. Each point of the lip and the barrel is drawn
  // toward its own place on it, so the barrel fills in rather than jumping.
  const xL = Math.max(TH * Hc * power, 1.5) + 1;
  const Fb1 = [xL + 0.25 * Hc, 0.5 * Hc], Fb2 = [xL + 0.38 * Hc, 0.18 * Hc], Fb3 = [xL + 0.4 * Hc, 0.05 * Hc];
  const boreAt = p => {
    if (p <= 0.5) { const s = p / 0.5; return [xL * s, Hc * (1 - 0.42 * Math.pow(s, 1.6))]; }
    if (p <= 0.85) return bez([xL, 0.58 * Hc], Fb1, Fb2, Fb3, (p - 0.5) / 0.35);
    const s = (p - 0.85) / 0.15; return [Fb3[0] + 0.45 * Hc * s, 0.05 * Hc * (1 - s)];
  };
  const toward = (x, y, p) => { const b = boreAt(p); return [x + (b[0] - x) * bore, y + (b[1] - y) * bore]; };
  for (let i = 0; i < NL; i++, k++) {                    // top of the lip, out to the tip
    const q = (i + 1) / NL, t = t0 * Math.pow(1 - q, 0.8) * 0.5;
    const r = toward(cl[i][0] + nrm[i][0] * t, cl[i][1] + nrm[i][1] * t, 0.5 * q);
    px[k] = r[0]; py[k] = r[1];
    foam[k] = Math.max(smooth(0.78, 1, q) * lamS * 0.7, bore * whiteAge);
    thin[k] = lamS * (0.6 + 0.4 * q) * (1 - bore);
    setFx(k, laceS * 0.35 * (1 - q), curtS * smooth(0.1, 0.55, q));
  }
  for (let i = NL - 1; i >= 0; i--, k++) {               // underside of the lip, back in
    const q = (i + 1) / NL, t = t0 * Math.pow(1 - q, 0.8) * 0.5;
    const r = toward(cl[i][0] - nrm[i][0] * t, cl[i][1] - nrm[i][1] * t, 0.5 + 0.08 * (1 - q));
    px[k] = r[0]; py[k] = r[1];
    foam[k] = Math.max(smooth(0.85, 1, q) * lamS * 0.5, bore * whiteAge);
    thin[k] = lamS * (1 - bore);
    setFx(k, laceS * 0.1, curtS * smooth(0.1, 0.5, q));
  }
  // the front: unbroken steepening face, or the barrel's inside wall, or the bore
  const R = [0.02 * Hc * lamS, Hc - t0];
  const F = [(0.95 + 0.25 * TX * lamS) * Hc + 2, 0];
  // a longer throw hollows the wall: its middle bows back under the lip
  const D1 = [R[0] + (0.12 - 0.06 * lift) * Hc, R[1] - 0.5 * Hc], D2 = [F[0] - (0.5 + 0.15 * lift) * Hc, 0.02 * Hc];
  const sF = sigma * (1 - 0.72 * steep);
  const wall = smooth(-1.5, 0.3, tau) * power;
  const NW = Math.round(NF * 0.6);
  // the trough sucked down in front of a heavy breaker, centred under where the lip lands
  const dipA = SHAPE.trough * Hc * Math.max(wall, 0.6 * steep) * (1 - bore), dipX = 0.85 * F[0], dipW = 0.7 * Hc + 2;
  const dip = x => dipA > 0 ? dipA * sech2((x - dipX) / dipW) : 0;
  for (let i = 0; i < NF; i++, k++) {
    let x, y;
    if (i < NW) {
      const q = i / (NW - 1);
      const ux = (0.95 * Hc + 2) * q * q, uy = Hc * sech2(ux / sF);          // unbroken face
      const b = bez(R, D1, D2, F, q);                                        // barrel wall
      x = ux + (b[0] - ux) * wall; y = uy + (b[1] - uy) * wall;
      y -= dip(x) * q;                                                       // the foot of the barrel wall into the trough
      [x, y] = toward(x, y, 0.58 + 0.42 * q);
      foam[k] = Math.max(lamS * smooth(0.75, 1, q) * 0.5, bore * whiteAge);
      thin[k] = wall * (1 - q) * 0.5 * (1 - bore) + (1 - wall) * steep * smooth(0.6, 0, q) * 0.6;
      setFx(k, laceS * Math.pow(1 - q, 1.5), curtS * smooth(0.3, 0, q) * 0.5);
    } else {
      const q = (i - NW + 1) / (NF - NW);
      const x0 = (1 - wall) * (0.95 * Hc + 2) + wall * F[0];
      const xb = boreAt(1)[0], start = x0 + (xb - x0) * bore;
      x = start + (XF - start) * q * q;
      y = (1 - wall) * Hc * sech2(x / sF) * (1 - bore) * edge(x) - dip(x);
      foam[k] = bore * whiteAge * smooth(0.6, 0, q) * 0.9;
      thin[k] = 0;
      setFx(k, laceS * smooth(0.5, 0, q) * 0.5, 0);
    }
    px[k] = x; py[k] = y;
  }
}

const BGS = 20, BG = new Float32Array(Math.ceil(320 / BGS) + 2);   // sized for the widest strip
let BGN = 0;

// A wave strip: `stations` are positions along the crest (metres, + = north).
export class Breaker {
  constructor(stations, material) {
    this.v = stations;
    const n = stations.length * NP;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.foam = new Float32Array(n);
    this.thin = new Float32Array(n);
    this.nor = new Float32Array(n * 3);
    this.fx = new Float32Array(n * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('foam', new THREE.BufferAttribute(this.foam, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('thin', new THREE.BufferAttribute(this.thin, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('fx', new THREE.BufferAttribute(this.fx, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let s = 0; s + 1 < stations.length; s++)
      for (let i = 0; i + 1 < NP; i++) {
        const a = s * NP + i, b = a + 1, c = a + NP, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.px = new Float32Array(NP); this.py = new Float32Array(NP);
    this.f = new Float32Array(NP); this.t = new Float32Array(NP); this.e = new Float32Array(NP * 2);
    this.tau = new Float32Array(stations.length);
    this.H = new Float32Array(stations.length);
    this.u = 0;
  }

  // frame: {u: crest position along the travel (m), sea: water level, dir:[dx,dy], nrm:[nx,ny],
  //         section(v) -> {H, tau, depth}}
  update(f) {
    const { pos, nor, foam, thin, fx, px, py } = this;
    let k = 0;
    for (let s = 0; s < this.v.length; s++) {
      const v = this.v[s];
      const sec = f.section(v, s);
      this.tau[s] = sec.tau; this.H[s] = sec.H;
      profile(sec.H, sec.depth, sec.tau, px, py, this.f, this.t, sec.power ?? 1, this.e);
      const bx = f.nrm[0] * v, by = f.nrm[1] * v;
      // the background sea under this section, sampled every BGS metres along it and interpolated
      BGN = Math.ceil((XB + XF) / BGS) + 1;
      if (f.bg) for (let j = 0; j < BGN; j++) {
        const along = f.u - XB + j * BGS;
        BG[j] = f.bg(f.dir[0] * along + bx, f.dir[1] * along + by);
      }
      for (let i = 0; i < NP; i++, k++) {
        const along = f.u + px[i];
        const x = f.dir[0] * along + bx, y = f.dir[1] * along + by;
        let g = 0;
        if (f.bg) {
          const r = Math.min(BGN - 1.001, Math.max(0, (px[i] + XB) / BGS)), j = Math.floor(r), a = r - j;
          g = BG[j] * (1 - a) + BG[j + 1] * a;
        }
        pos[3 * k] = x; pos[3 * k + 1] = f.sea + py[i] + g; pos[3 * k + 2] = -y;   // three.js: -z is north
        foam[k] = this.f[i]; thin[k] = this.t[i];
        fx[2 * k] = this.e[2 * i]; fx[2 * k + 1] = this.e[2 * i + 1];
        // normal from the section's own shape: the curve runs back to front, its left side is out of the water
        const a = Math.max(0, i - 1), b = Math.min(NP - 1, i + 1);
        let tx = px[b] - px[a], ty = py[b] - py[a];
        const l = Math.hypot(tx, ty);
        if (l < 1e-6) { tx = 1; ty = 0; } else { tx /= l; ty /= l; }
        const nx = -ty, ny = tx;                                    // in the section: forward, up
        nor[3 * k] = f.dir[0] * nx; nor[3 * k + 1] = ny; nor[3 * k + 2] = -f.dir[1] * nx;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.attributes.foam.needsUpdate = true;
    this.geo.attributes.thin.needsUpdate = true;
    this.geo.attributes.fx.needsUpdate = true;
  }

  // height of the water's upper surface above the flat sea, at `along` metres along the travel,
  // in the section at station s (the highest where the curve folds); null if outside the strip
  // near: if given, the surface nearest that height (a board on the face under the lip)
  heightAt(s, along, f, near) {
    const v = this.v[s], base = s * NP;
    let best = null, prevX = null, prevY = null;
    for (let i = 0; i < NP; i++) {
      const k = base + i, X = this.pos[3 * k], Y = -this.pos[3 * k + 2];
      const x = (X - f.nrm[0] * v) * f.dir[0] + (Y - f.nrm[1] * v) * f.dir[1] - this.u;
      const y = this.pos[3 * k + 1] - f.sea;
      if (prevX !== null && (prevX - along) * (x - along) <= 0 && prevX !== x) {
        const t = (along - prevX) / (x - prevX), yy = prevY + (y - prevY) * t;
        if (best === null || (near === undefined ? yy > best : Math.abs(yy - near) < Math.abs(best - near))) best = yy;
      }
      prevX = x; prevY = y;
    }
    return best;
  }

  // world position (three.js) of point i of the section at station s, from the last update
  point(s, i) {
    const k = s * NP + i;
    return [this.pos[3 * k], this.pos[3 * k + 1], this.pos[3 * k + 2]];
  }
}

export const LIP_TIP = NB + NL - 1;      // index of the lip's tip in a section
export const CREST = NB - 1;
