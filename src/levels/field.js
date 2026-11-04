// Уровень −3 · поле: чистое зелёное поле — холмы и трава, ни одного дерева, и жёлтые домики трёх
// видов: одноэтажный с двускатной крышей, двухэтажный и одноэтажный длинный с вальмовой
// крышей и крыльцом. Несколько домов рядом и ещё несколько — далеко на холмах.
// Сюда приезжает лифт с парковки: он стоит прямо посреди травы. Всё построено кодом:
// рельеф, редкая трава с ветром, небо с облаками, дома с сайдингом, окнами, дверями, трубами.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Route } from '../route.js';
import { siding, shingles, brick, concrete, macroNoise, labelTexture, weatheredSteel, rng, slicer } from '../textures.js';
import { createElevator, arrive } from '../elevator.js';

// --- рельеф ---
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// дома: [вид, x, z]. Ближние — правее тропинки (слева в кадре титры), дальние — на холмах
const NEAR = [['A', 7, -36], ['B', 27, -54], ['C', -7, -68], ['A', 46, -94], ['B', 14, -112]];
const FAR = [['C', -95, -185], ['A', 72, -205], ['B', -185, -250], ['A', 150, -160], ['C', -40, -290], ['B', 220, -300], ['A', -255, -170]];
const HOUSES = [...NEAR, ...FAR];
const LIFT = { x: 0, z: 37.75 };

function rawHeight(x, z) {
  const far = smooth(60, 260, Math.hypot(x, z + 60));
  let h = (fbm(x * 0.011 + 3.1, z * 0.011 - 1.7) - 0.5) * (16 + far * 34);
  h += (fbm(x * 0.045, z * 0.045, 3) - 0.5) * 1.6;
  h -= 3.5 * smooth(-22, -70, z) * (1 - far);
  // вдоль тропинки — плавный подъём на гребень у z≈−12, откуда открывается вид на дома
  const path = 3.2 * Math.exp(-((z + 12) ** 2) / 520);
  const k = 1 - smooth(8, 30, Math.abs(x));
  const onPath = z > -30 && z < 46 ? 1 : smooth(-55, -30, z);
  return THREE.MathUtils.lerp(h, path, k * onPath * 0.85);
}
const flats = HOUSES.map(([, x, z], i) => ({ x, z, y: rawHeight(x, z), r: i < NEAR.length ? 8 : 10 }));
export function groundHeight(x, z) {
  let h = rawHeight(x, z);
  for (const f of flats) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + 12) h = THREE.MathUtils.lerp(f.y, h, smooth(f.r, f.r + 10, d));
  }
  return h;
}

