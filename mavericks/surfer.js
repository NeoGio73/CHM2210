// The bought surfer and board (web/models/*.pak), in place of the simple shapes of figure.js.
//
// The simple figure stays, unseen, as the skeleton that is posed (figure.js does the pop-up,
// the crouch, the barrel tuck, the wipeout and the IK that keeps the feet on the deck). Each
// frame its joints' turns are copied onto the matching bones of the bought model. The model
// stands in an A-pose (arms angled down), the simple figure with its arms and legs hanging
// straight, so first the model's limbs are swung to hang straight too; from then on a bone's
// turn is the simple joint's turn applied to that straightened rest.
//
// Our own additions, since a cold-water big-wave surfer wears more than the model does: a
// neoprene hood, a red flotation vest, a leash from the tail to the back ankle. The board is the
// bought board's shape only, painted here (BOARD_PAINT): the pack's own textures were not used.
import * as THREE from 'three';
import { loadPak } from './models.js';

// The board's paint: change these and reload. Colours as CSS colours; null leaves a part out.
// After his reference photo (29 October 2026): a lime-green gun, a thin dark line round the rails,
// a pale wood stringer. Its logo and fin plugs are left out.
export const BOARD_PAINT = {
  base: '#72de3c',        // the board (deck and bottom)
  rails: '#14191c',       // a colour coming in from the rails toward the middle
  railWidth: 0.07,        // how far in it reaches (share of the half-width): here a thin edge line
  pinline: null,          // a thin line where the rails' colour ends
  stringer: '#dccba2',    // the wooden stringer down the middle
  text: '',               // words on the deck near the nose, reading along the board
  textColor: '#16181b',
};

const DECK = 0.065;       // the top of the deck (figure.js stands the feet here)
// the simple figure's joints and the model's bones; the third name is the next joint down the
// limb, whose direction is straightened to hang down like the simple figure's
const MAP = [
  ['root', 'root', null], ['spine', 'spine05', null], ['neck', 'neck01', null],
  ['armL', 'upperarm01.L', 'lowerarm01.L'], ['foreL', 'lowerarm01.L', 'wrist.L'],
  ['armR', 'upperarm01.R', 'lowerarm01.R'], ['foreR', 'lowerarm01.R', 'wrist.R'],
  ['thighL', 'upperleg01.L', 'lowerleg01.L'], ['shinL', 'lowerleg01.L', 'foot.L'], ['footL', 'foot.L', null],
  ['thighR', 'upperleg01.R', 'lowerleg01.R'], ['shinR', 'lowerleg01.R', 'foot.R'], ['footR', 'foot.R', null],
];
// three.js drops . : / [ ] from node names and turns spaces into _
const nodeName = n => n.replace(/[\[\]\.:\/]/g, '').replace(/\s/g, '_');

