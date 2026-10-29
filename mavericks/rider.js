// The board's physics (the figure itself is drawn and posed in figure.js).
//
// The board is a point on the water's surface (x east, y north, metres; h its height above the
// flat sea). Forces, per unit mass:
// - gravity along the surface: -g * grad(h) / (1 + |grad h|^2)
// - the water's own motion: under a wave crest the water moves forward. Shallow-water theory
//   gives u = C * eta / (depth + eta) (eta: height of the surface above the flat sea), which is
//   what carries a paddling surfer into the wave.
// - lying down: strong drag against the water's motion; paddling adds up to about 2.3 m/s.
// - standing (riding): the rails grip, so sideways slip dies away fast; along the board, small
//   drag. Turning is the player's (or the assist's).
import * as THREE from 'three';

const G = 9.81;

// the figure and its poses are in figure.js
export { buildRider } from './figure.js?v=3b3873500c';

// ---------- the physics ----------
export class Board {
  constructor() { this.reset(0, 0, 0); }
  reset(x, y, heading) {
    Object.assign(this, { x, y, h: 0, vx: 0, vy: 0, heading, mode: 'sit', standT: 0, wipeT: 0, ride: null, msg: '', topSpeed: 0, steer: 0 });
  }
  get speed() { return Math.hypot(this.vx, this.vy); }

  // env: { surface(x, y, near) -> h above the flat sea (the sheet nearest `near`),
  //        water(x, y, h) -> [ux, uy], C, dir: [dx, dy] }
  // input: { turn: -1..1 (+ = to the left), paddle: bool }
  step(dt, input, env, assist) {
    const e = 1.4;                       // the slope is felt over the board's length (a 3 m gun), not a point
    const h0 = env.surface(this.x, this.y, this.h);
    const hx = (env.surface(this.x + e, this.y, h0) - env.surface(this.x - e, this.y, h0)) / (2 * e);
    const hy = (env.surface(this.x, this.y + e, h0) - env.surface(this.x, this.y - e, h0)) / (2 * e);
    this.h = h0; this.hx = hx; this.hy = hy;
    const s2 = 1 + hx * hx + hy * hy;
    const gx = -G * hx / s2, gy = -G * hy / s2;
    const fx = Math.cos(this.heading), fy = Math.sin(this.heading);

    if (this.mode === 'sit' || this.mode === 'paddle') {
      this.heading += input.turn * 1.3 * dt;
      const [ux, uy] = env.water(this.x, this.y, h0);
      // water drag on a lying paddler, falling away as the board starts to plane (from about 3 m/s)
      // sitting up, legs in the water, it does not plane: the wave lifts it and passes under
      const rel = Math.hypot(this.vx - ux, this.vy - uy), kd = this.mode === 'sit' ? 3 : 0.2 + 1.2 / (1 + (rel / 2.5) ** 2);
      let ax = gx + kd * (ux - this.vx), ay = gy + kd * (uy - this.vy);
      if (input.paddle) {
        const along = this.vx * fx + this.vy * fy - (ux * fx + uy * fy);
        const th = 2.6 * Math.max(0, 1 - along / 2.3);
        ax += th * fx; ay += th * fy;
        this.mode = 'paddle'; this.paddleT = 0;
      } else if ((this.paddleT = (this.paddleT || 0) + dt) > 0.6) this.mode = 'sit';   // stopped paddling
      this.vx += ax * dt; this.vy += ay * dt;
    } else if (this.mode === 'ride') {
      this.standT += dt;
      let turn = input.turn;
      if (assist && Math.abs(turn) < 0.05) turn = assist(this);
      this.steer += (turn - this.steer) * Math.min(1, 8 * dt);
      const sp = this.speed;
      this.heading += this.steer * (0.9 + 0.035 * sp) * dt;
      const ff = Math.cos(this.heading), fyy = Math.sin(this.heading);
      let vf = this.vx * ff + this.vy * fyy, vl = -this.vx * fyy + this.vy * ff;
      const gf = gx * ff + gy * fyy, gl = -gx * fyy + gy * ff;
      const [ux, uy] = env.water(this.x, this.y, h0), rel = vf - (ux * ff + uy * fyy);   // drag is against the moving water
      vf += (gf - 0.0075 * rel * Math.abs(rel) - 0.25 * Math.sign(rel)) * dt;           // slope, water drag, a little friction
      const ul = -ux * fyy + uy * ff;
      vl += gl * 0.25 * dt; vl = ul + (vl - ul) * Math.exp(-7 * dt);        // the rails grip in the moving water
      this.vx = vf * ff - vl * fyy; this.vy = vf * fyy + vl * ff;
    } else {
      // wiped out: tumbling in the whitewater, carried shoreward
      this.wipeT += dt;
      const [ux, uy] = env.water(this.x, this.y, h0);
      this.vx += (ux * 0.8 - this.vx) * 2 * dt; this.vy += (uy * 0.8 - this.vy) * 2 * dt;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.topSpeed = Math.max(this.topSpeed, this.mode === 'ride' ? this.speed : 0);
  }
}