// --- небо ---
const SkyShader = {
  uniforms: { uSun: { value: new THREE.Vector3() }, uTime: { value: 0 }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } },
  vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uSun; uniform float uTime; uniform vec3 uZen; uniform vec3 uHor; varying vec3 vDir;
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y); }
    float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * n2(p); p *= 2.02; a *= 0.5; } return s; }
    void main(){
      vec3 d = normalize(vDir);
      float h = max(d.y, 0.0);
      vec3 col = mix(uHor, uZen, pow(h, 0.6));
      float sd = max(dot(d, uSun), 0.0);
      col += vec3(1.0, 0.95, 0.86) * (pow(sd, 900.0) * 6.0 + pow(sd, 14.0) * 0.22);
      if (d.y > 0.0) {
        vec2 uv = d.xz / (d.y + 0.1) * 0.55 + vec2(uTime * 0.0035, uTime * 0.0012);
        float c = fbm(uv * 1.3);
        c = smoothstep(0.5, 0.78, c) * smoothstep(0.0, 0.18, d.y);
        vec3 cc = mix(vec3(0.82, 0.85, 0.9), vec3(1.0, 0.99, 0.97), smoothstep(0.55, 0.85, fbm(uv * 1.3 + 0.07)) * 0.8 + pow(sd, 3.0) * 0.4);
        col = mix(col, cc, c * 0.92);
      }
      col = mix(col, uHor, smoothstep(0.06, -0.02, d.y));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// --- дома ---
// UV в метрах, чтобы доски сайдинга и черепица были одного размера на любом доме
function boxM(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}

function houseMaterials(seed) {
  const r = rng(seed);
  const yellow = [222 + r() * 12, 186 + r() * 18, 82 + r() * 20];
  return {
    siding: new THREE.MeshStandardMaterial({ map: siding(seed, yellow), roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf0ede2, roughness: 0.6 }),
    roof: new THREE.MeshStandardMaterial({ map: shingles(seed + 1), roughness: 0.95, side: THREE.DoubleSide }),
    base: new THREE.MeshStandardMaterial({ map: concrete(seed + 2, [150, 146, 138], 256), roughness: 1 }),
    brick: new THREE.MeshStandardMaterial({ map: brick(seed + 3), roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b0e10, metalness: 0.25, roughness: 0.06, envMapIntensity: 1.6 }),
    door: new THREE.MeshStandardMaterial({ color: [0x6e4b33, 0x3f4f5a, 0x7a2f26][Math.floor(r() * 3)], roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xdedbd2, metalness: 0.6, roughness: 0.4 }),
  };
}

function buildHouse(type, M, windows) {
  const g = new THREE.Group();
  const P = {
    A: { W: 9.2, D: 7.0, H: 2.75, pitch: 0.56, roof: 'gable', floors: 1 },
    B: { W: 7.6, D: 7.2, H: 5.6, pitch: 0.66, roof: 'gable', floors: 2 },
    C: { W: 12.0, D: 6.4, H: 2.6, pitch: 0.5, roof: 'hip', floors: 1 },
  }[type];
  const { W, D, H, pitch } = P;
  const B0 = 0.5; // высота цоколя
  const top = B0 + H;
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };

  add(boxM(W + 0.24, 3, D + 0.24, 2), M.base, 0, B0 - 1.5, 0);
  add(boxM(W, H, D, 2.4), M.siding, 0, B0 + H / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.14, H, 0.14), M.trim, sx * (W / 2), B0 + H / 2, sz * (D / 2));
  if (P.floors === 2) {
    add(new THREE.BoxGeometry(W + 0.06, 0.16, 0.06), M.trim, 0, B0 + H / 2, D / 2 + 0.02);
    add(new THREE.BoxGeometry(W + 0.06, 0.16, 0.06), M.trim, 0, B0 + H / 2, -D / 2 - 0.02);
    add(new THREE.BoxGeometry(0.06, 0.16, D + 0.06), M.trim, W / 2 + 0.02, B0 + H / 2, 0);
    add(new THREE.BoxGeometry(0.06, 0.16, D + 0.06), M.trim, -W / 2 - 0.02, B0 + H / 2, 0);
  }

  // face: 'front' (+z), 'back' (−z), 'right' (+x), 'left' (−x); x — вдоль стены
  function place(obj, x, y, face) {
    const o = 0.005;
    if (face === 'front') { obj.position.set(x, y, D / 2 + o); }
    if (face === 'back') { obj.position.set(-x, y, -D / 2 - o); obj.rotation.y = Math.PI; }
    if (face === 'right') { obj.position.set(W / 2 + o, y, -x); obj.rotation.y = Math.PI / 2; }
    if (face === 'left') { obj.position.set(-W / 2 - o, y, x); obj.rotation.y = -Math.PI / 2; }
    g.add(obj);
  }
  // окно: наличник, переплёт крестом, стекло, подоконник
  function windowAt(x, y, face, w = 1.0, h = 1.3) {
    const w2 = new THREE.Group();
    const f = 0.09;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass); glass.position.z = 0.012; w2.add(glass);
    for (const [gx, gy, gw, gh] of [[0, h / 2 + f / 2, w + 2 * f, f], [0, -h / 2 - f / 2, w + 2 * f, f], [-w / 2 - f / 2, 0, f, h], [w / 2 + f / 2, 0, f, h], [0, 0, w, 0.045], [0, 0, 0.045, h]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.06), M.trim); b.position.set(gx, gy, 0.03); w2.add(b);
    }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.06, 0.16), M.trim); sill.position.set(0, -h / 2 - f - 0.02, 0.08); w2.add(sill);
    place(w2, x, y, face);
    windows?.push(glass);
  }
  function door(x, face) {
    const d = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.05), M.door); leaf.position.set(0, 1.025, 0.03); d.add(leaf);
    for (const [px, py] of [[-0.22, 1.5], [0.22, 1.5], [-0.22, 0.55], [0.22, 0.55]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, py > 1 ? 0.62 : 0.72, 0.02), M.door); p.position.set(px, py, 0.065); d.add(p);
    }
    for (const [gx, gy, gw, gh] of [[0, 2.1, 1.2, 0.12], [-0.53, 1.05, 0.11, 2.1], [0.53, 1.05, 0.11, 2.1]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, 0.07), M.trim); b.position.set(gx, gy, 0.035); d.add(b);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.metal); knob.position.set(0.36, 1.0, 0.08); d.add(knob);
    place(d, x, B0, face);
    const step = new THREE.Mesh(boxM(1.5, 0.5, 0.9, 2), M.base);
    step.position.set(x, B0 - 0.25, D / 2 + 0.45);
    g.add(step);
  }

  // крыша
  const oh = 0.45;
  const rise = (D / 2) * Math.tan(pitch);
  if (P.roof === 'gable') {
    const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise)]);
    const tg = new THREE.ShapeGeometry(tri);
    const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.4, uv.getY(i) / 2.4);
    add(tg, M.siding, W / 2, top, 0, Math.PI / 2);
    add(tg, M.siding, -W / 2, top, 0, -Math.PI / 2);
    const L = (D / 2) / Math.cos(pitch) + oh;
    for (const s of [1, -1]) {
      const dir = new THREE.Vector3(0, -Math.sin(pitch), s * Math.cos(pitch));
      const nrm = new THREE.Vector3(0, Math.cos(pitch), s * Math.sin(pitch));
      const c = new THREE.Vector3(0, top + rise, 0).addScaledVector(dir, L / 2).addScaledVector(nrm, 0.07);
      const r = add(boxM(W + 2 * oh, 0.12, L, 2.6), M.roof, c.x, c.y, c.z);
      r.rotation.x = s * pitch;
      const e = new THREE.Vector3(0, top + rise, 0).addScaledVector(dir, L).addScaledVector(nrm, -0.02);
      add(new THREE.BoxGeometry(W + 2 * oh, 0.12, 0.12), M.trim, e.x, e.y - 0.04, e.z + s * 0.04);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, top - 0.1, 0.08), M.metal, sx * (W / 2 - 0.25), (top - 0.1) / 2 + 0.05, s * (D / 2 + 0.3));
    }
    add(new THREE.BoxGeometry(W + 2 * oh, 0.14, 0.28), M.roof, 0, top + rise + 0.1, 0);
    for (const sx of [-1, 1]) for (const s of [1, -1]) {
      const len = (D / 2 + oh) / Math.cos(pitch);
      const m = add(new THREE.BoxGeometry(0.06, 0.2, len), M.trim, sx * (W / 2 + oh + 0.01), top + rise / 2 - 0.05 - oh * Math.tan(pitch) / 2, s * (D / 4 + oh / 2));
      m.rotation.x = s * pitch;
    }
  } else {
    const Xe = W / 2 + oh, Ze = D / 2 + oh, ye = top - oh * Math.tan(pitch), yr = top + rise, r = (W - D) / 2;
    const v = [];
    const uvs = [];
    const quad = (a, b, c, d) => { v.push(...a, ...b, ...c, ...a, ...c, ...d); };
    const tri = (a, b, c) => { v.push(...a, ...b, ...c); };
    quad([-Xe, ye, Ze], [Xe, ye, Ze], [r, yr, 0], [-r, yr, 0]);
    quad([Xe, ye, -Ze], [-Xe, ye, -Ze], [-r, yr, 0], [r, yr, 0]);
    tri([Xe, ye, Ze], [Xe, ye, -Ze], [r, yr, 0]);
    tri([-Xe, ye, -Ze], [-Xe, ye, Ze], [-r, yr, 0]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    const n = geo.attributes.normal;
    for (let i = 0; i < v.length / 3; i++) {
      const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
      const ends = Math.abs(n.getX(i)) > Math.abs(n.getZ(i));
      uvs.push((ends ? z : x) / 2.6, Math.hypot(y - yr, ends ? x : z) / 2.6);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    add(geo, M.roof, 0, 0.06, 0);
    for (const s of [1, -1]) {
      add(new THREE.BoxGeometry(2 * Xe, 0.12, 0.12), M.trim, 0, ye, s * Ze);
      add(new THREE.BoxGeometry(0.12, 0.12, 2 * Ze), M.trim, s * Xe, ye, 0);
    }
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, ye - 0.1, 0.08), M.metal, sx * (W / 2 - 0.25), (ye - 0.1) / 2 + 0.05, D / 2 + 0.3);
    // крыльцо под навесом на двух столбиках
    add(boxM(3.2, 0.5, 2.0, 2), M.base, -W / 4, B0 - 0.25, D / 2 + 1.0);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.14, 2.45, 0.14), M.trim, -W / 4 + sx * 1.45, B0 + 1.22, D / 2 + 1.85);
    const pr = add(boxM(3.6, 0.1, 2.3, 2.6), M.roof, -W / 4, B0 + 2.62, D / 2 + 1.05);
    pr.rotation.x = 0.16;
  }

  if (type !== 'C') {
    const ch = add(boxM(0.62, rise + 1.4, 0.62, 1), M.brick, W * 0.22, top + (rise + 1.4) / 2 - 0.2, -D * 0.18);
    add(new THREE.BoxGeometry(0.74, 0.1, 0.74), M.base, ch.position.x, ch.position.y + (rise + 1.4) / 2, ch.position.z);
  }

  const wy = B0 + 1.55;
  if (type === 'A') {
    door(-1.6, 'front');
    for (const x of [-3.4, 1.2, 3.2]) windowAt(x, wy, 'front');
    for (const x of [-2.5, 2.5]) windowAt(x, wy, 'back');
    windowAt(0, wy, 'right'); windowAt(0, wy, 'left', 0.8, 1.1);
  } else if (type === 'B') {
    door(0, 'front');
    for (const x of [-2.4, 2.4]) windowAt(x, wy, 'front');
    for (const x of [-2.4, 0, 2.4]) windowAt(x, wy + 2.8, 'front');
    for (const x of [-1.6, 1.6]) { windowAt(x, wy, 'right'); windowAt(x, wy + 2.8, 'right'); windowAt(x, wy + 2.8, 'left'); }
    windowAt(0, wy, 'left', 0.8, 1.1);
    for (const x of [-2.4, 2.4]) { windowAt(x, wy, 'back'); windowAt(x, wy + 2.8, 'back'); }
  } else {
    door(-W / 4, 'front');
    for (const x of [-W / 4 - 1.9, 1.0, 3.2, 5.0]) windowAt(x, wy, 'front', x > 4 ? 0.8 : 1.0);
    for (const x of [-4, -1.3, 1.3, 4]) windowAt(x, wy, 'back');
    windowAt(0, wy, 'right'); windowAt(0, wy, 'left');
  }
  return g;
}

