import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VHSShader } from './vhs.js';
import { createAudio } from './audio.js';
import { createSmilers } from './smiler.js';
import { createLobby } from './levels/lobby.js';
import { createPool } from './levels/pool.js';
import { createParking } from './levels/parking.js';
import { createField } from './levels/field.js';
import { createStreet } from './levels/street.js';

const clamp = THREE.MathUtils.clamp;
const damp = (dt, r) => 1 - Math.exp(-dt * r);
const lowPower = matchMedia('(max-width: 700px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

// для тех, кто открыл консоль
console.log('%cЗАКУЛИСЬЕ.VHS%c\nВы заглянули за кулисы кулис. Код этой кассеты написан вручную: three.js, свои шейдеры, звук без файлов.\nНужен такой разработчик? Telegram: https://t.me/Saitama000001',
  'font: 700 22px monospace; color: #f2c230; background: #1424b8; padding: 6px 10px;', 'font: 13px monospace; color: inherit;');

// --- рендер: пониженное разрешение — часть «плёночной» картинки и запас производительности ---
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(devicePixelRatio, 1.5) * (lowPower ? 0.6 : 0.8);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 220);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.7, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const vhs = new ShaderPass(VHSShader);
composer.addPass(vhs);

// --- загрузка ---
const draco = new DRACOLoader().setDecoderPath('https://unpkg.com/three@0.170.0/examples/jsm/libs/draco/gltf/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const loadBar = document.getElementById('load-bar');
const loadState = { loaded: 0, total: 1 };
function loadGLB(url, report = false) {
  return new Promise((resolve, reject) => gltfLoader.load(url, resolve, (e) => {
    if (report && e.total) { loadState.loaded = e.loaded; loadState.total = e.total; drawLoad(); }
  }, reject));
}
function drawLoad() {
  const n = Math.round((loadState.loaded / loadState.total) * 10);
  loadBar.textContent = '▓'.repeat(n) + '░'.repeat(10 - n);
}

const audio = createAudio();
const MAKERS = [createLobby, createPool, createParking, createField];
const levels = [null, null, null, null];
const failed = [false, false, false, false];

async function build(i) {
  const ctx = { loadGLB: (u) => loadGLB(u, i === 0), renderer, lowPower };
  const level = await MAKERS[i](ctx);
  await renderer.compileAsync(level.scene, camera);
  // текстуры уровня уходят на видеокарту по одной за кадр, когда до уровня остаётся немного,
  // — не раньше: пока гуляешь по текущему, ничего не подтормаживает
  level.uploads = [];
  level.scene.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) if (m[k] && !level.uploads.includes(m[k])) level.uploads.push(m[k]);
  });
  levels[i] = level;
  layout();
  return level;
}

// --- карта записи: уровни подряд, между ними — «разрыв» плёнки ---
const GAP = 7;
const start = [0, 0, 0, 0];
let total = 0;
function layout() {
  let s = 0;
  for (let i = 0; i < levels.length; i++) {
    start[i] = s;
    if (!levels[i]) break;
    s += levels[i].route.length + (i < levels.length - 1 ? GAP : 0);
  }
  total = s;
}
function lastReady() { let k = -1; for (let i = 0; i < levels.length && levels[i]; i++) k = i; return k; }
function maxTarget() {
  const k = lastReady();
  if (k < 0) return 0;
  return start[k] + levels[k].route.length; // следующий уровень ещё грузится — ждём, пока «найдётся сигнал»
}
function locate(D) {
  const k = lastReady();
  for (let i = 0; i <= k; i++) {
    const L = levels[i].route.length;
    if (D <= start[i] + L || i === k) return { i, s: D - start[i], t: null };
    if (D < start[i] + L + GAP) {
      const t = (D - start[i] - L) / GAP;
      if (t < 0.5 || !levels[i + 1]) return { i, s: L, t, exitA: Math.min(1, t * 2), gap: i };
      return { i: i + 1, s: 0, t, enterB: (t - 0.5) * 2, gap: i };
    }
  }
  return { i: 0, s: 0, t: null };
}
// в каком «разрыве» лежит точка D (−1 — ни в каком)
function gapOf(D) {
  for (let i = 0; i < lastReady(); i++) {
    const g0 = start[i] + levels[i].route.length;
    if (D > g0 && D < g0 + GAP) return i;
  }
  return -1;
}

