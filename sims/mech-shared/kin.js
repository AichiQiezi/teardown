// GIPSY DANGER, the math. The gait phase phi (in strides, one left and one right step per unit) and the gait for the
// speed command (gaitFor: amplitude, cadence, and how far the walk has turned into a run) pose the whole Jaeger. The feet
// plant and swing on a world-frame cycloid, the pelvis bobs and sways over the stance foot, each leg is a two-bar chain
// solved exactly by the law of cosines, and every actuator's length, lever arm, tension and pressure follows from that
// pose and the quasi-static ground reaction. No three.js in here. Units: metres, seconds, newtons, radians;
// x forward, y up, z to the machine's right.
//
// Height (79.25 m) and weight (1,980 t) are the PPDC file's figures (Pacific Rim wiki). Segment lengths are the hull
// model's joints (gipsy-glb.js): hip axis at 59 % of height, knee at 35 %, a tall boot. The gait, actuators and power
// train are this model's engineering, not canon.
import {joint} from './gipsy-glb.js';

const dist = (a, b) => Math.hypot(...joint(a).map((v, i) => v - joint(b)[i]));

export const M = {
  height: 79.25,
  mass: 1980e3,
  g: 9.81,
  thigh: dist('hip', 'knee'), // 19.6
  shin: dist('knee', 'ankle'), // 22.1
  ankle: joint('ankle')[1], // ankle axis above the sole, 5.4: the boot is tall
  heel: 6.8, // sole behind the ankle
  toe: 12.0, // sole ahead of the ankle, to the ball the heel peels off over
  hipW: joint('hip')[2], // hip joint half-spacing, 5.8
  trackW: joint('ankle')[2], // foot track half-width, 6.2: the legs splay a little
  hipH: 45.2, // hip axis height, walking crouch (47 m straight)
  stride: 22, // foot travel against the hip over one stance, at amp 1
  lift: 4.2, // swing toe clearance
  duty: 0.62, // stance share of the cycle; 0.12 of it is double support at each end
  bob: 0.8, // pelvis drop in double support
  sway: 1.2, // pelvis sway over the stance foot
  vFull: 2.0, // speed at which the stride reaches full length
  vWalk: 7.0, // a quick march, the walk's top; Froude-scaled, 1.8 m/s at 1:11 is 6
  vMax: 16.0, // a run, Froude number 0.6 on the 45 m leg
  // the run: a short stance and a flight between steps, the hips a little lower, the heel kicked up behind
  run: {duty: 0.36, lift: 16.0, hipH: 45.2, sway: 0.5, peel: 40, fAt: [7, 0.2], fPer: 0.013},
  bore: 1.0, // two cylinders per joint, side by side
  rod: 0.55,
  pRated: 35e6,
  legMass: 240e3, // per leg; shin + foot 130 t of it
  shinMass: 130e3,
};
export const W = M.mass * M.g;
export const A_PUSH = 2 * (Math.PI / 4) * M.bore * M.bore;
export const A_PULL = 2 * (Math.PI / 4) * (M.bore * M.bore - M.rod * M.rod);
// actuator mounts in the leg plane: [distance along the segment, offset to its front]; the knee pushes from the back
// of the thigh onto a calf lever, the hip from the front of the pelvis onto the thigh. Each is a pair of cylinders, one
// side by side, at ±ACT_Z.
export const MOUNT = {
  // high on the back of the thigh down to a calf lever well below the knee: the line of pull stays clear of the knee
  // pin through 122° of bend, so the running knee can drive high without the cylinders going over centre
  kneeThigh: [3.0, -5.0],
  kneeShin: [6.0, -3.5],
  hipPelvis: [3.6, 3.2],
  hipThigh: [8.0, 2.8],
};
export const BARREL = {knee: 10.4, hip: 5.4};
// the pair runs down the front (hip) or back (knee) of the leg, this far either side of its plane
export const ACT_Z = 2.3;

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const mix = (a, b, k) => a + (b - a) * k;
export const frac = (x) => x - Math.floor(x);
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
// a point s along a segment leaving o at angle ang, n to its front (the side the knee points to)
const along = (o, ang, s, n) => [o[0] + s * Math.cos(ang) - n * Math.sin(ang), o[1] + s * Math.sin(ang) + n * Math.cos(ang)];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);

