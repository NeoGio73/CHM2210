// The surfer and the board as drawn, and how the figure is posed.
//
// The figure is built standing, facing +z, up +y, its left side toward +x, its root at the pelvis.
// Standing on the board it stays that way (regular foot: left foot toward the nose, +x); lying, the
// whole figure is turned so that its head points to the nose and its front faces down. The legs are
// placed by solving the knee (two-bone) so the feet stay planted on the deck at any crouch.
import * as THREE from 'three';

const L1 = 0.44, L2 = 0.44, UA = 0.3, FA = 0.28;            // thigh, shin, upper arm, forearm (m)
const HIP_W = 0.1, SHOULDER = 0.47, SHOULDER_W = 0.21;
const DECK = 0.065, ANKLE = DECK + 0.05;                    // top of the board; ankle height above it

function capsule(r, len, mat) { return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); }
// a limb hanging from its joint along -y
function limb(r, len, mat) {
  const j = new THREE.Group(), c = capsule(r, len, mat);
  c.position.y = -len / 2; j.add(c); return j;
}

export function buildRider() {
  const board = new THREE.Group();
  // a 10'6" gun: pointed nose, pintail; outline extruded, rounded edges
  const L = 3.2, W = 0.56;
  const shape = new THREE.Shape();
  const N = 24, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = -L / 2 + L * t;
    const w = W / 2 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.75) * (t > 0.9 ? 1 - (t - 0.9) * 3 : 1);
    pts.push([x, Math.max(w, 0.01)]);
  }
  shape.moveTo(pts[0][0], 0);
  for (const [x, w] of pts) shape.lineTo(x, w);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(pts[i][0], -pts[i][1]);
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, steps: 1 });
  bg.rotateX(-Math.PI / 2);
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.35 });
  const deck = new THREE.Mesh(bg, white);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 0.072, 0.03), new THREE.MeshStandardMaterial({ color: 0xc23b22, roughness: 0.4 }));
  stripe.position.set(-0.05, 0.02, 0);
  board.add(deck, stripe);
  for (const [x, z, h] of [[-1.35, 0, 0.17], [-1.2, 0.17, 0.12], [-1.2, -0.17, 0.12]]) {   // three fins under the tail
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.11, h, 0.012), white); f.position.set(x, -0.03 - h / 2, z); f.userData.fin = true; board.add(f);
  }

  // black wetsuit and hood, a red flotation vest
  const suit = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
  const vest = new THREE.MeshStandardMaterial({ color: 0xd2381f, roughness: 0.55 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const root = new THREE.Group(); board.add(root);           // at the pelvis
  const hips = capsule(0.13, 0.12, suit); hips.rotation.z = Math.PI / 2; root.add(hips);
  const spine = new THREE.Group(); root.add(spine);
  const chest = capsule(0.17, 0.3, vest); chest.position.y = 0.28; chest.scale.z = 0.8; spine.add(chest);
  const neck = new THREE.Group(); neck.position.y = 0.55; spine.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), suit); head.position.y = 0.13; neck.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, Math.PI / 2 - 0.8, 1.6, 1.0, 1.0), skin);   // the face, out of the hood
  face.position.set(0, 0.13, 0.025); neck.add(face);
  const arm = side => {
    const a = limb(0.055, UA, suit); a.position.set(side * SHOULDER_W, SHOULDER, 0); spine.add(a);
    const f = limb(0.048, FA, suit); f.position.y = -UA; a.add(f);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), suit); hand.position.y = -FA - 0.03; f.add(hand);
    return [a, f];
  };
  const leg = side => {
    const t = limb(0.075, L1, suit); t.position.set(side * HIP_W, -0.05, 0); root.add(t);
    const s = limb(0.062, L2, suit); s.position.y = -L1; t.add(s);
    const foot = new THREE.Group(); foot.position.y = -L2; s.add(foot);
    const fb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.26), suit); fb.position.set(0, -0.02, 0.06); foot.add(fb);
    return [t, s, foot];
  };
  const [armL, foreL] = arm(1), [armR, foreR] = arm(-1);
  const [thighL, shinL, footL] = leg(1), [thighR, shinR, footR] = leg(-1);
  const parts = { board, root, spine, neck, armL, foreL, armR, foreR, thighL, shinL, footL, thighR, shinR, footR };
  // the simple shapes (all but the fins): surfer.js hides them once the bought models are loaded,
  // and the groups above go on as an invisible skeleton that drives the model's
  const shapes = []; board.traverse(o => { if (o.isMesh && !o.userData.fin) shapes.push(o); });
  return { group: board, parts, shapes, pose: st => pose(parts, st) };
}

