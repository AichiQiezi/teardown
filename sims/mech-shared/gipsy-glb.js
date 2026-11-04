// The Gipsy Danger hull from a downloaded model ("Gipsy Danger" by savounited, Sketchfab, CC-BY-4.0), cut into the
// rig's rigid segments. The file is a SketchUp export: faces merged by material, not by part, so the cut is ours.
// Every triangle soup is split into connected pieces (vertices welded by position); each piece goes whole to the
// segment whose bone it sits nearest, measured as distance to the bone over the bone's reach. Pieces too big to be
// one plate (they span joints) are cut per triangle instead. No three.js in the reading and cutting: plain arrays in,
// plain arrays out, so node can run it to check the cut.
//
// Model units are SketchUp inches, Z up, the machine facing +Y. MODEL below are its joints, read off orthographic
// renders with a 50-unit grid and off the vertex extents per height band (legs centred at x 103 ± 232).

export const MODEL = {
  cx: 103, // the machine's centre line in x
  top: 3004, // the crest; 79.25 m
  // [lateral from the centre line, height, forward], model units; mirrored for the left side
  hip: [220, 1780, 0],
  knee: [228, 1040, 40],
  ankle: [236, 205, 0],
  toe: [250, 30, 480],
  heel: [236, 30, -270],
  shoulder: [585, 2560, -40],
  pauldron: [660, 2700, -40],
  elbow: [625, 2050, -215],
  wrist: [575, 1470, -70],
  fingers: [560, 1260, -10],
  thumb: [470, 1450, -40],
  waist: [0, 1900, 0],
  neck: [0, 2760, 40],
  crown: [0, 2960, 60],
  reactor: [0, 2290, 205],
};
export const SCALE = 79.25 / MODEL.top;

// SketchUp's scale figure stands by the left foot; drop it. 'material' is the default face, textured fully transparent
// in the file (glass over the visor and the reactor, a few fillers): drop that too
const SKIP = new Set(['material', 'jean_blue', 'Brown', 'Redwood', 'MATLOLIP1', 'DarkGoldenrod', 'MATREYEBA1', 'Gray6', 'Black', 'Beige_1']);

/** Reads the GLB's primitives into sim space (metres; x forward, y up, z to the machine's right). */
export function readGlb(buf) {
  const dv = new DataView(buf);
  const jl = dv.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const bin = 20 + jl + 8;
  const acc = (i) => {
    const a = j.accessors[i];
    const bv = j.bufferViews[a.bufferView];
    const n = a.count * {SCALAR: 1, VEC2: 2, VEC3: 3}[a.type];
    const off = bin + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const T = {5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array}[a.componentType];
    return new T(buf.slice(off, off + n * T.BYTES_PER_ELEMENT));
  };
  const out = [];
  for (const m of j.meshes) {
    for (const p of m.primitives) {
      const mat = j.materials[p.material];
      if (SKIP.has(mat.name)) continue;
      const src = acc(p.attributes.POSITION);
      // SketchUp (x, y, z) -> sim (y, z, x - cx): forward is +Y in the file; a cyclic swap, so the winding holds
      const pos = new Float32Array(src.length);
      for (let i = 0; i < src.length; i += 3) {
        pos[i] = src[i + 1] * SCALE;
        pos[i + 1] = src[i + 2] * SCALE;
        pos[i + 2] = (src[i] - MODEL.cx) * SCALE;
      }
      let nrm = null;
      if (p.attributes.NORMAL !== undefined) {
        const s = acc(p.attributes.NORMAL);
        nrm = new Float32Array(s.length);
        for (let i = 0; i < s.length; i += 3) {
          nrm[i] = s[i + 1];
          nrm[i + 1] = s[i + 2];
          nrm[i + 2] = s[i];
        }
      }
      const idx = Uint32Array.from(acc(p.indices));
      const pbr = mat.pbrMetallicRoughness || {};
      out.push({name: mat.name, mode: p.mode ?? 4, pos, nrm, idx, color: pbr.baseColorFactor, emissive: mat.emissiveFactor});
    }
  }
  return out;
}

// model joint -> sim metres, side -1 left (z < 0), +1 right
export const joint = (key, side = 1) => {
  const [l, h, f] = MODEL[key];
  return [f * SCALE, h * SCALE, side * l * SCALE];
};

/**
 * The rig's bones in sim space: [segment, from, to, reach, below?, above?]. A piece goes to the bone it is nearest to
 * over reach; the torso takes nothing below the waist and the pelvis nothing above it, so the crotch plate and the
 * back of the hips ride the pelvis.
 */
