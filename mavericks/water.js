// Water materials: the open sea and the breaking waves.
import * as THREE from 'three';
import { glsl as swellGlsl, CENTER, HALF } from './swell.js';

export const common = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1.0, 0.86, 0.7).multiplyScalar(2.2) },
  uSkyZenith: { value: new THREE.Color(0.16, 0.32, 0.6) },
  uSkyHorizon: { value: new THREE.Color(0.62, 0.62, 0.62) },
  uFogColor: { value: new THREE.Color(0.55, 0.6, 0.66) },
  uFogDensity: { value: 0.00022 },
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
  vec3 deep = vec3(0.012, 0.06, 0.085), shallow = vec3(0.03, 0.2, 0.19);
  return mix(shallow, deep, smoothstep(3.0, 28.0, depth));
}
vec3 shadeWater(vec3 n, vec3 V, vec3 base, float foam, float thin, float dist) {
  vec3 L = uSunDir;
  float ndl = max(dot(n, L), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n); R.y = abs(R.y);
  vec3 col = base * (uSkyZenith * 0.9 + uSunColor * 0.25 * ndl);
  // light through thin water (the lip, the top of a steep face), strongest looking toward the sun
  float back = 0.35 + 1.4 * pow(max(dot(-V, L), 0.0), 3.0);
  col += vec3(0.03, 0.34, 0.3) * thin * back * uSunColor * 0.35;
  col = mix(col, skyColor(R), fres);
  col += uSunColor * pow(max(dot(R, L), 0.0), 500.0) * 25.0 * (1.0 - foam);
  vec3 foamCol = vec3(0.9, 0.93, 0.95) * (uSkyZenith * 1.1 + uSunColor * 0.45 * (0.4 + 0.6 * ndl));
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
        for (int i = 0; i < 4; i++) {
          vec2 drift = vec2(1.0, 0.25 * float(i) - 0.3) * uTime * (1.2 + 0.5 * float(i));
          vec2 p = (xy + drift) * fr;
          float e = 0.35;
          float hx = vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0));
          float hy = vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e));
          float fade = 1.0 / (1.0 + dist * fr * 0.02);
          g += vec2(hx, hy) / (2.0 * e) * fr * amp * fade;
          amp *= 0.55; fr *= 2.3;
        }
        g += vGrad;
        vec3 n = normalize(vec3(-g.x, 1.0, g.y));
        vec3 V = normalize(cameraPosition - vW);
        float depth = waterDepth(xy);
        float f = foamAt(xy);
        float pattern = vnoise(xy * 0.16 + uTime * 0.05) * 0.6 + vnoise(xy * 0.5) * 0.4;
        f = clamp(f * (0.55 + 0.9 * pattern), 0.0, 1.0);
        f = smoothstep(0.15, 0.85, f);
        vec3 col = shadeWater(n, V, waterBody(depth), f, 0.0, dist);
        gl_FragColor = vec4(col, 1.0);
        ${tail}
      }`,
  });
}

export function waveMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: common,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: /* glsl */`
      attribute float foam; attribute float thin;
      uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying float vFoam; varying float vThin; varying float vChurn;
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
        vW = w.xyz; vN = n; vFoam = foam; vThin = thin; vChurn = c * amt;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: shading + /* glsl */`
      varying vec3 vW; varying vec3 vN; varying float vFoam; varying float vThin; varying float vChurn;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        if (dot(n, V) < 0.0) n = -n;
        vec2 xy = vec2(vW.x, -vW.z);
        // small ripples running up the face; rougher where the water is white
        float rough = 0.12 + 0.5 * smoothstep(0.3, 0.9, vFoam);
        vec2 q = xy * 0.35 + vec2(uTime * 0.6, vW.y * 0.4);
        float rx = vnoise(q) - 0.5, rz = vnoise(q + vec2(17.3, 5.1)) - 0.5;
        n = normalize(n + vec3(rx, 0.0, rz) * rough);
        float f = vFoam * (0.6 + 0.8 * vnoise(xy * 0.22 + vec2(0.0, vW.y * 0.3) + uTime * 0.2));
        f = smoothstep(0.12, 0.8, f);
        float dist = length(cameraPosition - vW);
        vec3 col = shadeWater(n, V, waterBody(waterDepth(xy)), f, vThin, dist);
        // foam is patchy: bright tops of the lumps, greyer hollows between them
        col *= mix(1.0, 0.72 + 0.5 * vChurn / max(smoothstep(0.25, 0.9, vFoam), 0.05), f);
        gl_FragColor = vec4(col, 1.0);
        ${tail}
      }`,
  });
}
