// GIPSY DANGER's geometry: the hull is a downloaded model (gipsy-glb.js cuts it into the rig's rigid segments), the
// insides are ours. Under the plating sits the skeleton the kinematics drives: a spine and shoulder beam, frame bars
// down each limb, ball and pin joints, a pair of hydraulic cylinders either side of each hip and knee, and the nuclear
// vortex turbine behind the chest plates. X-RAY turns the plating to glass and lights its edges; CORE swings the chest
// plates open on the turbine. The hull takes a procedural panel-and-grime texture, box-projected (the model carries no
// UVs). update(state, t, ops) poses it from kin.js's stateAt and nothing else. Frame: x forward, y up, z to the
// machine's right; metres.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import glb from '../../assets/gipsy.glb';
import {bones, cut, joint, readGlb} from './gipsy-glb.js';
import {ACT_Z, BARREL, CANNON, HERO, M, MOUNT} from './kin.js';

const V3 = THREE.Vector3;
const Y = new V3(0, 1, 0);

// plating: per-face panel seams and rivet rows, rain streaks, chipped paint; one canvas for colour, one for roughness
function plateTextures() {
  const N = 512;
  let r = 7;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const col = document.createElement('canvas');
  col.width = col.height = N;
  const g = col.getContext('2d');
  g.fillStyle = '#d9d9d9';
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '40,44,48' : '255,255,255'},${0.025 + rnd() * 0.05})`;
    const w = 20 + rnd() * 120;
    g.fillRect(rnd() * N, rnd() * N, w, w * (0.3 + rnd()));
  }
  // rain streaks running down
  for (let i = 0; i < 140; i++) {
    const x = rnd() * N;
    const y = rnd() * N * 0.6;
    const gr = g.createLinearGradient(0, y, 0, y + 80 + rnd() * 220);
    gr.addColorStop(0, 'rgba(30,26,22,0.16)');
    gr.addColorStop(1, 'rgba(30,26,22,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 1 + rnd() * 3, 300);
  }
  // panel seams: an inset border and a couple of cuts, darker with a light lip
  const seam = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(20,22,26,0.75)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x0 + 2, y0 + 2);
    g.lineTo(x1 + 2, y1 + 2);
    g.stroke();
  };
  const m = 34;
  seam(m, m, N - m, m);
  seam(N - m, m, N - m, N - m);
  seam(N - m, N - m, m, N - m);
  seam(m, N - m, m, m);
  seam(m, N * 0.42, N - m, N * 0.42);
  seam(N * 0.58, N * 0.42, N * 0.58, N - m);
  g.fillStyle = 'rgba(20,22,26,0.55)';
  for (let x = m + 16; x < N - m; x += 26) {
    g.fillRect(x, m + 10, 4, 4);
    g.fillRect(x, N - m - 14, 4, 4);
  }
  // chips: bare metal showing through
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(235,238,240,${0.2 + rnd() * 0.35})`;
    g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 5, 1 + rnd() * 3);
  }
  const rough = document.createElement('canvas');
  rough.width = rough.height = 256;
  const h = rough.getContext('2d');
  h.fillStyle = '#b4b4b4';
  h.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    h.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '60,60,60'},${0.04 + rnd() * 0.08})`;
    h.fillRect(rnd() * 256, rnd() * 256, 4 + rnd() * 40, 4 + rnd() * 40);
  }
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const roughnessMap = new THREE.CanvasTexture(rough);
  for (const t of [map, roughnessMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return {map, roughnessMap};
}

export function buildMech(P) {
  const tex = plateTextures();
  const std = (color, metalness, roughness, env = 0.6, plated = false) =>
    new THREE.MeshStandardMaterial({color, metalness, roughness, envMapIntensity: env, ...(plated ? tex : {})});
  const glow = (k, c = P.glow) => new THREE.MeshStandardMaterial({color: '#000000', emissive: c, emissiveIntensity: k});
  const mat = {
    // the roughness map averages about 0.7, so these land near 0.55 with the grime's spread
    hull: std(P.hull, 0.4, 0.8, 0.7, true),
    hullDark: std(P.hullDark, 0.55, 0.78, 0.6, true),
    gray: std('#5d656d', 0.75, 0.7, 0.6, true),
    silver: std('#8e979f', 0.9, 0.5, 0.7, true),
    frame: std(P.frame, 0.7, 0.5, 0.5),
    joint: std(P.joint, 0.8, 0.4, 0.6),
    chrome: std(P.chrome, 1.0, 0.24, 0.9),
    visor: glow(3.2, P.visor),
    stripe: std(P.stripe, 0.3, 0.5, 0.5),
    core: glow(2.5),
    blade: std('#1b2a33', 0.8, 0.35, 0.8),
  };
  // the model's materials onto ours
  const SKIN = {'0105_Navy': mat.hull, '0133_Gray': mat.gray, '0135_DarkGray': mat.hullDark, '0131_Silver': mat.silver,
    '0020_Red': mat.stripe, Color_F01: mat.visor, Color_B01: mat.core};
  // the shells go glassy under X-RAY; everything inside them stays solid
  const SHELLS = [mat.hull, mat.hullDark, mat.gray, mat.silver, mat.stripe];
  for (const m of SHELLS) m.transparent = true;
  // rocket exhaust, additive and HDR so it blooms: an orange sheath round a blue-white core
  const flame = (c, k) => new THREE.MeshBasicMaterial({color: new THREE.Color(c).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false});
  mat.flameOut = flame('#ff7a2e', 2.2);
  mat.flameIn = flame('#cfe6ff', 4.0);
  // a nozzle's plume: base at the nozzle, narrowing along +y, scaled to length
  const flameGeo = new THREE.CylinderGeometry(0.08, 1, 1, 16, 1, true).translate(0, 0.5, 0);
  const edgeMat = new THREE.LineBasicMaterial({color: P.edge, transparent: true, opacity: 0, depthWrite: false});
  const shells = [];
  const edges = [];

  const place = (parent, m, x, y, z) => {
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (parent, w, h, d, x, y, z, material, r = 0.5) =>
    place(parent, new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), material), x, y, z);
  // a cylinder along one axis: 'x', 'y' or 'z'
  const cyl = (parent, r, h, axis, x, y, z, material, seg = 32, r2 = r) => {
    const m = place(parent, new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), material), x, y, z);
    if (axis === 'x') m.rotation.z = -Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    return m;
  };
  const ball = (parent, r, x, y, z, material) => place(parent, new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), material), x, y, z);
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const at = (key, s = 1) => new V3(...joint(key, s));

  // the bind pose: the model's own stance. Hip axis height, waist pivot 4 m above it
  const hipY = at('hip').y;
  const root = new THREE.Group();

  // ------------------------------------------------------------ pelvis: the hip block and its pivots
  const pelvis = group(root, 0, hipY, 0);
  box(pelvis, 6.5, 3.0, 8.5, 0, 0.6, 0, mat.frame, 0.7);
  for (const s of [-1, 1]) cyl(pelvis, 2.6, 3.2, 'z', 0, 0, s * 3.6, mat.joint);

  // ------------------------------------------------------------ torso: a spine up to the shoulder beam, the turbine
  const torso = group(pelvis, 0, 4.0, 0);
  torso.rotation.order = 'YZX';
  const T0 = new V3(0, hipY + 4.0, 0);
  const shY = at('shoulder').y - T0.y;
  for (let i = 0; i < 4; i++) cyl(torso, 2.6 - (i % 2) * 0.5, 1.2, 'y', -0.6, 0.8 + i * 1.8, 0, i % 2 ? mat.frame : mat.joint);
  box(torso, 2.6, shY + 2, 2.6, -1.0, (shY + 2) / 2, 0, mat.frame, 0.6);
  box(torso, 2.4, 2.4, at('shoulder').z * 2 - 4, -1.0, shY, 0, mat.frame, 0.6);
  for (const s of [-1, 1]) cyl(torso, 0.4, shY - 2, 'y', -0.6, shY / 2, s * 2.6, mat.chrome, 12);
  const neck = at('neck').sub(T0);
  cyl(torso, 1.6, 3.0, 'y', neck.x - 0.6, neck.y - 1.5, 0, mat.joint, 20);
  // nuclear vortex turbine: an octagonal housing, the lit core, a fan of blades, the bezel; sized to the hull's ring
  const R0 = at('reactor').sub(T0);
  const core = group(torso, R0.x - 1.6, R0.y, 0);
  core.scale.setScalar(0.72);
  const housing = cyl(core, 4.6, 2.6, 'x', -0.9, 0, 0, mat.blade, 8);
  housing.rotation.x = Math.PI / 8;
  const disc = cyl(core, 3.3, 0.4, 'x', 0.2, 0, 0, mat.core, 48);
  disc.castShadow = false;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.22, 8, 48), mat.core);
  halo.rotation.y = Math.PI / 2;
  halo.position.x = 0.6;
  core.add(halo);
  const fan = group(core, 0.7, 0, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.2, 2.6, 0.5, 2, 0.08), mat.blade);
    b.position.set(0, Math.cos(a) * 1.55, Math.sin(a) * 1.55);
    b.rotation.x = -a;
    b.rotation.y = 0.55;
    fan.add(b);
  }
  cyl(fan, 0.7, 0.7, 'x', 0.1, 0, 0, mat.chrome, 24);
  // the plasma gathering in front of the turbine as the cannon charges
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({color: new THREE.Color('#9fdcff').multiplyScalar(2.2), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false}));
  orb.position.x = 3.2;
  orb.visible = false;
  core.add(orb);
  // the chest plates either side of the turbine hinge on their outer edges; CORE swings them open
  const halves = [-1, 1].map((s) => {
    const g = group(torso, R0.x, R0.y, s * 6.5);
    g.userData.s = s;
    return g;
  });
  const lid = group(torso);

  // ------------------------------------------------------------ arms: shoulder ball, upper arm, elbow pin, forearm
  // the bind angles aim each bar at the model's next joint; the gait swings and bends from there
  const UPPER = at('elbow').distanceTo(at('shoulder'));
  const FORE = at('wrist').distanceTo(at('elbow'));
  const arms = [-1, 1].map((s) => {
    const S0 = at('shoulder', s).sub(T0);
    const d = at('elbow', s).sub(at('shoulder', s)).normalize();
    ball(torso, 2.4, S0.x, S0.y, S0.z, mat.joint);
    const sh = group(torso, S0.x, S0.y, S0.z);
    sh.rotation.order = 'XZY';
    const swing0 = Math.asin(d.x);
    const abduct0 = Math.atan2(-d.z, -d.y);
    box(sh, 2.0, UPPER, 2.0, 0, -UPPER / 2, 0, mat.frame, 0.5);
    cyl(sh, 2.2, 4.4, 'z', 0, -UPPER, 0, mat.joint);
    const fa = group(sh, 0, -UPPER, 0);
    fa.rotation.order = 'XZY';
    box(fa, 1.8, FORE, 1.8, 0, -FORE / 2, 0, mat.frame, 0.5);
    ball(fa, 1.6, 0, -FORE, 0, mat.joint);
    sh.rotation.set(abduct0, 0, swing0);
    // the forearm's rest bend and its turn back in toward the hip: the wrist's direction seen from the upper arm
    const w = at('wrist', s).sub(at('elbow', s)).normalize().applyQuaternion(sh.getWorldQuaternion(new THREE.Quaternion()).invert());
    fa.rotation.x = Math.atan2(-w.z, -w.y);
    fa.rotation.z = Math.asin(w.x);
    // the elbow rockets: two nozzles on the elbow pad, on top and outside, burning back past the upper arm and splayed
    // off it so the plumes clear the hull (the forearm's -y is the punch, +x is up and +z out at full reach)
    const flames = [];
    const burnLight = new THREE.PointLight('#ff9a4a', 0, 60, 1.6);
    burnLight.position.set(0, 2, s * 2);
    fa.add(burnLight);
    for (const [x, z, rx, rz] of [[2.8, 0, 0, -0.5], [0, s * 3.2, s * 0.5, 0]]) {
      const g = group(fa, x, 1.2, z);
      g.rotation.set(rx, 0, rz);
      for (const [m, r, l] of [[mat.flameOut, 1.6, 1], [mat.flameIn, 0.75, 0.55]]) {
        const c = new THREE.Mesh(flameGeo, m);
        c.scale.set(r, l, r);
        c.castShadow = false;
        c.renderOrder = 6;
        g.add(c);
      }
      g.visible = false;
      flames.push(g);
    }
    return {sh, fa, s, swing0, abduct0, elbow0: fa.rotation.z, faX0: fa.rotation.x, flames, burnLight};
  });
  // the GD6 chain sword: plates folded along the right forearm that run out past the hand one after another and lock
  // into a blade, flat across the swing (local x) and thin across the arm (z), its edges glowing as it heats in a cut
  const BLADE = {n: 10, len: 32};
  const segL = BLADE.len / BLADE.n;
  mat.swordEdge = glow(0.4, '#ff7a3a');
  mat.swordSteel = std('#b4bec6', 1.0, 0.28, 1.4);
  const sword = group(arms[1].fa, 0, -FORE * 0.55, 0);
  const plates = Array.from({length: BLADE.n}, (_, k) => {
    const g = group(sword);
    const wd = 4.2 - 1.6 * (k / (BLADE.n - 1));
    // each plate hangs from its own top so it can grow out of the one before
    // the plates overlap a little so the blade reads as one piece, a darker fuller down its middle
    box(g, wd, segL * 1.06, 0.8, 0, -segL / 2, 0, mat.swordSteel, 0.2);
    box(g, wd * 0.22, segL * 1.06, 1.0, 0, -segL / 2, 0, mat.blade, 0.1);
    for (const sx of [-1, 1]) {
      box(g, 0.35, segL * 1.06, 0.9, (sx * wd) / 2, -segL / 2, 0, mat.swordEdge, 0.12);
      // the chain's teeth along each edge
      for (let j = 0; j < 2; j++) {
        const tooth = box(g, 0.9, 0.9, 0.7, (sx * (wd + 0.5)) / 2, -segL * (0.3 + 0.4 * j), 0, mat.joint, 0.1);
        tooth.rotation.z = Math.PI / 4;
      }
    }
    if (k === BLADE.n - 1) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(wd / 2, segL * 1.4, 4).rotateX(Math.PI).rotateY(Math.PI / 4), mat.swordSteel);
      tip.scale.z = 0.3;
      place(g, tip, 0, -segL - segL * 0.7, 0);
    }
    g.visible = false;
    return g;
  });
  let bladeEnd = 0;

  // the shockwave off the fist at full reach: a ring facing down the punch, out and gone in half a second
  // a thin bright edge over a faint haze filling it
  const shock = new THREE.Group();
  const shockMats = [[0.95, 1, '#d6efff', 2.2], [0.25, 0.95, '#7fb8d8', 0.35]].map(([r0, r1, c, k]) => {
    const m = new THREE.MeshBasicMaterial({color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false});
    shock.add(new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), m));
    return m;
  });
  shock.rotation.y = Math.PI / 2;
  shock.visible = false;
  root.add(shock);

  // ------------------------------------------------------------ legs: thigh and shin bars, knee pin, ankle ball, sole
  const act = (parent, barrel) => {
    const sides = [-1, 1].map((zs) => {
      const g = group(parent);
      g.userData.z = zs * ACT_Z;
      cyl(g, 1.05, barrel, 'y', 0, barrel / 2, 0, mat.blade, 24);
      cyl(g, 1.25, 0.9, 'y', 0, 0.5, 0, mat.joint, 24);
      cyl(g, 1.2, 0.6, 'y', 0, barrel - 0.3, 0, mat.joint, 24);
      const band = cyl(g, 1.1, 0.5, 'y', 0, barrel * 0.62, 0, null, 24);
      band.castShadow = false;
      const rod = cyl(g, 0.5, 1, 'y', 0, 0, 0, mat.chrome, 18);
      return {g, rod, band};
    });
    const bandMat = glow(0);
    for (const sd of sides) sd.band.material = bandMat;
    // the cross pins through both clevises
    const pins = [cyl(parent, 0.65, ACT_Z * 2 + 2.6, 'z', 0, 0, 0, mat.joint, 16), cyl(parent, 0.65, ACT_Z * 2 + 2.6, 'z', 0, 0, 0, mat.joint, 16)];
    return {sides, barrel, bandMat, pins, mid: new V3()};
  };
  const legs = [-1, 1].map((s) => {
    const rootL = group(root);
    const thigh = group(rootL);
    ball(thigh, 2.6, 0, 0, 0, mat.joint);
    box(thigh, 2.4, M.thigh, 2.4, 0, -M.thigh / 2, 0, mat.frame, 0.6);
    const knee = group(thigh, 0, -M.thigh, 0);
    cyl(knee, 2.8, 6.0, 'z', 0, 0, 0, mat.joint);
    box(knee, 2.2, M.shin, 2.2, 0, -M.shin / 2, 0, mat.frame, 0.5);
    // the calf lever the knee cylinders push on
    box(knee, 4.4, 2.0, 2.4, (MOUNT.kneeShin[1] * 2) / 3, -MOUNT.kneeShin[0], 0, mat.frame, 0.5);
    const ankle = group(knee, 0, -M.shin, 0);
    ball(ankle, 2.3, 0, 0, 0, mat.joint);
    const foot = group(ankle);
    box(foot, M.toe + M.heel - 2, 1.2, 4.0, (M.toe - M.heel) / 2, -M.ankle + 1.4, 0, mat.frame, 0.4);
    // the hip cylinders' pelvis anchor, in the leg's frame
    box(rootL, 2.0, 2.0, ACT_Z * 2 + 1.6, MOUNT.hipPelvis[0], MOUNT.hipPelvis[1], 0, mat.frame, 0.5);
    return {s, rootL, thigh, knee, ankle, foot, acts: {knee: act(rootL, BARREL.knee), hip: act(rootL, BARREL.hip)}};
  });

  // ------------------------------------------------------------ the hull, bound in the model's stance
  // each leg's bind: its plane rolled to reach the ankle, thigh and shin aimed at the model's knee and ankle
  for (const g of legs) {
    const H = at('hip', g.s);
    const K = at('knee', g.s);
    const A = at('ankle', g.s);
    const roll = Math.atan2(-(A.z - H.z), H.y - A.y);
    const th = Math.atan2(K.y - H.y, K.x - H.x);
    const ts = Math.atan2(A.y - K.y, A.x - K.x);
    g.rootL.position.copy(H);
    g.rootL.rotation.x = roll;
    g.thigh.rotation.z = th + Math.PI / 2;
    g.knee.rotation.z = ts - th;
    g.ankle.rotation.z = -(ts + Math.PI / 2);
    g.foot.rotation.x = -roll;
  }
  root.updateMatrixWorld(true);
  const SEG = {torso, pelvis};
  for (const g of legs) Object.assign(SEG, {[`thigh${g.s < 0 ? 'L' : 'R'}`]: g.thigh, [`shin${g.s < 0 ? 'L' : 'R'}`]: g.knee, [`foot${g.s < 0 ? 'L' : 'R'}`]: g.foot});
  for (const a of arms) Object.assign(SEG, {[`upper${a.s < 0 ? 'L' : 'R'}`]: a.sh, [`fore${a.s < 0 ? 'L' : 'R'}`]: a.fa});
  // the chest plates around the turbine go to the hinged halves, the hull's own reactor face to the lid that hides
  // when they open
  const R = at('reactor');
  const chest = (seg, c) => {
    if (seg !== 'torso' || c[0] < R.x - 3.2 || Math.abs(c[1] - R.y) > 6.2) return seg;
    const r = Math.hypot(c[1] - R.y, c[2]);
    if (r < 3.4) return 'lid';
    return Math.abs(c[2]) < 8.5 ? (c[2] < 0 ? 'halfL' : 'halfR') : seg;
  };
  Object.assign(SEG, {lid, halfL: halves[0], halfR: halves[1]});
  const B = bones();
  const bin = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0)).buffer;
  const inv = new THREE.Matrix4();
  const q = new V3();
  for (const prim of readGlb(bin)) {
    const {segs} = cut(prim, B, chest);
    const material = prim.mode === 1 ? edgeMat : SKIN[prim.name];
    for (const [name, idx] of Object.entries(segs)) {
      const parent = SEG[name];
      inv.copy(parent.matrixWorld).invert();
      const nmat = new THREE.Matrix3().getNormalMatrix(inv);
      // only the vertices this segment uses, carried into its bone's frame
      const remap = new Map();
      for (const i of idx) if (!remap.has(i)) remap.set(i, remap.size);
      const pos = new Float32Array(remap.size * 3);
      const nrm = prim.nrm && new Float32Array(remap.size * 3);
      const uv = new Float32Array(remap.size * 2);
      for (const [i, j] of remap) {
        q.fromArray(prim.pos, i * 3);
        // box-projected plate texture, one tile per 9 m, in the bind pose so it rides the part
        const n = prim.nrm ? [Math.abs(prim.nrm[i * 3]), Math.abs(prim.nrm[i * 3 + 1]), Math.abs(prim.nrm[i * 3 + 2])] : [0, 0, 1];
        const [u, v] = n[0] > n[1] && n[0] > n[2] ? [q.z, q.y] : n[1] > n[2] ? [q.x, q.z] : [q.x, q.y];
        uv[j * 2] = u / 9;
        uv[j * 2 + 1] = v / 9;
        q.applyMatrix4(inv).toArray(pos, j * 3);
        if (nrm) q.fromArray(prim.nrm, i * 3).applyMatrix3(nmat).normalize().toArray(nrm, j * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (nrm) geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      else geo.computeVertexNormals();
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx, (i) => remap.get(i)), 1));
      if (prim.mode === 1) {
        const e = new THREE.LineSegments(geo, edgeMat);
        e.renderOrder = 5;
        e.visible = false;
        parent.add(e);
        edges.push(e);
        continue;
      }
      const m = place(parent, new THREE.Mesh(geo, material), 0, 0, 0);
      if (material === mat.visor || material === mat.core) m.castShadow = false;
      if (SHELLS.includes(material)) shells.push(m);
    }
  }
  const visor = new V3(4.7, 72.0, 0).sub(T0);

  // ------------------------------------------------------------ posing
  const va = new V3();
  const vb = new V3();
  const dir = new V3();
  const setAct = (A, a, b, k) => {
    va.set(a[0], a[1], 0);
    vb.set(b[0], b[1], 0);
    dir.subVectors(vb, va);
    const L = dir.length();
    dir.normalize();
    for (const sd of A.sides) {
      sd.g.position.set(va.x, va.y, sd.g.userData.z);
      sd.g.quaternion.setFromUnitVectors(Y, dir);
      const r = Math.max(0.5, L - A.barrel + 0.9);
      sd.rod.scale.y = r;
      sd.rod.position.y = L - r / 2;
    }
    A.pins[0].position.set(va.x, va.y, 0);
    A.pins[1].position.set(vb.x, vb.y, 0);
    A.mid.set((va.x + vb.x) / 2, (va.y + vb.y) / 2, ACT_Z);
    A.bandMat.emissiveIntensity = 0.15 + 3.6 * k;
  };

  let xrayNow = 0;
  const xrayTint = new THREE.Color(P.edge).multiplyScalar(0.14);
  // the elbow the gait asks for at a stand is the model's own
  const ELBOW_REST = (12 * Math.PI) / 180;
  // the turbine's angle, integrated so its speed can change without a jump
  let fanA = 0;
  let lastT = 0;
  // the guard: the upper arm forward and down, the forearm up, fist by the chin
  const GUARD = [-1, 1].map((s) => {
    const v = new V3(0.55, -0.62, 0.18 * s).normalize();
    return [v.x, v.y, v.z];
  });
  const NEG_Y = new V3(0, -1, 0);
  const qP = new THREE.Quaternion();
  /** ops: xray 0..1, core 0..1 (chest open), load 0..1 (reactor output), pRated (Pa) */
  const update = (s, t, ops = {}) => {
    pelvis.position.set(0, s.pel.y, s.pel.z);
    pelvis.rotation.x = s.pel.roll;
    torso.rotation.y = s.up.yaw;
    torso.rotation.z = -s.up.lean;
    arms.forEach((a, i) => {
      a.sh.rotation.set(a.abduct0, 0, a.swing0 + (a.s < 0 ? s.up.armL : s.up.armR));
      a.fa.rotation.x = a.faX0;
      a.fa.rotation.z = a.elbow0 + (a.s < 0 ? s.up.elbowL : s.up.elbowR) - ELBOW_REST;
      // a punch takes the arm over from the gait; the other arm, if it is not punching too, comes up to guard the face
      const p = s.punch?.[i];
      const o = s.punch?.[1 - i];
      const pose = p ? p : o && o.guard !== false ? {w: o.w * 0.85, dir: GUARD[i], elbow: 2.2} : null;
      if (pose && pose.w > 0) {
        qP.setFromUnitVectors(NEG_Y, va.set(...pose.dir));
        a.sh.quaternion.slerp(qP, pose.w);
        a.fa.rotation.x += (0 - a.fa.rotation.x) * pose.w;
        a.fa.rotation.z += (pose.elbow - a.fa.rotation.z) * pose.w;
      }
      const burn = p?.burn ?? 0;
      for (const f of a.flames) {
        f.visible = burn > 0.01;
        // a ragged plume: its length flickers fast
        f.scale.setScalar(1);
        f.scale.y = burn * (13 + 3 * Math.sin(t * 61 + i * 3) + 2 * Math.sin(t * 37 + f.id));
      }
      a.burnLight.intensity = burn * 900;
    });
    // the sword runs out plate by plate, each one sliding out of the last
    const dep = s.sword?.deploy ?? 0;
    let yb = 0;
    plates.forEach((g, k) => {
      const e = Math.min(1, Math.max(0, dep * (BLADE.n + 1) - k));
      g.visible = e > 0.01;
      g.position.y = yb;
      g.scale.y = Math.max(e, 0.01);
      yb -= segL * e;
    });
    bladeEnd = yb - (dep > 0.98 ? segL * 1.4 : 0);
    mat.swordEdge.emissiveIntensity = 0.4 + 7 * (s.sword?.heat ?? 0);
    // the shockwave: the latest punch's, at its fist
    const hit = (s.punch ?? []).filter((p) => p && p.impact > 0.01).sort((x, y) => y.impact - x.impact)[0];
    shock.visible = !!hit;
    if (hit) {
      const a = arms[hit.s < 0 ? 0 : 1];
      root.updateMatrixWorld(true);
      shock.position.copy(root.worldToLocal(a.fa.localToWorld(vb.set(0, -FORE - 4, 0))));
      shock.position.x += 3;
      const r = 3 + 26 * (1 - hit.impact);
      shock.scale.set(r, r, r);
      for (const m of shockMats) m.opacity = hit.impact ** 1.5;
    }
    s.legs.forEach((L, i) => {
      const g = legs[i];
      g.rootL.position.set(...L.hip);
      g.rootL.rotation.x = L.roll;
      g.thigh.rotation.z = L.th + Math.PI / 2;
      g.knee.rotation.z = L.ts - L.th;
      g.ankle.rotation.z = L.ankleRel;
      g.foot.rotation.x = -L.roll;
    });
    for (const a of s.acts) setAct(legs[a.side < 0 ? 0 : 1].acts[a.key], a.a, a.b, Math.min(1, a.p / (ops.pRated || M.pRated)) ** 0.7);
    // the chest cannon opens the plates too, and drives the reactor past its glow
    const gun = ops.cannon;
    const open = Math.max(ops.core ?? 0, gun?.open ?? 0);
    const charge = gun?.charge ?? 0;
    const blast = gun?.flash ?? 0;
    for (const h of halves) {
      h.rotation.y = -h.userData.s * 1.1 * open;
      h.position.x = R0.x + 1.2 * open;
    }
    lid.visible = open < 0.35;
    core.visible = open > 0.02 || xrayNow > 0.02;
    const load = ops.load ?? 0.4;
    mat.core.emissiveIntensity = 2.4 + 3.6 * load + 1.6 * open + 5 * charge + 3 * blast;
    orb.visible = charge + blast > 0.02;
    orb.scale.setScalar(0.3 + 2.4 * charge * (1 + 0.08 * Math.sin(t * 47)) + 0.6 * blast);
    // the turbine spins with the power drawn
    const dt = Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    fanA += dt * (2 + 9 * load + 4 * open + 40 * charge);
    fan.rotation.x = fanA;
    xrayNow = ops.xray ?? 0;
    for (const m of SHELLS) {
      m.opacity = 1 - 0.93 * xrayNow;
      m.depthWrite = xrayNow < 0.3;
    }
    for (const m of [mat.frame, mat.joint]) m.emissive.copy(xrayTint).multiplyScalar(xrayNow);
    edgeMat.opacity = 0.3 * xrayNow;
    for (const e of edges) e.visible = xrayNow > 0.01;
  };

  // world positions the console's callouts point at
  const w = (obj, x = 0, y = 0, z = 0) => obj.localToWorld(new V3(x, y, z));
  const anchors = () => {
    const L = legs[HERO];
    const zs = L.s * 1; // the outer cylinder of the pair
    return {
      hipAct: L.rootL.localToWorld(L.acts.hip.mid.clone().setZ(zs * ACT_Z)),
      kneeAct: L.rootL.localToWorld(L.acts.knee.mid.clone().setZ(zs * ACT_Z)),
      knee: w(L.knee, 0, 0, L.s * 3.6),
      ankle: w(L.ankle, 0, 0, L.s * 2.6),
      foot: w(L.foot, 6, -2.4, 0),
      core: w(core, 1.0, 0, 0),
      muzzle: w(core, 5.5, 0, 0),
      // straight out of the chest, a little down
      aim: w(torso, 1, -CANNON.drop, 0).sub(w(torso)).normalize(),
      visor: w(torso, visor.x, visor.y, visor.z),
      cannon: w(arms[1].fa, 0, -FORE * 0.5, 2.0),
      elbows: arms.map((a) => w(a.fa, 0, 0.5, a.s * 3.0)),
      swordBase: w(sword, 0, bladeEnd * 0.4, 0),
      swordTip: w(sword, 0, bladeEnd, 0),
      swordMid: w(sword, 0, bladeEnd * 0.6, 0),
      fists: arms.map((a) => w(a.fa, 0, -FORE - 4, 0)),
    };
  };
  return {group: root, update, shells, edges, anchors, legs, mat, get xray() {
    return xrayNow;
  }};
}