/**
 * The speed command to the gait. Walking, amp grows as the square root of speed, so the cadence falls to zero with it.
 * Past vWalk the walk turns into a run over a metre a second: the stance shortens to leave a flight between steps and
 * the cadence takes over from the stride, rising slowly with speed. The stance stride follows from both (no foot slips:
 * the planted foot travels S against the hip in duty / f seconds at the body's speed). run is 0 walking, 1 running.
 */
export function gaitFor(v) {
  const amp = Math.sqrt(clamp(v / M.vFull, 0, 1));
  const run = ss(M.vWalk - 0.2, M.vWalk + 1.0, v);
  const duty = mix(M.duty, M.run.duty, run);
  const fWalk = amp > 1e-4 ? (v * M.duty) / (amp * M.stride) : 0;
  const fRun = M.run.fAt[1] + M.run.fPer * (v - M.run.fAt[0]);
  const f = mix(fWalk, fRun, run);
  const S = f > 1e-6 ? (v * duty) / f : 0;
  return {amp, f, run, duty, S};
}
// standing still: what the console and the bind ask for before any speed
export const STAND = gaitFor(0);

/** One foot at leg phase p (0 touchdown, duty lift-off), relative to the body point: toe, heel-up pitch, ankle. */
export function footAt(p, g) {
  const {amp, run, S} = g;
  const b = g.duty;
  const peel = mix(20, M.run.peel, run) * D2R;
  let toeX;
  let toeY = 0;
  let pitch;
  const stance = p < b;
  if (stance) {
    const u = p / b;
    toeX = S * (0.5 - u) + M.toe;
    // the heel peels off over the last quarter of stance, the foot rolling on its toe
    pitch = peel * amp * ss(0.72, 1, u);
  } else {
    const u = (p - b) / (1 - b);
    // a cycloid in the world frame: the toe leaves and lands at rest; against the moving hip that reads as below
    const cyc = u - Math.sin(TAU * u) / TAU;
    const walkX = -S / 2 + (S / b) * (cyc - (1 - b) * u);
    // running, the foot is whipped through: the heel kicks up behind, the knee drives high and forward with the foot
    // tucked under it, then the shin reaches out for the ground and comes down under the body
    const k = u ** 0.75;
    const runX = -S / 2 + S * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, k * 1.15))) - 0.08 * S * Math.sin(Math.PI * u);
    toeX = mix(walkX, runX, run) + M.toe;
    toeY = mix(M.lift * Math.sin(Math.PI * u), M.run.lift * Math.sin(Math.PI * k) ** 0.8, run) * amp;
    pitch = amp * (peel * (1 - ss(0, 0.55, u)) - 6 * D2R * ss(0.45, 0.85, u) * (1 - ss(0.88, 1, u)));
  }
  const [ax, ay] = rot(-M.toe, M.ankle, -pitch);
  return {toe: [toeX, toeY], ankle: [toeX + ax, toeY + ay], pitch, stance};
}

/**
 * The pelvis's vertical motion, two per stride: walking it vaults over the stance leg, lowest in double support (phi
 * 0.06); running it bounces, lowest mid-stance and highest in flight. Each is a cosine of depth d about its phase;
 * the run's depth is the one whose mid-stance deceleration the stance foot's peak force (runForce) gives, held to 2 m
 * at the slow end where the legs give less.
 */
function bounce(phi, g) {
  const w = 4 * Math.PI * g.f;
  const dRun = w > 1e-3 ? Math.min(2.0, (2 * M.g * (Math.PI / (4 * M.run.duty) - 1)) / (w * w)) : 0;
  return [
    [g.amp * (1 - g.run) * M.bob, 0.06],
    [g.amp * g.run * dRun, g.duty / 2],
  ].map(([d, at]) => ({d, c: Math.cos(4 * Math.PI * (phi - at)), w}));
}