// --- ввод: прокрутка = шаги, зажатая мышь или палец вбок = осмотреться ---
const state = {
  dist: 0, target: 0, speed: 0, playing: false,
  glitch: 0, bob: 0, seek: false, auto: false, lastInput: 0, dir: 1,
};
const look = { yaw: 0, pitch: 0, hoverX: 0, hoverY: 0, dragging: false, x: 0, y: 0, moved: 0, keyYaw: 0 };
const SCROLL = 0.014;
const LEAD = 6; // насколько прокрутка может «убежать» вперёд камеры — без рывков и перелётов
function push(delta) {
  if (intro) { skipIntro(); return; }
  if (!state.playing) return;
  state.target = clamp(clamp(state.target + delta, state.dist - LEAD, state.dist + LEAD), 0, maxTarget());
  state.dir = Math.sign(delta) || state.dir;
  state.lastInput = performance.now();
  state.seek = false;
  if (state.auto) setAuto(false);
}
addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
  push(e.deltaY * k * SCROLL);
}, { passive: false });

// мышь: зажал и повёл — смотришь по сторонам; просто водишь — лёгкий поворот головы
const pointer = new THREE.Vector2(2, 2);
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || !state.playing) return;
  look.dragging = true; look.x = e.clientX; look.y = e.clientY; look.moved = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* указатель уже отпущен — осмотр работает и без захвата */ }
  document.body.classList.add('grabbing');
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (look.dragging) {
    const dx = e.clientX - look.x, dy = e.clientY - look.y;
    look.x = e.clientX; look.y = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
    look.yaw += dx * 0.0042;
    look.pitch = clamp(look.pitch + dy * 0.0034, -1.05, 1.05);
  } else {
    look.hoverX = pointer.x; look.hoverY = pointer.y;
  }
});
function endDrag(e) {
  if (!look.dragging) return;
  look.dragging = false;
  document.body.classList.remove('grabbing');
  if (look.moved < 6) pick(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// палец: вверх-вниз — идти, вбок — осмотреться (направление решается в начале жеста)
let touch = null;
addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, mode: null, time: performance.now() };
}, { passive: true });
addEventListener('touchmove', (e) => {
  if (!touch || !state.playing) return;
  const t = e.touches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (!touch.mode) {
    const ax = Math.abs(t.clientX - touch.x0), ay = Math.abs(t.clientY - touch.y0);
    if (ax + ay > 10) touch.mode = ax > ay * 1.2 ? 'look' : 'walk';
  }
  if (touch.mode === 'walk') push(-dy * 0.045);
  if (touch.mode === 'look') {
    look.yaw += dx * 0.006;
    look.pitch = clamp(look.pitch + dy * 0.005, -1.05, 1.05);
  }
  touch.x = t.clientX; touch.y = t.clientY;
}, { passive: true });
addEventListener('touchend', (e) => {
  if (touch && !touch.mode && performance.now() - touch.time < 400 && e.target === canvas) pick(touch.x0, touch.y0);
  touch = null;
}, { passive: true });