export function bones() {
  const w = joint('waist')[1];
  const b = [
    ['torso', joint('waist'), joint('neck'), 9.0, w],
    ['torso', joint('neck'), joint('crown'), 5.0, w],
    ['pelvis', joint('hip', -1), joint('hip', 1), 4.0, -Infinity, w],
    ['pelvis', [0, 40, 0], joint('waist'), 6.0, -Infinity, w],
  ];
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    b.push(
      [`thigh${k}`, joint('hip', s), joint('knee', s), 5.4],
      [`shin${k}`, joint('knee', s), joint('ankle', s), 5.0, 2.6],
      [`foot${k}`, joint('ankle', s), joint('toe', s), 4.6],
      [`foot${k}`, joint('ankle', s), joint('heel', s), 4.0],
      [`upper${k}`, joint('shoulder', s), joint('elbow', s), 4.2],
      [`upper${k}`, joint('shoulder', s), joint('pauldron', s), 3.6],
      [`fore${k}`, joint('elbow', s), joint('wrist', s), 4.4],
      [`fore${k}`, joint('wrist', s), joint('fingers', s), 3.0],
      [`fore${k}`, joint('wrist', s), joint('thumb', s), 2.0],
    );
  }
  return b;
}

const segDist = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
};

/** Which segment a point belongs to: the torso and pelvis split at the waist, limbs by the nearest bone. */
export function classify(p, B) {
  let best = null;
  let bd = Infinity;
  for (const [name, a, b, r, lo = -Infinity, hi = Infinity] of B) {
    if (p[1] < lo || p[1] > hi) continue;
    const d = segDist(p, a, b) / r;
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

/**
 * Splits one primitive into pieces and assigns each to a segment; refine(segment, centroid) may rename it (the chest
 * plates). Returns {segs: {segment: Uint32Array of indices}, pieces, split}. Lines (mode 1) go whole by piece.
 */
export function cut(prim, B, refine = (s) => s, maxPiece = 9.0) {
  const {pos, idx, mode} = prim;
  const per = mode === 1 ? 2 : 3;
  const nf = idx.length / per;
  // weld by position so a plate's faces join across split normals
  const key = new Map();
  const weld = new Uint32Array(pos.length / 3);
  for (let i = 0; i < weld.length; i++) {
    const k = `${Math.round(pos[i * 3] * 200)},${Math.round(pos[i * 3 + 1] * 200)},${Math.round(pos[i * 3 + 2] * 200)}`;
    if (!key.has(k)) key.set(k, key.size);
    weld[i] = key.get(k);
  }
  const parent = Int32Array.from({length: key.size}, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let f = 0; f < nf; f++) {
    const a = find(weld[idx[f * per]]);
    for (let c = 1; c < per; c++) {
      const b = find(weld[idx[f * per + c]]);
      if (a !== b) parent[b] = a;
    }
  }
  // per piece: bounds and centroid
  const pieces = new Map();
  const cen = (f) => {
    const c = [0, 0, 0];
    for (let k = 0; k < per; k++) for (let d = 0; d < 3; d++) c[d] += pos[idx[f * per + k] * 3 + d] / per;
    return c;
  };
  for (let f = 0; f < nf; f++) {
    const r = find(weld[idx[f * per]]);
    let pc = pieces.get(r);
    if (!pc) pieces.set(r, (pc = {faces: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], c: [0, 0, 0]}));
    pc.faces.push(f);
    const c = cen(f);
    for (let d = 0; d < 3; d++) {
      pc.lo[d] = Math.min(pc.lo[d], c[d]);
      pc.hi[d] = Math.max(pc.hi[d], c[d]);
      pc.c[d] += c[d];
    }
  }
  const out = {};
  let split = 0;
  for (const pc of pieces.values()) {
    const span = Math.hypot(pc.hi[0] - pc.lo[0], pc.hi[1] - pc.lo[1], pc.hi[2] - pc.lo[2]);
    const whole = span < maxPiece || mode === 1;
    const c = pc.c.map((v) => v / pc.faces.length);
    const seg = whole ? refine(classify(c, B), c) : null;
    if (!whole) split++;
    for (const f of pc.faces) {
      const fc = seg ? null : cen(f);
      const s = seg ?? refine(classify(fc, B), fc);
      (out[s] ||= []).push(...Array.from(idx.subarray(f * per, f * per + per)));
    }
  }
  return {segs: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Uint32Array.from(v)])), pieces: pieces.size, split};
}
