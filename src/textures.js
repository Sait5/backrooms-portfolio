// Процедурные текстуры: мозаика бассейна, брусчатка и бетон парковки, сталь лифта, корпус
// телевизора, сайдинг и черепица домиков, трава, надписи краской. Всё рисуется на canvas —
// без скачиваемых картинок.
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// большие текстуры считаются кусками и отдают кадр браузеру — пока в фоне готовится следующий
// уровень, прогулка по текущему не подлагивает
export function slicer(budget = 7) {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 < budget) return;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
  };
}
const noTick = async () => {};

export function toTexture(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// бесшовный value-noise: сетка случайных чисел с плавной интерполяцией, несколько октав
function noiseField(w, h, cells, octaves, rand) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const gx = cells << o, gy = Math.max(1, Math.round(cells * h / w)) << o;
    const g = new Float32Array(gx * gy).map(() => rand());
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * gy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % gy) * gx, r1 = ((y0 + 1) % gy) * gx;
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * gx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % gx, c1 = (x0 + 1) % gx;
        const a = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * sx;
        const b = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * sx;
        out[y * w + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// карта нормалей из карты высот (бесшовно)
async function normalFromHeight(hgt, w, h, strength, tick = noTick) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    if ((y & 7) === 0) await tick();
    for (let x = 0; x < w; x++) {
      const l = hgt[y * w + ((x - 1 + w) % w)], r = hgt[y * w + ((x + 1) % w)];
      const u = hgt[((y - 1 + h) % h) * w + x], d = hgt[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = nz * 255; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(values, w, h) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = values[i] * 255; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c;
}

// --- мозаика бассейна: 16×16 глазурованных плиток, у каждой свой тон и лёгкий перекос
// (поэтому отражения «ломаются» на стыках, как у настоящей плитки), швы утоплены и
// чуть грязнее, кое-где сколы на углах и волосяные трещины ---
export async function poolTiles(seed = 3, S = 2048, { N = 16, tick = noTick } = {}) {
  const rand = rng(seed);
  const cell = S / N, grout = Math.max(3, Math.round(S / 300)), bev = grout * 1.4;
  // шум плавный — считаем его в четверть разрешения и читаем с интерполяцией
  const q = S / 4;
  const fineQ = noiseField(q, q, 32, 3, rand);
  await tick();
  const stainQ = noiseField(q, q, 3, 3, rand);
  await tick();
  const lookup = (f, x, y) => {
    const fx = x / 4, fy = y / 4, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const x1 = (x0 + 1) % q, y1 = (y0 + 1) % q;
    const a = f[y0 * q + x0] + (f[y0 * q + x1] - f[y0 * q + x0]) * tx;
    const b = f[y1 * q + x0] + (f[y1 * q + x1] - f[y1 * q + x0]) * tx;
    return a + (b - a) * ty;
  };
  const tiles = Array.from({ length: N * N }, () => {
    const k = rand();
    return {
      tone: 0.925 + rand() * 0.07,
      tint: k < 0.07 ? [0.965, 0.995, 1.0] : k < 0.12 ? [1.0, 0.985, 0.955] : [0.985, 1.0, 1.0],
      tx: (rand() - 0.5) * 0.09, ty: (rand() - 0.5) * 0.09,
      chip: rand() < 0.035 ? Math.floor(rand() * 4) : -1,
      crack: rand() < 0.02 ? [rand() * cell, rand() * cell, rand() * Math.PI] : null,
    };
  });
  const [c, g] = canvas(S);
  const img = g.createImageData(S, S);
  const hgt = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    if ((y & 7) === 0) await tick();
    const ty = Math.floor(y / cell), ly = y - ty * cell;
    for (let x = 0; x < S; x++) {
      const tx = Math.floor(x / cell), lx = x - tx * cell;
      const t = tiles[ty * N + tx];
      const e = Math.min(lx, ly, cell - 1 - lx, cell - 1 - ly) - grout / 2;
      // скол угла: четверть круга на одном из углов плитки
      let chipped = false;
      if (t.chip >= 0) {
        const cx = t.chip & 1 ? cell : 0, cy = t.chip & 2 ? cell : 0;
        chipped = Math.hypot(lx - cx, ly - cy) < cell * 0.13;
      }
      let crack = 0;
      if (t.crack) {
        const [ax, ay, an] = t.crack;
        const d = Math.abs((lx - ax) * Math.sin(an) - (ly - ay) * Math.cos(an));
        crack = d < 0.8 ? 1 : 0;
      }
      const i = y * S + x;
      const n = lookup(fineQ, x, y), st = lookup(stainQ, x, y);
      let r, gg, b, h, ro;
      if (e < 0 || chipped) {
        const v = (chipped ? 0.74 : 0.7) + n * 0.08 - st * 0.08;
        r = v * 0.99; gg = v; b = v * 0.96;
        h = chipped ? 0.25 : 0; ro = 0.92;
      } else {
        const bevel = Math.min(1, e / bev);
        const k = t.tone * (0.986 + n * 0.028) * (0.97 + 0.03 * bevel) - st * 0.025;
        r = k * t.tint[0]; gg = k * t.tint[1]; b = k * t.tint[2];
        if (crack) { r *= 0.8; gg *= 0.8; b *= 0.8; }
        h = 0.55 + 0.45 * Math.sin(bevel * Math.PI / 2) + t.tx * (lx / cell - 0.5) + t.ty * (ly / cell - 0.5);
        ro = crack ? 0.6 : 0.05 + n * 0.08 + st * 0.05;
      }
      img.data[i * 4] = Math.min(255, r * 255); img.data[i * 4 + 1] = Math.min(255, gg * 255); img.data[i * 4 + 2] = Math.min(255, b * 255); img.data[i * 4 + 3] = 255;
      hgt[i] = h; rough[i] = ro;
    }
  }
  g.putImageData(img, 0, 0);
  await tick();
  const roughC = grayCanvas(rough, S, S);
  await tick();
  const normalC = await normalFromHeight(hgt, S, S, S / 360, tick);
  return {
    map: toTexture(c),
    rough: toTexture(roughC, { srgb: false }),
    normal: toTexture(normalC, { srgb: false }),
  };
}

// --- брусчатка «ёлочкой» для продолжения парковки ---
export function pavers(seed = 5) {
  const rand = rng(seed);
  const S = 1024, u = 32; // кирпичик 2u × u
  const [c, g] = canvas(S);
  const nz = noiseField(S, S, 8, 5, rand);
  g.fillStyle = '#4a4844'; g.fillRect(0, 0, S, S);
  for (let row = -2; row < S / u + 2; row++) {
    for (let col = -2; col < S / (2 * u) + 2; col++) {
      const ox = col * 2 * u + row * u, oy = row * u;
      for (const [x, y, w, h] of [[ox, oy, 2 * u, u], [ox + u, oy - u, u, 2 * u]]) {
        const v = 112 + rand() * 30;
        g.fillStyle = `rgb(${v},${v * 0.98},${v * 0.93})`;
        for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) g.fillRect(((x % S) + S) % S + dx + 2, ((y % S) + S) % S + dy + 2, w - 4, h - 4);
      }
    }
  }
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const k = 0.78 + nz[i] * 0.4;
    img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 14; k++) {
    const x = rand() * S, y = rand() * S, r = 20 + rand() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(20,18,14,0.45)'); gr.addColorStop(1, 'rgba(20,18,14,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c);
}

