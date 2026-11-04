// GIPSY DANGER as a page you drive: the console (console.js) over the stage (stage.js), run in real time. View buttons and
// keys 1-5, SWORD (S), CHEST CANNON (F), PUNCH (P), DRAIN SEA (W), X-RAY (X), OPEN CORE (C), TRACE (T), PAUSE (space), the throttle slider and ←/→, an orbit you drag and a
// zoom on the wheel. Left alone it plays SCRIPT as an auto tour with an operator's cursor, looped; a click, drag, wheel
// or key hands control to the visitor, and 25 s of quiet hands it back. The throttle is the one input: speed sets the
// gait (kin.gaitFor), the gait phase is integrated frame by frame, and every pose and reading comes from stateAt.
import * as THREE from 'three';
import {warmComposer} from '../kit/warm.js';
import {createConsole, V_MAX, VIEW_KEYS} from './console.js';
import {onLang, t} from './i18n.js';
import {CANNON, cannonAt, SWORD, swordAt, gaitFor, HERO, legAt, M, PUNCH, punchAt, REACTOR_RATED, stateAt, wadeAt} from './kin.js';
import {createMechStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// the camera for each view: target, azimuth (0 in front, -90 from the right: the walk reads left to right),
// elevation, distance, screen shift
const VIEW_FN = {
  cine: (s, bx) => ({tx: bx + 8, ty: 41, tz: 0, az: -34 - 9 * Math.sin(s * 0.11), el: 4, d: 330, sx: 0, sy: -42}),
  leg: (s, bx) => ({tx: bx + 3, ty: 23, tz: 6, az: -86 - 4 * Math.sin(s * 0.2), el: 4, d: 225, sx: -20, sy: -14}),
  side: (s, bx) => ({tx: bx + 5, ty: 40, tz: 0, az: -90, el: 3, d: 330, sx: 0, sy: -42}),
  front: (s, bx) => ({tx: bx, ty: 40, tz: 0, az: -3, el: 4, d: 335, sx: 0, sy: -42}),
  top: (s, bx) => ({tx: bx + 12, ty: 16, tz: 0, az: -55 - 6 * Math.sin(s * 0.1), el: 52, d: 380, sx: 0, sy: -30}),
  core: (s, bx) => ({tx: bx + 5, ty: 64, tz: 0, az: -24 - 6 * Math.sin(s * 0.15), el: 6, d: 175, sx: 0, sy: -40}),
};
// the auto tour: the operator's moves, in seconds; slide is [from, to, duration] on the throttle
const SCRIPT = [
  {t: 4.5, btn: 'leg'},
  {t: 6.5, btn: 'xray'},
  {t: 13.0, btn: 'xray'},
  {t: 14.2, btn: 'side'},
  {t: 15.2, btn: 'drain'},
  {t: 16.0, slide: [3.5, 12, 2.4]},
  {t: 19.5, btn: 'trace'},
  {t: 21.4, btn: 'drain'},
  {t: 22.0, btn: 'front'},
  {t: 25.5, btn: 'core'},
  {t: 31.5, btn: 'core'},
  {t: 32.8, slide: [12, 2.5, 1.8]},
  {t: 34.6, btn: 'top'},
  {t: 38.6, btn: 'trace'},
  {t: 39.6, btn: 'cine'},
  {t: 40.4, btn: 'punch'},
  {t: 41.5, btn: 'punch'},
  {t: 45.2, btn: 'cannon'},
  {t: 51.0, btn: 'sword'},
];
const DURATION = 58;
const TOUR_SPEED0 = 3.5;

const CSS = `
html,body{background:#04070b;overflow:hidden;margin:0}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.vb{pointer-events:auto;cursor:pointer}
.vb:hover{filter:brightness(1.35)}
.thrhit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:48px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:21px;padding:0 11px;border:1px solid rgba(128,170,205,.35);background:rgba(10,15,21,.9);color:#dfe7ee;font:700 8.5px Inter,sans-serif;letter-spacing:1.4px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#45d4ff}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#7d8d9c;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.title = 'GIPSY DANGER · teardown';
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createMechStage({canvas});
  const ui = createConsole(app);
  st.setLegView(ui.legView);

  // ------------------------------------------------------------ quality tiers: AO first, then MSAA and the shadow map
  const TIERS = [
    {samples: 4, shadow: 2048, ao: true, bloom: true, rain: 5000, refl: 0.5, pr: 2},
    {samples: 4, shadow: 2048, ao: false, bloom: true, rain: 3500, refl: 0.4, pr: 1.5},
    {samples: 0, shadow: 1024, ao: false, bloom: true, rain: 2000, refl: 0.3, pr: 1.1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  // ?tier=N pins a tier (review captures), otherwise it steps down on a slow GPU
  const pinned = new URLSearchParams(location.search).get('tier');
  let tier = pinned !== null ? clamp(Number(pinned), 0, 2) : light ? 2 : 0;
  let fitReady = false;
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    if (fitReady) fit();
  };
  applyTier();

  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  addEventListener('resize', fit);
  fit();
  fitReady = true;
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const turnNote = document.createElement('div');
  turnNote.className = 'turn';
  turnNote.textContent = t('turn');
  document.body.appendChild(turnNote);
  const [kx0, ky] = ui.knobAt(0);
  const [kx1] = ui.knobAt(V_MAX);
  const thrHit = document.createElement('div');
  thrHit.className = 'thrhit';
  Object.assign(thrHit.style, {left: `${kx0 - 12}px`, top: `${ky - 13}px`, width: `${kx1 - kx0 + 24}px`, height: '26px'});
  ui.root.appendChild(thrHit);

  // ------------------------------------------------------------ state
  let T = 0;
  let simT = 0;
  let reactorOut = 24e6;
  let phi = 0;
  let bx = 0;
  let dist = 0;
  let speed = TOUR_SPEED0;
  let speedTarget = TOUR_SPEED0;
  let paused = false;
  let dragging = false;
  const tog = {xray: 0, core: 0, trace: 0, drain: 0};
  const togT = {xray: 0, core: 0, trace: 0, drain: 0};
  let view = 'cine';
  let viewAt0 = 0;
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN.cine(0, 0)};
  let ring = {t: -9, x: 0, y: 0};
  const hist = [];
  let lastSample = -1;
  const wasStance = [true, true];
  const callO = {};
  let jolt = {t: -9, k: 0};
  // punches: when each arm (left, right) last threw one, sim seconds; the next goes to the arm that threw least recently
  const punchT = [-99, -99];
  const fist = [null, null];
  const fistV = [0, 0];
  // the chest cannon and the sword: when each was last called, sim seconds. One move at a time: neither starts while
  // anything is up, and no punch while either is
  let cannonT = -99;
  let swordT = -99;
  let lastAn = null;
  const bigUp = () => simT - cannonT < CANNON.end || simT - swordT < SWORD.end;
  const busy = () => bigUp() || punchT.some((p) => simT - p < PUNCH.end);
  const fire = () => {
    if (!busy()) cannonT = simT;
  };
  const slash = () => {
    if (!busy()) swordT = simT;
  };
  let beamSplash = -9;
  let tip = null;
  let tipV = 0;
  const punch = () => {
    if (bigUp()) return;
    const i = punchT[0] <= punchT[1] ? 0 : 1;
    // an arm still driving through its own punch can't throw again
    if (simT - punchT[i] < PUNCH.end - 0.6) return;
    punchT[i] = simT;
  };

  const setView = (v) => {
    if (v === view) return;
    view = v;
    viewAt0 = T;
  };
  const setPaused = (p) => {
    paused = p;
    ui.btn.pause.textContent = t(p ? 'resume' : 'pause');
  };
  onLang(() => {
    setPaused(paused);
    turnNote.textContent = t('turn');
    tourChip.innerHTML = '';
  });
  setPaused(paused);
  // what a button does, for the visitor and the tour alike
  const act = (k) => {
    if (VIEW_KEYS.includes(k)) {
      if (togT.core && k !== 'cine') togT.core = 0;
      setView(k);
      Object.assign(off, {az: 0, el: 0, k: 1});
    } else if (k === 'xray') togT.xray = togT.xray ? 0 : 1;
    else if (k === 'core') {
      togT.core = togT.core ? 0 : 1;
      if (togT.core) setView('core');
      else if (view === 'core') setView('cine');
      Object.assign(off, {az: 0, el: 0, k: 1});
    } else if (k === 'trace') {
      togT.trace = togT.trace ? 0 : 1;
      if (togT.trace) st.clearTrails();
    } else if (k === 'drain') togT.drain = togT.drain ? 0 : 1;
    else if (k === 'punch') punch();
    else if (k === 'cannon') fire();
    else if (k === 'sword') slash();
    else if (k === 'pause') setPaused(!paused);
  };
  const pulseAt = (x, y) => (ring = {t: T, x, y});

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0, next: 0};
  let lastInput = 0;
  const resetForTour = () => {
    Object.assign(togT, {xray: 0, core: 0, trace: 0, drain: 0});
    if (paused) setPaused(false);
    speedTarget = TOUR_SPEED0;
    setView('cine');
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    AP.next = 0;
    resetForTour();
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    speedTarget = speed;
  };
  // where the cursor stands for an event: the button, or the throttle knob at the slide's start
  const posOf = (e) => (e.btn ? ui.spot(e.btn) : ui.knobAt(e.slide[0]));
  const endOf = (e) => (e.btn ? ui.spot(e.btn) : ui.knobAt(e.slide[1]));
  const tourCursor = (c) => {
    let i = SCRIPT.findIndex((e) => e.t > c);
    if (i < 0) i = SCRIPT.length;
    const prev = SCRIPT[i - 1];
    const next = SCRIPT[i];
    const rest = [1210, 470];
    const from = prev ? endOf(prev) : rest;
    // during a slide the cursor rides the knob
    if (prev?.slide && c < prev.t + prev.slide[2]) {
      const [a, b, d] = prev.slide;
      const [x, y] = ui.knobAt(a + (b - a) * ss(prev.t, prev.t + d, c));
      return {x, y, press: true};
    }
    if (!next) return {x: from[0], y: from[1], press: false};
    const to = posOf(next);
    const k = ss(next.t - 1.0, next.t - 0.08, c);
    const arc = Math.sin(k * Math.PI) * 24;
    return {x: from[0] + (to[0] - from[0]) * k, y: from[1] + (to[1] - from[1]) * k - arc, press: c > next.t - 0.08 && c < next.t + 0.12};
  };

  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', takeOver);
  for (const k of [...VIEW_KEYS, 'sword', 'cannon', 'punch', 'drain', 'xray', 'core', 'trace', 'pause'])
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      const [x, y] = ui.spot(k);
      pulseAt(x, y);
      act(k);
    });
  {
    const onMove = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      speedTarget = clamp(((x - kx0) / (kx1 - kx0)) * V_MAX, 0, V_MAX);
      lastInput = T;
    };
    thrHit.addEventListener('pointerdown', (e) => {
      takeOver();
      dragging = true;
      const up = () => {
        dragging = false;
        removeEventListener('pointermove', onMove);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', up);
      onMove(e);
    });
  }
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const v = {1: 'cine', 2: 'leg', 3: 'side', 4: 'front', 5: 'top'}[key];
    if (v) ui.btn[v].click();
    else if (key === 'x') ui.btn.xray.click();
    else if (key === 'w') ui.btn.drain.click();
    else if (key === 'p') ui.btn.punch.click();
    else if (key === 'f') ui.btn.cannon.click();
    else if (key === 's') ui.btn.sword.click();
    else if (key === 'c') ui.btn.core.click();
    else if (key === 't') ui.btn.trace.click();
    else if (key === ' ') ui.btn.pause.click();
    else if (key === 'l') ui.btn.lang.click();
    else if (key === 'arrowright' || key === 'arrowleft') {
      takeOver();
      speedTarget = clamp(speedTarget + (key === 'arrowright' ? 0.5 : -0.5), 0, V_MAX);
    } else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    drag = {x: e.clientX, y: e.clientY};
    off.az -= dx * 0.3;
    off.el = clamp(off.el + dy * 0.2, -10, 70);
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.4, 2.2);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ histories for the charts
  const windowOf = (secs) => hist.filter((h) => h.t >= simT - secs);
  const footfallOf = (rows) => {
    const out = [[], []];
    const t0 = simT - 6;
    for (const side of [0, 1]) {
      let start = null;
      for (const h of rows) {
        if (h.st[side] && start === null) start = h.t;
        if (!h.st[side] && start !== null) {
          out[side].push([(start - t0) / 6, (h.t - t0) / 6]);
          start = null;
        }
      }
      if (start !== null) out[side].push([(start - t0) / 6, 1]);
    }
    return out;
  };
  let pathOf = null;
  let anklePath = [];
  const pathFor = (g) => {
    if (!pathOf || Math.abs(g.amp - pathOf.amp) > 0.01 || Math.abs(g.run - pathOf.run) > 0.01 || Math.abs(g.S - pathOf.S) > 0.05) {
      pathOf = g;
      anklePath = Array.from({length: 72}, (_, i) => legAt(HERO ? 1 : -1, i / 72, g).A);
    }
    return anklePath;
  };

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  let odd = false;
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    if (pinned === null && tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.4) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    // the operator: the tour's script, or the visitor's last choices
    let cursor;
    let tourSliding = false;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      if (loop > AP.loop) {
        AP.loop = loop;
        AP.next = 0;
        resetForTour();
      }
      const cyc = c - loop * DURATION;
      while (AP.next < SCRIPT.length && SCRIPT[AP.next].t <= cyc) {
        const e = SCRIPT[AP.next++];
        if (e.btn) {
          act(e.btn);
          const [x, y] = ui.spot(e.btn);
          pulseAt(x, y);
        }
      }
      for (const e of SCRIPT)
        if (e.slide && cyc >= e.t && cyc < e.t + e.slide[2] + 0.1) {
          speedTarget = e.slide[0] + (e.slide[1] - e.slide[0]) * ss(e.t, e.t + e.slide[2], cyc);
          tourSliding = true;
        }
      cursor = tourCursor(cyc);
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {...cursor, ring: rk, ringX: ring.x, ringY: ring.y};
    } else {
      if (T - lastInput > IDLE) startTour();
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    speed += (speedTarget - speed) * (1 - Math.exp(-dt / 0.6));
    // the sea drains and floods over a couple of seconds; the rest switch quickly
    for (const k in tog) tog[k] += (togT[k] - tog[k]) * (1 - Math.exp(-dt / (k === 'drain' ? 0.7 : 0.22)));

    // the gait: speed sets amplitude and cadence, the phase integrates
    const g = gaitFor(speed);
    const {amp, f} = g;
    if (!paused) {
      simT += dt;
      phi += f * dt;
      bx += speed * dt;
      dist += speed * dt;
    }
    const s = stateAt(phi, g);
    // the punches lay over the gait's upper body: each arm's own pose, the torso twisting and leaning into them
    s.punch = [-1, 1].map((sd, i) => punchAt(simT - punchT[i], sd));
    // the chest cannon braces the body: the arms swing back out of its line, the torso leans back into the recoil; its
    // charge draws on the reactor
    const gun = cannonAt(simT - cannonT);
    if (gun) {
      s.punch = gun.arms;
      s.up.lean += gun.w * gun.lean;
      s.reactor += gun.charge * 90e6 + gun.flash * 150e6;
      // the beam lights: a hard kick, then the whole time it holds the water heaves round the boots and the shot shakes
      if (!paused && simT - dt < cannonT + CANNON.fire && simT >= cannonT + CANNON.fire) {
        jolt = {t: simT, k: 3.0};
        st.addImpact(bx + 2, 0, simT, 2.0);
      } else if (!paused && gun.flash > 0.5 && simT - beamSplash > 0.3) {
        beamSplash = simT;
        jolt = {t: simT, k: 0.9};
        for (const L of s.legs) st.addImpact(bx + L.footW[0], L.footW[2], simT, 1.1);
      }
    }
    // the sword takes the right arm over; the left comes up to guard
    const sw = swordAt(simT - swordT);
    s.sword = sw;
    if (sw) {
      s.punch = [null, sw];
      if (!paused && simT - dt < swordT + SWORD.cut && simT >= swordT + SWORD.cut) jolt = {t: simT, k: 2.2};
    }
    for (const p of s.punch) {
      if (!p || p.guard === false) continue;
      s.up.yaw += p.w * p.yaw;
      s.up.lean += p.w * p.lean;
      // full reach: the blow shakes the shot
      if (!sw && !paused && simT - dt < punchT[p.s < 0 ? 0 : 1] + PUNCH.hit && simT >= punchT[p.s < 0 ? 0 : 1] + PUNCH.hit) jolt = {t: simT, k: 1.2};
    }
    // the accumulators carry the pumps' peaks: the reactor sees the demand averaged over about a step
    if (!paused) reactorOut += (s.reactor - reactorOut) * (1 - Math.exp(-dt / 1.4));
    s.reactor = reactorOut;
    // footfalls at touchdown (a ripple ring, spray, a jolt through the camera), trails while TRACE is on
    s.legs.forEach((L, i) => {
      if (!paused && L.stance && !wasStance[i] && amp > 0.2) {
        const k = clamp(0.35 + 0.65 * amp * Math.min(1, speed / 4), 0, 1) * (1 + 0.5 * g.run);
        // the boot lands on the floor under the water: the surface heaves where the shin goes through it
        const w = wadeAt(L, st.level);
        if (w.wet) st.addImpact(bx + w.x, w.z, simT, k);
        jolt = {t: simT, k};
      }
      wasStance[i] = L.stance;
      if (tog.trace > 0.01 && !paused) st.pushTrail(i, [bx + L.footW[0], L.footW[1], L.footW[2]], tog.trace);
    });
    if (!paused && simT - lastSample >= 1 / 30) {
      lastSample = simT;
      const byName = Object.fromEntries(s.acts.map((a) => [a.name, a.p]));
      hist.push({t: simT, st: [s.legs[0].share > 0.02, s.legs[1].share > 0.02], F: [s.legs[0].F / 1e6, s.legs[1].F / 1e6], kp: [byName['L-KNEE'], byName['R-KNEE']], P: s.reactor});
      while (hist.length > 2 && hist[0].t < simT - 12.5) hist.shift();
    }

    // the camera eases toward the view's own move plus the visitor's orbit
    const since = T - viewAt0;
    const tgt = VIEW_FN[view](since, bx);
    tgt.az += off.az;
    tgt.el = clamp(tgt.el + off.el, 1, 82);
    tgt.d *= off.k;
    const k = 1 - Math.exp(-dt / 0.6);
    const dAz = wrapDeg(tgt.az - cam.az);
    cam.az += dAz * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    const swing = Math.min(1, Math.abs(dAz) / 90);
    const load = clamp(s.reactor / REACTOR_RATED, 0, 1);
    // a heavy footfall shakes the shot: a damped vertical jolt on the look point
    const ja = simT - jolt.t;
    const shake = ja > 0 ? jolt.k * Math.exp(-ja * 5) * Math.sin(ja * 38) * 0.5 : 0;
    // lightning: a double flicker every 13.7 s
    const lu = T % 13.7;
    const flash = Math.exp(-lu * 10) + (lu > 0.22 ? 0.7 * Math.exp(-(lu - 0.22) * 7) : 0);
    const an = st.frame(s, bx, simT, {...cam, ty: cam.ty + shake * cam.d * 0.004, el: (cam.el + 8 * swing) * D2R, az: cam.az * D2R, d: cam.d + 30 * swing}, {xray: tog.xray, core: tog.core, drain: tog.drain, cannon: gun, load, trail: tog.trace, flash: Math.min(1, flash), pRated: M.pRated});

    lastAn = an;
    if (tip && !paused && dt > 0) tipV += (an.swordTip.distanceTo(tip) / dt - tipV) * (1 - Math.exp(-dt / 0.1));
    tip = an.swordTip.clone();
    // the fists' speed through the air, from where the frame put them
    an.fists.forEach((f, i) => {
      if (fist[i] && !paused && dt > 0) fistV[i] += (f.distanceTo(fist[i]) / dt - fistV[i]) * (1 - Math.exp(-dt / 0.12));
      fist[i] = f.clone();
    });
    const burning = s.punch.map((p) => p?.burn ?? 0);
    const hot = burning[0] > burning[1] ? 0 : 1;

    // callouts: the left leg's parts in LEG view or X-RAY, the reactor when the core is open, the elbow rockets in a punch
    const L = s.legs[HERO];
    const kA = s.acts.find((a) => a.key === 'knee' && a.side === L.side);
    const hA = s.acts.find((a) => a.key === 'hip' && a.side === L.side);
    const legOn = view === 'leg' || tog.xray > 0.5 ? 1 : 0;
    const fmt = (a) => t('cyl', (a.p / 1e6).toFixed(1), t(a.T > 0 ? 'pull' : 'push'), (Math.abs(a.T) / 1e6).toFixed(1));
    const defs = [
      {id: 'hip', on: legOn, at: an.hipAct, name: t('hipCyl'), sub: fmt(hA), dx: 70, dy: -46},
      {id: 'knee', on: legOn, at: an.kneeAct, name: t('kneeCyl'), sub: fmt(kA), dx: -80, dy: -40},
      {id: 'kj', on: legOn, at: an.knee, name: t('kneeJ'), sub: t('bend', ((L.flex * 180) / Math.PI).toFixed(1)), dx: 86, dy: 18},
      {id: 'ankle', on: legOn, at: an.ankle, name: t('ankle'), sub: L.stance ? t('onFoot', (L.F / 1e6).toFixed(1)) : t('inAir', ((L.pitch * 180) / Math.PI).toFixed(0)), dx: -84, dy: 34},
      {id: 'core', on: tog.core > 0.5 ? 1 : 0, at: an.core, name: t('turbine'), sub: t('turbineSub', (s.reactor / 1e6).toFixed(0), (load * 100).toFixed(0)), dx: 120, dy: -70},
      {id: 'vis', on: tog.core > 0.5 ? 1 : 0, at: an.visor, name: t('pod'), sub: t('podSub'), dx: -110, dy: -40},
      {id: 'plasma', on: gun && simT - cannonT < CANNON.fire + CANNON.beam ? 1 : 0, at: an.core, name: t('plasma'), sub: simT - cannonT < CANNON.fire ? t('charging', ((gun?.charge ?? 0) * 100).toFixed(0)) : t('firing', (s.reactor / 1e6).toFixed(0)), dx: -150, dy: 60},
      {id: 'sword', on: sw && sw.deploy > 0.6 ? 1 : 0, at: an.swordMid, name: t('swordName'), sub: t('swordSub', 32, tipV.toFixed(0)), dx: 110, dy: 50},
      {id: 'rocket', on: burning[hot] > 0.2 || (s.punch[hot]?.impact ?? 0) > 0.3 ? 1 : 0, at: an.elbows[hot], name: t('rocket'), sub: t('fistSpeed', fistV[hot].toFixed(0)), dx: hot ? 110 : -120, dy: -70},
    ];
    const callouts = defs.map((c) => {
      const p = st.project(c.at);
      const vis = p && !ui.covered(p[0], p[1]) && !ui.covered(p[0] + c.dx * 1.6, p[1] + c.dy) ? c.on : 0;
      callO[c.id] = (callO[c.id] ?? 0) + (vis - (callO[c.id] ?? 0)) * (1 - Math.exp(-dt / 0.18));
      return {...c, at: p, o: callO[c.id]};
    });

    odd = !odd;
    if (tier > 0 && odd) ui.pointer(cursor);
    else {
      const rows6 = windowOf(6);
      const rows12 = windowOf(12).filter((_, i) => i % 2 === 0);
      ui.update({
        st: s,
        speed,
        amp,
        f,
        gait: g,
        dist,
        drag: dragging || tourSliding,
        view,
        xray: tog.xray,
        drain: tog.drain,
        punch: gun ? 0 : Math.max(...s.punch.map((p) => p?.w ?? 0)),
        cannon: gun?.w ?? 0,
        sword: sw?.w ?? 0,
        water: st.level,
        core: tog.core,
        trace: tog.trace,
        anklePath: pathFor(g),
        reactorHist: rows12.map((h) => h.P),
        footfall: footfallOf(rows6),
        loadHist: [rows6.map((h) => h.F[0]), rows6.map((h) => h.F[1])],
        kneeHist: [rows6.map((h) => h.kp[0]), rows6.map((h) => h.kp[1])],
        callouts,
        cursor,
      });
    }

    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? `<i></i>${t('tourOn')}` : t('tourOff');
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {st, cam, startTour, takeOver, act, THREE, get tier() {
    return tier;
  }, get T() {
    return T;
  }, get speed() {
    return speed;
  }, setSpeed: (v) => (speedTarget = v)};
}