/** Pelvis height, sway toward the stance foot and roll for gait phase phi. */
export function pelvisAt(phi, g) {
  const {amp} = g;
  return {
    y: mix(M.hipH, M.run.hipH, g.run) - bounce(phi, g).reduce((y, b) => y + b.d * (0.5 + 0.5 * b.c), 0),
    // over the single stance foot (phi 0.31 left, 0.81 right walking)
    z: -amp * mix(M.sway, M.run.sway, g.run) * Math.cos(TAU * (phi - 0.31)),
    roll: amp * 1.6 * D2R * Math.cos(TAU * (phi - 0.31)),
  };
}

/** One leg. side -1 is the left (z < 0), leading at phi 0; +1 the right, half a cycle behind. */
export function legAt(side, phi, g) {
  const p = frac(phi + (side < 0 ? 0 : 0.5));
  const ft = footAt(p, g);
  const pel = pelvisAt(phi, g);
  const zo = side * M.hipW;
  const hip = [0, pel.y - zo * Math.sin(pel.roll), pel.z + zo * Math.cos(pel.roll)];
  const fz = side * M.trackW;
  const dx = ft.ankle[0] - hip[0];
  const dy = ft.ankle[1] - hip[1];
  const dz = fz - hip[2];
  // the leg plane rolls about x to reach the foot's track; in it the chain is planar
  const roll = Math.atan2(-dz, -dy);
  const n = Math.hypot(dy, dz);
  const L1 = M.thigh;
  const L2 = M.shin;
  const D = clamp(Math.hypot(dx, n), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-4);
  const toA = Math.atan2(-n, dx);
  const th = toA + Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1)); // knee forward
  const K = [L1 * Math.cos(th), L1 * Math.sin(th)];
  const ts = Math.atan2(-n - K[1], dx - K[0]);
  const A = [K[0] + L2 * Math.cos(ts), K[1] + L2 * Math.sin(ts)];
  // the foot in the leg plane: sole points from the ankle at its pitch
  const toeR = rot(M.toe, -M.ankle, -ft.pitch);
  const heelR = rot(-M.heel, -M.ankle, -ft.pitch);
  const toe2 = [A[0] + toeR[0], A[1] + toeR[1]];
  const heel2 = [A[0] + heelR[0], A[1] + heelR[1]];
  return {
    side,
    p,
    stance: ft.stance,
    hip, // relative to the body point
    roll,
    th, // thigh direction in the leg plane
    ts, // shin direction
    K,
    A,
    toe2,
    heel2,
    pitch: ft.pitch,
    flex: th - ts, // knee bend
    hipFlex: th + Math.PI / 2, // thigh ahead of vertical
    ankleRel: -ft.pitch - (ts + Math.PI / 2), // ankle joint angle that sets the foot's pitch
    footW: [ft.ankle[0], ft.ankle[1], fz], // ankle, body frame
    toeW: [ft.toe[0], ft.toe[1], fz],
  };
}

/** Actuator end points in the leg plane, proximal end first. */
export function mountsOf(L) {
  return {
    knee: [along([0, 0], L.th, ...MOUNT.kneeThigh), along(L.K, L.ts, ...MOUNT.kneeShin)],
    hip: [MOUNT.hipPelvis, along([0, 0], L.th, ...MOUNT.hipThigh)],
  };
}

/** Torso lean and yaw, arm swing (each arm with the opposite leg) and elbow bend: a boxer's carriage; running, the
 * body pitches into it and the arms pump, bent near square. */
