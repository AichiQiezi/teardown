// GIPSY DANGER's stage: Hong Kong harbour at night, in the rain. Real metres. Shallow water the Jaeger wades through
// (a shader: eight trains of swell and chop, rain pocks, a planar reflection of the machine and the skyline under a
// fresnel, the moon's glint, white water round each planted boot, and a ring of ripples plus foam from every footfall), a
// spray burst at each touchdown, rain streaks around the camera, the skyline faint in the fog and harbour lights along
// its shore, a lightning flash now
// and then. A pale moon key casts the shadows, a cyan rim from behind, GTAO for contact, bloom for the lit parts
// (visor, turbine, plasmacaster coils, actuator bands). frame(state, bx, t, cam, ops) poses the machine from kin.js's
// state at body position bx and draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {CANNON, HERO, M, WATER, wadeAt} from './kin.js';
import {buildMech} from './mech.js';

const V3 = THREE.Vector3;
export const PAL = {
  sky: ['#04070b', '#122130'],
  bg: '#122130',
  deep: '#050c12',
  water: '#2a4a63',
  hull: '#4f7499',
  hullDark: '#243140',
  stripe: '#b0352b',
  visor: '#ffb52e',
  frame: '#13171c',
  joint: '#2b323a',
  chrome: '#b8c2cb',
  glow: '#45d4ff',
  edge: '#7fd8ff',
  shadow: ['#000000', 0.45],
};
const NRIP = 24;

const WATER_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FRAG = /* glsl */ `uniform vec3 uDeep; uniform vec3 uSky; uniform vec3 uBg; uniform vec3 uMoon; uniform vec3 uMoonDir; uniform vec3 uC;
  uniform float uT; uniform float uFlash; uniform vec4 uRip[${NRIP}]; uniform vec4 uLeg[2]; uniform vec2 uLegR;
  uniform sampler2D uRefl; uniform mat4 uTexMat; uniform float uReflOn; uniform sampler2D uNrm; uniform float uNrmS; varying vec3 vW;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  // a long swell's slope
  vec2 swell(vec2 p, vec2 d, float L, float A){
    float k = 6.2831 / L;
    return A * k * d * cos(dot(d, p) * k - sqrt(9.81 * k) * uT);
  }
  // the chop: a tileable slope map at three scales drifting different ways; its mipmaps take the distance
  vec2 chop(vec2 uv){ return (texture2D(uNrm, uv).rg * 2.0 - 1.0) * uNrmS; }
  void main(){
    vec2 p = vW.xz;
    float fw = max(length(fwidth(p)), 1e-3);
    vec2 g = swell(p, normalize(vec2(1.0, 0.35)), 41.0, 0.16) + swell(p, normalize(vec2(0.6, -0.8)), 23.0, 0.07);
    // gusts: the wind roughens the water in patches, so the short chop comes and goes across the bay
    float gust = 0.35 + 1.1 * smoothstep(0.2, 0.8, vnoise(p / 90.0 + uT * vec2(0.012, 0.005)) * 0.7 + vnoise(p / 31.0 - uT * 0.02) * 0.3);
    // each scale turned off the others' axes so the tiles never line up
    mat2 r1 = mat2(0.825, 0.565, -0.565, 0.825);
    mat2 r2 = mat2(-0.505, 0.863, -0.863, -0.505);
    g += chop(p / 53.0 + uT * vec2(0.011, 0.004)) / 53.0 * 0.4;
    g += r1 * chop((r1 * p) / 17.3 + uT * vec2(-0.021, 0.017)) / 17.3 * 0.14 * gust;
    g += r2 * chop((r2 * p) / 6.1 + uT * vec2(0.046, -0.038)) / 6.1 * 0.045 * gust;
    // rain pocks: tiny rings that come and go in a fine grid, two offset layers
    float pockFade = clamp(0.6 / fw - 1.0, 0.0, 1.0);
    for (int l = 0; l < 2; l++) {
      vec2 q = p / 1.3 + float(l) * vec2(0.37, 0.61);
      vec2 cell = floor(q);
      vec2 f = fract(q) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5;
      float age = fract(uT * 1.1 + hash(cell + float(l) * 13.0));
      float rr = length(f) - age * 0.42;
      g += normalize(f + 1e-4) * cos(rr * 42.0) * exp(-rr * rr * 320.0) * (1.0 - age) * 0.28 * pockFade;
    }
    // footfalls: an expanding ring with a cos profile, foam on its crest, churn at the centre
    float foam = 0.0;
    for (int i = 0; i < ${NRIP}; i++) {
      vec4 r = uRip[i];
      float a = uT - r.z;
      if (a < 0.0 || a > 10.0) continue;
      vec2 d = p - r.xy;
      float dist = length(d) + 1e-3;
      float x = dist - (7.0 + a * 11.0);
      float env = exp(-x * x / 30.0) * exp(-a * 0.42) * r.w;
      g += -sin(x * 0.75) * 0.82 * env * d / dist;
      foam += env * smoothstep(0.5, 1.0, cos(x * 0.75)) * exp(-a * 0.9) * 0.5;
      foam += r.w * exp(-a * 0.9) * (1.0 - smoothstep(4.0, 12.0, dist)) * 0.8;
    }
    // where a shin breaks the surface: a collar of white water round it, a ruffled ring outside, a bow wave piled on
    // its leading side and, the faster it ploughs through (w), a churned lane and a V of waves trailing behind (the
    // machine heads +x)
    for (int i = 0; i < 2; i++) {
      vec4 lg = uLeg[i];
      if (lg.z <= 0.0) continue;
      vec2 d = p - lg.xy;
      vec2 e = d / uLegR;
      float de = length(e);
      float band = (de - 1.0) * uLegR.y;
      float w = lg.w;
      foam += lg.z * exp(-max(band, 0.0) * 0.55) * step(0.85, de) * 0.9;
      foam += w * exp(-max(band, 0.0) * 0.3) * smoothstep(-0.2, 1.0, e.x) * step(0.85, de) * 0.7;
      g += normalize(e + 1e-4) * sin(band * 2.4 - uT * 7.0) * exp(-max(band, 0.0) * 0.4) * 0.22 * lg.z;
      float back = -d.x;
      if (back > 0.0) {
        float lat = abs(d.y);
        float arm = lat - (uLegR.y + back * 0.36);
        float spread = 1.5 + back * 0.08;
        float fade = exp(-back / 45.0) * w;
        foam += exp(-arm * arm / spread) * fade * 0.5;
        foam += exp(-lat * lat / (uLegR.y * uLegR.y * 1.4)) * exp(-back / 22.0) * w * 0.8;
        g += vec2(-0.3, sign(d.y)) * cos(arm * 1.3) * exp(-arm * arm / (spread * 4.0)) * fade * 0.18;
      }
    }
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vW);
    float NV = max(dot(n, V), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
    vec3 R = reflect(-V, n);
    // what the surface mirrors: the scene (the machine, its lights, the skyline) over a sky of the night's colour
    vec3 sky = mix(uSky * 1.1, uSky * 0.25, smoothstep(-0.05, 0.7, R.y)) + uFlash * vec3(0.5, 0.6, 0.75);
    vec4 rc = uTexMat * vec4(vW, 1.0);
    // the slope toward the viewer drags the mirror image up and down the screen: lights draw out into streaks
    vec2 fwd = normalize(V.xz + 1e-4);
    vec2 ruv = rc.xy / rc.w + vec2(dot(g, vec2(-fwd.y, fwd.x)) * 0.05, dot(g, fwd) * 0.32);
    vec4 rf = texture2D(uRefl, clamp(ruv, 0.001, 0.999)) * uReflOn;
    vec3 refl = sky * (1.0 - rf.a) + rf.rgb;
    // the body: dark harbour water, a little murky green-blue scatter where the slope faces the viewer
    vec3 body = uDeep * (0.7 + 0.6 * pow(NV, 3.0)) + vec3(0.004, 0.012, 0.014) * (1.0 - fres);
    vec3 col = mix(body, refl, fres);
    foam *= smoothstep(0.3, 0.75, vnoise(p * 0.45) * 0.6 + vnoise(p * 1.9) * 0.4);
    float fo = clamp(foam, 0.0, 1.0);
    col += uMoon * min(pow(max(dot(R, uMoonDir), 0.0), 400.0) * 2.0, 1.2) * (1.0 - fo);
    col = mix(col, vec3(0.36, 0.45, 0.52), fo * 0.75);
    float dc = length(p - uC.xz);
    gl_FragColor = vec4(mix(col, uBg, smoothstep(220.0, 1100.0, dc)), 1.0);
  }`;