// ---- posing ----
const QL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, -Math.PI / 2, 'ZYX'));   // lying: head to the nose, front down
const QS = new THREE.Quaternion();                                                                      // standing
const ID = new THREE.Quaternion(), DOWN = new THREE.Vector3(0, -1, 0);
const QA = new THREE.Quaternion(), QB = new THREE.Quaternion(), QC = new THREE.Quaternion(), QD = new THREE.Quaternion();
const VA = new THREE.Vector3(), VB = new THREE.Vector3();
const mix = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const setRot = (o, x, y, z) => o.rotation.set(x, y, z);

// Two-bone leg: hip at `hip`, ankle wanted at `target` (both in the pelvis frame); the knee bends
// toward `hint`. `blend` goes from a straight leg (0) to the solved one (1).
function legIK(thigh, shin, foot, hip, target, hint, blend) {
  const d = new THREE.Vector3().subVectors(target, hip);
  const len = Math.min(Math.max(d.length(), 0.15), L1 + L2 - 1e-3); d.normalize();
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + len * len - L2 * L2) / (2 * L1 * len))));
  const n = hint.clone().addScaledVector(d, -hint.dot(d)).normalize();
  const tdir = d.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a)).normalize();
  const qt = new THREE.Quaternion().setFromUnitVectors(DOWN, tdir);
  const knee = hip.clone().addScaledVector(tdir, L1);
  const sdir = hip.clone().addScaledVector(d, len).sub(knee).normalize();
  const qs = new THREE.Quaternion().setFromUnitVectors(DOWN, sdir);
  thigh.quaternion.slerpQuaternions(ID, qt, blend);
  shin.quaternion.slerpQuaternions(ID, qt.clone().invert().multiply(qs), blend);
  foot.quaternion.slerpQuaternions(ID, qs.clone().invert(), blend);   // the foot flat on the deck
}