export function upperAt(phi, g) {
  const {amp, run} = g;
  // running the arms pump hard, bent past square, and the body pitches well forward into the run
  const sw = amp * (16 + 26 * run) * D2R * Math.cos(TAU * (phi - 0.5));
  const bend = (12 + 10 * amp + 72 * run) * D2R;
  return {
    lean: (3 + 4 * amp + 20 * run) * D2R,
    yaw: amp * (4 + 3 * run) * D2R * Math.cos(TAU * phi),
    armL: sw,
    armR: -sw,
    elbowL: bend + 0.6 * Math.max(0, sw),
    elbowR: bend + 0.6 * Math.max(0, -sw),
  };
}

// the punch: wind up, the elbow rockets fire and drive the arm through to full reach, hold, recover; seconds from the
// call. A 79 m machine's swing takes the better part of a second: a boxer's straight slowed by the square root of scale
export const PUNCH = {wind: 0.9, hit: 1.7, hold: 2.1, end: 3.4};
const unit = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};

/**
 * The arm on side s (-1 left, +1 right) t seconds into a punch, or null outside one: how far the punch has taken the
 * arm over from the gait (w), the upper arm's direction in the torso frame, the elbow bend, the torso's twist and lean
 * into it, the elbow rockets' burn (0..1) and the impact flash after full reach.
 */
export function punchAt(t, s) {
  if (!(t >= 0 && t <= PUNCH.end)) return null;
  const k = ss(PUNCH.wind, PUNCH.hit, t);
  // drawn back by the ribs, elbow high and tight; then straight out at shoulder height, a little across the body
  const back = [-0.45, -0.8, 0.35 * s];
  const out = [1, 0.12, -0.16 * s];
  return {
    s,
    w: ss(0, 0.45, t) * (1 - ss(PUNCH.hold, PUNCH.end, t)),
    dir: unit(back.map((b, i) => mix(b, out[i], k))),
    elbow: mix(118, 6, k) * D2R,
    yaw: s * mix(-14, 22, k) * D2R,
    lean: mix(2, 9, k) * D2R,
    burn: ss(PUNCH.wind - 0.1, PUNCH.wind + 0.1, t) * (1 - ss(PUNCH.hit - 0.1, PUNCH.hit + 0.2, t)),
    impact: t > PUNCH.hit ? Math.exp(-(t - PUNCH.hit) * 4) : 0,
  };
}

// the chest cannon: the plates open, the reactor charges, a beam held for a second and a half, the plates close;
// seconds from the call. The beam leaves the chest a little above level (drop, fall over run: negative climbs)
export const CANNON = {open: 0.8, fire: 2.0, beam: 1.6, close: 3.8, end: 5.0, drop: -0.16};

/**
 * The machine t seconds into a chest-cannon shot, or null outside one: how far the shot has taken over (w), the chest
 * plates (open), the reactor's charge before the beam and the beam itself (flash, 0..1), the recoil it pushes the
 * torso back with, and the arms flung back and out to brace, fists low.
 */
export function cannonAt(t) {
  if (!(t >= 0 && t <= CANNON.end)) return null;
  const w = ss(0, 0.6, t) * (1 - ss(CANNON.close, CANNON.end, t));
  const on = t >= CANNON.fire ? ss(CANNON.fire, CANNON.fire + 0.12, t) * (1 - ss(CANNON.fire + CANNON.beam - 0.3, CANNON.fire + CANNON.beam, t)) : 0;
  const jolt = t > CANNON.fire ? Math.exp(-(t - CANNON.fire) * 5) : 0;
  return {
    w,
    flash: on,
    open: ss(0, CANNON.open, t) * (1 - ss(CANNON.close, CANNON.end - 0.2, t)),
    charge: t < CANNON.fire ? ss(CANNON.open * 0.8, CANNON.fire, t) : 0,
    lean: (-3 - 6 * on - 5 * jolt) * D2R,
    arms: [-1, 1].map((s) => ({s, w, dir: unit([-0.25, -0.72, 0.65 * s]), elbow: 55 * D2R, guard: false, burn: 0, impact: 0})),
  };
}

