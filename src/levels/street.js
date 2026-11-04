// Вступление: тёмный переулок ночью — панельные дома с балконами, подъездами и редкими горящими
// окнами, фонари с натриевыми плафонами (один мигает), тротуар из старых бетонных плит,
// мокрый асфальт с люками и стёртой разметкой. Камера идёт по тротуару, плёнку начинает
// «рвать», фонари гаснут — и человек медленно проваливается сквозь асфальт («ноуклип»).
import * as THREE from 'three';
import { canvas, toTexture, concrete, rng } from '../textures.js';

// фасад панельки: 4 пролёта × 9 этажей (3,2 × 2,8 м). Панели с разным тоном и зерном бетона,
// швы с мастикой, окна в глубоких откосах — рамы (белый пластик или старое крашеное дерево),
// подоконные отливы, потёки, ремонтные заплаты; на первом этаже — решётки на окнах.
// Горят немногие окна: тёплый свет, тюль, шторы. Свечение окна шейдер берёт из самого цвета
// (тёплое и яркое = горит), отдельная карта свечения не нужна.
const COLS = 4, ROWS = 9;
function facade(seed, hi) {
  const rand = rng(seed);
  const W = hi ? 1024 : 512, H = W * 2;
  const u = W / 1024; // масштаб деталей
  const [c, g] = canvas(W, H);
  const cw = W / COLS, rh = H / ROWS;
  const tone = [[150, 142, 128], [138, 136, 130], [156, 146, 128], [128, 124, 118]][seed % 4];
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) {
    const v = 0.9 + rand() * 0.14;
    g.fillStyle = `rgb(${tone[0] * v | 0},${tone[1] * v | 0},${tone[2] * v | 0})`;
    g.fillRect(k * cw, r * rh, cw, rh);
  }
  // зерно бетона и раковины
  for (let n = 0; n < 60000 * u * u; n++) {
    const d = rand() < 0.5;
    g.fillStyle = d ? `rgba(30,28,24,${rand() * 0.16})` : `rgba(235,230,220,${rand() * 0.1})`;
    const s = (0.8 + rand() * 2.2) * u * 1.6;
    g.fillRect(rand() * W, rand() * H, s, s);
  }
  // ремонтные заплаты другого тона
  for (let n = 0; n < 5; n++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '96,92,86' : '178,172,160'},0.45)`;
    g.fillRect(rand() * W, rand() * H, (30 + rand() * 90) * u, (20 + rand() * 60) * u);
  }
  // потёки от кровли
  for (let n = 0; n < 26; n++) {
    const x = rand() * W, w = (3 + rand() * 12) * u, h = H * (0.1 + rand() * 0.5);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(36,32,26,0.28)'); gr.addColorStop(1, 'rgba(36,32,26,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, h);
  }
  // швы между панелями: тёмная щель и полоса мастики рядом
  const sw = 4 * u;
  for (let r = 0; r <= ROWS; r++) {
    g.fillStyle = 'rgba(52,50,46,0.7)'; g.fillRect(0, r * rh - sw * 2.2, W, sw * 4.4);
    g.fillStyle = 'rgba(18,17,15,0.85)'; g.fillRect(0, r * rh - sw * 0.5, W, sw);
  }
  for (let k = 0; k <= COLS; k++) {
    g.fillStyle = 'rgba(52,50,46,0.7)'; g.fillRect(k * cw - sw * 2.2, 0, sw * 4.4, H);
    g.fillStyle = 'rgba(18,17,15,0.85)'; g.fillRect(k * cw - sw * 0.5, 0, sw, H);
  }
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) {
    const ground = r === ROWS - 1;
    const x = k * cw + cw * 0.26, y = r * rh + rh * 0.24, w = cw * 0.48, h = rh * 0.5;
    const lit = rand() < (ground ? 0.12 : 0.2);
    const pvc = rand() < 0.6;
    const frameC = pvc ? [226, 224, 218] : [[150, 132, 108], [168, 160, 142], [96, 74, 54]][Math.floor(rand() * 3)];
    // потёк под отливом
    const gr = g.createLinearGradient(0, y + h, 0, y + h + rh * 0.55);
    gr.addColorStop(0, 'rgba(38,34,28,0.4)'); gr.addColorStop(1, 'rgba(38,34,28,0)');
    g.fillStyle = gr; g.fillRect(x + 6 * u, y + h, w - 12 * u, rh * 0.55);
    // откос: тень сверху и слева — окно утоплено в панель
    const rv = 12 * u;
    g.fillStyle = '#4a4741'; g.fillRect(x - rv, y - rv, w + rv * 2, h + rv * 2);
    g.fillStyle = '#2c2a26'; g.fillRect(x - rv, y - rv, w + rv * 2, rv * 0.9); g.fillRect(x - rv, y - rv, rv * 0.7, h + rv * 2);
    // стекло
    if (lit) {
      const warm = 0.72 + rand() * 0.28;
      const lg = g.createLinearGradient(0, y, 0, y + h);
      lg.addColorStop(0, `rgb(${226 * warm | 0},${158 * warm | 0},${82 * warm | 0})`);
      lg.addColorStop(1, `rgb(${255 * warm | 0},${200 * warm | 0},${116 * warm | 0})`);
      g.fillStyle = lg; g.fillRect(x, y, w, h);
      // тюль: светлые вертикальные складки
      if (rand() < 0.7) for (let f = 0; f < w; f += 6 * u) { g.fillStyle = `rgba(255,236,200,${0.12 + rand() * 0.12})`; g.fillRect(x + f, y, 3 * u, h); }
      // шторы по краям, иногда — силуэт абажура
      if (rand() < 0.65) {
        g.fillStyle = ['rgba(120,52,32,0.7)', 'rgba(90,70,40,0.7)', 'rgba(70,40,60,0.7)'][Math.floor(rand() * 3)];
        g.fillRect(x, y, w * (0.16 + rand() * 0.12), h); g.fillRect(x + w * (0.82 - rand() * 0.1), y, w * 0.3, h);
      }
      if (rand() < 0.3) { g.fillStyle = 'rgba(60,34,18,0.55)'; g.beginPath(); g.moveTo(x + w * 0.4, y + h * 0.18); g.lineTo(x + w * 0.6, y + h * 0.18); g.lineTo(x + w * 0.66, y + h * 0.36); g.lineTo(x + w * 0.34, y + h * 0.36); g.fill(); }
    } else {
      const sg = g.createLinearGradient(x, y, x + w, y + h);
      sg.addColorStop(0, '#2a3142'); sg.addColorStop(1, '#10131b');
      g.fillStyle = sg; g.fillRect(x, y, w, h);
      // отражение неба — косая светлая полоса; в некоторых окнах видны шторы или жалюзи
      g.fillStyle = 'rgba(120,130,160,0.12)';
      g.beginPath(); g.moveTo(x + w * 0.1, y + h); g.lineTo(x + w * 0.35, y + h); g.lineTo(x + w * 0.75, y); g.lineTo(x + w * 0.5, y); g.fill();
      const dim = rand();
      if (dim < 0.25) { g.fillStyle = 'rgba(80,70,62,0.5)'; g.fillRect(x, y, w * 0.3, h); g.fillRect(x + w * 0.7, y, w * 0.3, h); }
      else if (dim < 0.38) { for (let b = 0; b < h; b += 5 * u) { g.fillStyle = 'rgba(150,146,136,0.35)'; g.fillRect(x, y + b, w, 2.4 * u); } }
    }
    // рама: коробка, импост, форточка
    const fr = 7 * u;
    g.fillStyle = `rgb(${frameC[0]},${frameC[1]},${frameC[2]})`;
    g.fillRect(x, y, w, fr); g.fillRect(x, y + h - fr, w, fr); g.fillRect(x, y, fr, h); g.fillRect(x + w - fr, y, fr, h);
    const split = rand() < 0.5 ? 0.5 : 0.36;
    g.fillRect(x + w * split - fr / 2, y, fr, h);
    if (rand() < 0.6) g.fillRect(x + w * split, y + h * 0.3, w * (1 - split), fr * 0.8);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + fr, y + fr, w - fr * 2, 2 * u);
    // отлив: светлая жесть с тенью снизу
    g.fillStyle = '#9a978f'; g.fillRect(x - rv - 4 * u, y + h + rv * 0.5, w + rv * 2 + 8 * u, 7 * u);
    g.fillStyle = 'rgba(20,18,16,0.5)'; g.fillRect(x - rv - 4 * u, y + h + rv * 0.5 + 7 * u, w + rv * 2 + 8 * u, 4 * u);
    // первый этаж: решётки
    if (ground) {
      g.strokeStyle = 'rgba(30,30,32,0.9)'; g.lineWidth = 3.2 * u;
      for (let b = 1; b < 7; b++) { g.beginPath(); g.moveTo(x + (w * b) / 7, y); g.lineTo(x + (w * b) / 7, y + h); g.stroke(); }
      for (const yy of [0.33, 0.66]) { g.beginPath(); g.moveTo(x, y + h * yy); g.lineTo(x + w, y + h * yy); g.stroke(); }
      g.beginPath(); g.arc(x + w / 2, y + h * 0.33, w * 0.16, Math.PI, 0); g.stroke();
    }
  }
  // цоколь первого этажа — темнее и грязнее
  const pg = g.createLinearGradient(0, H - rh * 0.35, 0, H);
  pg.addColorStop(0, 'rgba(40,36,30,0)'); pg.addColorStop(1, 'rgba(40,36,30,0.55)');
  g.fillStyle = pg; g.fillRect(0, H - rh * 0.35, W, rh * 0.35);
  return toTexture(c);
}

// глухой торец: панели 4 × 2,8 м, швы с мастикой, потёки; 12 м × 3 этажа
function endWall(seed, hi) {
  const rand = rng(seed);
  const W = hi ? 1024 : 512, H = (W * 3) / 4;
  const u = W / 1024;
  const [c, g] = canvas(W, H);
  const pw = W / 3, ph = H / 3;
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
    const v = 0.86 + rand() * 0.16;
    g.fillStyle = `rgb(${142 * v | 0},${136 * v | 0},${124 * v | 0})`; g.fillRect(k * pw, r * ph, pw, ph);
  }
  for (let n = 0; n < 50000 * u * u; n++) {
    g.fillStyle = rand() < 0.5 ? `rgba(30,28,24,${rand() * 0.16})` : `rgba(235,230,220,${rand() * 0.1})`;
    const s = (0.8 + rand() * 2.2) * u * 1.6; g.fillRect(rand() * W, rand() * H, s, s);
  }
  for (let n = 0; n < 18; n++) {
    const x = rand() * W, w = (4 + rand() * 16) * u, h = H * (0.3 + rand() * 0.7);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(36,32,26,0.3)'); gr.addColorStop(1, 'rgba(36,32,26,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, h);
  }
  const sw = 5 * u;
  for (let r = 0; r <= 3; r++) { g.fillStyle = 'rgba(52,50,46,0.75)'; g.fillRect(0, r * ph - sw * 2, W, sw * 4); g.fillStyle = 'rgba(18,17,15,0.85)'; g.fillRect(0, r * ph - sw * 0.5, W, sw); }
  for (let k = 0; k <= 3; k++) { g.fillStyle = 'rgba(52,50,46,0.75)'; g.fillRect(k * pw - sw * 2, 0, sw * 4, H); g.fillStyle = 'rgba(18,17,15,0.85)'; g.fillRect(k * pw - sw * 0.5, 0, sw, H); }
  return toTexture(c);
}

// голое дерево: ветки рекурсивно, на прозрачном фоне — две скрещённые плоскости
function treeTex(seed) {
  const rand = rng(seed);
  const [c, g] = canvas(512, 1024);
  g.clearRect(0, 0, 512, 1024);
  g.strokeStyle = '#1c1915'; g.lineCap = 'round';
  function branch(x, y, len, ang, wdt, depth) {
    const x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len;
    g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.sin(ang + (rand() - 0.5) * 0.4) * len * 0.5, y - Math.cos(ang) * len * 0.5, x2, y2); g.stroke();
    if (depth <= 0 || wdt < 0.8) return;
    const n = depth > 3 ? 2 : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) branch(x2, y2, len * (0.62 + rand() * 0.2), ang + (rand() - 0.5) * 1.2 + (i - (n - 1) / 2) * 0.35, wdt * 0.66, depth - 1);
  }
  branch(256, 1024, 330, (rand() - 0.5) * 0.1, 26, 7);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// двор: тёмная земля с пожухлой травой и тропинками
function yardTex(seed = 77) {
  const rand = rng(seed);
  const t = concrete(seed, [52, 56, 40], 512);
  const g = t.image.getContext('2d');
  for (let n = 0; n < 14000; n++) { g.fillStyle = `rgba(${rand() < 0.5 ? '70,80,44' : '40,34,26'},${0.2 + rand() * 0.3})`; g.fillRect(rand() * 512, rand() * 512, 1.5, 2 + rand() * 3); }
  t.needsUpdate = true;
  return t;
}

// старые бетонные плиты 0,5 м: свой тон у каждой, сколы, трещины, тёмные швы с мхом.
// Текстура плотная (около 5 пикселей на сантиметр) — провал сквозь плиты видно вблизи
function slabs(seed = 63, hi = true) {
  const rand = rng(seed);
  const S = hi ? 1024 : 512, N = 4, cs = S / N, u = S / 512;
  const t = concrete(seed, [126, 122, 116], S);
  const g = t.image.getContext('2d');
  for (let n = 0; n < 30000 * u * u; n++) { g.fillStyle = `rgba(${rand() < 0.5 ? '30,28,24' : '200,196,186'},${rand() * 0.18})`; const s = (0.6 + rand() * 1.8) * u; g.fillRect(rand() * S, rand() * S, s, s); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '20,18,16' : '230,226,216'},${rand() * 0.12})`;
    g.fillRect(x * cs, y * cs, cs, cs);
    if (rand() < 0.35) {
      g.strokeStyle = 'rgba(20,18,16,0.6)'; g.lineWidth = 1.5 * u;
      let px = x * cs + rand() * cs, py = y * cs + rand() * cs;
      g.beginPath(); g.moveTo(px, py);
      for (let j = 0; j < 7; j++) { px += (rand() - 0.5) * 36 * u; py += (rand() - 0.5) * 36 * u; g.lineTo(px, py); }
      g.stroke();
    }
    if (rand() < 0.2) { g.fillStyle = 'rgba(20,18,16,0.5)'; g.beginPath(); g.arc(x * cs + (rand() < 0.5 ? 0 : cs), y * cs + (rand() < 0.5 ? 0 : cs), (10 + rand() * 14) * u, 0, Math.PI * 2); g.fill(); }
    // фаска по краю плиты: светлая сверху-слева, тёмная снизу-справа
    g.fillStyle = 'rgba(230,226,216,0.08)'; g.fillRect(x * cs + 3 * u, y * cs + 3 * u, cs - 6 * u, 3 * u); g.fillRect(x * cs + 3 * u, y * cs + 3 * u, 3 * u, cs - 6 * u);
    g.fillStyle = 'rgba(20,18,16,0.12)'; g.fillRect(x * cs + 3 * u, (y + 1) * cs - 6 * u, cs - 6 * u, 3 * u); g.fillRect((x + 1) * cs - 6 * u, y * cs + 3 * u, 3 * u, cs - 6 * u);
  }
  for (let k = 0; k <= S; k += cs) {
    g.fillStyle = 'rgba(22,20,18,0.8)'; g.fillRect(k - 3 * u, 0, 6 * u, S); g.fillRect(0, k - 3 * u, S, 6 * u);
    g.fillStyle = 'rgba(50,62,30,0.35)'; for (let j = 0; j < 60; j++) { g.fillRect(k - 2 * u + (rand() - 0.5) * 3 * u, rand() * S, 3 * u, 3 * u); g.fillRect(rand() * S, k - 2 * u + (rand() - 0.5) * 3 * u, 3 * u, 3 * u); }
  }
  t.needsUpdate = true;
  return t;
}