// spray: a burst of droplets per footfall, ballistic, gone once they fall back into the water
const SPRAY_VERT = /* glsl */ `attribute vec3 aSeed; attribute vec4 aImp; uniform float uT; uniform float uPr; uniform float uWL; varying float vA;
  void main(){
    float age = uT - aImp.z;
    float a = aSeed.x * 6.2831;
    float sp = aImp.w;
    float vr = (3.0 + aSeed.y * 9.0) * sp;
    float vy = (8.0 + aSeed.z * 15.0) * sp;
    float r0 = 4.0 + aSeed.y * 3.0;
    vec2 dir = vec2(cos(a) * 1.5, sin(a));
    float rad = r0 + vr * age;
    vec3 p = vec3(aImp.x + dir.x * rad, uWL + vy * age - 4.905 * age * age, aImp.y + dir.y * rad);
    vA = smoothstep(0.0, 0.3, age) * step(uWL, p.y) * (1.0 - smoothstep(1.4, 3.4, age)) * (0.18 + 0.3 * aSeed.z);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPr * (2.0 + 5.0 * aSeed.z) * clamp(300.0 / -mv.z, 0.4, 3.0);
  }`;
const SPRAY_FRAG = /* glsl */ `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = (1.0 - smoothstep(0.1, 0.5, length(c))) * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.78, 0.88, 0.95, a); }`;
const RAIN_VERT = /* glsl */ `attribute vec3 aSeed; attribute float aEnd; uniform float uT; uniform vec3 uC; varying float vA;
  void main(){
    vec3 box = vec3(420.0, 200.0, 420.0);
    float y = mod(aSeed.y * box.y - uT * (70.0 + aSeed.z * 20.0), box.y);
    vec2 xz = aSeed.xz * box.xz + vec2(0.13 * (box.y - y), 0.0);
    xz = mod(xz - uC.xz + box.xz * 0.5, box.xz) + uC.xz - box.xz * 0.5;
    vec3 w = vec3(xz.x, y, xz.y) + aEnd * vec3(0.55, -4.2, 0.0);
    vA = 0.05 + 0.1 * aSeed.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;
const RAIN_FRAG = /* glsl */ `varying float vA; void main(){ gl_FragColor = vec4(0.62, 0.76, 0.88, vA); }`;

// harbour lights: lamps, piers and ships along the far shore, HDR so they bloom; the water draws their reflections
// out into streaks
const LAMP_VERT = /* glsl */ `attribute vec4 aLamp; attribute vec3 aCol; uniform float uPr; uniform float uT; varying vec3 vC;
  void main(){
    vC = aCol * (0.8 + 0.2 * sin(uT * (0.7 + aLamp.w) + aLamp.w * 40.0));
    vec4 mv = modelViewMatrix * vec4(aLamp.xyz, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPr * (1.6 + aLamp.w * 2.2);
  }`;
const LAMP_FRAG = /* glsl */ `varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 14.0); gl_FragColor = vec4(vC * a, a); }`;

// the chop's slope map: a tileable sea of random wave trains, amplitude falling off with wavenumber (a rough wind
// spectrum), stored as slope per tile length in RG; mipmapped so it averages out with distance instead of shimmering
function chopTexture() {
  const N = 256;
  let r = 5;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const waves = [];
  for (let i = 0; i < 90; i++) {
    const kx = Math.round((rnd() * 2 - 1) * 14);
    const ky = Math.round((rnd() * 2 - 1) * 14);
    const k = Math.hypot(kx, ky);
    if (k < 1.5) continue;
    waves.push([kx, ky, 1 / k ** 1.6, rnd() * Math.PI * 2]);
  }
  const sx = new Float32Array(N * N);
  const sy = new Float32Array(N * N);
  let m = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let a = 0;
      let b = 0;
      for (const [kx, ky, A, ph] of waves) {
        const c = Math.cos(((kx * x + ky * y) / N) * Math.PI * 2 + ph) * A * Math.PI * 2;
        a += c * kx;
        b += c * ky;
      }
      sx[y * N + x] = a;
      sy[y * N + x] = b;
      m = Math.max(m, Math.abs(a), Math.abs(b));
    }
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round((sx[i] / m) * 127.5 + 127.5);
    data[i * 4 + 1] = Math.round((sy[i] / m) * 127.5 + 127.5);
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return {t, scale: m};
}

// the skyline: a strip of towers with sparse lit windows, wrapped round a far cylinder
function skylineTexture() {
  const W = 4096;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  let r = 11;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (const [layer, tone, hMax] of [[0, '#16283a', 0.72], [1, '#0f1d2a', 0.5]]) {
    let x = 0;
    while (x < W) {
      const w = 30 + rnd() * 110;
      const tall = rnd() < 0.08 ? 1 : 0.35 + rnd() * 0.5;
      const h = H * hMax * tall;
      g.fillStyle = tone;
      g.fillRect(x, H - h, w, h);
      if (tall === 1) g.fillRect(x + w / 2 - 2, H - h - 40, 4, 40);
      for (let wy = H - h + 8; wy < H - 6; wy += 9)
        for (let wx = x + 5; wx < x + w - 5; wx += 8)
          if (rnd() < (layer ? 0.05 : 0.08)) {
            const k = rnd();
            g.fillStyle = k < 0.55 ? 'rgba(120,200,255,.55)' : k < 0.85 ? 'rgba(255,190,120,.5)' : 'rgba(255,90,170,.5)';
            g.fillRect(wx, wy, 3, 4);
          }
      x += w + rnd() * 18;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export function createMechStage({canvas}) {
  const P = PAL;
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, P.sky[0]);
    gr.addColorStop(0.62, P.sky[1]);
    gr.addColorStop(1, P.sky[1]);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  scene.fog = new THREE.Fog(P.bg, 260, 1500);
  const camera = new THREE.PerspectiveCamera(22, 16 / 9, 1, 6000);

  const rt = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({radius: 4.0, distanceExponent: 1.3, thickness: 8.0, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  // the AO pass sees only the solid machine: lights and effects drawn with no depth would come out as dark sheets
  const glows = [];
  const aoView = (v) => () => {
    for (const o of [water, shade, spray, rain, skyline, lamps]) o.visible = v;
    for (const g of glows) {
      if (!v) g.userData.was = g.visible;
      g.visible = v && g.userData.was;
    }
    for (const t of trails) t.line.visible = v && t.on;
    if (mech.xray > 0.3) for (const m of mech.shells) m.visible = v;
  };
  composer.addPass(new Toggle(aoView(false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(aoView(true)));
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.6, 0.45, 1.5);
  composer.addPass(bloom);
  // the beam's glare on the screen: off but while the chest cannon fires
  const wavePass = new ShaderPass({
    uniforms: {tDiffuse: {value: null}, uC: {value: new THREE.Vector2(0.5, 0.5)}, uAmp: {value: 0}, uAspect: {value: 16 / 9}},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // the beam's glare: colours pulled apart away from the muzzle, a blue cast near it
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uC; uniform float uAmp; uniform float uAspect; varying vec2 vUv;
      void main(){
        vec2 d = vUv - uC;
        float r = length(d * vec2(uAspect, 1.0));
        vec2 off = d * uAmp * 0.008;
        vec3 c = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
        c += vec3(0.01, 0.03, 0.06) * uAmp * (1.0 - smoothstep(0.0, 0.6, r));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  wavePass.enabled = false;
  composer.addPass(wavePass);
  composer.addPass(new OutputPass());

  // environment: a night harbour, a pale overhead wash, a cool city glow low on the horizon
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#05080c');
    const panel = (w, h, pos, color, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(20, 5, new V3(6, 14, 8), '#cfdcff', 0.7);
    panel(40, 3, new V3(-14, 3, -12), '#3f8fc9', 0.45);
    panel(30, 3, new V3(12, 2, 16), '#7a5a8a', 0.35);
    panel(30, 2, new V3(0, -3, 0), '#0b1622', 1.0);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
    scene.environmentIntensity = 0.8;
    pm.dispose();
  }
  const SUN_DIR = new V3(0.4, 0.75, 0.6).normalize();
  const sun = new THREE.DirectionalLight('#e2eaff', 3.4);
  sun.castShadow = true;
  const EXT = 62;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 5, far: 420});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 12;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.15;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#5fc8ff', 2.2);
  scene.add(rim, rim.target);
  const hemi = new THREE.HemisphereLight('#4a6580', '#06090c', 0.7);
  scene.add(hemi);
  const coreLight = new THREE.PointLight(P.glow, 0, 32, 0);
  scene.add(coreLight);

  // the water, and a shadow catcher just above it
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      uDeep: {value: new THREE.Color(P.deep)},
      uSky: {value: new THREE.Color(P.water)},
      uBg: {value: new THREE.Color(P.bg)},
      uMoon: {value: new THREE.Color('#cfe0ff')},
      uMoonDir: {value: SUN_DIR.clone()},
      uC: {value: new V3()},
      uT: {value: 0},
      uFlash: {value: 0},
      uRip: {value: Array.from({length: NRIP}, () => new THREE.Vector4(0, 0, -1e4, 0))},
      uLeg: {value: [new THREE.Vector4(), new THREE.Vector4()]},
      // the shin's section at the waterline, semi-axes along and across (the hull model's, at 15 m)
      uLegR: {value: new THREE.Vector2(5.6, 3.2)},
      uRefl: {value: null},
      uTexMat: {value: new THREE.Matrix4()},
      uReflOn: {value: 1},
      uNrm: {value: null},
      uNrmS: {value: 1},
    },
    fog: false,
  });
  {
    const c = chopTexture();
    waterMat.uniforms.uNrm.value = c.t;
    waterMat.uniforms.uNrmS.value = c.scale;
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER;
  scene.add(water);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({color: P.shadow[0], opacity: P.shadow[1], fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = WATER + 0.02;
  shade.receiveShadow = true;
  scene.add(shade);
  // the harbour floor the feet stand on, under the water: seen only when the sea is drained, a dark wet bed with a
  // survey grid every 10 m
  const floor = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(120,200,240,.9)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(120,200,240,.25)';
    g.lineWidth = 1.5;
    for (const v of [64, 128, 192]) {
      g.beginPath();
      g.moveTo(v, 0);
      g.lineTo(v, 256);
      g.moveTo(0, v);
      g.lineTo(256, v);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(200, 200);
    t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({color: '#10171e', roughness: 0.92, metalness: 0, envMapIntensity: 0.12, emissive: '#3a8fbf', emissiveIntensity: 0.18, emissiveMap: t}));
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  })();
  let level = WATER;

  const skyline = new THREE.Mesh(
    new THREE.CylinderGeometry(1400, 1400, 170, 96, 1, true),
    new THREE.MeshBasicMaterial({map: skylineTexture(), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, opacity: 0.38}),
  );
  skyline.position.y = 85 + WATER - 3;
  skyline.renderOrder = -1;
  scene.add(skyline);
  const lamps = (() => {
    const n = 260;
    const lamp = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    let r = 23;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const tones = [[3.2, 1.6, 0.55], [2.6, 2.7, 2.9], [0.6, 2.2, 3.2], [3.0, 0.7, 1.6]];
    for (let i = 0; i < n; i++) {
      // in clusters along the shore: a pier, a terminal, a ship at anchor
      const a = Math.floor(rnd() * 18) / 18 * Math.PI * 2 + rnd() * 0.25;
      const d = 950 + rnd() * 350;
      const tone = tones[rnd() < 0.55 ? 0 : rnd() < 0.6 ? 1 : rnd() < 0.7 ? 2 : 3];
      const k = 0.5 + rnd() * 1.2;
      lamp.set([Math.cos(a) * d, WATER + 1 + rnd() ** 2 * 28, Math.sin(a) * d, rnd()], i * 4);
      col.set(tone.map((c) => c * k), i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('aLamp', new THREE.BufferAttribute(lamp, 4));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({vertexShader: LAMP_VERT, fragmentShader: LAMP_FRAG, uniforms: {uPr: {value: 1}, uT: {value: 0}},
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
    m.frustumCulled = false;
    m.renderOrder = -1;
    scene.add(m);
    return m;
  })();

  const mech = buildMech(P);
  scene.add(mech.group);

  // spray: CAP footfall slots of PER droplets each
  const CAP = 12;
  const PER = 160;
  const sprayGeo = new THREE.BufferGeometry();
  {
    const n = CAP * PER;
    const seed = new Float32Array(n * 3);
    let r = 91;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n * 3; i++) seed[i] = rnd();
    const imp = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) imp[i * 4 + 2] = -1e4;
    sprayGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    sprayGeo.setAttribute('aImp', new THREE.BufferAttribute(imp, 4).setUsage(THREE.DynamicDrawUsage));
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  }
  const sprayMat = new THREE.ShaderMaterial({vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG, uniforms: {uT: {value: 0}, uPr: {value: 1}, uWL: {value: WATER}}, transparent: true, depthWrite: false});
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.frustumCulled = false;
  spray.renderOrder = 4;
  scene.add(spray);
  let slot = 0;
  let ripI = 0;
  /** A foot lands at (x, z) at time t with strength k (0..1): a ripple ring and a spray burst. */
  const addImpact = (x, z, t, k) => {
    waterMat.uniforms.uRip.value[ripI].set(x, z, t, k);
    ripI = (ripI + 1) % NRIP;
    const a = sprayGeo.attributes.aImp;
    for (let i = 0; i < PER; i++) a.array.set([x, z, t, k], (slot * PER + i) * 4);
    slot = (slot + 1) % CAP;
    a.needsUpdate = true;
  };
  const clearImpacts = () => {
    for (const v of waterMat.uniforms.uRip.value) v.z = -1e4;
    const a = sprayGeo.attributes.aImp;
    for (let i = 0; i < CAP * PER; i++) a.array[i * 4 + 2] = -1e4;
    a.needsUpdate = true;
  };

  // the chest cannon's beam: a white-hot core in a blue sheath and a haze, the surface boiling along its length,
  // lightning crawling round it and arcing off the chest, a flare and a spray of sparks where it leaves the chest. It
  // lives in its own group laid along the beam (+z), placed from the chest every frame
  const BEAM_LEN = 900;
  const beam = new THREE.Group();
  beam.visible = false;
  scene.add(beam);
  const beamMats = [
    [1.5, '#ffffff', 3.2, 1.6],
    [3.6, '#6cc8ff', 1.1, 1.8],
    [7, '#2f7dff', 0.28, 2.0],
  ].map(([r, c, k, sharp]) => {
    const m = new THREE.ShaderMaterial({
      uniforms: {uA: {value: 0}, uT: {value: 0}, uC: {value: new THREE.Color(c).multiplyScalar(k)}, uS: {value: sharp}},
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vL;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vL = position.z; gl_Position = projectionMatrix * mv; }`,
      // bright down the axis, gone at the silhouette; ripples running out along it; it thins out toward the far end
      fragmentShader: `uniform float uA; uniform float uT; uniform vec3 uC; uniform float uS; varying vec3 vN; varying vec3 vV; varying float vL;
        void main(){ float f = pow(abs(dot(vN, vV)), uS);
          float boil = 0.72 + 0.28 * sin(vL * 260.0 - uT * 60.0) * sin(vL * 61.0 + uT * 23.0);
          float ends = smoothstep(0.0, 0.004, vL) * (1.0 - smoothstep(0.35, 1.0, vL));
          gl_FragColor = vec4(uC * f * boil * ends * uA, 1.0); }`,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), m);
    mesh.userData.r = r;
    mesh.frustumCulled = false;
    beam.add(mesh);
    return m;
  });
  const beamTubes = beam.children.slice();
  // lightning: jagged polylines, redrawn twenty times a second; the first ones crawl along the beam, the rest jump off
  // the chest plates
  const ARCS = 12;
  const ARC_P = 18;
  const arcPos = new Float32Array(ARCS * (ARC_P - 1) * 2 * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3).setUsage(THREE.DynamicDrawUsage));
  const arcMat = new THREE.LineBasicMaterial({color: new THREE.Color('#a8e4ff').multiplyScalar(6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false});
  const arcs = new THREE.LineSegments(arcGeo, arcMat);
  arcs.frustumCulled = false;
  beam.add(arcs);
  let arcT = -1;
  const rnd = Math.random;
  const drawArcs = () => {
    let o = 0;
    for (let i = 0; i < ARCS; i++) {
      const along = i < 8;
      const z0 = along ? rnd() * 60 : 0;
      const len = along ? 60 + rnd() * 320 : 7 + rnd() * 12;
      let ang = rnd() * Math.PI * 2;
      const r0 = along ? 3 + rnd() * 8 : 2;
      let prev = null;
      for (let j = 0; j < ARC_P; j++) {
        const u = j / (ARC_P - 1);
        ang += (rnd() - 0.5) * 0.9;
        // along the beam: wound round it at a wandering radius; off the chest: out sideways and back over the plates
        const r = along ? r0 * (0.6 + 0.8 * rnd()) * Math.sin(Math.PI * Math.min(1, u * 1.4 + 0.15)) : r0 + u * len;
        const z = along ? z0 + u * len : -u * len * 0.5 + (rnd() - 0.5) * 2;
        const pt = [Math.cos(ang) * r + (rnd() - 0.5) * 1.5, Math.sin(ang) * r + (rnd() - 0.5) * 1.5, z];
        if (prev) {
          arcPos.set(prev, o);
          arcPos.set(pt, o + 3);
          o += 6;
        }
        prev = pt;
      }
    }
    arcGeo.attributes.position.needsUpdate = true;
  };
  // the flare: a soft white-blue glow, and the same stretched flat into a streak across the screen
  const flareTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(190,230,255,.85)');
    gr.addColorStop(0.45, 'rgba(70,150,255,.25)');
    gr.addColorStop(1, 'rgba(0,40,120,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const flareMat = (k) => new THREE.SpriteMaterial({map: flareTex, color: new THREE.Color(1, 1, 1).multiplyScalar(k), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false});
  const flare = new THREE.Sprite(flareMat(1.4));
  const streak = new THREE.Sprite(flareMat(0.9));
  scene.add(flare, streak);
  // sparks: a steady spray off the chest, each spark on its own short ballistic life
  const NS = 500;
  const sparkGeo = new THREE.BufferGeometry();
  {
    const seed = new Float32Array(NS * 4);
    for (let i = 0; i < NS * 4; i++) seed[i] = rnd();
    sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
  }
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: {uO: {value: new V3()}, uD: {value: new V3(1, 0, 0)}, uT: {value: 0}, uOn: {value: 0}, uPr: {value: 1}},
    vertexShader: `attribute vec4 aSeed; uniform vec3 uO; uniform vec3 uD; uniform float uT; uniform float uOn; uniform float uPr; varying float vA;
      void main(){
        float life = 0.5 + 0.5 * aSeed.w;
        float age = mod(uT + aSeed.w * 7.0, life);
        float th = aSeed.x * 6.2831; float z = aSeed.y * 2.0 - 1.0;
        vec3 dir = vec3(sqrt(1.0 - z * z) * cos(th), z, sqrt(1.0 - z * z) * sin(th));
        // thrown out round the muzzle, mostly sideways off the beam and back toward the machine
        dir = normalize(dir - uD * (0.6 * dot(dir, uD) + 0.35));
        vec3 p = uO + dir * (25.0 + 55.0 * aSeed.z) * age + vec3(0.0, -15.0 * age * age, 0.0);
        vA = (1.0 - age / life) * uOn;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPr * (1.5 + 2.5 * aSeed.z) * clamp(300.0 / -mv.z, 0.4, 3.0);
      }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = (1.0 - smoothstep(0.1, 0.5, length(c))) * vA; if (a < 0.01) discard;
      gl_FragColor = vec4(mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.95, 0.85), vA) * 2.5 * a, a); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);
  const beamLight = new THREE.PointLight('#8fd4ff', 0, 320, 1.3);
  scene.add(beamLight);
  const ZF = new V3(0, 0, 1);
  /** The beam from the chest's muzzle along aim, at strength on (0..1) */
  const runBeam = (t, on, muzzle, aim) => {
    const vis = on > 0.01;
    beam.visible = sparks.visible = flare.visible = streak.visible = vis;
    beamLight.intensity = vis ? 1800 * on : 0;
    if (!vis) {
      wavePass.enabled = false;
      renderer.toneMappingExposure = 1.25;
      return;
    }
    beam.position.copy(muzzle);
    beam.quaternion.setFromUnitVectors(ZF, aim);
    const len = BEAM_LEN * Math.min(1, on * 1.4);
    const pulse = 1 + 0.07 * Math.sin(t * 53) + 0.05 * Math.sin(t * 31);
    beamTubes.forEach((m) => {
      const r = m.userData.r * pulse * (0.7 + 0.3 * on);
      m.scale.set(r, r, len);
    });
    for (const m of beamMats) {
      m.uniforms.uA.value = on;
      m.uniforms.uT.value = t;
    }
    if (t - arcT > 0.05 || t < arcT) {
      arcT = t;
      drawArcs();
    }
    arcMat.opacity = on * (0.6 + 0.4 * rnd());
    flare.position.copy(muzzle).addScaledVector(aim, 2);
    streak.position.copy(flare.position);
    flare.scale.setScalar(15 * on * pulse);
    streak.scale.set(90 * on, 3 * on, 1);
    flare.material.opacity = streak.material.opacity = on;
    sparkMat.uniforms.uO.value.copy(muzzle);
    sparkMat.uniforms.uD.value.copy(aim);
    sparkMat.uniforms.uT.value = t;
    sparkMat.uniforms.uOn.value = on;
    beamLight.position.copy(muzzle).addScaledVector(aim, 10);
    // the frame splits its colours away from the muzzle, and the exposure lifts with the beam
    const sp = project(muzzle);
    wavePass.enabled = true;
    wavePass.uniforms.uC.value.set(sp ? sp[0] / size.w : 0.5, sp ? 1 - sp[1] / size.h : 0.5);
    wavePass.uniforms.uAmp.value = on;
    wavePass.uniforms.uAspect.value = size.w / size.h;
    renderer.toneMappingExposure = 1.25;
  };

  // the sword's light trail: a ribbon through the blade's last positions, base to tip, fading with age
  const TN = 48;
  const trailPos = new Float32Array(TN * 2 * 3);
  const trailAge = new Float32Array(TN * 2);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('aAge', new THREE.BufferAttribute(trailAge, 1).setUsage(THREE.DynamicDrawUsage));
  {
    const idx = [];
    for (let i = 0; i < TN - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    trailGeo.setIndex(idx);
    // across the ribbon: 0 at the blade's root, 1 at its tip
    trailGeo.setAttribute('aSide', new THREE.BufferAttribute(Float32Array.from({length: TN * 2}, (_, i) => i % 2), 1));
  }
  const trailMat = new THREE.ShaderMaterial({
    uniforms: {uA: {value: 0}},
    vertexShader: 'attribute float aAge; attribute float aSide; varying float vAge; varying float vSide; void main(){ vAge = aAge; vSide = aSide; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uA; varying float vAge; varying float vSide;
      // brightest along the tip's own path, thinning toward the root, gone within six tenths of a second
      void main(){ float fade = pow(max(0.0, 1.0 - vAge), 2.0); float a = fade * pow(vSide, 3.0) * uA;
        gl_FragColor = vec4(mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.85, 0.6), pow(vSide, 6.0) * fade) * 1.3 * a, 1.0); }`,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.visible = false;
  scene.add(trail);
  glows.push(beam, sparks, flare, streak, trail);
  const tSamp = [];
  let tipLast = null;
  let splashT = -9;
  const runTrail = (t, sw, base, tip) => {
    const on = sw?.trail ?? 0;
    if (on > 0.01) {
      // paused, time stands still: keep the ribbon as it was
      if (tSamp[0]?.t !== t) tSamp.unshift({t, b: base.clone(), p: tip.clone()});
      if (tSamp.length > TN) tSamp.length = TN;
    } else tSamp.length = 0;
    trail.visible = tSamp.length > 1;
    if (trail.visible) {
      for (let i = 0; i < TN; i++) {
        const sm = tSamp[Math.min(i, tSamp.length - 1)];
        trailPos.set([sm.b.x, sm.b.y, sm.b.z], i * 6);
        trailPos.set([sm.p.x, sm.p.y, sm.p.z], i * 6 + 3);
        trailAge[i * 2] = trailAge[i * 2 + 1] = i < tSamp.length ? (t - sm.t) / 0.6 : 1;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.aAge.needsUpdate = true;
      trailMat.uniforms.uA.value = on;
    }
    // the tip cutting the water throws it up
    if (sw && tip && tipLast && water.visible && tip.y < level + 2 && t - splashT > 0.12 && tip.distanceTo(tipLast) > 0.5) {
      splashT = t;
      addImpact(tip.x, tip.z, t, 1.3);
    }
    tipLast = sw ? tip.clone() : null;
  };

  // rain streaks in a box round the camera's look point
  const NR = 7000;
  const rainGeo = new THREE.BufferGeometry();
  {
    const seed = new Float32Array(NR * 2 * 3);
    const end = new Float32Array(NR * 2);
    let r = 3;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < NR; i++) {
      const s = [rnd(), rnd(), rnd()];
      seed.set(s, i * 6);
      seed.set(s, i * 6 + 3);
      end[i * 2 + 1] = 1;
    }
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 2 * 3), 3));
  }
  const rainMat = new THREE.ShaderMaterial({vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: {uT: {value: 0}, uC: {value: new V3()}}, transparent: true, depthWrite: false});
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.renderOrder = 7;
  scene.add(rain);

  // ankle trails: the last N world positions of each ankle, drawn as a fading line
  const N = 260;
  const trails = [0, 1].map(() => {
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    // the ankles walk under the surface: the trail is drawn over everything (frame() turns that off on dry floor)
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, depthTest: false}));
    line.frustumCulled = false;
    line.renderOrder = 6;
    scene.add(line);
    return {line, pos, col, n: 0, on: false};
  });
  const glowC = new THREE.Color(P.glow).multiplyScalar(1.6);
  const pushTrail = (i, p, fade) => {
    const t = trails[i];
    t.pos.copyWithin(3, 0, (N - 1) * 3);
    t.pos.set(p, 0);
    t.n = Math.min(N, t.n + 1);
    for (let k = 0; k < t.n; k++) {
      const a = fade * (1 - k / N) ** 1.5;
      t.col[k * 3] = glowC.r * a;
      t.col[k * 3 + 1] = glowC.g * a;
      t.col[k * 3 + 2] = glowC.b * a;
    }
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.geometry.attributes.color.needsUpdate = true;
    t.line.geometry.setDrawRange(0, t.n);
  };
  const clearTrails = () => {
    for (const t of trails) t.n = 0;
  };

  // the mirror: the scene seen from below the water plane, clipped at it, at a fraction of the resolution. The water
  // samples it through uTexMat, shifted by its slope, over its own sky colour where nothing was drawn
  const reflRT = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType});
  waterMat.uniforms.uRefl.value = reflRT.texture;
  const mirror = new THREE.PerspectiveCamera();
  const mPlane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q4 = new THREE.Vector4();
  const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const clearC = new THREE.Color();
  let reflScale = 0.5;
  const renderMirror = (tx, ty, tz) => {
    mirror.position.set(camera.position.x, 2 * level - camera.position.y, camera.position.z);
    mirror.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mirror.up.y *= -1;
    mirror.lookAt(tx, 2 * level - ty, tz);
    // a little wider than the view: the slope pulls the reflection from beyond the frame's edge
    Object.assign(mirror, {fov: camera.fov * 1.2, aspect: camera.aspect, near: camera.near, far: camera.far});
    mirror.updateProjectionMatrix();
    mirror.updateMatrixWorld();
    waterMat.uniforms.uTexMat.value.copy(BIAS).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    // an oblique near plane lying on the water, so the boots below it stay out of the reflection
    mPlane.normal.set(0, 1, 0);
    mPlane.constant = -level;
    mPlane.applyMatrix4(mirror.matrixWorldInverse);
    clip.set(mPlane.normal.x, mPlane.normal.y, mPlane.normal.z, mPlane.constant);
    const e = mirror.projectionMatrix.elements;
    q4.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q4));
    e[2] = clip.x;
    e[6] = clip.y;
    e[10] = clip.z + 1;
    e[14] = clip.w;
    const hide = [water, shade, spray, rain, ...trails.map((tr) => tr.line)];
    const was = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    const bg = scene.background;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.getClearColor(clearC);
    const clearA = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(reflRT);
    renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearC, clearA);
    renderer.shadowMap.autoUpdate = true;
    scene.background = bg;
    hide.forEach((o, i) => (o.visible = was[i]));
  };

  // the leg panel: the hero leg alone, seen square to its own plane by an orthographic camera riding the hip, rendered
  // multisampled off screen and laid into the console's panel rect over a pane of the panels' own dark glass
  const LEG_LAYER = 1;
  mech.legs[HERO].rootL.traverse((o) => o.layers.enable(LEG_LAYER));
  for (const l of [sun, rim, hemi, coreLight]) l.layers.enable(LEG_LAYER);
  // a soft key from over the viewer's shoulder, for the panel only: the harbour's sun leaves the leg's back black
  const legKey = new THREE.DirectionalLight('#cfdcf0', 1.3);
  legKey.layers.set(LEG_LAYER);
  scene.add(legKey, legKey.target);
  const legCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  legCam.layers.set(LEG_LAYER);
  const legRT = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
  const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blit = new THREE.Scene();
  const quad = (material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    m.frustumCulled = false;
    blit.add(m);
    return m;
  };
  quad(new THREE.MeshBasicMaterial({color: '#050b11', transparent: true, opacity: 0.8, toneMapped: false, depthTest: false, depthWrite: false}));
  // the target holds premultiplied colour (the leg over a clear of zero), so it goes over as such
  quad(new THREE.MeshBasicMaterial({map: legRT.texture, transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor}));
  let legView = null;
  const legQ = new THREE.Quaternion();
  const renderLeg = () => {
    const {x, y, w, h, ox, oy, k} = legView;
    const hip = mech.legs[HERO].rootL;
    // panel px to metres in the leg plane, the hip at (ox, oy)
    Object.assign(legCam, {left: (x - ox) / k, right: (x + w - ox) / k, top: (oy - y) / k, bottom: (oy - y - h) / k});
    legCam.updateProjectionMatrix();
    legCam.position.copy(hip.localToWorld(tmp.set(0, 0, 150)));
    legCam.quaternion.copy(hip.getWorldQuaternion(legQ));
    legCam.updateMatrixWorld();
    hip.getWorldPosition(legKey.target.position);
    legKey.position.copy(hip.localToWorld(tmp.set(-25, 30, 60)));
    legKey.target.updateMatrixWorld();
    legRT.setSize(Math.round(w * size.pr), Math.round(h * size.pr));
    const bg = scene.background;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.getClearColor(clearC);
    const clearA = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(legRT);
    renderer.clear();
    renderer.render(scene, legCam);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearC, clearA);
    renderer.shadowMap.autoUpdate = true;
    scene.background = bg;
    renderer.autoClear = false;
    renderer.setViewport(x, size.h - y - h, w, h);
    renderer.render(blit, blitCam);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.autoClear = true;
  };
  /** v: the panel rect and the hip's place in it, stage px, and k px per metre; null turns the pass off */
  const setLegView = (v) => (legView = v);

  const size = {w: 1600, h: 900, pr: 1};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    size.pr = pr;
    // the waves smear the mirror anyway: it renders at CSS pixels, never at the device ratio
    reflRT.setSize(Math.max(4, Math.round(w * reflScale)), Math.max(4, Math.round(h * reflScale)));
    sprayMat.uniforms.uPr.value = pr;
    lamps.material.uniforms.uPr.value = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const right = new V3().crossVectors(new V3(0, 1, 0), SUN_DIR).normalize();
  const upL = new V3().crossVectors(SUN_DIR, right);
  const tmp = new V3();
  let texel = (2 * EXT) / sun.shadow.mapSize.x;
  const bgFlash = new THREE.Color();
  const wade = [0, 1].map(() => ({x: 0, z: 0, t: -1, v: 0}));

  // ops: xray, core, load, trail (0..1), flash (0..1), pRated; cam {tx,ty,tz,az,el,d,sx,sy}, angles in radians,
  // sx/sy shift the picture on screen (CSS px) into the space the console leaves free
  const frame = (s, bx, t, cam, ops = {}) => {
    mech.group.position.set(bx, 0, 0);
    mech.update(s, t, ops);
    const flash = ops.flash ?? 0;
    waterMat.uniforms.uT.value = t;
    waterMat.uniforms.uFlash.value = flash;
    sprayMat.uniforms.uT.value = t;
    rainMat.uniforms.uT.value = t;
    hemi.intensity = 0.7 + 3.5 * flash;
    scene.fog.color.set(P.bg).lerp(bgFlash.set('#5d7891'), flash * 0.6);
    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.cos(az), ty + d * Math.sin(el), tz - d * Math.cos(el) * Math.sin(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    waterMat.uniforms.uC.value.set(tx, 0, tz);
    rainMat.uniforms.uC.value.set(tx, 0, tz);
    water.position.x = shade.position.x = Math.round(tx);
    // the floor's grid snapped to its own 20 m tile so it never swims
    floor.position.x = Math.round(tx / 20) * 20;
    floor.position.z = Math.round(tz / 20) * 20;
    // drain 0..1 lowers the sea onto the floor; once it is down the floor takes the shadows and the water goes
    level = WATER * (1 - (ops.drain ?? 0));
    water.visible = shade.visible = level > 0.05;
    // under water the ankle trails are drawn over everything; on the dry floor the legs hide them as they should
    for (const tr of trails) tr.line.material.depthTest = !water.visible;
    water.position.y = level;
    shade.position.y = level + 0.02;
    sprayMat.uniforms.uWL.value = level;
    water.position.z = shade.position.z = Math.round(tz);
    skyline.position.x = lamps.position.x = camera.position.x;
    skyline.position.z = lamps.position.z = camera.position.z;
    lamps.material.uniforms.uT.value = t;
    // the shadow box follows the machine, snapped to texels so it never shimmers
    tmp.set(bx, 32, 0);
    const rr = Math.round(tmp.dot(right) / texel) * texel;
    const uu = Math.round(tmp.dot(upL) / texel) * texel;
    sun.target.position.copy(right).multiplyScalar(rr).addScaledVector(upL, uu).addScaledVector(SUN_DIR, tmp.dot(SUN_DIR));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
    sun.target.updateMatrixWorld();
    rim.target.position.set(bx, 35, 0);
    rim.position.set(bx - 100, 80, -70);
    rim.target.updateMatrixWorld();
    const an = mech.anchors();
    coreLight.position.copy(an.core).add(tmp.set(8, 0, 0));
    coreLight.intensity = 3 + (ops.core ?? 0) * (6 + 14 * (ops.load ?? 0.4)) + (ops.cannon?.charge ?? 0) * 30 + (ops.cannon?.flash ?? 0) * 20;
    runBeam(t, ops.cannon?.flash ?? 0, an.muzzle, an.aim);
    runTrail(t, s.sword, an.swordBase, an.swordTip);
    for (const tr of trails) tr.on = (ops.trail ?? 0) > 0.01;
    // each shin at the waterline: where it breaks the surface, and how fast it moves through the water there,
    // smoothed over a second or so as the wake it leaves would be
    s.legs.forEach((L, i) => {
      const w = wadeAt(L, level);
      const x = bx + w.x;
      const pv = wade[i];
      const dt = t - pv.t;
      if (dt > 1e-4 && dt < 0.5) pv.v += (Math.hypot(x - pv.x, w.z - pv.z) / dt - pv.v) * (1 - Math.exp(-dt / 1.2));
      if (dt !== 0) Object.assign(pv, {x, z: w.z, t});
      waterMat.uniforms.uLeg.value[i].set(x, w.z, w.wet ? 1 : 0, Math.min(1, pv.v / 14));
    });
    if (reflScale > 0 && water.visible) renderMirror(tx, ty, tz);
    composer.render();
    if (legView) renderLeg();
    return an;
  };
  const pv = new V3();
  const project = (v) => {
    pv.copy(v).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const setQuality = ({samples, shadow, ao, bloom: bl, rain: nr, refl}) => {
    if (refl !== undefined) {
      reflScale = refl;
      waterMat.uniforms.uReflOn.value = refl > 0 ? 1 : 0;
      resize(size.w, size.h, size.pr);
    }
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      texel = (2 * EXT) / shadow;
    }
    if (ao !== undefined) gtao.enabled = ao;
    if (bl !== undefined) bloom.enabled = bl;
    if (nr !== undefined) rainGeo.setDrawRange(0, nr * 2);
  };
  return {renderer, scene, camera, composer, mech, resize, frame, project, size, addImpact, clearImpacts, pushTrail, clearTrails, setQuality, setLegView, get level() {
    return level;
  }, M};
}
