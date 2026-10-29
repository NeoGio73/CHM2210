// Reflections in the water: the scene drawn a second time, at reduced size, from a camera
// mirrored below the sea's flat surface, cut off at the surface (so the seabed and the parts of
// the wave below the water are not mirrored up). The water's shaders look this picture up
// where they would mirror something (the wave, the cliffs, the surfer, the spray); the sky in
// it is left empty, and the water keeps its own sky there. Same method as three.js's
// Reflector, which draws onto one mirror mesh of its own; here the existing water uses it.
import * as THREE from 'three';
import { common, PALETTE } from './water.js?v=3b3873500c';

export class Reflection {
  // hide: objects not to draw in the mirror (the sea itself, the sky dome)
  constructor(renderer, scene, sea, hide) {
    this.renderer = renderer; this.scene = scene; this.sea = sea; this.hide = hide;
    this.cam = new THREE.PerspectiveCamera();
    this.rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
    this.scale = 0;
    // a stand-in while the mirror is being drawn (a texture cannot be read while drawn into)
    this.blank = new THREE.DataTexture(new Uint8Array(4), 1, 1); this.blank.needsUpdate = true;
    this.v = new THREE.Vector3(); this.t = new THREE.Vector3(); this.p = new THREE.Vector3();
    this.rot = new THREE.Matrix4(); this.plane = new THREE.Plane(); this.clip = new THREE.Vector4(); this.q = new THREE.Vector4();
    this.N = new THREE.Vector3(0, 1, 0);
  }

  // scale: the mirror's size as a share of the screen's (0 turns reflections off)
  setScale(s) { this.scale = s; this.resize(); }
  resize() {
    if (!this.scale) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(Math.max(16, Math.round(size.x * this.scale)), Math.max(16, Math.round(size.y * this.scale)));
  }

  update(camera) {
    const on = this.scale > 0 && PALETTE.reflect > 0;
    const C = common;
    camera.updateMatrixWorld();
    const camPos = this.p.setFromMatrixPosition(camera.matrixWorld);
    if (!on || camPos.y < this.sea + 0.2) { C.uReflOn.value = 0; return; }   // off, or under the water
    const { cam, v, t, rot, N } = this;
    const onPlane = new THREE.Vector3(camPos.x, this.sea, camPos.z);
    // mirror the camera's position, the point it looks at and its up direction in the surface
    rot.extractRotation(camera.matrixWorld);
    v.subVectors(onPlane, camPos).reflect(N).negate().add(onPlane);
    t.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    t.subVectors(onPlane, t).reflect(N).negate().add(onPlane);
    cam.position.copy(v);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(N);
    cam.lookAt(t);
    cam.near = camera.near; cam.far = camera.far; cam.fov = camera.fov; cam.aspect = camera.aspect;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    // world position -> place in the mirror's picture (0..1), for the water's shaders
    C.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // cut the mirror's view off at the surface: an oblique near plane (Lengyel's method)
    this.plane.setFromNormalAndCoplanarPoint(N, onPlane).applyMatrix4(cam.matrixWorldInverse);
    const clip = this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pe = cam.projectionMatrix.elements, q = this.q;
    q.x = (Math.sign(clip.x) + pe[8]) / pe[0];
    q.y = (Math.sign(clip.y) + pe[9]) / pe[5];
    q.z = -1; q.w = (1 + pe[10]) / pe[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pe[2] = clip.x; pe[6] = clip.y; pe[10] = clip.z + 1 - 0.003; pe[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    // draw the mirror
    const r = this.renderer, prevTarget = r.getRenderTarget(), prevXr = r.xr.enabled, prevShadow = r.shadowMap.autoUpdate;
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const vis = this.hide.map(o => o.visible);
    this.hide.forEach(o => { o.visible = false; });
    C.uRefl.value = this.blank; C.uReflOn.value = 0;
    r.xr.enabled = false; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear();
    r.render(this.scene, cam);
    r.setRenderTarget(prevTarget); r.setClearColor(prevClear, prevAlpha);
    r.xr.enabled = prevXr; r.shadowMap.autoUpdate = prevShadow;
    this.hide.forEach((o, i) => { o.visible = vis[i]; });
    C.uRefl.value = this.rt.texture; C.uReflOn.value = PALETTE.reflect;
  }
}
