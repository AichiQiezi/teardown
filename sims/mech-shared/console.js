// The GIPSY DANGER console: a LOCCENT instrument sheet over the full-bleed proving ground. Dark glass panels, steel-blue
// rules, one Jaeger-cyan accent for whatever is carrying load right now (the right leg is the hero). Fixed 1600 x 900 CSS
// layout; update(s) redraws every live part from the frame's state: the leg panel is the hero leg's solved pose and its
// ankle loop, the hydraulics the four actuators' real pressures, the footfall and load charts the last 6 s of the gait.
import {getLang, onLang, setLang, t} from './i18n.js';
import {HERO, M, REACTOR_RATED} from './kin.js';

export const C = {ink: '#e3ebf2', mute: '#7c8b99', faint: '#2c3a47', line: 'rgba(100,190,235,.26)', panel: 'rgba(5,11,17,.8)', accent: '#45d4ff', cool: '#b9c4ce', warn: '#ff5a3c', dark: '#061018'};
export const VIEW_KEYS = ['cine', 'leg', 'side', 'front', 'top'];
// lit while on; PUNCH, CANNON and SWORD are one-shots, lit while the move plays
export const TOGGLES = ['sword', 'cannon', 'punch', 'drain', 'xray', 'core', 'trace'];
export const V_MAX = M.vMax;
const CSS = `
#app{font-family:Inter,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at 52% 45%,transparent 55%,rgba(0,0,0,.55) 100%)}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};backdrop-filter:blur(4px)}
.pn::before,.pn::after{content:'';position:absolute;width:9px;height:9px;border:1.5px solid ${C.accent};opacity:.75}
.pn::before{left:-1px;top:-1px;border-right:0;border-bottom:0}
.pn::after{right:-1px;bottom:-1px;border-left:0;border-top:0}
.hd{font-size:9px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;white-space:nowrap;color:${C.ink}}
.hd i{font-style:normal;color:${C.accent};margin-right:7px;letter-spacing:0}
.lb{font-size:8px;font-weight:600;letter-spacing:1.3px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.vl{font-size:10.5px;font-weight:600;letter-spacing:.4px;white-space:nowrap}
.mono{font-family:'JetBrains Mono','PingFang SC','Microsoft YaHei',ui-monospace,monospace}
.ttl [data-i] span{color:${C.accent};font-size:20px;letter-spacing:2px}
html[lang=zh-CN] .lb{font-size:8.6px;letter-spacing:1px}
html[lang=zh-CN] .hd{font-size:9.8px;letter-spacing:1.4px}
html[lang=zh-CN] .call b{font-size:9.5px;letter-spacing:1px}
.vb{position:absolute;height:19px;padding:0 9px;display:flex;align-items:center;font-size:8.5px;font-weight:700;letter-spacing:1.4px;white-space:nowrap;border:1px solid ${C.line};background:rgba(10,15,21,.85);color:${C.ink}}
.call{position:absolute;white-space:nowrap;background:rgba(10,15,21,.86);border:1px solid ${C.line};border-left:2px solid ${C.accent};padding:4px 8px 4px}
.call b{display:block;font-size:8.5px;font-weight:700;letter-spacing:1.4px}
.call span{display:block;font:600 8px 'JetBrains Mono',monospace;letter-spacing:.6px;color:${C.accent};margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
.ring{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:1.6px solid ${C.accent};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
// a fixed label in the current language, relabelled in place when it changes
const tx = (k) => `<span data-i="${k}">${t(k)}</span>`;
const specsHtml = () => t('specs').map(([k, v]) => `<span class="lb">${k}:</span><span class="vl">${v}</span>`).join('');
const pad = (n, w = 3) => String(Math.round(n)).padStart(w, '0');
const deg = (r) => (r * 180) / Math.PI;

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  add(`<div class="vig"></div>`);
  add(`<div class="scan"></div>`);

  // ------------------------------------------------------------ top bar: views and toggles
  add(`<div style="position:absolute;left:12px;right:12px;top:8px;height:24px;border-bottom:1px solid ${C.line}"></div>`);
  add(`<div class="lb" style="left:18px;top:14px;position:absolute;color:${C.ink}">${tx('top')}</div>`);
  // left of centre: the view and toggle buttons reach past the middle of the bar
  add(`<div class="lb mono" style="position:absolute;left:330px;top:14px;color:${C.ink};letter-spacing:2px">${tx('mid')}</div>`);
  const btn = {};
  {
    let x = 1588;
    const right = (key, label, w) => {
      x -= w;
      btn[key] = add(`<div class="vb" style="left:${x}px;top:10px;width:${w}px;justify-content:center"${label ? ` data-i="${label}"` : ''}>${label ? t(label) : ''}</div>`);
      x -= 4;
    };
    right('lang', 'lang', 46);
    btn.lang.style.pointerEvents = 'auto';
    btn.lang.style.cursor = 'pointer';
    x -= 6;
    right('pause', null, 84);
    x -= 10;
    right('trace', 'trace', 62);
    right('core', 'core', 84);
    right('xray', 'xray', 58);
    right('drain', 'drain', 76);
    x -= 10;
    right('punch', 'punch', 52);
    right('cannon', 'cannon', 66);
    right('sword', 'sword', 62);
    x -= 10;
    for (const k of [...VIEW_KEYS].reverse()) right(k, k === 'top' ? 'topv' : k, k.length * 7 + 22);
    add(`<div class="lb" style="position:absolute;left:${x - 34}px;top:15px">${tx('view')}</div>`);
  }
  add(`<div class="lb" style="position:absolute;right:16px;top:36px;letter-spacing:1px;font-size:7.5px">${tx('keys')}</div>`);

  // ------------------------------------------------------------ title block and specs, top left
  add(`<div class="ttl" style="position:absolute;left:34px;top:50px;font-size:31px;font-weight:500;letter-spacing:.6px;line-height:1">${tx('title')}</div>`);
  add(`<div class="lb" style="position:absolute;left:35px;top:88px;color:${C.ink};font-size:8.5px;letter-spacing:1.6px">${tx('sub')}</div>`);
  const specs = add(`<div style="position:absolute;left:35px;top:110px;display:grid;grid-template-columns:70px auto;row-gap:4px">${specsHtml()}</div>`);

  add(`<div class="lb" style="position:absolute;left:35px;top:262px;font-size:6.5px;letter-spacing:1px">${tx('note')}</div>`);
  add(`<div class="lb" style="position:absolute;left:35px;top:271px;font-size:6.5px;letter-spacing:1px">${tx('credit')}</div>`);

  // ------------------------------------------------------------ throttle, left
  const TP = {x: 34, y: 282, w: 262, h: 150};
  add(`<div class="pn" style="left:${TP.x}px;top:${TP.y}px;width:${TP.w}px;height:${TP.h}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:${TP.x + 12}px;top:${TP.y + 11}px"><i>›››</i>${tx('throttle')}</div>`);
  const gaitVal = add(`<div class="vl" style="position:absolute;right:${1600 - (TP.x + TP.w - 16)}px;top:${TP.y + 10}px;font-weight:700;letter-spacing:1.4px"></div>`);
  const SL = {x: TP.x + 16, y: TP.y + 52, w: TP.w - 32};
  add(`<div class="lb" style="position:absolute;left:${SL.x}px;top:${SL.y - 18}px">${tx('speed')}</div>`);
  const spdVal = add(`<div class="vl mono" style="position:absolute;right:${1600 - (SL.x + SL.w)}px;top:${SL.y - 20}px;color:${C.accent}"></div>`);
  add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y}px;width:${SL.w}px;height:3px;background:rgba(128,170,205,.18)"></div>`);
  // past the walk's top speed the gait turns into a run: that stretch of the track is marked
  const runX = (M.vWalk / V_MAX) * SL.w;
  add(`<div style="position:absolute;left:${SL.x + runX}px;top:${SL.y - 3}px;width:${SL.w - runX}px;height:2px;background:${C.warn};opacity:.55"></div>`);
  const fill = add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y}px;height:3px;background:${C.accent}"></div>`);
  const knob = add(`<div style="position:absolute;top:${SL.y - 6.5}px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:${C.dark};border:1.6px solid ${C.ink}"></div>`);
  add(`<svg style="position:absolute;left:${SL.x}px;top:${SL.y + 8}px" width="${SL.w}" height="14">${[0, 4, 8, 12, 16].map((v) => `<line x1="${(v / V_MAX) * SL.w}" x2="${(v / V_MAX) * SL.w}" y1="0" y2="4" stroke="${C.mute}" stroke-width=".8"/><text x="${Math.min(SL.w - 12, Math.max(4, (v / V_MAX) * SL.w))}" y="12" font-size="6.5" text-anchor="middle" fill="${C.mute}">${v}${v === 16 ? ' m/s' : ''}</text>`).join('')}</svg>`);
  add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y + 32}px;width:${SL.w}px;display:grid;grid-template-columns:1fr auto;row-gap:5px">
    <span class="lb">${tx('cadence')}</span><span class="vl mono" data-k="cad"></span>
    <span class="lb">${tx('stride')}</span><span class="vl mono" data-k="stride"></span>
    <span class="lb">${tx('dist')}</span><span class="vl mono" data-k="dist"></span></div>`);

  // ------------------------------------------------------------ reactor, left
  const RP = {x: 34, y: 444, w: 262, h: 276};
  add(`<div class="pn" style="left:${RP.x}px;top:${RP.y}px;width:${RP.w}px;height:${RP.h}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:${RP.x + 12}px;top:${RP.y + 11}px"><i>›››</i>${tx('reactor')}</div>`);
  const gauge = add(`<svg style="position:absolute;left:${RP.x + 12}px;top:${RP.y + 30}px" width="238" height="118"></svg>`);
  add(`<div style="position:absolute;left:${RP.x + 16}px;top:${RP.y + 154}px;width:${RP.w - 32}px;display:grid;grid-template-columns:1fr auto;row-gap:5px">
    <span class="lb">${tx('hyd')}</span><span class="vl mono" data-k="hyd"></span>
    <span class="lb">${tx('flow')}</span><span class="vl mono" data-k="flow"></span>
    <span class="lb">${tx('hotel')}</span><span class="vl mono">20 MW</span></div>`);
  const rHist = add(`<svg style="position:absolute;left:${RP.x + 16}px;top:${RP.y + 214}px" width="${RP.w - 32}" height="50"></svg>`);

  // ------------------------------------------------------------ leg kinematics, top right
  const LP = {x: 1300, y: 52, w: 272, h: 398};
  // the stage paints this panel's glass and the hero leg's hull into it (setLegView); the frame here stays clear
  add(`<div class="pn" style="left:${LP.x}px;top:${LP.y}px;width:${LP.w}px;height:${LP.h}px;background:none;backdrop-filter:none"></div>`);
  add(`<div class="hd" style="position:absolute;left:${LP.x + 12}px;top:${LP.y + 11}px"><i>›››</i>${tx('legK')}</div>`);
  const legSvg = add(`<svg style="position:absolute;left:${LP.x + 12}px;top:${LP.y + 28}px" width="248" height="282"></svg>`);
  add(`<div style="position:absolute;left:${LP.x + 12}px;top:${LP.y + 318}px;width:${LP.w - 24}px;display:grid;grid-template-columns:1fr 1fr;row-gap:5px">
    <span class="lb">${tx('hipFlex')}</span><span class="vl mono" style="text-align:right" data-k="hip"></span>
    <span class="lb">${tx('kneeBend')}</span><span class="vl mono" style="text-align:right" data-k="knee"></span>
    <span class="lb">${tx('pitch')}</span><span class="vl mono" style="text-align:right" data-k="ankle"></span>
    <span class="lb">${tx('phase')}</span><span class="vl mono" style="text-align:right" data-k="phase"></span></div>`);

  // ------------------------------------------------------------ hydraulics, right
  const HP = {x: 1300, y: 462, w: 272, h: 258};
  add(`<div class="pn" style="left:${HP.x}px;top:${HP.y}px;width:${HP.w}px;height:${HP.h}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:${HP.x + 12}px;top:${HP.y + 11}px"><i>›››</i>${tx('hydr')}</div>`);
  const ACT_ORDER = ['R-HIP', 'R-KNEE', 'L-HIP', 'L-KNEE'];
  const actRows = {};
  ACT_ORDER.forEach((name, i) => {
    const y = HP.y + 34 + i * 46;
    actRows[name] = add(`<div style="position:absolute;left:${HP.x + 12}px;top:${y}px;width:${HP.w - 24}px;height:42px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="lb" data-r="n" style="color:${C.ink}">${tx(name)}</span><span class="vl mono" data-r="p"></span></div>
      <div style="position:relative;height:6px;margin-top:4px;background:rgba(128,170,205,.12)"><div data-r="bar" style="position:absolute;left:0;top:0;bottom:0"></div><div style="position:absolute;left:${((28 / 35) * 100).toFixed(1)}%;top:-2px;bottom:-2px;width:1px;background:${C.mute}"></div></div>
      <div class="lb mono" data-r="s" style="margin-top:4px;font-size:7.5px;letter-spacing:.5px"></div></div>`);
  });
  add(`<div class="lb" style="position:absolute;left:${HP.x + 12}px;top:${HP.y + HP.h - 18}px;font-size:6.5px;letter-spacing:.4px">${tx('scale')}</div>`);

  // ------------------------------------------------------------ bottom strip: footfall + load, balance, pressure
  const BY = 734;
  const BH = 154;
  add(`<div class="pn" style="left:34px;top:${BY}px;width:840px;height:${BH}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:46px;top:${BY + 11}px"><i>›››</i>${tx('footfall')}</div>`);
  add(`<div class="lb" style="position:absolute;left:640px;top:${BY + 12}px"><span style="display:inline-block;width:14px;height:6px;background:${C.accent};vertical-align:middle;margin-right:6px"></span>${tx('right')} <span style="display:inline-block;width:14px;height:6px;background:${C.cool};vertical-align:middle;margin:0 6px 0 14px"></span>${tx('left')}</div>`);
  const gait = add(`<svg style="position:absolute;left:46px;top:${BY + 30}px" width="816" height="118"></svg>`);

  add(`<div class="pn" style="left:882px;top:${BY}px;width:396px;height:${BH}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:894px;top:${BY + 11}px"><i>›››</i>${tx('balance')}</div>`);
  const bal = add(`<svg style="position:absolute;left:894px;top:${BY + 28}px" width="372" height="118"></svg>`);

  add(`<div class="pn" style="left:1286px;top:${BY}px;width:286px;height:${BH}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:1298px;top:${BY + 11}px"><i>›››</i>${tx('kneeP')}</div>`);
  const pres = add(`<svg style="position:absolute;left:1296px;top:${BY + 28}px" width="268" height="118"></svg>`);

  // ------------------------------------------------------------ overlays: callouts and the pointer
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="24" height="24" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="${C.ink}" stroke="${C.dark}" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);

  const K = {};
  for (const n of ui.querySelectorAll('[data-k]')) K[n.dataset.k] = n;
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    const a = app.getBoundingClientRect();
    const sc = a.width / 1600 || 1;
    return [(r.left + r.width / 2 - a.left) / sc, (r.top + r.height / 2 - a.top) / sc];
  };
  const knobAt = (v) => [SL.x + (v / V_MAX) * SL.w, SL.y + 1.5];
  const spot = (k) => centre(btn[k]);
  // the screen areas the panels cover, so a callout never lands under one
  const PANELS = [[1300, 52, 1572, 720], [34, 282, 296, 720], [34, BY, 1572, 888], [30, 44, 330, 270], [880, 6, 1592, 44]];
  const covered = (x, y) => PANELS.some(([a, b, c, d]) => x > a - 8 && x < c + 8 && y > b - 8 && y < d + 8);

  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };

  // the leg panel's frame: metres in the leg plane (hip at the origin) to panel px
  const LS = 5.6;
  const LX = (x) => 90 + x * LS;
  const LY = (y) => 22 - y * LS;
  const pt = (p) => `${LX(p[0]).toFixed(1)} ${LY(p[1]).toFixed(1)}`;
  const pCol = (p) => (p > 28e6 ? C.warn : C.accent);

  // static labels follow the language; the live ones are redrawn every frame anyway
  const relabel = () => {
    for (const n of ui.querySelectorAll('[data-i]')) n.innerHTML = t(n.dataset.i);
    specs.innerHTML = specsHtml();
  };
  onLang(relabel);
  btn.lang.addEventListener('click', (e) => {
    e.stopPropagation();
    setLang(getLang() === 'zh' ? 'en' : 'zh');
  });

  return {
    btn,
    root: ui,
    legView: {x: LP.x, y: LP.y, w: LP.w, h: LP.h, ox: LP.x + 12 + LX(0), oy: LP.y + 28 + LY(0), k: LS},
    spot,
    covered,
    knobAt,
    pointer,
    update(s) {
      const st = s.st;
      const L = st.legs[HERO];
      // throttle
      {
        const [kx] = knobAt(s.speed);
        knob.style.left = `${kx.toFixed(1)}px`;
        knob.style.transform = `scale(${s.drag ? 1.18 : 1})`;
        knob.style.borderColor = s.drag ? C.accent : C.ink;
        fill.style.width = `${(kx - SL.x).toFixed(1)}px`;
        spdVal.textContent = `${s.speed.toFixed(2)} m/s · ${(s.speed * 3.6).toFixed(1)} km/h`;
        K.cad.textContent = t('steps', (s.f * 120).toFixed(1));
        const g = st.gait;
        // one stride is two steps: the stance travel plus the ground covered while that foot is up
        const strideW = g.duty > 0 ? g.S / g.duty : 0;
        const air = g.run > 0.5 && st.legs.every((x) => !x.stance);
        gaitVal.textContent = t(s.speed < 0.05 ? 'stand' : air ? 'flight' : g.run > 0.5 ? 'running' : 'walking');
        gaitVal.style.color = g.run > 0.5 ? C.warn : C.accent;
        K.stride.textContent = `${strideW.toFixed(2)} m · ${(strideW / 2).toFixed(2)} m`;
        K.dist.textContent = `${s.dist.toFixed(1)} m`;
      }
      // reactor gauge: a 220° arc, its last 12 s below
      {
        const k = Math.min(1, st.reactor / REACTOR_RATED);
        const cx = 119;
        const cy = 92;
        const r = 72;
        const a0 = (200 * Math.PI) / 180;
        const a1 = (-20 * Math.PI) / 180;
        const P = (a, rr = r) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy - Math.sin(a) * rr).toFixed(1)}`;
        const arc = (u0, u1, rr) => {
          const b0 = a0 + (a1 - a0) * u0;
          const b1 = a0 + (a1 - a0) * u1;
          return `M${P(b0, rr)} A${rr} ${rr} 0 ${Math.abs(b1 - b0) > Math.PI ? 1 : 0} 1 ${P(b1, rr)}`;
        };
        let h = `<path d="${arc(0, 1, r)}" fill="none" stroke="${C.faint}" stroke-width="7"/><path d="${arc(0.8, 1, r)}" fill="none" stroke="rgba(255,77,58,.35)" stroke-width="7"/>`;
        h += `<path d="${arc(0, k, r)}" fill="none" stroke="${C.accent}" stroke-width="7"/>`;
        for (let i = 0; i <= 12; i++) {
          const a = a0 + ((a1 - a0) * i) / 12;
          h += `<line x1="${(cx + Math.cos(a) * (r - 9)).toFixed(1)}" y1="${(cy - Math.sin(a) * (r - 9)).toFixed(1)}" x2="${(cx + Math.cos(a) * (r - (i % 3 ? 12 : 16))).toFixed(1)}" y2="${(cy - Math.sin(a) * (r - (i % 3 ? 12 : 16))).toFixed(1)}" stroke="${C.mute}" stroke-width=".8"/>`;
          if (i % 3 === 0) h += `<text x="${(cx + Math.cos(a) * (r - 24)).toFixed(1)}" y="${(cy - Math.sin(a) * (r - 24) + 2.5).toFixed(1)}" font-size="6.5" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">${((i / 12) * (REACTOR_RATED / 1e6)).toFixed(0)}</text>`;
        }
        h += `<text x="${cx}" y="${cy + 2}" font-size="22" font-weight="600" text-anchor="middle" fill="${C.ink}" font-family="JetBrains Mono">${(st.reactor / 1e6).toFixed(0)}</text><text x="${cx}" y="${cy + 15}" font-size="7" text-anchor="middle" fill="${C.mute}" letter-spacing="1.2">${t('rated', (k * 100).toFixed(0))}</text>`;
        gauge.innerHTML = h;
        K.hyd.textContent = `${(st.hydW / 1e6).toFixed(1)} MW`;
        K.flow.textContent = `${(st.flow / 1000).toFixed(1)} m³/min`;
        const W = RP.w - 32;
        let p = '';
        s.reactorHist.forEach((v, i) => (p += `${i ? 'L' : 'M'}${((i / Math.max(1, s.reactorHist.length - 1)) * W).toFixed(1)} ${(46 - (v / REACTOR_RATED) * 42).toFixed(1)}`));
        rHist.innerHTML = `<rect width="${W}" height="48" fill="rgba(128,170,205,.05)"/><line x1="0" x2="${W}" y1="${46 - 0.8 * 42}" y2="${46 - 0.8 * 42}" stroke="rgba(255,77,58,.4)" stroke-width=".6" stroke-dasharray="2 3"/><path d="${p} L${W} 48 L0 48 Z" fill="rgba(69,212,255,.12)"/><path d="${p}" fill="none" stroke="${C.accent}" stroke-width="1.3"/><text x="3" y="9" font-size="6.5" fill="${C.mute}">${t('last12')}</text>`;
      }
      // leg panel: the hero leg's solved pose, its ankle loop, both actuators lit by pressure
      {
        const gy = -L.hip[1];
        let h = `<line x1="0" x2="248" y1="${LY(gy)}" y2="${LY(gy)}" stroke="${C.mute}" stroke-width=".8"/>`;
        for (let i = 0; i < 31; i++) h += `<line x1="${i * 8}" y1="${LY(gy) + 2}" x2="${i * 8 + 5}" y2="${LY(gy) + 7}" stroke="${C.faint}" stroke-width=".6"/>`;
        // the harbour over the floor: the leg below the line is wading
        const wy = s.water - L.hip[1];
        if (s.water > 0.5) h += `<rect x="0" y="${LY(wy)}" width="248" height="${LY(gy) - LY(wy)}" fill="rgba(40,120,175,.16)"/><line x1="0" x2="248" y1="${LY(wy)}" y2="${LY(wy)}" stroke="${C.accent}" stroke-width=".8" stroke-dasharray="5 3" opacity=".7"/><text x="2" y="${LY(wy) - 4}" font-size="6.5" fill="${C.accent}" opacity=".8">${t('waterline', s.water.toFixed(0))}</text>`;
        h += `<path d="${s.anklePath.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join(' ')} Z" fill="none" stroke="${C.accent}" stroke-width="1.2" stroke-dasharray="3 2" opacity=".8"/>`;
        // the vertical through the hip and the knee's bend arc
        h += `<line x1="${LX(0)}" x2="${LX(0)}" y1="${LY(3)}" y2="${LY(-13)}" stroke="${C.faint}" stroke-width=".7" stroke-dasharray="2 2"/>`;
        const ext = [L.K[0] + Math.cos(L.th) * 6, L.K[1] + Math.sin(L.th) * 6];
        h += `<line x1="${LX(L.K[0])}" y1="${LY(L.K[1])}" x2="${LX(ext[0])}" y2="${LY(ext[1])}" stroke="${C.faint}" stroke-width=".7" stroke-dasharray="2 2"/>`;
        const ra = 4.2;
        const p0 = [L.K[0] + Math.cos(L.th) * ra, L.K[1] + Math.sin(L.th) * ra];
        const p1 = [L.K[0] + Math.cos(L.ts) * ra, L.K[1] + Math.sin(L.ts) * ra];
        h += `<path d="M${pt(p0)} A${ra * LS} ${ra * LS} 0 0 0 ${pt(p1)}" fill="none" stroke="${C.cool}" stroke-width="1"/>`;
        h += `<text x="${LX(L.K[0]) + 26}" y="${LY(L.K[1]) + 4}" font-size="8" fill="${C.cool}" font-family="JetBrains Mono">${deg(L.flex).toFixed(0)}°</text>`;
        // the hull itself is rendered under this sheet: only the joint centres are marked on it
        for (const p of [[0, 0], L.K, L.A]) h += `<circle cx="${LX(p[0])}" cy="${LY(p[1])}" r="3.4" fill="none" stroke="${C.accent}" stroke-width="1.3"/><circle cx="${LX(p[0])}" cy="${LY(p[1])}" r="1" fill="${C.accent}"/>`;
        if (L.stance) h += `<circle cx="${LX(L.cop[0])}" cy="${LY(gy)}" r="3.4" fill="${C.accent}"/><text x="${LX(L.cop[0])}" y="${LY(gy) + 14}" font-size="6.5" text-anchor="middle" fill="${C.accent}" font-family="JetBrains Mono">${(L.F / 1e6).toFixed(1)} MN</text>`;
        h += `<text x="244" y="${LY(gy) - 6}" font-size="6.5" text-anchor="end" fill="${C.mute}">${t('walk')}</text>`;
        legSvg.innerHTML = h;
        K.hip.textContent = `${deg(L.hipFlex) >= 0 ? '+' : '−'}${Math.abs(deg(L.hipFlex)).toFixed(1)}°`;
        K.knee.textContent = `${deg(L.flex).toFixed(1)}°`;
        K.ankle.textContent = `${deg(L.pitch).toFixed(1)}°`;
        K.phase.textContent = `${t(L.stance ? 'stance' : 'swing')} ${pad(L.p * 100)}%`;
      }
      // hydraulics
      for (const a of st.acts) {
        const r = actRows[a.name];
        const k = Math.min(1, a.p / 35e6);
        r.querySelector('[data-r=bar]').style.cssText = `position:absolute;left:0;top:0;bottom:0;width:${(k * 100).toFixed(1)}%;background:${pCol(a.p)};opacity:${a.side === L.side ? 1 : 0.55}`;
        r.querySelector('[data-r=p]').textContent = `${(a.p / 1e6).toFixed(1)} MPa`;
        r.querySelector('[data-r=p]').style.color = a.side === L.side ? C.accent : C.ink;
        r.querySelector('[data-r=s]').textContent = `${t(a.T > 0 ? 'pull' : 'push')} ${(Math.abs(a.T) / 1e6).toFixed(1)} MN · L ${a.len.toFixed(2)} m · ${a.v >= 0 ? '+' : '−'}${Math.abs(a.v).toFixed(2)} m/s`;
      }
      // footfall bars and the vertical ground reaction of each foot
      {
        const W = 816;
        const x0 = 22;
        const X = (u) => x0 + u * (W - x0);
        let h = '';
        const order = [HERO, 1 - HERO];
        order.forEach((r, row) => {
          const n = t(r ? 'R' : 'L');
          const hero = r === HERO;
          const y = 2 + row * 13;
          h += `<text x="0" y="${y + 8}" font-size="7" fill="${C.mute}" font-family="JetBrains Mono">${n}</text>`;
          h += `<rect x="${x0}" y="${y}" width="${W - x0}" height="10" fill="rgba(128,170,205,.06)"/>`;
          for (const [a, b] of s.footfall[r]) h += `<rect x="${X(a).toFixed(1)}" y="${y}" width="${Math.max(0.8, X(b) - X(a)).toFixed(1)}" height="10" fill="${hero ? C.accent : C.cool}" opacity="${hero ? 0.95 : 0.55}"/>`;
        });
        const top = 34;
        const hh = 76;
        // running, a stance foot takes twice the weight: the scale opens up to it
        const Fmax = 25 + 20 * st.gait.run;
        const Fy = (mn) => top + hh - (mn / Fmax) * hh;
        for (const v of [0, 19.4, ...(Fmax > 40 ? [38.8] : [9.7])]) h += `<line x1="${x0}" x2="${W}" y1="${Fy(v)}" y2="${Fy(v)}" stroke="${C.faint}" stroke-width=".6" stroke-dasharray="${v > 19 ? '4 3' : '2 3'}"/><text x="${x0 - 3}" y="${Fy(v) + 2}" font-size="6" text-anchor="end" fill="${C.mute}" font-family="JetBrains Mono">${v}</text>`;
        h += `<text x="${W}" y="${Fy(19.4) - 3}" font-size="6" text-anchor="end" fill="${C.mute}">${t('weight')}</text>`;
        const line = (arr, col, op) => {
          let p = '';
          arr.forEach((v, i) => (p += `${i ? 'L' : 'M'}${X(i / Math.max(1, arr.length - 1)).toFixed(1)} ${Fy(v).toFixed(1)}`));
          return `<path d="${p}" fill="none" stroke="${col}" stroke-width="1.5" opacity="${op}"/>`;
        };
        h += line(s.loadHist[1 - HERO], C.cool, 0.7) + line(s.loadHist[HERO], C.accent, 1);
        h += `<line x1="${W}" x2="${W}" y1="0" y2="${top + hh}" stroke="${C.accent}" stroke-width="1"/><text x="${W - 3}" y="${top + hh + 8}" font-size="6" text-anchor="end" fill="${C.mute}">${t('now')}</text>`;
        gait.innerHTML = h;
      }
      // balance: the feet seen from above in the body frame, stance feet filled, the centre of mass over them
      {
        const S = 3.2;
        const ox = 150;
        const oy = 58;
        const X = (x) => ox + x * S;
        const Z = (z) => oy + z * S;
        let h = `<line x1="0" x2="372" y1="${oy}" y2="${oy}" stroke="${C.faint}" stroke-width=".6" stroke-dasharray="2 3"/><text x="368" y="${oy - 4}" font-size="6.5" text-anchor="end" fill="${C.mute}">${t('heading')}</text>`;
        for (let i = -4; i <= 7; i++) h += `<line x1="${X(i * 5)}" x2="${X(i * 5)}" y1="${oy - 52}" y2="${oy + 52}" stroke="rgba(128,170,205,.07)" stroke-width="1"/>`;
        const stanceFeet = [];
        st.legs.forEach((Lg, i) => {
          const x = Lg.footW[0] + (M.toe - M.heel) / 2;
          const z = Lg.footW[2];
          const on = Lg.share > 0.04;
          const col = i === HERO ? C.accent : C.cool;
          h += `<rect x="${X(x - (M.toe + M.heel) / 2)}" y="${Z(z - 4.3)}" width="${(M.toe + M.heel) * S}" height="${8.6 * S}" rx="3" fill="${on ? col : 'none'}" fill-opacity="${on ? 0.18 + 0.5 * Lg.share : 0}" stroke="${col}" stroke-width="1.2" stroke-dasharray="${on ? '' : '3 2'}"/>`;
          if (on) stanceFeet.push([x, z]);
        });
        if (stanceFeet.length === 2) h += `<path d="M${X(stanceFeet[0][0])} ${Z(stanceFeet[0][1])} L${X(stanceFeet[1][0])} ${Z(stanceFeet[1][1])}" stroke="${C.ink}" stroke-width=".8" stroke-dasharray="3 2"/>`;
        const [cx, cz] = st.com;
        h += `<circle cx="${X(cx)}" cy="${Z(cz)}" r="5.5" fill="none" stroke="${C.ink}" stroke-width="1.4"/><circle cx="${X(cx)}" cy="${Z(cz)}" r="1.8" fill="${C.ink}"/><text x="${X(cx) + 9}" y="${Z(cz) - 7}" font-size="6.5" fill="${C.ink}" font-family="JetBrains Mono">${t('com')} ${cz >= 0 ? '+' : '−'}${Math.abs(cz).toFixed(2)} m</text>`;
        h += `<text x="0" y="${oy - 44}" font-size="6.5" fill="${C.mute}">${t('left')}</text><text x="0" y="${oy + 50}" font-size="6.5" fill="${C.mute}">${t('right')}</text>`;
        bal.innerHTML = h;
      }
      // knee pressures over the last 6 s
      {
        const W = 268;
        const Y = (p) => 98 - (p / 35e6) * 92;
        let h = '';
        for (const v of [0, 10, 20, 28]) h += `<line x1="16" x2="${W}" y1="${Y(v * 1e6)}" y2="${Y(v * 1e6)}" stroke="${v === 28 ? 'rgba(255,77,58,.4)' : C.faint}" stroke-width=".6" stroke-dasharray="2 3"/><text x="0" y="${Y(v * 1e6) + 2}" font-size="6" fill="${C.mute}" font-family="JetBrains Mono">${v}</text>`;
        const line = (arr, col, op) => {
          let p = '';
          arr.forEach((v, i) => (p += `${i ? 'L' : 'M'}${(16 + (i / Math.max(1, arr.length - 1)) * (W - 16)).toFixed(1)} ${Y(v).toFixed(1)}`));
          return `<path d="${p}" fill="none" stroke="${col}" stroke-width="1.5" opacity="${op}"/>`;
        };
        h += line(s.kneeHist[1 - HERO], C.cool, 0.7) + line(s.kneeHist[HERO], C.accent, 1);
        h += `<text x="${W}" y="112" font-size="6" text-anchor="end" fill="${C.mute}">${t('kneeKey')} <tspan fill="${C.accent}">—</tspan> ${t('kneeKeyL')} <tspan fill="${C.cool}">—</tspan></text>`;
        pres.innerHTML = h;
      }
      // views and toggles
      for (const k of VIEW_KEYS) {
        const on = s.view === k;
        btn[k].style.background = on ? C.ink : 'rgba(10,15,21,.85)';
        btn[k].style.color = on ? C.dark : C.ink;
      }
      for (const k of TOGGLES) {
        const on = (s[k] ?? 0) > 0.5;
        btn[k].style.background = on ? C.accent : 'rgba(10,15,21,.85)';
        btn[k].style.color = on ? C.dark : C.ink;
        btn[k].style.borderColor = on ? C.accent : C.line;
      }
      // callouts
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const lx = ax + c.dx;
        const ly = ay + c.dy;
        const e = lx + (c.dx < 0 ? -22 : 22);
        lh += `<g opacity="${c.o.toFixed(2)}"><polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)} ${e.toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="${C.ink}" stroke-width=".8"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.4" fill="${C.accent}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="6" fill="none" stroke="${C.accent}" stroke-width=".8"/></g>`;
        ch += `<div class="call" style="left:${(e + (c.dx < 0 ? -4 : 4)).toFixed(1)}px;top:${(ly - 14).toFixed(1)}px;opacity:${c.o.toFixed(2)};transform:translateX(${c.dx < 0 ? '-100%' : '0'})"><b>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
  };
}