// the GD6 chain sword: the blade runs out of the right forearm, the arm winds up over the shoulder and hangs there a
// beat, one diagonal cut down and across to the left, the follow-through held, the blade runs back in; seconds from
// the call. The cut takes a second and a half and gathers speed as it falls: a heavy blade, not a quick one
export const SWORD = {deploy: 1.0, wind: 1.8, slash: 2.2, cut: 3.7, hold: 4.3, back: 5.2, end: 5.6};
const lerp3 = (a, b, k) => a.map((v, i) => mix(v, b[i], k));

/**
 * The right arm t seconds into a sword cut, or null outside one: the arm's pose over the gait (w, dir, elbow), the
 * torso's twist and lean into the cut, how far the blade is out (deploy), the light trail behind it and the edge's heat.
 */
export function swordAt(t) {
  if (!(t >= 0 && t <= SWORD.end)) return null;
  const up = ss(0.15, SWORD.wind, t);
  // slow off the top, fastest late in the cut, braked hard at the end
  const k = ss(SWORD.slash, SWORD.cut, t) ** 1.6;
  // out at the side, then high over the shoulder, then through to low across the body
  const ready = [0.55, 0.1, 0.6];
  const wind = [-0.35, 0.88, 0.35];
  const done = [0.72, -0.55, -0.42];
  return {
    s: 1,
    w: ss(0, 0.5, t) * (1 - ss(SWORD.hold, SWORD.back, t)),
    dir: unit(k > 0 ? lerp3(wind, done, k) : lerp3(ready, wind, up)),
    elbow: (k > 0 ? mix(70, 8, k) : mix(25, 70, up)) * D2R,
    yaw: (k > 0 ? mix(-26, 30, k) : -26 * up) * D2R,
    // the whole body leans back under the raised blade and drops forward into the cut
    lean: (k > 0 ? mix(-7, 16, k) : -7 * up) * D2R,
    deploy: ss(0.1, SWORD.deploy, t) * (1 - ss(SWORD.back - 0.2, SWORD.end - 0.1, t)),
    trail: ss(SWORD.slash + 0.2, SWORD.slash + 0.4, t) * (1 - ss(SWORD.cut, SWORD.cut + 0.6, t)),
    heat: ss(SWORD.slash - 0.4, SWORD.slash, t) * (1 - ss(SWORD.cut + 0.2, SWORD.back, t)),
    burn: 0,
    impact: 0,
  };
}

// a leg's contact: ramps up over the first 0.12 of stance, down over the last (less, running); the two legs' shares
// of the load are their contacts over the sum, none in flight; standing splits it evenly
// running, each foot carries the whole weight's impulse for a step in its short contact: a half sine peaking at
// pi / (4 duty) times the weight
const runForce = (p, g) => (p < g.duty ? ((W * Math.PI) / (4 * g.duty)) * Math.sin((Math.PI * p) / g.duty) : 0);
const contactOf = (p, g) => {
  const r = mix(0.12, 0.05, g.run);
  return p >= g.duty ? 0 : ss(0, r, p) * (1 - ss(g.duty - r, g.duty, p));
};

// one leg's loads: the ground reaction at its centre of pressure plus the leg's own weight, carried by the actuators
function loadsOf(L, F) {
  // centre of pressure: mid-foot while flat, the toe once the heel is up
  const cop = L.pitch > 0.02 ? L.toe2 : [L.A[0] + 1.5, L.A[1] - M.ankle];
  const mt = mountsOf(L);
  const shinCom = along(L.K, L.ts, 9.0, 0);
  const legCom = along([0, 0], L.th, 12.0, 0);
  // load torques on the distal body about its pivot (counter-clockwise positive)
  const tKnee = cross(sub(cop, L.K), [0, F]) + cross(sub(shinCom, L.K), [0, -M.shinMass * M.g]);
  const tHip = cross(cop, [0, F]) + cross(legCom, [0, -M.legMass * M.g]);
  const act = (pivot, [a, b], tau) => {
    const ab = sub(a, b);
    const l = len(ab);
    // torque about the pivot per newton of tension pulling the distal mount b toward a
    const k = cross(sub(b, pivot), [ab[0] / l, ab[1] / l]);
    const T = -tau / k;
    return {len: l, arm: Math.abs(k), T, p: Math.abs(T) / (T > 0 ? A_PULL : A_PUSH), a, b};
  };
  return {cop, knee: act(L.K, mt.knee, tKnee), hip: act([0, 0], mt.hip, tHip)};
}