// клавиатура: держишь ↑/W — идёшь вперёд, ↓/S — назад, ←→/A D — поворачиваешь голову;
// PageDown/пробел — шаг подальше. Кнопки «◀ НАЗАД / ВПЕРЁД ▶» на экране работают так же
const hold = { walk: 0, turn: 0, keys: new Set() };
const KEYS_FWD = ['ArrowUp', 'w', 'W', 'ц', 'Ц'], KEYS_BACK = ['ArrowDown', 's', 'S', 'ы', 'Ы'];
const KEYS_LEFT = ['ArrowLeft', 'a', 'A', 'ф', 'Ф'], KEYS_RIGHT = ['ArrowRight', 'd', 'D', 'в', 'В'];
function holdFromKeys() {
  const k = hold.keys;
  hold.walk = (KEYS_FWD.some((x) => k.has(x)) ? 1 : 0) - (KEYS_BACK.some((x) => k.has(x)) ? 1 : 0);
  hold.turn = (KEYS_LEFT.some((x) => k.has(x)) ? 1 : 0) - (KEYS_RIGHT.some((x) => k.has(x)) ? 1 : 0);
}
addEventListener('keydown', (e) => {
  if (e.target.closest?.('a, button, dialog')) return;
  if (intro && (KEYS_FWD.includes(e.key) || e.key === ' ')) { skipIntro(); return; }
  if (!state.playing) return;
  if ([...KEYS_FWD, ...KEYS_BACK, ...KEYS_LEFT, ...KEYS_RIGHT].includes(e.key)) {
    e.preventDefault();
    hold.keys.add(e.key); holdFromKeys();
    if (state.auto && hold.walk) setAuto(false);
  }
  if (['PageDown', ' '].includes(e.key)) { e.preventDefault(); push(3.5); }
  if (e.key === 'PageUp') { e.preventDefault(); push(-3.5); }
});
addEventListener('keyup', (e) => { hold.keys.delete(e.key); holdFromKeys(); });
addEventListener('blur', () => { hold.keys.clear(); holdFromKeys(); });
for (const [id, dir] of [['walk-fwd', 1], ['walk-back', -1]]) {
  const b = document.getElementById(id);
  const on = (e) => { e.preventDefault(); if (intro) { skipIntro(); return; } hold.walk = dir; if (state.auto) setAuto(false); b.classList.add('held'); };
  const off = () => { if (hold.walk === dir) hold.walk = 0; b.classList.remove('held'); };
  b.addEventListener('pointerdown', on);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

// --- экранные элементы ---
const gate = document.getElementById('gate');
const soundBtn = document.getElementById('sound');
const autoBtn = document.getElementById('auto');
const lvlEl = document.getElementById('lvl');
const modeEl = document.getElementById('mode');
const hint = document.getElementById('hint');
const toastEl = document.getElementById('toast');
const eggsEl = document.getElementById('eggs');
const tapeBtns = [...document.querySelectorAll('[data-go]')];
hint.textContent = coarse ? 'СВАЙП ВВЕРХ — ИДТИ · ВБОК — ОСМОТРЕТЬСЯ' : 'КОЛЕСО ИЛИ ↑ ↓ — ИДТИ · МЫШЬ ИЛИ ← → — ОСМОТРЕТЬСЯ';
function setSound(on) {
  audio.setEnabled(on);
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.textContent = on ? 'ЗВУК: ВКЛ' : 'ЗВУК: ВЫКЛ';
}
soundBtn.addEventListener('click', () => setSound(!audio.enabled));
function setAuto(on) {
  state.auto = on;
  autoBtn.setAttribute('aria-pressed', String(on));
  autoBtn.textContent = on ? '❚❚ ПАУЗА' : '▶ АВТО';
}
autoBtn.addEventListener('click', () => { setAuto(!state.auto); state.seek = false; });
function seekTo(D) {
  if (!state.playing) return;
  state.target = clamp(D, 0, maxTarget());
  state.dir = Math.sign(state.target - state.dist) || 1;
  state.seek = Math.abs(state.target - state.dist) > 2;
  if (state.auto) setAuto(false);
  if (state.seek) audio.glitch(0.4);
}
tapeBtns.forEach((b) => b.addEventListener('click', () => {
  const i = +b.dataset.go;
  if (!levels[i]) return;
  seekTo(start[i] + (i === 0 ? 0 : 1.2));
}));
document.getElementById('rewind').addEventListener('click', () => seekTo(0));

// лицензии и авторы — отдельное окно
const lic = document.getElementById('lic');
document.getElementById('lic-open').addEventListener('click', () => lic.showModal());
document.getElementById('lic-close').addEventListener('click', () => lic.close());
lic.addEventListener('click', (e) => { if (e.target === lic) lic.close(); });

// всплывающая строка камеры
let toastTimer = 0;
function toast(text, ms = 4200) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// --- находки: по одной на каждом уровне ---
const EGGS = {
  almond: 'МИНДАЛЬНАЯ ВОДА. ГОВОРЯТ, ЗДЕСЬ ТОЛЬКО ОНА И ВЫРУЧАЕТ',
  duck: 'РЕЗИНОВАЯ УТКА — ЕДИНСТВЕННЫЙ ЖИЛЕЦ УРОВНЯ 37',
  tape: 'ЧУЖАЯ КАССЕТА «ЗАПИСЬ №0». ДО ВАС ЗДЕСЬ УЖЕ КТО-ТО БЫЛ',
  mail: 'ПОЧТОВЫЙ ЯЩИК. ПИСЬМА СЮДА НЕ ДОХОДЯТ — ПИШИТЕ В TELEGRAM',
};
const found = new Set();
try { for (const id of JSON.parse(localStorage.getItem('br-eggs') || '[]')) if (EGGS[id]) found.add(id); } catch { /* хранилище недоступно — считаем заново */ }
function drawEggs() { eggsEl.textContent = found.size ? `НАХОДКИ ${found.size}/4` : ''; }
drawEggs();
function onEgg(id) {
  if (id === 'duck') audio.quack();
  if (found.has(id)) { toast(`УЖЕ НАЙДЕНО · ${EGGS[id]}`); return; }
  found.add(id);
  try { localStorage.setItem('br-eggs', JSON.stringify([...found])); } catch { /* без сохранения */ }
  audio.chime();
  drawEggs();
  toast(`НАХОДКА ${found.size}/4 · ${EGGS[id]}`, 5200);
  if (found.size === 4) setTimeout(() => toast('ВСЕ НАХОДКИ СОБРАНЫ · ВЫ ПРОШЛИ ЗАКУЛИСЬЕ ВНИМАТЕЛЬНЕЕ ВСЕХ', 6000), 5400);
}

// --- вступление: вечерняя улица, плёнку рвёт, проваливаешься сквозь асфальт — и падаешь
// в Закулисье (камера появляется прямо под потолком, сверху ничего не видно) ---
let street = null;
let intro = null;
// по секундам: идёшь — плёнку рвёт — проваливаешься сквозь плиты и сразу оказываешься в
// Закулисье (без затемнения между ними)
const INTRO = { walk: 3.0, tear: 3.9, fall: 5.6 };
const LAND_FALL = 1.9; // с, падение под потолком уровня 0
let fallT = -1, playStart = 0;
function play(withSound) {
  setSound(withSound);
  gate.classList.add('gone');
  document.body.classList.add('playing');
  playStart = clock.elapsedTime;
  state.glitch = 0.8;
  audio.glitch(0.5);
  if (street && !calm) {
    intro = { t: 0, fell: false };
    audio.setScene('street');
    lvlEl.textContent = 'ЗАПИСЬ';
    return;
  }
  land();
}
// приземление на уровень 0
function land() {
  intro = null;
  active = -1;
  state.playing = true;
  fallT = 0;
  state.glitch = 1;
  audio.glitch(0.6);
}
function skipIntro() { if (intro && intro.t < INTRO.tear) intro.t = INTRO.tear; }
document.getElementById('play-sound').addEventListener('click', () => play(true));
document.getElementById('play-mute').addEventListener('click', () => play(false));

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 78 : 62;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
  vhs.uniforms.uRes.value.set(innerWidth * pixelRatio, innerHeight * pixelRatio);
}
addEventListener('resize', resize);
resize();

