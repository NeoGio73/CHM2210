// Water materials: the open sea and the breaking waves.
import * as THREE from 'three';
import { glsl as swellGlsl, CENTER, HALF } from './swell.js';

// The water's look, all in one place (linear colours, 0..1). Mavericks is cold, grey-green
// water; these keep that but brighter and bluer than before, with the wave's face lighter
// toward the crest. Lace and curtain set how strong the face's foam lines and the lip's
// falling streaks are (0 turns them off).
export const PALETTE = {
  deep: [0.02, 0.075, 0.11],      // deep water (was 0.012, 0.06, 0.085)
  shallow: [0.035, 0.16, 0.18],   // shallow water (was 0.03, 0.2, 0.19)
  glow: [0.04, 0.3, 0.33],        // light through thin water: the lip, the top of the face (was 0.03, 0.34, 0.3)
  foam: [0.9, 0.93, 0.95],        // whitewater
  faceLift: 1.6,                  // how much lighter the face is at the crest than at its foot
  lace: 1.0,                      // foam lines on the face near the curl
  curtain: 1.0,                   // white streaks falling down the lip
  puffs: 1.0,                     // big grainy foam puffs riding on the whitewater (0 = none, as before)
  crestSpray: 1.0,                // spray feathering off the crest before it breaks (0 = none, as before)
  reflect: 1.0,                   // the wave, cliffs and surfer mirrored in the water (0 = none, as before)
  reflectSize: [0, 0.35, 0.5],    // the mirror's size as a share of the screen, per quality step (0 = off)
  streak: 4.0,                    // ripples this many times longer along the crest than across (1 = round, as before)
  slicks: 0.6,                    // long glassy bands on the water, parallel to the crest (0 = none)
  // the light: a soft, hazy coastal morning (the old, clearer values in brackets)
  haze: {
    skyZenith: [0.22, 0.36, 0.58],   // sky overhead, as the water sees it (0.16, 0.32, 0.6)
    skyHorizon: [0.7, 0.72, 0.74],   // sky at the horizon (0.62, 0.62, 0.62)
    fogColor: [0.62, 0.67, 0.72],    // the haze (0.55, 0.6, 0.66)
    fogDensity: 0.00034,             // per metre: about half gone at 2 km (0.00022, and on the water only)
    ambient: 1.15,                   // light in the shadows, from the bright hazy sky (1.0)
    glint: 0.45,                     // the sun's sharp sparkle on the water (1.0)
    sheen: 0.5,                      // a broad soft shine round it (0)
    turbidity: 7,                    // the sky dome's haze (4)
    rayleigh: 1.2,                   // its blueness (1.6)
    mie: 0.008,                      // its glow round the sun (0.004)
  },
};
const col3 = c => new THREE.Color(c[0], c[1], c[2]);
const HZ = PALETTE.haze;

export const common = {
  uDeep: { value: col3(PALETTE.deep) },
  uShallow: { value: col3(PALETTE.shallow) },
  uGlow: { value: col3(PALETTE.glow) },
  uFoamTint: { value: col3(PALETTE.foam) },
  uFaceLift: { value: PALETTE.faceLift },
  uLace: { value: PALETTE.lace },
  uCurtain: { value: PALETTE.curtain },
  uCrest: { value: new THREE.Vector2(0, 1) },   // direction along the crest (east, north)
  uRefl: { value: null },                       // the mirror's picture (reflect.js)
  uReflMatrix: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
  uStreak: { value: PALETTE.streak },
  uSlicks: { value: PALETTE.slicks },
  uAmbient: { value: HZ.ambient },
  uGlint: { value: HZ.glint },
  uSheen: { value: HZ.sheen },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1.0, 0.86, 0.7).multiplyScalar(2.2) },
  uSkyZenith: { value: col3(HZ.skyZenith) },
  uSkyHorizon: { value: col3(HZ.skyHorizon) },
  uFogColor: { value: col3(HZ.fogColor) },
  uFogDensity: { value: HZ.fogDensity },
  uTime: { value: 0 },
  uSea: { value: 0 },
  uDepth: { value: null },          // water depth, 0..40 m in 0..1
  uDepthRect: { value: new THREE.Vector4() },   // x0, y0 (north), width, height of the depth map in metres
  uFoam: { value: null },
  uFoamRect: { value: new THREE.Vector4() },
};