// st: { pop 0 lying .. 1 standing, crouch 0..1, lean -1..1 (+ = leaning toward the toes),
//       paddling, t (time, s), tuck 0..1 (in the barrel), flail 0..1 (wiping out) }
function pose(P, st) {
  const pop = st.pop ?? 0, t = st.t ?? 0;
  const tuck = st.tuck ?? 0, flail = st.flail ?? 0;
  const crouch = Math.min(1.15, Math.max(st.crouch ?? 0.35, tuck * 1.1));
  const lean = st.lean ?? 0;
  // the pop-up in three parts: chest up on the arms, knees in under the body, then up
  const up = sm(0, 0.35, pop), knees = sm(0.3, 0.75, pop), stand = sm(0.65, 1, pop);
  const tilt = 0.12 * up + 0.88 * knees;                    // the whole body: 0 lying, 1 upright
  P.root.quaternion.slerpQuaternions(QL, QS, tilt);
  // the pelvis: on the deck when lying, over the stance when standing
  const hipH = (L1 + L2) * mix(0.6, 0.97 - 0.36 * crouch, stand);
  P.root.position.set(mix(-0.3, -0.02, knees), mix(DECK + 0.15, ANKLE + hipH, knees), 0);
  // spine: arched up on the arms, then bent forward over the knees; a side lean in a carve.
  // Standing, the chest turns toward the nose (shoulders open down the line), as surfers ride.
  const fwd = mix(0, 0.15 + 0.45 * crouch + 0.35 * tuck, stand);
  const twist = stand * (0.38 + 0.12 * crouch - 0.15 * tuck);
  setRot(P.spine, -0.55 * up * (1 - knees) + fwd + 0.6 * knees * (1 - stand), twist, -0.35 * lean * stand);
  // head: lying, lifted to look ahead; standing, turned to look down the line (toward the nose),
  // the chest's turn doing part of it
  setRot(P.neck, mix(-0.7, 0, tilt) - 0.4 * fwd, mix(0, 1.15, stand) - twist, 0);

  // legs
  if (pop < 0.3) {
    const kick = st.paddling ? 0.12 * Math.sin(t * 5.5) : 0;
    setRot(P.thighL, kick, 0, 0.05); setRot(P.thighR, -kick, 0, -0.05);
    setRot(P.shinL, 0.25 * up, 0, 0); setRot(P.shinR, 0.25 * up, 0, 0);
    setRot(P.footL, -0.9, 0, 0); setRot(P.footR, -0.9, 0, 0);   // toes pointed
  } else {
    // ankles on the deck, in the pelvis's frame (the pelvis is upright once the knees are in)
    const sp = mix(0.12, 0.34, stand), y = -(P.root.position.y - ANKLE);
    // the front knee points down the line; the back knee turns in toward it (and more in a crouch)
    legIK(P.thighL, P.shinL, P.footL, new THREE.Vector3(HIP_W, -0.05, 0), new THREE.Vector3(sp + 0.02, y, 0.02), new THREE.Vector3(0.45, 0, 1), sm(0.3, 0.7, pop));
    legIK(P.thighR, P.shinR, P.footR, new THREE.Vector3(-HIP_W, -0.05, 0), new THREE.Vector3(-sp - 0.02, y, 0.05), new THREE.Vector3(0.7 + 0.5 * crouch, 0, 1), sm(0.3, 0.7, pop));
    // feet across the board, the front one angled toward the nose
    P.footL.rotateY(0.38 * stand); P.footR.rotateY(0.12 * stand);
  }

  // arms
  if (stand < 0.01 && up < 0.05) {
    if (st.paddling) {
      // a crawl stroke each side, half a stroke apart: in the water from overhead to the hip, then back over the top
      for (const [a, f, ph, side] of [[P.armL, P.foreL, 0, 1], [P.armR, P.foreR, Math.PI, -1]]) {
        const c = (((t * 5.5 + ph) / (2 * Math.PI)) % 1 + 1) % 1;
        if (c < 0.6) { const k = c / 0.6; setRot(a, -Math.PI + 0.1 + k * (Math.PI - 0.3), 0, side * 0.15); setRot(f, -0.25, 0, 0); }
        else { const k = (c - 0.6) / 0.4; setRot(a, -0.2 - k * (Math.PI - 0.3), 0, side * (0.15 + 1.1 * Math.sin(k * Math.PI))); setRot(f, -0.9 * Math.sin(k * Math.PI), 0, 0); }
      }
    } else {
      setRot(P.armL, -Math.PI / 2 + 0.2, 0, 0.35); setRot(P.armR, -Math.PI / 2 + 0.2, 0, -0.35);   // hands resting by the rails
      setRot(P.foreL, -0.3, 0, 0); setRot(P.foreR, -0.3, 0, 0);
    }
  } else {
    // pushing up: hands on the deck under the shoulders
    const push = up;
    setRot(P.armL, mix(-1.25, -1.4, push), 0, mix(1.05, 0.2, push)); QA.copy(P.armL.quaternion);
    setRot(P.armR, mix(-1.25, -1.4, push), 0, -mix(1.05, 0.2, push)); QB.copy(P.armR.quaternion);
    // standing (directions in the chest's frame: +x the nose, -y down, +z the toe-side rail):
    // the front hand reaches down the line, the back one hangs low by the back hip; in a drop or
    // a crouch both go wider for balance; in a carve the arms swing with the turn
    const bal = sm(0.5, 1.0, crouch), sway = 0.05 * Math.sin(t * 1.7);
    VA.set(0.78 - 0.1 * bal, -0.5 + 0.12 * bal + sway, 0.32 + 0.3 * lean).normalize();
    VB.set(-0.28 - 0.35 * bal - 0.2 * Math.abs(lean), -0.9 + 0.35 * bal, 0.28 - 0.2 * lean).normalize();
    QC.setFromUnitVectors(DOWN, VA); QD.setFromUnitVectors(DOWN, VB);
    P.armL.quaternion.slerpQuaternions(QA, QC, stand);
    P.armR.quaternion.slerpQuaternions(QB, QD, stand);
    setRot(P.foreL, mix(-0.15, -0.35, stand), 0, 0); setRot(P.foreR, mix(-0.15, -0.65 + 0.25 * bal, stand), 0, 0);
    if (tuck > 0) {          // in the barrel: the trailing hand reaches back toward the face of the wave
      P.armR.rotation.x = mix(P.armR.rotation.x, 0.5, tuck); P.armR.rotation.z = mix(P.armR.rotation.z, -0.35, tuck);
      P.armL.rotation.x = mix(P.armL.rotation.x, -1.3, tuck); P.armL.rotation.z = mix(P.armL.rotation.z, 0.6, tuck);
    }
  }
  if (flail > 0) {           // tumbling: arms and legs thrown about
    const w = (k, s) => Math.sin(t * (6 + k) + s);
    for (const [o, k, s, amt] of [[P.armL, 1, 0, 1.6], [P.armR, 2, 2, 1.6], [P.thighL, 3, 1, 0.9], [P.thighR, 0.5, 3, 0.9], [P.spine, 1.5, 0.5, 0.5]]) {
      o.rotation.x = mix(o.rotation.x, amt * w(k, s) - 0.6, flail);
      o.rotation.z = mix(o.rotation.z, amt * 0.7 * w(k + 1, s + 1), flail);
    }
    P.shinL.rotation.x = mix(P.shinL.rotation.x, 0.6 + 0.5 * w(4, 2), flail); P.shinR.rotation.x = mix(P.shinR.rotation.x, 0.6 + 0.5 * w(2, 0), flail);
  }
}