// --- смена уровня: сцена, свет, цвет, звук, подпись ---
let active = -1;
let hovered = null;
const smilers = createSmilers({ audio, kick: (g) => lctx.kick(g) });
const lctx = {
  audio, camera, smilers, now: 0, s: 0,
  get playing() { return state.playing; },
  kick(g) { if (!calm) state.glitch = Math.max(state.glitch, g); },
};
function activate(i) {
  if (i === active) return;
  levels[active]?.leave?.(lctx);
  smilers.hide();
  active = i;
  snapView = true;
  const L = levels[i];
  L.uploads.length = 0; // остальное догрузится при первом кадре уровня
  renderPass.scene = L.scene;
  bloom.strength = L.bloom.strength; bloom.radius = L.bloom.radius; bloom.threshold = L.bloom.threshold;
  renderer.toneMappingExposure = L.exposure;
  vhs.uniforms.uTint.value.set(...L.grade.tint);
  vhs.uniforms.uSat.value = L.grade.sat;
  camera.far = L.far || 220;
  camera.updateProjectionMatrix();
  audio.setScene(L.floor);
  lvlEl.textContent = L.label;
  tapeBtns.forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
  hovered = null; document.body.classList.remove('can-pick');
}

// --- титры: показываем те, в чьём отрезке маршрута стоит камера ---
const captions = new Map([...document.querySelectorAll('.caption')].map((el) => [el.id, el]));
const shown = new Set();
// на телефоне списки свёрнуты, чтобы текст не закрывал телевизор: кнопка «подробнее»
for (const el of captions.values()) {
  const list = el.querySelector('.list');
  if (!list || !/^cap-p\d/.test(el.id)) continue;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'osd more'; b.textContent = 'ПОДРОБНЕЕ ▾'; b.setAttribute('aria-expanded', 'false');
  b.addEventListener('click', () => {
    const open = el.classList.toggle('open');
    b.textContent = open ? 'СВЕРНУТЬ ▴' : 'ПОДРОБНЕЕ ▾';
    b.setAttribute('aria-expanded', String(open));
  });
  list.before(b);
}
function updateCaptions(loc) {
  const want = new Set();
  const L = levels[loc.i];
  if (state.playing && fallT < 0 && loc.t === null && !state.seek) {
    for (const st of L.stations) if (loc.s >= st.from && loc.s <= st.to) want.add(st.id);
  }
  for (const id of shown) if (!want.has(id)) { captions.get(id)?.classList.remove('show'); shown.delete(id); }
  for (const id of want) if (!shown.has(id)) { captions.get(id)?.classList.add('show'); shown.add(id); }
}