const shading = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyZenith; uniform vec3 uSkyHorizon;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime; uniform float uSea;
uniform sampler2D uDepth; uniform vec4 uDepthRect; uniform sampler2D uFoam; uniform vec4 uFoamRect;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uGlow; uniform vec3 uFoamTint;
uniform float uFaceLift; uniform float uLace; uniform float uCurtain; uniform vec2 uCrest;
uniform float uStreak; uniform float uSlicks; uniform float uAmbient; uniform float uGlint; uniform float uSheen;
uniform sampler2D uRefl; uniform mat4 uReflMatrix; uniform float uReflOn;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 skyColor(vec3 r) {
  float e = clamp(r.y, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(e, 0.45));
  float s = max(dot(r, uSunDir), 0.0);
  return c + uSunColor * (pow(s, 6.0) * 0.18 + pow(s, 200.0) * 2.0);
}
float waterDepth(vec2 xy) {          // xy: metres east, north
  vec2 uv = (xy - uDepthRect.xy) / uDepthRect.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 60.0;
  return texture2D(uDepth, uv).r * 40.0;
}
float foamAt(vec2 xy) {
  vec2 uv = (xy - uFoamRect.xy) / uFoamRect.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return texture2D(uFoam, uv).r;
}
vec3 waterBody(float depth) {
  return mix(uShallow, uDeep, smoothstep(3.0, 28.0, depth));
}
// foam lace: the edges of moving cells, broken into pieces. Returns 0..1 (1 on a line).
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float cellEdge(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * hash2(i + g));
      vec2 r = g + o - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  return sqrt(d2) - sqrt(d1);
}
float lace(vec2 p, float t, float width) {
  // bend the cells so the lines curve and wander instead of running straight
  vec2 w = vec2(vnoise(p * 0.8), vnoise(p * 0.8 + 5.2)) - 0.5;
  vec2 pw = p + w * 1.4;
  float wid = width * (0.4 + 1.2 * vnoise(p * 1.9 + 1.7));     // thick and thin along each line
  float e = cellEdge(pw, t), aa = fwidth(e) * 1.5 + 1e-4;
  float line = 1.0 - smoothstep(wid, wid + aa, e);
  float e2 = cellEdge(pw * 2.4 + 7.1, t * 1.3), aa2 = fwidth(e2) * 1.5 + 1e-4;
  line = max(line, (1.0 - smoothstep(wid * 0.6, wid * 0.6 + aa2, e2)) * 0.55);
  // broken into pieces, as foam lines are; far away (lines too fine to draw) it becomes a light haze
  line *= smoothstep(0.42, 0.68, vnoise(p * 1.3 + 3.3));
  return mix(line, 0.08, smoothstep(0.25, 0.6, aa));
}
// wpos: the point's world position; mirror (0..1): how far it may show the mirror's picture
vec3 shadeWater(vec3 n, vec3 V, vec3 base, float foam, float thin, float dist, vec3 wpos, float mirror) {
  vec3 L = uSunDir;
  float ndl = max(dot(n, L), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n); R.y = abs(R.y);
  vec3 col = base * (uSkyZenith * 0.9 * uAmbient + uSunColor * 0.25 * ndl);
  // light through thin water (the lip, the top of a steep face), strongest looking toward the sun
  float back = 0.35 + 1.4 * pow(max(dot(-V, L), 0.0), 3.0);
  col += uGlow * thin * back * uSunColor * 0.35;
  vec3 env = skyColor(R);
  if (uReflOn > 0.0 && mirror > 0.0) {
    // the mirrored scene where there is something in it, wobbled by the ripples; the sky elsewhere
    vec4 rc = uReflMatrix * vec4(wpos, 1.0);
    vec2 uv = rc.xy / rc.w + n.xz * 0.05;
    float edge = smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x) * smoothstep(0.0, 0.04, uv.y) * smoothstep(1.0, 0.96, uv.y);
    vec4 m = texture2D(uRefl, clamp(uv, 0.002, 0.998));
    env = mix(env, m.rgb, clamp(m.a, 0.0, 1.0) * mirror * uReflOn * edge);
  }
  col = mix(col, env, fres);
  float rl = max(dot(R, L), 0.0);
  col += uSunColor * (pow(rl, 500.0) * 25.0 * uGlint + pow(rl, 30.0) * 0.35 * uSheen) * (1.0 - foam);
  vec3 foamCol = uFoamTint * (uSkyZenith * 1.1 + uSunColor * 0.45 * (0.4 + 0.6 * ndl));
  col = mix(col, foamCol, clamp(foam, 0.0, 1.0));
  return mix(col, uFogColor, 1.0 - exp(-dist * uFogDensity));
}
`;

const tail = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// the open sea. inner = true: the detailed square round the reef, a fine sheet that moves with
// the background swell (swell.js). inner = false: a flat sheet to the horizon, cut away where
// the detailed square is. Both are cut away in the bands where a breaking wave strip lies.
export function oceanMaterial(maxBands, inner) {
  return new THREE.ShaderMaterial({
    uniforms: { ...common, uBands: { value: Array.from({ length: maxBands }, () => new THREE.Vector4()) },
      uDir: { value: new THREE.Vector2(1, 0) }, uVRange: { value: new THREE.Vector2(-1e9, 1e9) } },
    vertexShader: /* glsl */`
      uniform float uTime; uniform sampler2D uDepth; uniform vec4 uDepthRect;
      varying vec3 vW; varying vec2 vGrad;
      ${swellGlsl}
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vGrad = vec2(0.0);
        ${inner ? `
        vec2 xy = vec2(w.x, -w.z);
        vec2 uv = (xy - uDepthRect.xy) / uDepthRect.zw;
        float depth = (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) ? 60.0 : texture2D(uDepth, uv).r * 40.0;
        vec3 s = swellH(xy, uTime); float f = swellFade(depth, xy);
        w.y += s.x * f; vGrad = s.yz * f;` : ''}
        vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: shading + /* glsl */`
      uniform vec4 uBands[${maxBands}]; uniform vec2 uDir; uniform vec2 uVRange;
      varying vec3 vW; varying vec2 vGrad;
      void main() {
        vec2 xy = vec2(vW.x, -vW.z);
        ${inner ? '' : `if (all(lessThan(abs(xy - vec2(${CENTER[0].toFixed(1)}, ${CENTER[1].toFixed(1)})), vec2(${(HALF - 2).toFixed(1)})))) discard;`}
        float u = dot(xy, uDir), v = dot(xy, vec2(-uDir.y, uDir.x));
        if (v > uVRange.x && v < uVRange.y)
          for (int i = 0; i < ${maxBands}; i++)
            if (uBands[i].z > 0.5 && abs(u - uBands[i].x) < uBands[i].y) discard;
        // ripples: layered drifting noise (slopes from its differences), plus a gentle background swell
        float dist = length(cameraPosition - vW);
        vec2 g = vec2(0.0);
        float amp = 0.5, fr = 0.09;
        // ripples in the crest's frame (a: along the crest, b: toward the shore), stretched along
        // the crest, so the water reads as long lines parallel to the waves
        float a = dot(xy, uCrest), b = dot(xy, uDir);
        for (int i = 0; i < 4; i++) {
          vec2 drift = vec2(0.25 * float(i) - 0.3, 1.0) * uTime * (1.2 + 0.5 * float(i));
          vec2 p = (vec2(a / uStreak, b) + drift) * fr;
          float e = 0.35;
          float ha = vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0));
          float hb = vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e));
          float fade = 1.0 / (1.0 + dist * fr * 0.02);
          vec2 gp = vec2(ha, hb) / (2.0 * e) * fr * amp * fade;
          g += uCrest * gp.x / uStreak + uDir * gp.y;
          amp *= 0.55; fr *= 2.3;
        }
        // glassy bands: long patches, parallel to the crest, where the ripples die down
        float slick = smoothstep(0.45, 0.75, vnoise(vec2(a * 0.0035, b * 0.03) + vec2(0.0, uTime * 0.01)));
        g *= 1.0 - 0.8 * uSlicks * slick;
        g += vGrad;
        vec3 n = normalize(vec3(-g.x, 1.0, g.y));
        vec3 V = normalize(cameraPosition - vW);
        float depth = waterDepth(xy);
        float f = foamAt(xy);
        float pattern = vnoise(xy * 0.16 + uTime * 0.05) * 0.6 + vnoise(xy * 0.5) * 0.4;
        f = clamp(f * (0.55 + 0.9 * pattern), 0.0, 1.0);
        f = smoothstep(0.15, 0.85, f);
        vec3 col = shadeWater(n, V, waterBody(depth), f, 0.0, dist, vW, 1.0 - f);
        gl_FragColor = vec4(col, 1.0);
        ${tail}
      }`,
  });
}