// сотни деталей дома склеиваются в несколько мешей по материалам — на всё поле немного вызовов отрисовки
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const m4 = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    geo.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
  });
  const out = new THREE.Group();
  out.position.copy(root.position); out.rotation.copy(root.rotation);
  for (const [mat, geos] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

// почтовый ящик у тропинки — находка
function makeMailbox() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.9 });
  const tin = new THREE.MeshStandardMaterial({ color: 0x5f7486, metalness: 0.5, roughness: 0.45 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb8281e, roughness: 0.5 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.09), wood); post.position.y = 0.575;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.17, 0.46), tin); box.position.y = 1.2;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.46, 20, 1, false, 0, Math.PI), tin);
  lid.rotation.set(Math.PI / 2, Math.PI / 2, 0); lid.rotation.order = 'YXZ'; lid.position.y = 1.285;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.05), red); flag.position.set(0.12, 1.33, -0.08);
  const name = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), new THREE.MeshStandardMaterial({ map: labelTexture(['С.-А. БАЛАЕВ'], { w: 512, h: 128, bg: '#e8e0c8', sizes: [64] }), roughness: 0.7 }));
  name.position.set(-0.1105, 1.2, 0); name.rotation.y = -Math.PI / 2;
  g.add(post, box, lid, flag, name);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData = { egg: 'mail' }; } });
  return g;
}