/**
 * The whole machine at gait phase phi in gait g (gaitFor: amplitude, cadence f in strides per second, run): both legs, the upper body,
 * the ground reactions, every actuator's length, rate, tension and pressure, the hydraulic power and the reactor
 * output. Rates come from the pose a moment later along the same gait.
 */
export function stateAt(phi, g) {
  const {amp, f} = g;
  const legs = [legAt(-1, phi, g), legAt(1, phi, g)];
  const pel = pelvisAt(phi, g);
  const up = upperAt(phi, g);
  // the pelvis's vertical acceleration loads the feet beyond the static weight; in flight nothing does
  const ydd = bounce(phi, g).reduce((a, b) => a + b.d * 0.5 * b.w * b.w * b.c, 0);
  const Ftot = W * Math.max(0, 1 + ydd / M.g);
  const dp = 1e-3;
  const ahead = [legAt(-1, phi + dp, g), legAt(1, phi + dp, g)];
  const acts = [];
  let hydW = 0;
  let flow = 0;
  let hold = 0;
  const contact = legs.map((L) => contactOf(L.p, g));
  const sum = contact[0] + contact[1];
  const share = contact.map((c) => 0.5 + ((sum > 1e-6 ? c / sum : 0) - 0.5) * amp);
  legs.forEach((L, i) => {
    const F = mix(share[i] * Ftot, runForce(L.p, g), g.run);
    const ld = loadsOf(L, F);
    const mt = mountsOf(ahead[i]);
    for (const key of ['hip', 'knee']) {
      const a = ld[key];
      const v = ((len(sub(...mt[key])) - a.len) / dp) * f;
      const area = v > 0 ? A_PUSH : A_PULL;
      Object.assign(a, {v, key, side: L.side, name: `${L.side < 0 ? 'L' : 'R'}-${key.toUpperCase()}`});
      hydW += Math.abs(a.T * v);
      flow += Math.abs(v) * area;
      hold += Math.abs(a.T);
      acts.push(a);
    }
    L.F = F;
    L.share = share[i];
    L.cop = ld.cop;
  });
  // reactor: hotel load (cooling, conn-pod, drift link), the pumps' delivered power at 74 % pump-to-shaft efficiency,
  // and the valves' holding losses
  const reactor = 20e6 + hydW / 0.74 + hold * 0.25;
  return {gait: g, legs, pel, up, acts, Ftot, hydW, flow: flow * 60000, reactor, com: [1.2 * amp + 0.5 + 2.5 * g.run, pel.z]};
}

export const REACTOR_RATED = 200e6;
// the harbour's surface over the floor the feet stand on: mid-shin, the boots and the calves always under
export const WATER = 15.0;

/**
 * Where leg L breaks a surface at height h: the point of the shin (ankle to knee) at that height, body frame, and
 * whether the leg is in the water at all (the ankle below it).
 */
export function wadeAt(L, h) {
  const c = Math.cos(L.roll);
  const s = Math.sin(L.roll);
  const yA = L.hip[1] + L.A[1] * c;
  const yK = L.hip[1] + L.K[1] * c;
  const u = clamp((h - yA) / (yK - yA), 0, 1);
  const px = L.A[0] + (L.K[0] - L.A[0]) * u;
  const py = L.A[1] + (L.K[1] - L.A[1]) * u;
  return {x: L.hip[0] + px, z: L.hip[2] + py * s, wet: yA < h};
}
// the leg the console follows: the right one, nearest the camera in the side views (it walks left to right)
export const HERO = 1;