// свечение окон: тёплые и яркие пиксели фасада светятся сами
function litWindows(mat, k) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */ `
      #include <emissivemap_fragment>
      #ifdef USE_MAP
        float warm = smoothstep(0.14, 0.3, sampledDiffuseColor.r - sampledDiffuseColor.b) * smoothstep(0.22, 0.5, sampledDiffuseColor.r);
        totalEmissiveRadiance += sampledDiffuseColor.rgb * warm * ${k.toFixed(2)};
      #endif`);
  };
  return mat;
}

// развёртка коробки дома: фасады — по пролётам и этажам, торцы — по 12 м и 3 этажа
function houseGeometry(d, h, w, cols, floors, off) {
  const geo = new THREE.BoxGeometry(d, h, w);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    if (face <= 1) uv.setXY(i, uv.getX(i) * (cols / COLS) + off, uv.getY(i) * (floors / ROWS));
    else if (face >= 4) uv.setXY(i, uv.getX(i) * (d / 12), uv.getY(i) * (floors / 3));
  }
  return geo;
}

function asphalt(seed = 61) {
  const rand = rng(seed);
  const S = 512;
  const [c, g] = canvas(S);
  g.fillStyle = '#2b2a28'; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 30000; k++) { const v = 25 + rand() * 45; g.fillStyle = `rgba(${v},${v},${v * 0.96},0.55)`; g.fillRect(rand() * S, rand() * S, 1.5, 1.5); }
  g.strokeStyle = 'rgba(10,10,9,0.75)'; g.lineWidth = 1.5;
  for (let k = 0; k < 12; k++) {
    let x = rand() * S, y = rand() * S;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 9; j++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(${rand() < 0.5 ? '16,15,14' : '60,58,54'},0.4)`; g.fillRect(rand() * S, rand() * S, 40 + rand() * 120, 30 + rand() * 80); }
  return toTexture(c);
}

function manholeTex() {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#26241f'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3c3933'; g.lineWidth = 6;
  for (let r = 30; r < 120; r += 22) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
  for (let a = 0; a < 8; a++) { g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a * Math.PI / 4) * 120, 128 + Math.sin(a * Math.PI / 4) * 120); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ореол вокруг плафона
function glowTex() {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,190,110,0.9)'); gr.addColorStop(0.25, 'rgba(255,160,70,0.35)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const SkyShader = {
  uniforms: {},
  vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float h = clamp(d.y, -0.2, 1.0);
      vec3 zen = vec3(0.012, 0.016, 0.04), mid = vec3(0.05, 0.05, 0.09), hor = vec3(0.2, 0.12, 0.09);
      vec3 col = mix(hor, mid, smoothstep(0.0, 0.15, h));
      col = mix(col, zen, smoothstep(0.15, 0.6, h));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createStreet({ lowPower = false } = {}) {
  const hi = !lowPower;
  const scene = new THREE.Scene();
  const night = new THREE.Color().setRGB(0.07, 0.065, 0.09);
  scene.background = night.clone();
  // лёгкая дымка вдали, без сплошной мглы: видно дворы и дома второго ряда
  scene.fog = new THREE.FogExp2(night.clone(), 0.019);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({ ...SkyShader, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0x4a5880, 0x1c1814, 1.1));

  const L = 150, Z0 = 40, ROAD = 3.4, WALK = 3.0;
  const XW = ROAD + 0.12 + WALK / 2, XB = ROAD + 0.12 + WALK + 1.2;
  // мокрый асфальт: блики от фонарей
  const roadTex = asphalt(); roadTex.repeat.set(1.6, L / 4.5);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, L), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.42, metalness: 0 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, Z0 - L / 2);
  scene.add(road);
  // стёртая разметка по оси и люки
  const paint = new THREE.MeshStandardMaterial({ color: 0x8f8b80, roughness: 0.6, transparent: true, opacity: 0.55 });
  const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 2.6), paint, Math.floor(L / 8));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < dash.count; i++) dash.setMatrixAt(i, m.compose(new THREE.Vector3(0, 0.004, Z0 - i * 8), q, one));
  scene.add(dash);
  const mh = new THREE.MeshStandardMaterial({ map: manholeTex(), transparent: true, roughness: 0.35, metalness: 0.4 });
  for (const [x, z] of [[-1.3, 22], [1.6, -4], [-1.0, -32]]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), mh);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.006, z); scene.add(d);
  }
  // бордюрный камень по метру, тротуар из плит, полоса газона у домов
  const curbMat = new THREE.MeshStandardMaterial({ map: concrete(65, [150, 146, 138], 256), roughness: 0.8 });
  const curb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.16, 0.98), curbMat, Math.ceil(L) * 2);
  let ci = 0;
  for (const sx of [-1, 1]) for (let z = 0; z < L; z++) curb.setMatrixAt(ci++, m.makeTranslation(sx * (ROAD + 0.11), 0.08, Z0 - z - 0.5));
  scene.add(curb);
  const walkTex = slabs(63, hi); walkTex.repeat.set(WALK / 2, L / 2);
  walkTex.anisotropy = 16;
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.75 });
  // двор за домами: земля с пожухлой травой до второго ряда домов
  const yardMat = new THREE.MeshLambertMaterial({ map: yardTex() });
  yardMat.map.repeat.set(70 / 5, L / 5);
  for (const sx of [-1, 1]) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(WALK, L), walkMat);
    walk.rotation.x = -Math.PI / 2; walk.position.set(sx * XW, 0.15, Z0 - L / 2); scene.add(walk);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(70, L + 40), yardMat);
    yard.rotation.x = -Math.PI / 2; yard.position.set(sx * (XB - 1.2 + 35), 0.12, Z0 - L / 2); scene.add(yard);
  }

  // фасады — четыре общих варианта (по два на сторону), торцы глухие, крыша — рубероид
  const facades = [0, 1, 2, 3].map((v) => litWindows(new THREE.MeshLambertMaterial({ map: facade(80 + v * 7, hi) }), 1.7));
  const endMat = new THREE.MeshLambertMaterial({ map: endWall(41, hi) });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x1e1d1b });
  const house = (sx, d, cols, floors, x, z, v, off) => {
    const w = cols * 3.2, h = floors * 2.8;
    const fm = facades[v];
    const b = new THREE.Mesh(houseGeometry(d, h, w, cols, floors, off), [fm, fm, roofMat, roofMat, endMat, endMat]);
    b.position.set(x, h / 2, z - w / 2);
    scene.add(b);
    return { w, h };
  };

  // панельные дома по обе стороны: балконы, подъезды с козырьками и лампочкой, парапет,
  // водосточные трубы, кондиционеры; в просветах между домами — деревья и второй ряд домов
  const rand = rng(71);
  const balconyMat = new THREE.MeshLambertMaterial({ map: concrete(73, [120, 116, 108], 256) });
  const balconies = [];
  const porchLights = [];
  const pipes = [], acs = [], trees = [];
  for (const sx of [-1, 1]) {
    let z = Z0 + 4;
    let k = 0;
    while (z > Z0 - L) {
      const cols = 6 + Math.floor(rand() * 4), floors = 5 + Math.floor(rand() * 5);
      const d = 12;
      const bx = sx * (XB + d / 2);
      const { w, h } = house(sx, d, cols, floors, bx, z, (sx > 0 ? 0 : 2) + (k % 2), Math.floor(rand() * 4) / 4);
      const par = new THREE.Mesh(new THREE.BoxGeometry(d + 0.3, 0.5, w + 0.3), balconyMat);
      par.position.set(bx, h + 0.25, z - w / 2); scene.add(par);
      const face = sx * XB; // фасад на улицу
      pipes.push([face - sx * 0.1, h, z - 0.25], [face - sx * 0.1, h, z - w + 0.25]);
      for (let fl = 1; fl < floors; fl++) for (let cc = 0; cc < cols; cc++) {
        const r = rand();
        if (r < 0.3) balconies.push([face - sx * 0.55, fl * 2.8 + 0.05, z - (cc + 0.5) * 3.2]);
        else if (r < 0.4) acs.push([face - sx * 0.17, fl * 2.8 + 0.55, z - (cc + 0.5) * 3.2 + 1.05]);
      }
      // подъезд
      const dz = z - w * (0.3 + rand() * 0.4);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshLambertMaterial({ color: 0x2a2622, emissive: 0x3a2a14, emissiveIntensity: 0.4 }));
      door.position.set(face - sx * 0.01, 1.1, dz); door.rotation.y = -sx * Math.PI / 2; scene.add(door);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 2.4), balconyMat);
      canopy.position.set(face - sx * 0.7, 2.55, dz); scene.add(canopy);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.2) }));
      bulb.position.set(face - sx * 0.15, 2.35, dz); scene.add(bulb);
      porchLights.push(new THREE.Vector3(face - sx * 0.6, 2.2, dz));
      const gap = 7 + rand() * 9;
      // деревья в просвете между домами
      for (let t = 0; t < 2; t++) if (rand() < 0.8) trees.push([sx * (XB + 1.5 + rand() * 9), z - w - gap * (0.25 + t * 0.5), 6 + rand() * 4, rand() * Math.PI]);
      z -= w + gap;
      k++;
    }
    // второй ряд домов за двором: видно в просветах и над крышами низких домов
    z = Z0 + 14;
    while (z > Z0 - L - 10) {
      const cols = 8 + Math.floor(rand() * 7), floors = 9 + Math.floor(rand() * 5);
      const d = 12, bx = sx * (XB + 30 + d / 2);
      const { w } = house(sx, d, cols, floors, bx, z, Math.floor(rand() * 4), Math.floor(rand() * 4) / 4);
      z -= w + 5 + rand() * 8;
    }
  }
  // балконы: плита и бетонное ограждение спереди
  const slabG = new THREE.BoxGeometry(1.1, 0.12, 2.8), frontG = new THREE.BoxGeometry(0.06, 1.0, 2.8);
  const bs = new THREE.InstancedMesh(slabG, balconyMat, balconies.length), bf = new THREE.InstancedMesh(frontG, balconyMat, balconies.length);
  balconies.forEach(([x, y, z], i) => {
    bs.setMatrixAt(i, m.makeTranslation(x, y, z));
    bf.setMatrixAt(i, m.makeTranslation(x - Math.sign(x) * 0.52, y + 0.56, z));
  });
  scene.add(bs, bf);
  // водосточные трубы по углам фасадов
  const pipeMat = new THREE.MeshLambertMaterial({ color: 0x5b5a56 });
  const pipeG = new THREE.CylinderGeometry(0.055, 0.055, 1, 8);
  const pm = new THREE.InstancedMesh(pipeG, pipeMat, pipes.length);
  const sc = new THREE.Vector3(), qp = new THREE.Quaternion();
  pipes.forEach(([x, h, z], i) => pm.setMatrixAt(i, m.compose(new THREE.Vector3(x, h / 2 + 0.1, z), qp, sc.set(1, h + 0.3, 1))));
  scene.add(pm);
  // наружные блоки кондиционеров с решёткой вентилятора
  const acTex = (() => {
    const [c, g] = canvas(128, 96);
    g.fillStyle = '#c4c3bd'; g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(46, 48, 34, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8d8c86'; g.lineWidth = 2; for (let r = 8; r < 34; r += 6) { g.beginPath(); g.arc(46, 48, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(60,50,40,0.35)'; g.fillRect(0, 80, 128, 16);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const acMat = new THREE.MeshLambertMaterial({ color: 0xb9b8b2 });
  const acFace = new THREE.MeshLambertMaterial({ map: acTex });
  const ac = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.55, 0.78), [acFace, acFace, acMat, acMat, acMat, acMat], acs.length);
  acs.forEach(([x, y, z], i) => ac.setMatrixAt(i, m.makeTranslation(x, y, z)));
  scene.add(ac);
  // голые деревья: две скрещённые плоскости, силуэт веток на фоне окон
  const treeMats = [treeTex(5), treeTex(19)].map((map) => new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x9a9a9a }));
  const treeG = new THREE.PlaneGeometry(1, 2); treeG.translate(0, 1, 0);
  trees.forEach(([x, z, s, a], i) => {
    for (const r of [0, Math.PI / 2]) {
      const p = new THREE.Mesh(treeG, treeMats[i % 2]);
      p.scale.set(s * 0.55, s * 0.55, 1); p.position.set(x, 0.1, z); p.rotation.y = a + r;
      scene.add(p);
    }
  });
  for (const p of porchLights.slice(0, 4)) { const l = new THREE.PointLight(0xffb066, 3, 7, 2); l.position.copy(p); scene.add(l); }

  // фонари: столб, изогнутый кронштейн, плафон «кобра» со светящимся стеклом и ореолом
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3e4143, roughness: 0.6, metalness: 0.4 });
  const glow = glowTex();
  const lamps = [];
  for (let i = 0; i < 7; i++) for (const sx of [1, -1]) {
    if (sx < 0 && i % 2) continue; // на дальней стороне — реже: переулок тёмный
    const z = Z0 - 4 - i * 24 - (sx < 0 ? 12 : 0);
    const px = sx * (ROAD + 0.55);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 7.2, 12), poleMat);
    pole.position.set(px, 3.6, z);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(px, 7.1, z), new THREE.Vector3(px, 7.7, z), new THREE.Vector3(px - sx * 1.4, 7.5, z)), 16, 0.045, 8), poleMat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), poleMat);
    head.scale.set(0.42, 0.1, 0.2); head.position.set(px - sx * 1.55, 7.45, z);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.8) }));
    lens.scale.set(0.34, 0.15, 1); lens.rotation.x = Math.PI / 2; lens.position.set(px - sx * 1.55, 7.36, z);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    halo.scale.set(2.4, 2.4, 1); halo.position.set(px - sx * 1.55, 7.2, z);
    scene.add(pole, arm, head, lens, halo);
    lamps.push({ pos: new THREE.Vector3(px - sx * 1.55, 7.1, z), lens, halo, flick: i === 2 && sx > 0 });
  }
  const lights = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffa64a, 0, 22, 1.6); scene.add(l); return l; });

  const START = new THREE.Vector3(XW + 0.4, 1.75, 31);
  const black = new THREE.Color(0x000000);
  function update(now, t, camera, kick) {
    // фонари рядом; один мигает всегда; когда «рвёт» плёнку — гаснут все
    const tear = THREE.MathUtils.smoothstep(t, 2.8, 3.8);
    const near = lamps.slice().sort((a, b) => Math.abs(a.pos.z - camera.position.z) - Math.abs(b.pos.z - camera.position.z));
    for (const lp of lamps) {
      const off = (lp.flick && Math.sin(now * 23) > 0.7) || (tear > 0 && Math.sin(now * 47 + lp.pos.z) > 1 - tear * 1.4);
      lp.on = off ? (lp.flick ? 0.05 : 0.45) : 1; // при сбое фонари только мигают — улица не темнеет
      lp.lens.material.color.setRGB(3.2 * lp.on, 1.9 * lp.on, 0.8 * lp.on);
      lp.halo.material.opacity = 0.8 * lp.on;
    }
    lights.forEach((l, i) => { const lp = near[i]; l.position.copy(lp.pos); l.intensity = 55 * lp.on; });
    if (tear > 0 && Math.random() < tear * 0.08) kick(0.2 + tear * 0.4);
    // под асфальтом — пустота
    const under = camera.position.y < 0.12;
    scene.background.copy(under ? black : night);
    scene.fog.color.copy(under ? black : night);
    scene.fog.density = under ? 0.9 : 0.03;
  }

  return {
    scene, update, START,
    bloom: { strength: 0.75, radius: 0.6, threshold: 0.85 },
    exposure: 1.05,
    grade: { tint: [1.02, 0.98, 0.94], sat: 0.84 },
  };
}
