// The background sea between and under the sets: a few long swell trains and some wind chop.
// One list, used both by the open sea (in its shader) and by the breaking-wave strips (in
// JavaScript), so the two move together without a seam.
// Heights are amplitudes (half the crest-to-trough height). They fade out in shallow water
// (they would break or be absorbed there) and far from the reef (beyond the detailed sea).

const C = [   // amplitude m, period s, wavelength m (in 20-40 m of water), coming from (deg)
  [0.70, 17.4, 290, 284],
  [0.45, 13.0, 200, 293],
  [0.30, 9.0, 115, 275],
  [0.15, 6.5, 62, 300],
];
export const CENTER = [300, 0];        // middle of the detailed sea, local metres
export const HALF = 3500;              // half its width

export const comps = C.map(([a, T, L, from], i) => {
  const bt = (from + 180) * Math.PI / 180;
  return { a, k: 2 * Math.PI / L, w: 2 * Math.PI / T, dx: Math.sin(bt), dy: Math.cos(bt), ph: i * 1.9 };
});

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function fade(depth, x, y) {
  return smooth(1, 7, depth) * (1 - smooth(HALF - 900, HALF - 100, Math.max(Math.abs(x - CENTER[0]), Math.abs(y - CENTER[1]))));
}
// height of the background sea above the flat sea (before the fade)
export function height(x, y, t) {
  let h = 0;
  for (const c of comps) h += c.a * Math.cos(c.k * (c.dx * x + c.dy * y) - c.w * t + c.ph);
  return h;
}

// the same in GLSL: swellH(xy, t) -> vec3(height, dh/dx, dh/dy)
export const glsl = `
vec3 swellH(vec2 xy, float t) {
  vec3 r = vec3(0.0); float p;
${comps.map(c => `  p = ${c.k.toFixed(6)} * dot(vec2(${c.dx.toFixed(6)}, ${c.dy.toFixed(6)}), xy) - ${c.w.toFixed(6)} * t + ${c.ph.toFixed(3)};
  r.x += ${c.a.toFixed(3)} * cos(p); r.yz -= ${(c.a * c.k).toFixed(6)} * sin(p) * vec2(${c.dx.toFixed(6)}, ${c.dy.toFixed(6)});`).join('\n')}
  return r;
}
float swellFade(float depth, vec2 xy) {
  vec2 d = abs(xy - vec2(${CENTER[0].toFixed(1)}, ${CENTER[1].toFixed(1)}));
  return smoothstep(1.0, 7.0, depth) * (1.0 - smoothstep(${(HALF - 900).toFixed(1)}, ${(HALF - 100).toFixed(1)}, max(d.x, d.y)));
}
`;