// Foam puffs: soft clumps of whitewater drawn as camera-facing sprites, lit like the foam on the
// wave (white on top, a cool shadow underneath) and fading into the haze. Per sprite: size
// (metres), alpha, which of the four pictures in the atlas, and a turn.
export function puffMaterial(atlas) {
  return new THREE.ShaderMaterial({
    uniforms: { ...common, uAtlas: { value: atlas }, uScale: { value: 500 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float size; attribute float alpha; attribute float cell; attribute float rot;
      uniform float uScale;
      varying float vAlpha; varying float vCell; varying float vRot; varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(size * uScale / max(-mv.z, 0.1), 900.0);
        vAlpha = alpha; vCell = cell; vRot = rot; vDist = -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uAtlas; uniform vec3 uFoamTint; uniform vec3 uSkyZenith; uniform vec3 uSunColor;
      uniform float uAmbient; uniform vec3 uFogColor; uniform float uFogDensity;
      varying float vAlpha; varying float vCell; varying float vRot; varying float vDist;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float cs = cos(vRot), sn = sin(vRot);
        vec2 r = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) + 0.5;
        if (any(lessThan(r, vec2(0.0))) || any(greaterThan(r, vec2(1.0)))) discard;
        vec2 cellXY = vec2(mod(vCell, 2.0), floor(vCell / 2.0));
        vec4 t = texture2D(uAtlas, (cellXY + r) * 0.5);
        float a = t.a * vAlpha;
        if (a < 0.01) discard;
        float lit = mix(0.25, 1.0, 1.0 - gl_PointCoord.y) * (0.7 + 0.3 * t.r);   // light from above, lumps within
        vec3 col = uFoamTint * (uSkyZenith * 1.1 * uAmbient + uSunColor * 0.45 * lit);
        col *= mix(0.8, 1.0, lit);
        col = mix(col, uFogColor, 1.0 - exp(-vDist * uFogDensity));
        gl_FragColor = vec4(col, a);
        ${tail}
      }`,
  });
}

// the picture for the puffs: four clumps of overlapping soft blobs whose edges break up into
// grain (as whitewater does), in a 2 x 2 atlas
export function puffAtlas(size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), h = size / 2;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lump = document.createElement('canvas'); lump.width = lump.height = size;
  const lg = lump.getContext('2d');
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * h, oy = Math.floor(cell / 2) * h, cx = ox + h / 2, cy = oy + h * 0.55;
    for (let i = 0; i < 14; i++) {                       // the clump's shape
      const a = rnd() * 6.283, d = rnd() * h * 0.2, r = h * (0.12 + rnd() * 0.16);
      const x = cx + Math.cos(a) * d * 1.3, y = cy + Math.sin(a) * d - rnd() * h * 0.08;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(ox, oy, h, h);
    }
    for (let i = 0; i < 10; i++) {                       // brighter lumps inside it
      const x = cx + (rnd() - 0.5) * h * 0.5, y = cy + (rnd() - 0.6) * h * 0.4, r = h * (0.05 + rnd() * 0.08);
      const gr = lg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      lg.fillStyle = gr; lg.fillRect(ox, oy, h, h);
    }
  }
  const img = g.getImageData(0, 0, size, size), lu = lg.getImageData(0, 0, size, size).data, d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255, n = 0.15 + 0.7 * rnd();
    // solid inside, speckled toward the edge, nothing past it
    const t = Math.min(1, Math.max(0, (a - n + 0.2) / 0.25));
    d[i + 3] = 255 * t * t * (3 - 2 * t) * Math.min(1, a * 2.2);
    const b = 150 + 105 * Math.min(1, lu[i + 3] / 255);
    d[i] = d[i + 1] = d[i + 2] = b;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function waveMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: common,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: /* glsl */`
      attribute float foam; attribute float thin; attribute vec2 fx;
      uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying float vFoam; varying float vThin; varying float vChurn; varying vec2 vFx;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vnoise3(vec3 p) {
        vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), u.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y), u.z);
      }
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        // whitewater churns: lumps that boil and roll, bigger where the foam is thick
        float c = vnoise3(vec3(w.xz * 0.12, uTime * 0.9)) * 0.65 + vnoise3(vec3(w.xz * 0.35, uTime * 1.7 + 3.0)) * 0.35;
        float amt = smoothstep(0.25, 0.9, foam);
        w.xyz += n * (c - 0.35) * 1.6 * amt;
        vW = w.xyz; vN = n; vFoam = foam; vThin = thin; vChurn = c * amt; vFx = fx;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: shading + /* glsl */`
      varying vec3 vW; varying vec3 vN; varying float vFoam; varying float vThin; varying float vChurn; varying vec2 vFx;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        if (dot(n, V) < 0.0) n = -n;
        vec2 xy = vec2(vW.x, -vW.z);
        // small ripples running up the face; rougher where the water is white
        float along = dot(xy, uCrest);                 // metres along the crest
        float across = dot(xy, vec2(uCrest.y, -uCrest.x));
        float up = vW.y - uSea;                        // metres above the flat sea
        // stretched along the crest, as on the open sea; glassy bands on the flat water ahead
        float rough = 0.12 + 0.5 * smoothstep(0.3, 0.9, vFoam);
        float onFlat = 1.0 - smoothstep(0.5, 3.0, up);
        float slick = smoothstep(0.45, 0.75, vnoise(vec2(along * 0.0035, across * 0.03) + vec2(0.0, uTime * 0.01)));
        rough *= 1.0 - 0.8 * uSlicks * slick * onFlat * (1.0 - smoothstep(0.1, 0.4, vFoam));
        vec2 q = vec2(along * 0.35 / uStreak, across * 0.35 + up * 0.4) + vec2(uTime * 0.1, uTime * 0.6);
        float rx = vnoise(q) - 0.5, rz = vnoise(q + vec2(17.3, 5.1)) - 0.5;
        // close to the camera, finer and stronger chop: the water near the board is what shows
        // how fast you are going past it
        float near = exp(-length(cameraPosition - vW) / 25.0) * (1.0 - smoothstep(0.3, 0.8, vFoam));
        vec2 q2 = q * 3.7 + vec2(5.3, 1.7);
        rx += near * 1.3 * (vnoise(q2) - 0.5); rz += near * 1.3 * (vnoise(q2 + vec2(9.1, 3.7)) - 0.5);
        rough *= 1.0 + 0.8 * near;
        n = normalize(n + vec3(rx, 0.0, rz) * rough);
        float f = vFoam * (0.6 + 0.8 * vnoise(xy * 0.22 + vec2(0.0, vW.y * 0.3) + uTime * 0.2));
        f = smoothstep(0.12, 0.8, f);
        float dist = length(cameraPosition - vW);
        // the lip's falling curtain: long streaks running down the thrown sheet, moving down
        float s1 = vnoise(vec2(along * 1.1, up * 0.07 + uTime * 1.6));
        float s2 = vnoise(vec2(along * 2.9 + 11.0, up * 0.12 + uTime * 2.3));
        float streak = smoothstep(0.5, 0.78, s1 * 0.6 + s2 * 0.4);
        float curtain = clamp(vFx.y * uCurtain, 0.0, 1.0);
        f = max(f, streak * curtain);
        // foam lace on the face near the curl: a web of broken lines, slowly drifting
        float laceAmt = clamp(vFx.x * uLace, 0.0, 1.0) * (1.0 - smoothstep(0.5, 0.9, vFoam));
        if (laceAmt > 0.01) {
          vec2 lp = vec2(along * 0.09, up * 0.2 + dot(xy, vec2(-uCrest.y, uCrest.x)) * 0.05);
          float ln = lace(lp + vec2(0.0, uTime * 0.05), uTime * 0.25, 0.025 + 0.03 * laceAmt);
          f = max(f, ln * laceAmt * 0.9);
        }
        // the face is lighter toward the crest (more light comes through as the water thins)
        vec3 body = waterBody(waterDepth(xy)) * mix(1.0, uFaceLift, smoothstep(0.0, 14.0, up));
        // between the streaks the thin sheet glows a little more
        float thinMore = vThin * (1.0 + 0.6 * curtain * (1.0 - streak));
        // only the flat water mirrors the scene (a steep face would need a mirror of its own)
        float mirror = smoothstep(0.85, 0.97, abs(normalize(vN).y)) * (1.0 - f);
        vec3 col = shadeWater(n, V, body, f, thinMore, dist, vW, mirror);
        // foam is patchy: bright tops of the lumps, greyer hollows between them
        col *= mix(1.0, 0.72 + 0.5 * vChurn / max(smoothstep(0.25, 0.9, vFoam), 0.05), f);
        gl_FragColor = vec4(col, 1.0);
        ${tail}
      }`,
  });
}