// --- то, на что можно нажать: экраны телевизоров и находки ---
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hitAt(nx, ny) {
  const L = levels[active];
  if (!L?.picks?.length || !state.playing) return null;
  ndc.set(nx, ny);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(L.picks, false)[0];
  return hit && hit.distance < 9 ? hit.object : null;
}
function updateHover() {
  if (look.dragging || coarse) return;
  const obj = hitAt(pointer.x, pointer.y);
  if (obj !== hovered) {
    hovered = obj;
    levels[active]?.hover?.(obj);
    document.body.classList.toggle('can-pick', !!obj);
  }
}
function pick(x, y) {
  const obj = hitAt((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  if (!obj) return;
  if (obj.userData.url) window.open(obj.userData.url, '_blank', 'noopener');
  else if (obj.userData.egg) onEgg(obj.userData.egg);
}

// --- надписи камеры ---
const MONTHS = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const dateEl = document.getElementById('date'), clockEl = document.getElementById('clock'), tcEl = document.getElementById('timecode');
function updateHud(now) {
  const d = new Date();
  dateEl.textContent = `${MONTHS[d.getMonth()]}. ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}`;
  clockEl.textContent = d.toLocaleTimeString('ru-RU');
  const t = Math.max(0, now - playStart);
  const f = (n) => String(Math.floor(n)).padStart(2, '0');
  tcEl.textContent = `${f(t / 3600)}:${f((t / 60) % 60)}:${f(t % 60)}`;
  let mode = '';
  if (state.seek) mode = state.dir > 0 ? '▶▶ ПЕРЕМОТКА' : '◀◀ ПЕРЕМОТКА';
  else if (state.playing && state.target >= maxTarget() - 0.01 && lastReady() < levels.length - 1) mode = failed[lastReady() + 1] ? 'СИГНАЛ ПОТЕРЯН · ОБНОВИТЕ СТРАНИЦУ' : 'ПОИСК СИГНАЛА…';
  if (modeEl.textContent !== mode) modeEl.textContent = mode;
}

// --- кадр ---
const clock = new THREE.Clock();
const pos = new THREE.Vector3(), target = new THREE.Vector3(), dir = new THREE.Vector3();
const wantQ = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
let first = true, lastStepPhase = 0, hudTick = 0, snapView = true;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const WALK_MAX = 3.2; // м/с: даже при резкой прокрутке камера идёт, а не летит

// поворот камеры сглаживается: неровные события мыши и изломы маршрута не дают рывков
function aim(p, yaw, pitch, roll, dt, rate) {
  eul.set(pitch, yaw, roll, 'YXZ');
  wantQ.setFromEuler(eul);
  camera.position.copy(p);
  if (snapView) { camera.quaternion.copy(wantQ); snapView = false; } else camera.quaternion.slerp(wantQ, damp(dt, rate));
}
function headLook(dt, walking) {
  const hx = coarse || look.dragging ? 0 : -look.hoverX * 0.14, hy = coarse || look.dragging ? 0 : look.hoverY * 0.07;
  look.yaw += look.keyYaw * damp(dt, 6); look.keyYaw *= 1 - damp(dt, 6);
  const shake = calm ? 0 : 1;
  return {
    yaw: look.yaw + hx + (Math.sin(clock.elapsedTime * 1.7) * 0.006 + Math.sin(clock.elapsedTime * 4.3) * 0.003) * shake,
    pitch: look.pitch + hy + Math.cos(clock.elapsedTime * 1.3) * 0.005 * shake,
    roll: Math.sin(state.bob * 0.5) * 0.006 * walking * shake,
  };
}

// кадр вступления: улица → рвёт плёнку → провал сквозь асфальт → темнота
function introFrame(dt, now) {
  intro.t += dt;
  const t = intro.t;
  if (renderPass.scene !== street.scene) {
    renderPass.scene = street.scene;
    bloom.strength = street.bloom.strength; bloom.radius = street.bloom.radius; bloom.threshold = street.bloom.threshold;
    renderer.toneMappingExposure = street.exposure;
    vhs.uniforms.uTint.value.set(...street.grade.tint); vhs.uniforms.uSat.value = street.grade.sat;
    camera.far = 450; camera.updateProjectionMatrix();
  }
  const walking = t < INTRO.tear ? 0.75 : 0;
  state.bob += dt * (1.2 + walking * 7.5);
  const phase = Math.sin(state.bob);
  if (walking > 0.15) {
    if (lastStepPhase > 0 && phase <= 0) audio.step(0.8);
    if (lastStepPhase < 0 && phase >= 0) audio.step(0.7);
  }
  lastStepPhase = phase;
  pos.copy(street.START);
  pos.z -= Math.min(t, INTRO.tear) * 1.25;
  pos.y += phase * 0.04 * walking;
  let pitchFall = -0.05;
  if (t > INTRO.walk && t < INTRO.tear) state.glitch = Math.max(state.glitch, Math.random() < 0.15 ? (t - INTRO.walk) * 0.6 : 0);
  if (t > INTRO.tear) {
    if (!intro.fell) { intro.fell = true; audio.noclip(LAND_FALL + 0.6); state.glitch = 0.55; }
    // плиты «расступаются»: сначала проседаешь, потом быстрее уходишь вниз; глаз доходит до
    // самих плит — и в этот миг плёнка склеивается с Закулисьем (темноты нет)
    const k = Math.min(1, (t - INTRO.tear) / (INTRO.fall - INTRO.tear));
    pos.y -= (street.START.y - 0.24) * (0.3 * k + 0.7 * k * k * k);
    pitchFall -= THREE.MathUtils.smoothstep(k, 0, 0.6) * 0.9;
    state.glitch = Math.max(state.glitch, 0.12 + k * k * 0.45);
  }
  const h = headLook(dt, walking);
  aim(pos, h.yaw, clamp(h.pitch + pitchFall, -1.45, 1.45), h.roll, dt, 12);
  street.update(now, t, camera, (g) => lctx.kick(g));
  if (t >= INTRO.fall) land();
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = clock.elapsedTime;
  if (intro) {
    introFrame(dt, now);
    state.glitch = Math.max(0, state.glitch - dt * 1.4);
    vhs.uniforms.uTime.value = now;
    vhs.uniforms.uGlitch.value = state.glitch;
    if ((hudTick += dt) > 0.25) { hudTick = 0; updateHud(now); }
    composer.render();
    requestAnimationFrame(frame);
    return;
  }

  // автопросмотр: медленнее там, где есть титры
  if (state.auto && !state.seek && state.playing) {
    const loc0 = locate(state.target);
    const reading = loc0.t === null && levels[loc0.i].stations.some((st) => loc0.s >= st.from && loc0.s <= st.to && st.id !== 'cap-title');
    state.target = clamp(state.target + dt * (loc0.t !== null ? 3.5 : reading ? 0.4 : 1.1), 0, maxTarget());
    if (state.target >= total - 0.01) setAuto(false);
  }
  // ходьба кнопками и клавишами: спокойным шагом, пока держишь
  if (hold.walk && state.playing && fallT < 0) {
    state.target = clamp(clamp(state.target + hold.walk * dt * 1.4, state.dist - 1.2, state.dist + 1.2), 0, maxTarget());
    state.dir = hold.walk; state.lastInput = performance.now(); state.seek = false;
  }
  if (hold.turn) look.yaw += hold.turn * dt * 1.3;
  // если остановились посреди «разрыва» — доезжаем до ближайшего уровня в сторону движения
  const tg = gapOf(state.target);
  if (tg >= 0 && !state.seek && !state.auto && performance.now() - state.lastInput > 260) {
    const g0 = start[tg] + levels[tg].route.length;
    state.target = clamp(state.dir > 0 ? g0 + GAP + 0.6 : g0 - 0.6, 0, maxTarget());
  }

  // ходьба; переходы между уровнями идут по времени, а не по скорости прокрутки
  const prev = state.dist;
  let next = state.dist + (state.target - state.dist) * damp(dt, state.seek ? 1.6 : 2.4);
  const gi = gapOf(state.dist) >= 0 ? gapOf(state.dist) : gapOf(next);
  if (gi >= 0) {
    const vmax = GAP / (levels[gi].transition || 3) * (state.seek ? 4 : 1);
    next = state.dist + clamp(next - state.dist, -vmax * dt, vmax * dt);
  } else if (!state.seek) {
    // у лифтов — спокойным шагом: в кабину входишь и выходишь из неё не бегом
    const lc = locate(state.dist), Lc = levels[lc.i];
    const edge = lc.t === null ? Math.min(lc.i > 0 ? lc.s : 9, lc.i < levels.length - 1 ? Lc.route.length - lc.s : 9) : 9;
    const vmax = WALK_MAX * clamp(0.32 + edge / 3.2, 0.32, 1);
    next = state.dist + clamp(next - state.dist, -vmax * dt, vmax * dt);
  }
  state.dist = next;
  if (state.seek && Math.abs(state.target - state.dist) < 0.4) state.seek = false;
  state.speed = Math.abs(state.dist - prev) / Math.max(dt, 1e-4);

  const loc = locate(state.dist);
  activate(loc.i);
  const L = levels[loc.i];
  const walking = state.seek || loc.t !== null ? 0 : clamp(state.speed / 2.2, 0, 1);
  state.bob += dt * (1.2 + walking * 7.5);
  const phase = Math.sin(state.bob);
  if (walking > 0.15) {
    if (lastStepPhase > 0 && phase <= 0) audio.step(0.5 + walking * 0.6);
    if (lastStepPhase < 0 && phase >= 0) audio.step(0.4 + walking * 0.5);
  }
  lastStepPhase = phase;
  // текстуры следующего уровня — на видеокарту, когда до него осталось немного
  const nextL = levels[loc.i + 1];
  if (nextL?.uploads.length && (loc.t !== null || loc.s > L.route.length * 0.6)) renderer.initTexture(nextL.uploads.shift());

  lctx.now = now;
  lctx.s = loc.s;
  lctx.walking = walking;
  L.route.sample(clamp(loc.s, 0, L.route.length), pos, target);
  let flash = 0;
  if (loc.exitA !== undefined && L.exit) flash = Math.max(flash, L.exit(loc.exitA, pos, target, lctx)?.flash || 0);
  if (L.enter) flash = Math.max(flash, L.enter(loc.enterB ?? 1, pos, target, lctx)?.flash || 0);
  if (L.ground) {
    const gy = L.ground(pos.x, pos.z) + 1.6;
    target.y += gy - pos.y;
    pos.y = gy;
  }
  if (!calm) pos.y += phase * 0.035 * (0.3 + walking) + Math.sin(now * 0.7) * 0.01;

  // вход в запись: камера «вываливается» из потолка (стартует под ним — потолок сверху не виден)
  let pitchFall = 0;
  if (fallT >= 0) {
    fallT += dt / LAND_FALL; // успеваешь понять, что тебя «выбросило» под потолок
    const k = Math.min(1, fallT);
    const e = k * k * (3 - 2 * k);
    pos.y = THREE.MathUtils.lerp(2.3, pos.y, e);
    pitchFall = (1 - e) * -1.0;
    if (fallT >= 1) { fallT = -1; state.glitch = Math.max(state.glitch, 0.6); audio.glitch(0.35); audio.thud(); }
  }

  // разрыв между уровнями: снег и сбой, сильнее всего посередине
  if (loc.t !== null) {
    const from = levels[loc.gap];
    const peak = 1 - Math.abs(loc.t - 0.5) * 2;
    const g = Math.pow(peak, from.glitchSharp ?? 0.8) * (from.exitGlitch ?? 1) * (calm ? 0.5 : 1);
    state.glitch = Math.max(state.glitch, g);
  }

  // взгляд: направление маршрута + осмотр мышью/пальцем + лёгкий поворот головы за курсором
  if (!look.dragging && !touch) {
    // пока идёшь — взгляд потихоньку возвращается к дороге; стоишь — смотри куда хочешь
    const back = damp(dt, 0.9 * walking + (loc.t !== null ? 2 : 0));
    look.yaw = wrap(look.yaw) * (1 - back);
    look.pitch *= 1 - back;
  }
  // на последнем уровне осматриваться можно только чуть-чуть: вокруг одни холмы
  if (L.lookLimit) {
    look.yaw = clamp(wrap(look.yaw), -L.lookLimit.yaw, L.lookLimit.yaw);
    look.pitch = clamp(look.pitch, -L.lookLimit.pitch, L.lookLimit.pitch);
  }
  dir.subVectors(target, pos);
  const h = headLook(dt, walking);
  aim(pos, Math.atan2(-dir.x, -dir.z) + h.yaw, clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) + h.pitch + pitchFall, -1.45, 1.45), h.roll, dt, look.dragging ? 16 : 10);

  // отладочный вид для проверочных скриптов: __br.view = { pos: [x,y,z], look: [x,y,z] }
  if (window.__br.view) { camera.position.fromArray(window.__br.view.pos); camera.lookAt(...window.__br.view.look); }

  L.update(dt, now, lctx);
  smilers.update(dt, camera);
  updateCaptions(loc);
  updateHover();
  hint.classList.toggle('hide', !(state.playing && state.dist < 3));

  state.glitch = Math.max(0, state.glitch - dt * 1.4);
  vhs.uniforms.uTime.value = now;
  vhs.uniforms.uGlitch.value = state.glitch;
  vhs.uniforms.uFF.value += ((state.seek ? 1 : 0) - vhs.uniforms.uFF.value) * damp(dt, 8);
  vhs.uniforms.uFlash.value = flash;
  if ((hudTick += dt) > 0.25) { hudTick = 0; updateHud(now); }

  composer.render();
  if (first) {
    first = false;
    gate.classList.add('ready');
    loadBar.parentElement.style.display = 'none';
  }
  requestAnimationFrame(frame);
}

// лобби — сразу, остальные уровни по очереди в фоне
(async () => {
  try {
    street = createStreet({ lowPower });
    await renderer.compileAsync(street.scene, camera);
    await build(0);
  } catch (err) {
    console.error(err);
    document.getElementById('load').textContent = 'ОШИБКА ЧТЕНИЯ КАССЕТЫ · ОБНОВИТЕ СТРАНИЦУ';
    return;
  }
  activate(0);
  requestAnimationFrame(frame);
  for (let i = 1; i < MAKERS.length; i++) {
    try { await build(i); } catch (err) { console.error(err); failed[i] = true; break; }
  }
})();

window.__br = {
  state, look, levels, start, camera, renderer, vhs, bloom, smilers, view: null,
  goto(i, s = 0) { state.dist = state.target = start[i] + s; state.seek = false; },
  play,
};