// --- бетон: потолок, колонны, стены ---
export function concrete(seed = 9, base = [150, 148, 142], size = 512) {
  const rand = rng(seed);
  const [c, g] = canvas(size);
  const nz = noiseField(size, size, 6, 6, rand);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const k = 0.72 + nz[i] * 0.5 + (rand() - 0.5) * 0.06;
    img.data[i * 4] = base[0] * k; img.data[i * 4 + 1] = base[1] * k; img.data[i * 4 + 2] = base[2] * k; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 40; k++) {
    const x = rand() * size, w = 2 + rand() * 6, h = 40 + rand() * 200;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(40,36,30,0.18)'); gr.addColorStop(1, 'rgba(40,36,30,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, h);
  }
  return toTexture(c);
}

// --- бетон по опалубке: отпечатки досок, стыки щитов, отверстия от стяжек, потёки — так
// выглядят потолки и балки настоящих подземных парковок ---
export function formwork(seed = 91, S = 1024) {
  const rand = rng(seed);
  const t = concrete(seed, [150, 147, 140], S);
  const g = t.image.getContext('2d');
  const board = S / 16;
  for (let r = 0; r < 16; r++) {
    const v = rand() * 0.08;
    g.fillStyle = `rgba(${rand() < 0.5 ? '40,38,34' : '220,216,206'},${v})`;
    g.fillRect(0, r * board, S, board);
    g.fillStyle = 'rgba(40,38,34,0.28)'; g.fillRect(0, r * board, S, 2);
    let x = rand() * S * 0.5;
    while (x < S) { g.fillRect(x, r * board, 2, board); x += S * (0.35 + rand() * 0.6); }
  }
  // стыки больших щитов и отверстия от стяжек
  g.fillStyle = 'rgba(30,28,25,0.45)';
  g.fillRect(0, S / 2 - 2, S, 4); g.fillRect(S / 2 - 2, 0, 4, S);
  for (let y = S / 8; y < S; y += S / 4) for (let x = S / 8; x < S; x += S / 4) {
    const gr = g.createRadialGradient(x, y, 1, x, y, 9);
    gr.addColorStop(0, 'rgba(20,18,16,0.85)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr; g.fillRect(x - 10, y - 10, 20, 20);
  }
  // влажные пятна
  for (let k = 0; k < 10; k++) {
    const x = rand() * S, y = rand() * S, r = 30 + rand() * 120;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(60,52,36,0.22)'); gr.addColorStop(1, 'rgba(60,52,36,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  t.needsUpdate = true;
  return t;
}

// --- колонна: бетон, внизу полосы «зебра» красно-белые, как на настоящей парковке ---
export function columnSkin(seed = 11) {
  const rand = rng(seed);
  const W = 256, H = 1024;
  const [c, g] = canvas(W, H);
  const conc = concrete(seed, [158, 156, 150], 256).image;
  for (let y = 0; y < H; y += 256) g.drawImage(conc, 0, y);
  g.fillStyle = 'rgba(96,108,122,0.85)'; g.fillRect(0, H * 0.84, W, H * 0.16);
  g.save();
  g.beginPath(); g.rect(0, H * 0.56, W, H * 0.26); g.clip();
  g.fillStyle = '#e9e4da'; g.fillRect(0, H * 0.56, W, H * 0.26);
  g.fillStyle = '#d8502a';
  for (let k = -6; k < 12; k++) {
    g.beginPath();
    const y0 = H * 0.56 + k * 64;
    g.moveTo(0, y0); g.lineTo(W, y0 - 110); g.lineTo(W, y0 - 70); g.lineTo(0, y0 + 40); g.fill();
  }
  g.restore();
  for (let k = 0; k < 90; k++) {
    g.fillStyle = `rgba(30,28,24,${rand() * 0.25})`;
    g.fillRect(rand() * W, H * 0.5 + rand() * H * 0.5, 1 + rand() * 4, 1 + rand() * 4);
  }
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// износ краски: царапины, облупившиеся пятна, следы шин
function wear(g, w, h, rand, amount = 1) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 420 * amount; k++) { g.globalAlpha = 0.3 + rand() * 0.7; g.fillRect(rand() * w, rand() * h, 1 + rand() * 6, 1 + rand() * 3); }
  for (let k = 0; k < 18 * amount; k++) {
    g.globalAlpha = 0.25 + rand() * 0.4;
    g.lineWidth = 1 + rand() * 3;
    g.beginPath(); const x = rand() * w, y = rand() * h; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * w * 0.5, y + (rand() - 0.5) * h * 0.3); g.stroke();
  }
  g.restore();
}

const SIGN_FONT = '"Oswald", "Arial Narrow", sans-serif';

// табличка на пилоне: жёлтая полоса краской, чёрные трафаретные буквы, потёртости
export function paintSign(text, { w = 1024, h = 300, seed = 13, bg = '#e7b521', fg = '#15130f', code = '' } = {}) {
  const rand = rng(seed);
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  // полоса с неровными краями (валик)
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(8, 10 + rand() * 6);
  for (let x = 8; x <= w - 8; x += 24) g.lineTo(x, 8 + rand() * 7);
  for (let x = w - 8; x >= 8; x -= 24) g.lineTo(x, h - 8 - rand() * 7);
  g.closePath(); g.fill();
  // потёки снизу
  for (let k = 0; k < 6; k++) { const x = 30 + rand() * (w - 60); g.fillRect(x, h - 14, 3, 6 + rand() * 18); }
  // буквы
  let size = h * 0.62;
  g.font = `700 ${size}px ${SIGN_FONT}`;
  const pad = code ? w * 0.2 : 0;
  while (g.measureText(text).width > (w - pad) * 0.84 && size > 20) { size -= 4; g.font = `700 ${size}px ${SIGN_FONT}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = fg;
  const cx = (w + pad) / 2, cy = h / 2 + size * 0.04;
  g.fillText(text, cx, cy);
  if (code) {
    g.fillRect(w * 0.035, h * 0.18, pad - w * 0.06, h * 0.64);
    g.fillStyle = bg; g.font = `700 ${h * 0.4}px ${SIGN_FONT}`;
    g.fillText(code, w * 0.035 + (pad - w * 0.06) / 2, h / 2 + 2);
  }
  // перемычки трафарета — горизонтальный разрыв посередине букв
  g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = bg;
  g.fillRect(pad, cy - size * 0.03, w - pad, size * 0.05);
  g.restore();
  wear(g, w, h, rand, 0.8);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// разметка на полу: большие буквы краской, стрелка, рамка, следы шин поверх
export function floorMark(text, { w = 1024, h = 320, seed = 17, color = '#ece4c8' } = {}) {
  const rand = rng(seed);
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 10;
  g.strokeRect(14, 14, w - 28, h - 28);
  let size = h * 0.6;
  g.font = `700 ${size}px ${SIGN_FONT}`;
  while (g.measureText(text).width > w * 0.66 && size > 20) { size -= 4; g.font = `700 ${size}px ${SIGN_FONT}`; }
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(text, w * 0.08, h / 2 + 4);
  // стрелка по ходу движения
  const ax = w * 0.86, ay = h / 2;
  g.beginPath(); g.moveTo(ax - 70, ay - 40); g.lineTo(ax, ay); g.lineTo(ax - 70, ay + 40); g.lineTo(ax - 70, ay + 16); g.lineTo(ax - 140, ay + 16); g.lineTo(ax - 140, ay - 16); g.lineTo(ax - 70, ay - 16); g.closePath(); g.fill();
  wear(g, w, h, rand, 1.3);
  // следы шин: тёмные полосы
  for (let k = 0; k < 2; k++) {
    const y = h * (0.25 + rand() * 0.5);
    g.fillStyle = 'rgba(20,18,14,0.35)';
    g.fillRect(0, y, w, 26 + rand() * 20);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// надпись краской прямо по полу парковки, как на настоящих: жёлтый трафарет с перемычками,
// поперечные полосы сверху и снизу, бетон проступает сквозь краску, поверх — продольные следы
// шин. Буквы на плоскости потом вытягиваются по ходу движения — издалека читаются ровно
export function floorStencil(text, { w = 1024, h = 1024, seed = 29, color = '#d8b23c' } = {}) {
  const rand = rng(seed);
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  // полосы-рамки поперёк проезда
  for (const y of [h * 0.04, h * 0.9]) g.fillRect(w * 0.04, y, w * 0.92, h * 0.06);
  let size = h * 0.62;
  g.font = `700 ${size}px ${SIGN_FONT}`;
  while (g.measureText(text).width > w * 0.84 && size > 20) { size -= 6; g.font = `700 ${size}px ${SIGN_FONT}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cy = h * 0.5 + size * 0.04;
  g.fillText(text, w / 2, cy);
  // перемычки трафарета
  g.save(); g.globalCompositeOperation = 'destination-out';
  g.fillRect(0, cy - size * 0.03, w, size * 0.045);
  for (let k = 0; k < 9; k++) g.fillRect(w * (0.08 + k * 0.105), h * 0.03, w * 0.012, h * 0.08);
  for (let k = 0; k < 9; k++) g.fillRect(w * (0.08 + k * 0.105), h * 0.89, w * 0.012, h * 0.08);
  // краска стёрта: зерно бетона, сколы, полосы износа по колеям
  for (let k = 0; k < 18000; k++) { g.globalAlpha = 0.1 + rand() * 0.6; const s = 1 + rand() * 3; g.fillRect(rand() * w, rand() * h, s, s); }
  for (let k = 0; k < 160; k++) { g.globalAlpha = 0.4 + rand() * 0.5; g.beginPath(); g.arc(rand() * w, rand() * h, 3 + rand() * 14, 0, Math.PI * 2); g.fill(); }
  for (const x of [w * (0.22 + rand() * 0.05), w * (0.7 + rand() * 0.05)]) {
    const gr = g.createLinearGradient(x - w * 0.09, 0, x + w * 0.09, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x - w * 0.09, 0, w * 0.18, h);
  }
  g.restore();
  // следы шин поверх краски
  g.globalCompositeOperation = 'source-atop';
  for (const x of [w * 0.24, w * 0.72]) {
    g.fillStyle = 'rgba(24,20,16,0.28)'; g.fillRect(x - w * 0.06, 0, w * 0.12, h);
    for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(16,14,12,0.18)'; g.fillRect(x - w * 0.06 + rand() * w * 0.12, 0, 2, h); }
  }
  g.globalCompositeOperation = 'source-over';
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  return t;
}

// --- шлифованная сталь: двери и стенки лифта ---
export function brushedSteel(seed = 31, S = 512) {
  const rand = rng(seed);
  const [c, g] = canvas(S);
  g.fillStyle = '#9ea3a6'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    const v = 140 + (rand() - 0.5) * 40;
    g.fillStyle = `rgba(${v},${v + 3},${v + 6},0.5)`;
    g.fillRect(0, y, S, 1);
  }
  for (let k = 0; k < 900; k++) {
    const v = 170 + rand() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(rand() * S, rand() * S, 20 + rand() * 120, 1);
  }
  // отпечатки и пятна
  for (let k = 0; k < 20; k++) {
    const x = rand() * S, y = rand() * S, r = 10 + rand() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(60,62,64,0.18)'); gr.addColorStop(1, 'rgba(60,62,64,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c);
}

// сталь под открытым небом: потёки ржавчины от крыши, пыль снизу
export function weatheredSteel(seed = 47) {
  const rand = rng(seed);
  const t = brushedSteel(seed, 512);
  const g = t.image.getContext('2d');
  for (let k = 0; k < 40; k++) {
    const x = rand() * 512, w = 3 + rand() * 14, h = 60 + rand() * 300;
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `rgba(${120 + rand() * 40},${60 + rand() * 20},${24},${0.35 + rand() * 0.3})`); gr.addColorStop(1, 'rgba(120,60,24,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, h);
  }
  const gr = g.createLinearGradient(0, 380, 0, 512);
  gr.addColorStop(0, 'rgba(80,70,50,0)'); gr.addColorStop(1, 'rgba(80,70,50,0.45)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  t.needsUpdate = true;
  return t;
}

// резиновый пол лифта с круглыми выступами
export function studRubber(S = 256) {
  const [c, g] = canvas(S);
  g.fillStyle = '#26262a'; g.fillRect(0, 0, S, S);
  const step = S / 8;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const gr = g.createRadialGradient(x * step + step / 2 - 3, y * step + step / 2 - 3, 1, x * step + step / 2, y * step + step / 2, step * 0.32);
    gr.addColorStop(0, '#4a4a50'); gr.addColorStop(1, '#2c2c31');
    g.fillStyle = gr; g.beginPath(); g.arc(x * step + step / 2, y * step + step / 2, step * 0.3, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c);
}

// --- корпус телевизора: пластик с крапом, желтизной и грязью; передняя панель с решёткой
// динамика, кнопками каналов и надписью ---
export function tvPlastic(seed = 41, base = [214, 204, 184]) {
  const rand = rng(seed);
  const S = 512;
  const [c, g] = canvas(S);
  const nz = noiseField(S, S, 8, 4, rand);
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const y = Math.floor(i / S) / S;
    const k = 0.94 + nz[i] * 0.08 + (rand() - 0.5) * 0.05 - y * 0.06;
    img.data[i * 4] = base[0] * k; img.data[i * 4 + 1] = base[1] * k; img.data[i * 4 + 2] = base[2] * k * 0.98; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 70; k++) { g.strokeStyle = `rgba(90,80,60,${0.05 + rand() * 0.12})`; g.lineWidth = 1; g.beginPath(); const x = rand() * S, y = rand() * S; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 20); g.stroke(); }
  return toTexture(c);
}

export function tvFront(label = 'СИГНАЛ', seed = 43, base = '#d6ccb6') {
  const rand = rng(seed);
  const W = 512, H = 400;
  const [c, g] = canvas(W, H);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // крап пластика
  for (let k = 0; k < 6000; k++) { const v = 150 + rand() * 80; g.fillStyle = `rgba(${v},${v * 0.96},${v * 0.88},0.18)`; g.fillRect(rand() * W, rand() * H, 1.5, 1.5); }
  // правая панель: решётка динамика из отверстий
  g.fillStyle = 'rgba(20,18,15,0.85)';
  for (let y = 0; y < 10; y++) for (let x = 0; x < 6; x++) { g.beginPath(); g.arc(W * 0.82 + x * 11, H * 0.52 + y * 11, 3, 0, Math.PI * 2); g.fill(); }
  // кнопки каналов
  for (let k = 0; k < 6; k++) {
    g.fillStyle = '#3a3630'; g.fillRect(W * 0.8 + (k % 3) * 22, H * 0.84 + Math.floor(k / 3) * 22, 17, 15);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(W * 0.8 + (k % 3) * 22, H * 0.84 + Math.floor(k / 3) * 22, 17, 3);
  }
  // надпись и полоска
  g.fillStyle = '#6a6254'; g.font = `600 22px ${SIGN_FONT}`; g.textAlign = 'center';
  g.fillText(label, W * 0.86, H * 0.12);
  g.fillStyle = '#b04030'; g.fillRect(W * 0.78, H * 0.16, W * 0.17, 3);
  // грязь снизу
  const gr = g.createLinearGradient(0, H * 0.7, 0, H);
  gr.addColorStop(0, 'rgba(80,70,50,0)'); gr.addColorStop(1, 'rgba(80,70,50,0.2)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return toTexture(c);
}

// шнур: тёмная резина с продольным блеском и едва заметной оплёткой
export function cableRubber() {
  const W = 256, H = 64;
  const [c, g] = canvas(W, H);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#0d0d0e'); gr.addColorStop(0.45, '#2a2a2c'); gr.addColorStop(0.55, '#202022'); gr.addColorStop(1, '#0b0b0c');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 6) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x, 0, 2, H); }
  const t = toTexture(c);
  return t;
}

// --- сайдинг домика: горизонтальные доски с тенью под каждой ---
export function siding(seed = 17, color = [222, 190, 92]) {
  const rand = rng(seed);
  const S = 512, board = 32;
  const [c, g] = canvas(S);
  const nz = noiseField(S, S, 4, 5, rand);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    const ly = y % board;
    const shade = ly < 3 ? 0.62 : 0.9 + (ly / board) * 0.12;
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, k = shade * (0.93 + nz[y * S + x] * 0.14);
      img.data[i] = color[0] * k; img.data[i + 1] = color[1] * k; img.data[i + 2] = color[2] * k; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(70,52,10,0.35)';
  for (let row = 0; row < S / board; row++) {
    const x = (rand() * S) | 0;
    g.fillRect(x, row * board + 3, 2, board - 3);
  }
  const gr = g.createLinearGradient(0, S * 0.6, 0, S);
  gr.addColorStop(0, 'rgba(70,60,30,0)'); gr.addColorStop(1, 'rgba(70,60,30,0.12)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return toTexture(c);
}

// --- рубероидная черепица ---
export function shingles(seed = 19) {
  const rand = rng(seed);
  const S = 512, row = 26, tab = 48;
  const [c, g] = canvas(S);
  g.fillStyle = '#2d2a27'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < S / row; r++) {
    const off = (r % 2) * tab / 2;
    for (let x = -tab; x < S + tab; x += tab) {
      const v = 58 + rand() * 26;
      g.fillStyle = `rgb(${v},${v * 0.94},${v * 0.88})`;
      g.fillRect(x + off + 1, r * row + 2, tab - 2, row - 2);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + off, r * row + row - 4, tab, 4);
    }
  }
  for (let k = 0; k < 4000; k++) {
    const v = 40 + rand() * 90;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  return toTexture(c);
}

// --- кирпич для трубы ---
export function brick(seed = 23) {
  const rand = rng(seed);
  const S = 256, bh = 16, bw = 48;
  const [c, g] = canvas(S);
  g.fillStyle = '#9a9187'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < S / bh; r++) {
    for (let x = -bw; x < S; x += bw) {
      const v = rand();
      g.fillStyle = `rgb(${120 + v * 40},${58 + v * 20},${44 + v * 14})`;
      g.fillRect(x + (r % 2) * bw / 2 + 1, r * bh + 1, bw - 2, bh - 2);
    }
  }
  return toTexture(c);
}

// --- газон сверху: под травой — тёмная земля с сухой подстилкой; поверх — травинки кустиками
// (в каждом кустике десяток листьев от общего корня), у листа тёмное основание и светлый
// кончик. Одновременно рисуется карта высот: кончики выше — солнце даёт объём. Бесшовно ---
export async function grassGround(seed = 29, S = 1024, tick = noTick) {
  const rand = rng(seed);
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  const q = S / 4;
  const nz = noiseField(q, q, 6, 5, rand);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = nz[((y >> 2) % q) * q + ((x >> 2) % q)];
    const k = 0.62 + n * 0.55, i = (y * S + x) * 4;
    img.data[i] = 50 * k; img.data[i + 1] = 46 * k; img.data[i + 2] = 24 * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  await tick();
  // сухие травинки подстилки
  g.lineCap = 'round'; hg.lineCap = 'round';
  const blade = (x, y, a, len, w, col, tip, hgt) => {
    const xs = x < 30 ? [0, S] : x > S - 30 ? [0, -S] : [0];
    const ys = y < 30 ? [0, S] : y > S - 30 ? [0, -S] : [0];
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len, bx = Math.cos(a + 0.35) * len * 0.5, by = Math.sin(a + 0.35) * len * 0.5;
    for (const dx of xs) for (const dy of ys) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + bx, y + dy + by, x + dx + ex * 0.7, y + dy + ey * 0.7); g.stroke();
      g.strokeStyle = tip; g.lineWidth = w * 0.6;
      g.beginPath(); g.moveTo(x + dx + ex * 0.55, y + dy + ey * 0.55); g.lineTo(x + dx + ex, y + dy + ey); g.stroke();
      hg.strokeStyle = `rgb(${hgt},${hgt},${hgt})`; hg.lineWidth = w;
      hg.beginPath(); hg.moveTo(x + dx, y + dy); hg.lineTo(x + dx + ex, y + dy + ey); hg.stroke();
    }
  };
  // редкие сухие травинки подстилки
  for (let k = 0; k < 3000; k++) {
    if ((k & 511) === 0) await tick();
    const v = 0.7 + rand() * 0.5;
    blade(rand() * S, rand() * S, rand() * Math.PI * 2, 3 + rand() * 5, 1, `rgb(${120 * v | 0},${104 * v | 0},${58 * v | 0})`, `rgb(${150 * v | 0},${134 * v | 0},${78 * v | 0})`, 40);
  }
  // газон: очень много коротких травинок, сверху видны в основном кончики — мелкое зерно,
  // а не «штрихи»; оттенки чуть разные по пятнам
  const greens = [[44, 82, 22], [54, 94, 26], [66, 108, 32], [80, 120, 38], [96, 132, 44]];
  const patch = noiseField(64, 64, 4, 3, rand);
  for (let k = 0; k < 26000; k++) {
    if ((k & 255) === 0) await tick();
    const cx = rand() * S, cy = rand() * S, n = 4 + Math.floor(rand() * 6);
    const pk = patch[((cy / S * 64) | 0) * 64 + ((cx / S * 64) | 0)];
    const base = greens[Math.min(greens.length - 1, Math.floor((pk * 0.7 + rand() * 0.45) * greens.length))];
    for (let j = 0; j < n; j++) {
      const a = rand() * Math.PI * 2, len = 3 + rand() * 6, v = 0.82 + rand() * 0.36;
      const col = `rgb(${base[0] * v * 0.72 | 0},${base[1] * v * 0.78 | 0},${base[2] * v * 0.7 | 0})`;
      const tip = `rgb(${Math.min(255, base[0] * v * 1.4) | 0},${Math.min(255, base[1] * v * 1.32) | 0},${Math.min(255, base[2] * v * 1.28) | 0})`;
      blade(cx + (rand() - 0.5) * 3, cy + (rand() - 0.5) * 3, a, len, 1.0 + rand() * 0.5, col, tip, 120 + rand() * 135 | 0);
    }
  }
  await tick();
  // карта высот → нормали
  const hd = hg.getImageData(0, 0, S, S).data;
  const hgt = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) hgt[i] = hd[i * 4] / 255;
  const normal = await normalFromHeight(hgt, S, S, 2.2, tick);
  return { map: toTexture(c), normal: toTexture(normal, { srgb: false }) };
}