// --- трава: невысокая, тонкая, пятнами и только у тропинки; изогнутые травинки качаются от ветра ---
async function makeGrass(count, shared, area, tick) {
  const W = 0.016, SEG = 4;
  const pos = [], idx = [];
  for (let k = 0; k <= SEG; k++) {
    const y = k / SEG, w = W * (1 - y * 0.88), z = 0.18 * y * y;
    if (k < SEG) pos.push(-w, y, z, w, y, z); else pos.push(0, 1, z);
  }
  for (let k = 0; k < SEG - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const lastRow = (SEG - 1) * 2;
  idx.push(lastRow, lastRow + 1, lastRow + 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat(), 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vH;')
      .replace('#include <project_vertex>', /* glsl */ `
        vH = position.y;
        vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        float sway = sin(uTime * 1.4 + wp.x * 0.22 + wp.z * 0.16) * 0.6 + sin(uTime * 2.5 + wp.x * 0.7 - wp.z * 0.45) * 0.3;
        float bend = vH * vH;
        wp.x += (sway * 0.07 + 0.02) * bend;
        wp.z += (sway * 0.03) * bend;
        vec4 mvPosition = modelViewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.42, 0.5, 0.36), vec3(1.12, 1.1, 0.92), vH);');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const r = rng(77);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  // те же оттенки, что у газона на земле, — травинки не выделяются на его фоне
  const PALETTE = [[0.2, 0.36, 0.1], [0.25, 0.42, 0.12], [0.3, 0.47, 0.14], [0.38, 0.52, 0.17], [0.5, 0.5, 0.26]];
  let n = 0;
  for (let tries = 0; n < count && tries < count * 6; tries++) {
    if ((tries & 2047) === 0) await tick();
    // травинки — только вблизи тропинки, где их видно; дальше трава — это текстура земли
    const x = (r() - 0.5) * 2 * (2 + r() * area.x);
    const z = area.z0 + r() * (area.z1 - area.z0);
    // пятна: где-то трава гуще, где-то почти голая земля
    const patch = fbm(x * 0.09 + 5, z * 0.09 - 3, 3);
    if (r() > smooth(0.38, 0.66, patch)) continue;
    if (Math.abs(x - LIFT.x) < 1.3 && z > LIFT.z - 1.2 && z < LIFT.z + 1.4) continue;
    p.set(x, groundHeight(x, z) - 0.015, z);
    e.set((r() - 0.5) * 0.4, r() * Math.PI * 2, (r() - 0.5) * 0.4);
    q.setFromEuler(e);
    const hgt = (0.05 + Math.pow(r(), 1.8) * 0.1) * (0.75 + patch * 0.6);
    s.set(0.7 + r() * 0.5, hgt, 1);
    mesh.setMatrixAt(n, m.compose(p, q, s));
    const pc = PALETTE[Math.min(PALETTE.length - 1, Math.floor(Math.pow(r(), 1.5) * PALETTE.length))];
    mesh.setColorAt(n, col.setRGB(pc[0], pc[1], pc[2]).multiplyScalar(1.8 + r() * 0.4));
    n++;
  }
  mesh.count = n;
  mesh.frustumCulled = false;
  return mesh;
}

export async function createField({ renderer, lowPower }) {
  const tick = slicer();
  await document.fonts.load('700 64px "Oswald"').catch(() => {});
  const scene = new THREE.Scene();
  const hor = new THREE.Color().setRGB(0.8, 0.86, 0.9);
  const zen = new THREE.Color().setRGB(0.2, 0.4, 0.76);
  scene.fog = new THREE.FogExp2(hor.clone(), 0.0036);
  const shared = { uTime: { value: 0 } };

  const sunDir = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({ ...SkyShader, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.material.uniforms.uSun.value.copy(sunDir);
  sky.material.uniforms.uZen.value.copy(zen);
  sky.material.uniforms.uHor.value.copy(hor);
  sky.frustumCulled = false; sky.renderOrder = -1;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene(); skyScene.add(sky.clone());
  scene.environment = pmrem.fromScene(skyScene, 0, 1, 2000).texture;
  pmrem.dispose();
  scene.add(sky);

  // рельеф. Газон: мелкая текстура травы с рельефом (солнце даёт объём) + второй, более мелкий
  // слой поверх, чтобы не было видно повтора, + крупные пятна гуще/суше
  const size = 900, seg = lowPower ? 160 : 260;
  const tg = new THREE.PlaneGeometry(size, size, seg, seg);
  tg.rotateX(-Math.PI / 2);
  tg.translate(0, 0, -100);
  const tp = tg.attributes.position;
  const colors = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) {
    if ((i & 4095) === 0) await tick();
    const x = tp.getX(i), z = tp.getZ(i);
    tp.setY(i, groundHeight(x, z));
    const n = fbm(x * 0.03 + 9, z * 0.03 - 4, 3);
    colors[i * 3] = 0.9 + n * 0.16; colors[i * 3 + 1] = 0.94 + n * 0.12; colors[i * 3 + 2] = 0.86 + n * 0.14;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tg.computeVertexNormals();
  // газон — фототекстура Grass004 (ambientCG, CC0): цвет, рельеф и затенение между травинками;
  // плитка 1,4 м, второй слой под углом и крупные пятна гуще/суше — повтора не видно
  const loader = new THREE.TextureLoader();
  const [gCol, gNor, gAo] = await Promise.all(['textures/grass004_color.jpg', 'textures/grass004_normal.jpg', 'textures/grass004_ao.jpg'].map((u) => loader.loadAsync(u)));
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const REP = size / 1.4;
  for (const t of [gCol, gNor, gAo]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(REP, REP); t.anisotropy = aniso; }
  gCol.colorSpace = THREE.SRGBColorSpace;
  const macro = macroNoise();
  const groundMat = new THREE.MeshLambertMaterial({ map: gCol, normalMap: gNor, normalScale: new THREE.Vector2(1.1, 1.1), aoMap: gAo, aoMapIntensity: 0.7, vertexColors: true });
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.tMacro = { value: macro };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tMacro;')
      .replace('#include <map_fragment>', /* glsl */ `
      #ifdef USE_MAP
        vec4 t1 = texture2D(map, vMapUv);
        // второй слой: крупнее и повёрнут — швы плиток не складываются в сетку
        vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.61 + vec2(0.37, 0.11);
        vec4 t2 = texture2D(map, ruv);
        float mac = texture2D(tMacro, vMapUv * 0.011).r;
        // слои не смешиваются пополам (так травинки «замыливаются»), а сменяют друг друга пятнами
        float w = smoothstep(0.44, 0.56, texture2D(tMacro, vMapUv * 0.043 + 0.5).r);
        vec3 tc = mix(t1.rgb, t2.rgb, w);
        tc = max(vec3(0.0), (tc - 0.12) * 1.14 + 0.12);
        diffuseColor.rgb *= tc * mix(vec3(0.86, 0.92, 0.8), vec3(1.12, 1.08, 0.9), mac) * 1.08;
      #endif`);
  };
  const ground = new THREE.Mesh(tg, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
  await tick();

  scene.add(await makeGrass(lowPower ? 14000 : 38000, shared, { x: 16, z0: -40, z1: 40 }, tick));

  // дома: ближние и дальние на холмах; окна запоминаем — в одном из них может появиться улыбка
  const windows = [];
  for (let i = 0; i < HOUSES.length; i++) {
    await tick();
    const [type, x, z] = HOUSES[i];
    const local = [];
    const h = buildHouse(type, houseMaterials(100 + i * 7), local);
    const y = groundHeight(x, z);
    h.position.set(x, y - 0.05, z);
    h.rotation.y = Math.atan2(-4 - x, -12 - z) + (i % 2 ? 0.3 : -0.25);
    h.updateMatrixWorld(true);
    if (i < 3) for (const gl of local) {
      const wp = gl.getWorldPosition(new THREE.Vector3());
      const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(gl.getWorldQuaternion(new THREE.Quaternion()));
      windows.push({ pos: wp, nrm });
    }
    scene.add(mergeByMaterial(h));
  }

  // лифт посреди поля: отсюда начинается уровень
  const el = createElevator(renderer, { standalone: true, shell: new THREE.MeshStandardMaterial({ map: weatheredSteel(), metalness: 0.7, roughness: 0.5 }) });
  el.group.position.set(LIFT.x, groundHeight(LIFT.x, LIFT.z), LIFT.z - 0.75);
  el.group.rotation.y = Math.PI;
  scene.add(el.group);

  const mailbox = makeMailbox();
  mailbox.position.set(-1.0, groundHeight(-1.0, -17.2), -17.2);
  mailbox.rotation.y = 2.6;
  scene.add(mailbox);
  const picks = [];
  mailbox.traverse((o) => { if (o.isMesh) picks.push(o); });

  // свет: солнце сзади-слева, мягкий свет неба
  scene.add(new THREE.HemisphereLight(0xd4e4f7, 0x5a7a33, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
  sun.position.copy(sunDir).multiplyScalar(150).add(new THREE.Vector3(0, 0, -60));
  sun.target.position.set(0, 0, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 20, far: 400 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const E = 1.6;
  const at = (x, z, dy = E) => [x, groundHeight(x, z) + dy, z];
  const route = new Route([
    { p: at(LIFT.x, LIFT.z), look: at(0, 20, 1.5) },
    { p: at(0, 35.2), look: at(-1, 0, 2.0) },
    { p: at(-1.0, 22), look: at(-1, -30, 2.4) },
    { p: at(-2.2, 8), look: at(0, -36, 2.8) },
    { p: at(-3.2, -4), look: at(2, -44, 3.0) },
    { p: at(-4.0, -12), look: at(3, -54, 3.6) },
  ]);
  const stations = [
    { id: 'cap-field', from: route.at(1) - 0.5, to: route.at(2) + 2 },
    { id: 'cap-contacts', from: route.at(4) - 1.5, to: route.length + 50 },
  ];

  // улыбка в тёмном окне одного из ближних домов — когда идёшь по гребню и дома уже видны
  let haunted = false, tCrest = 0;
  const toCam = new THREE.Vector3();
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  function update(dt, now, { camera, playing, s, smilers, walking }) {
    shared.uTime.value = now;
    sky.material.uniforms.uTime.value = now;
    if (!playing || haunted || smilers.left <= 0 || s < route.at(3)) return;
    if (walking > 0.2) tCrest += dt;
    if (tCrest < 1.5) return;
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    const options = windows.filter((w) => frustum.containsPoint(w.pos) && toCam.subVectors(camera.position, w.pos).normalize().dot(w.nrm) > 0.45);
    if (!options.length) return;
    const w = options[Math.floor(Math.random() * options.length)];
    if (smilers.spawn(scene, w.pos.clone().addScaledVector(w.nrm, 0.05), { dur: 2.8, scale: 0.72 })) haunted = true;
  }

  // вход: лифт доезжает, звенит, двери расходятся — снаружи поле и дневной свет
  function enter(b, pos, target, ctx) {
    arrive(el, b, pos, target, ctx, ['−2', '?', '??', '−3']);
    const k = THREE.MathUtils.smoothstep(b, 0.5, 0.85);
    return { flash: k * (1 - k) * 0.6 };
  }
  function leave({ audio }) { audio.elevator(0); }

  return {
    id: 'field',
    label: 'УРОВЕНЬ −3 · ПОЛЕ',
    scene, route, stations, update, enter, leave, picks,
    ground: (x, z) => groundHeight(x, z),
    floor: 'field',
    far: 1800,
    lookLimit: { yaw: 0.55, pitch: 0.28 }, // вокруг одни холмы — смотреть можно только вперёд
    bloom: { strength: 0.32, radius: 0.5, threshold: 0.95 },
    exposure: 1.0,
    grade: { tint: [1.01, 1.0, 0.93], sat: 0.9 },
  };
}
