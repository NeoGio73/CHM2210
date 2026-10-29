// Loads the game's packed models (web/models/*.pak, made by tools/pack_model.mjs from the bought
// models kept outside web/): undoes the scrambling and hands the glTF to three.js.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function seedOf(name) {
  let h = 0x9e3779b9;
  for (const ch of 'mavericks-' + name) h = Math.imul(h ^ ch.charCodeAt(0), 0x85ebca6b) >>> 0;
  return h || 1;
}
function unscramble(bytes, name) {
  const b = new Uint8Array(bytes);                       // a copy
  for (let i = 0; i < b.length; i += 4096) b.subarray(i, Math.min(i + 4096, b.length)).reverse();
  let x = seedOf(name);
  for (let i = 0; i < b.length; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    b[i] ^= x & 0xff;
  }
  return b;
}

export async function loadPak(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const all = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(all.buffer);
  if (String.fromCharCode(...all.subarray(0, 4)) !== 'MVPK' || dv.getUint32(4, true) !== 1) throw new Error(`${url}: not a model pack`);
  const glb = unscramble(all.subarray(12, 12 + dv.getUint32(8, true)), name);
  return new GLTFLoader().parseAsync(glb.buffer, '');
}