// крупные пятна для поля: где трава гуще и темнее, где суше и светлее
export function macroNoise(seed = 31, S = 256) {
  const rand = rng(seed);
  const nz = noiseField(S, S, 5, 4, rand);
  return toTexture(grayCanvas(nz, S, S), { srgb: false });
}

// --- улыбка из темноты: светящиеся глаза-щёлки и широкая зубастая улыбка ---
export function smilerTexture() {
  const W = 512, H = 300;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.shadowColor = 'rgba(255,250,235,1)';
  g.shadowBlur = 22;
  g.fillStyle = '#fffdf4';
  // глаза: вытянутые миндалины, чуть наклонены к переносице
  for (const s of [-1, 1]) {
    g.save();
    g.translate(W / 2 + s * 92, 82);
    g.rotate(s * 0.16);
    g.beginPath(); g.ellipse(0, 0, 44, 11, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // улыбка: широкий серп
  g.beginPath();
  g.moveTo(W * 0.12, 150);
  g.quadraticCurveTo(W / 2, 330, W * 0.88, 150);
  g.quadraticCurveTo(W / 2, 236, W * 0.12, 150);
  g.fill();
  // зубы: тёмные промежутки
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 4;
  for (let k = 1; k < 18; k++) {
    const x = W * 0.12 + (W * 0.76) * (k / 18);
    g.beginPath(); g.moveTo(x, 120); g.lineTo(x + (x - W / 2) * 0.04, 280); g.stroke();
  }
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(W * 0.15, 158); g.quadraticCurveTo(W / 2, 272, W * 0.85, 158); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// небольшая этикетка/надпись для предметов (бутылка, кассета, почтовый ящик)
export function labelTexture(lines, { w = 512, h = 256, bg = '#efe9d8', fg = '#2a2520', font = SIGN_FONT, sizes = [] } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const step = h / (lines.length + 1);
  lines.forEach((l, i) => { g.font = `700 ${sizes[i] || Math.round(h * 0.2)}px ${font}`; g.fillText(l, w / 2, step * (i + 1)); });
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