function paintCanvas(P) {
  const W = 2048, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = P.base; g.fillRect(0, 0, W, H);
  const band = H / 2 * P.railWidth;
  if (P.rails) for (const [y0, y1] of [[0, band], [H, H - band]]) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, P.rails); gr.addColorStop(0.55, P.rails); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, Math.min(y0, y1), W, band);
  }
  if (P.pinline) { g.fillStyle = P.pinline; g.fillRect(0, band - 3, W, 4); g.fillRect(0, H - band - 1, W, 4); }
  if (P.stringer) { g.fillStyle = P.stringer; g.fillRect(0, H / 2 - 3, W, 6); }
  if (P.text) {
    g.fillStyle = P.textColor; g.font = `bold ${Math.round(H * 0.13)}px "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(P.text, W * 0.72, H / 2 + H * 0.17);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// UVs for the paint: u along the board (tail 0, nose 1), v across it relative to the board's own
// width at that point, so the rails' colour follows the outline to the nose and the tail
function boardUVs(geo) {
  const p = geo.attributes.position, n = p.count, NB = 64;
  geo.computeBoundingBox(); const bb = geo.boundingBox, L = bb.max.x - bb.min.x;
  const half = new Float32Array(NB).fill(0.005);
  for (let i = 0; i < n; i++) { const b = Math.min(NB - 1, Math.floor((p.getX(i) - bb.min.x) / L * NB)); half[b] = Math.max(half[b], Math.abs(p.getZ(i))); }
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const u = (p.getX(i) - bb.min.x) / L, b = Math.min(NB - 1, Math.floor(u * NB));
    uv[2 * i] = u; uv[2 * i + 1] = Math.min(1, Math.max(0, 0.5 + p.getZ(i) / (2 * half[b])));
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return bb;
}

export async function upgradeRider(rider) {
  const [sg, bg] = await Promise.all([loadPak(new URL('./models/surfer.pak', import.meta.url), 'surfer'),
                                      loadPak(new URL('./models/board.pak', import.meta.url), 'board')]);
  const G = rider.group, P = rider.parts;

  // ---- the board ----
  const bmesh = bg.scene.getObjectByProperty('isMesh', true);
  const bgeo = bmesh.geometry.clone();
  bmesh.updateWorldMatrix(true, false); bgeo.applyMatrix4(bmesh.matrixWorld);
  const bb = boardUVs(bgeo);
  const board = new THREE.Mesh(bgeo, new THREE.MeshPhysicalMaterial({ map: paintCanvas(BOARD_PAINT), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }));
  board.position.y = DECK - bb.max.y;
  G.add(board);

  // ---- the surfer ----
  const model = sg.scene; G.add(model);
  model.traverse(o => { if (o.isSkinnedMesh || o.isMesh) { o.frustumCulled = false; } });
  const bone = n => { const b = model.getObjectByName(nodeName(n)); if (!b) throw new Error('no bone ' + n); return b; };
  const toG = new THREE.Matrix4(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const refresh = () => { G.updateMatrixWorld(true); toG.copy(G.matrixWorld).invert(); };
  const rotG = (o, out) => out.setFromRotationMatrix(m.multiplyMatrices(toG, o.matrixWorld).extractRotation(m));
  const posG = (o, out) => out.setFromMatrixPosition(o.matrixWorld).applyMatrix4(toG);
  refresh();
  // straighten the model's limbs to hang down like the simple figure's, parents first
  const DOWN = new THREE.Vector3(0, -1, 0), rp = new THREE.Quaternion(), rc = new THREE.Quaternion();
  const links = MAP.map(([part, b, child]) => ({ part: P[part], bone: bone(b), child: child && bone(child), rest: new THREE.Quaternion() }));
  for (const L of links) {
    if (L.child) {
      posG(L.bone, v); posG(L.child, w);
      const swing = q.setFromUnitVectors(w.sub(v).normalize(), DOWN);
      rotG(L.bone, rc); rc.premultiply(swing);
      rotG(L.bone.parent, rp);
      L.bone.quaternion.copy(rp.invert().multiply(rc));
      L.bone.updateMatrixWorld(true);
    }
    rotG(L.bone, L.rest);
  }
  // where the model's hips sit below its root bone, and the ankle's height above the sole
  const hipBelowRoot = new THREE.Vector3(0, -0.05, 0);       // the simple figure's hips: 5 cm under its pelvis
  posG(bone('upperleg01.L'), v); posG(bone('root'), w); hipBelowRoot.y -= v.y - w.y;
  posG(bone('foot.L'), v); const ankleLift = v.y - 0.05;        // the simple figure's ankle is 5 cm over the deck

  // ---- our additions: hood, gloves, booties and vest, made from the body's own surface ----
  // Each is a copy of part of the body mesh, pushed out along its normals a few millimetres and
  // skinned to the same skeleton, so it bends exactly as the body does.
  const body = (() => { let best = null; model.traverse(o => { if (o.isSkinnedMesh && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = o; }); return best; })();
  const names = body.skeleton.bones.map(b => b.name);
  const boneSet = re => new Set(names.map((n, i) => re.test(n) ? i : -1).filter(i => i >= 0));
  const ARM = boneSet(/^(shoulder01|upperarm|lowerarm|wrist|finger|metacarpal)/), HAND = boneSet(/^(wrist|finger|metacarpal)/);
  const bp = body.geometry.attributes.position, bn = body.geometry.attributes.normal;
  const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight, idx = body.geometry.index;
  const share = (i, set) => { let s = 0; for (let k = 0; k < 4; k++) if (set.has(si.getComponent(i, k))) s += sw.getComponent(i, k); return s; };
  function shell(keep, out, colour, roughness) {
    const g = new THREE.BufferGeometry(), n = bp.count, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) pos[3 * i + k] = bp.array[3 * i + k] + bn.array[3 * i + k] * out;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    for (const a of ['normal', 'uv', 'skinIndex', 'skinWeight']) if (body.geometry.attributes[a]) g.setAttribute(a, body.geometry.attributes[a]);
    const tri = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (keep(a) && keep(b) && keep(c)) tri.push(a, b, c);
    }
    g.setIndex(tri);
    const s = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ color: colour, roughness, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    s.frustumCulled = false; s.position.copy(body.position); s.quaternion.copy(body.quaternion); s.scale.copy(body.scale);
    body.parent.add(s); s.bind(body.skeleton, body.bindMatrix);
    return s;
  }
  const X = i => bp.getX(i), Y = i => bp.getY(i), Z = i => bp.getZ(i);
  // the hood: head and neck, with an oval opening for the face
  const face = i => Z(i) > 0.045 && (X(i) / 0.068) ** 2 + ((Y(i) - 1.665) / 0.098) ** 2 < 1;
  shell(i => Y(i) > 1.5 && !face(i) && share(i, ARM) < 0.2, 0.006, 0x101215, 0.5);
  shell(i => share(i, HAND) > 0.5, 0.004, 0x101215, 0.55);                // gloves
  shell(i => Y(i) < 0.13, 0.005, 0x101215, 0.6);                            // booties
  shell(i => Y(i) > 1.06 && Y(i) < 1.46 && share(i, ARM) < 0.25, 0.017, 0xc8321e, 0.62);   // the vest
  const NL = 18, leashPos = new Float32Array(NL * 3);
  const leashGeo = new THREE.BufferGeometry(); leashGeo.setAttribute('position', new THREE.BufferAttribute(leashPos, 3));
  const leash = new THREE.Line(leashGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
  leash.frustumCulled = false; G.add(leash);
  const tail = new THREE.Vector3(bb.min.x + 0.08, DECK + 0.005, 0), ankleB = bone('foot.R');

  // the simple shapes go; the fins stay (the bought board has none)
  for (const s of rider.shapes) s.visible = false;

  const drive = rider.pose;
  const rd = new THREE.Quaternion(), p = new THREE.Vector3();
  rider.pose = st => {
    drive(st);
    refresh();
    for (const L of links) {
      rotG(L.part, rd).multiply(L.rest);                    // the simple joint's turn on the straightened rest
      rotG(L.bone.parent, rp);
      L.bone.quaternion.copy(rp.invert().multiply(rd));
      if (L.part === P.root) {                              // and the hips where the simple figure's are
        p.copy(hipBelowRoot).applyQuaternion(rotG(P.root, rc)).add(P.root.position); p.y += ankleLift;
        L.bone.position.copy(L.bone.parent.worldToLocal(p.applyMatrix4(G.matrixWorld)));
      }
      L.bone.updateMatrixWorld(true);
    }
    // the leash: tail to back ankle, sagging onto the deck
    posG(ankleB, v);
    const sag = Math.max(DECK + 0.01, Math.min(v.y, tail.y) - 0.12);
    for (let i = 0; i < NL; i++) {
      const t = i / (NL - 1), a = 2 * t * (1 - t);
      leashPos[3 * i] = tail.x + (v.x - tail.x) * t;
      leashPos[3 * i + 1] = (1 - t) * (1 - t) * tail.y + a * sag + t * t * v.y;
      leashPos[3 * i + 2] = tail.z + (v.z - tail.z) * t;
    }
    leashGeo.attributes.position.needsUpdate = true;
  };
  return rider;
}
