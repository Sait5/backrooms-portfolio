// Лифт: кабина 1,6 × 2,3 × 1,5 м из шлифованной стали — панели со швами, полированная
// задняя стенка, поручень на кронштейнах, алюминиевый порог, вентиляционная решётка, табло
// этажа снаружи и внутри, кнопки с переговорным устройством, табличка грузоподъёмности.
// Такой лифт стоит в конце каждого уровня и в начале следующего — поездка между уровнями
// выглядит непрерывной: двери закрылись в одном месте, открылись уже в другом.
// Начало координат — середина порога на полу; кабина уходит в −Z, двери смотрят в +Z.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { brushedSteel, studRubber, canvas, labelTexture } from './textures.js';

export const CAB = { W: 1.6, H: 2.3, D: 1.5, T: 0.06, O: 0.9, OH: 2.1 };

let envTex = null;
function roomEnv(renderer) {
  if (!envTex) {
    const p = new THREE.PMREMGenerator(renderer);
    envTex = p.fromScene(new RoomEnvironment(), 0.04).texture;
    p.dispose();
  }
  return envTex;
}

// табло: янтарные цифры на чёрном, стрелка направления
function makeDisplay() {
  const [c, g] = canvas(256, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let last = null;
  function draw(text, arrow = 0) {
    const key = text + arrow;
    if (key === last) return;
    last = key;
    g.fillStyle = '#060504'; g.fillRect(0, 0, 256, 96);
    g.shadowColor = '#ffae3a'; g.shadowBlur = 10;
    g.fillStyle = '#ffb347';
    g.font = '700 60px "IBM Plex Mono", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 150, 52);
    if (arrow) {
      g.beginPath();
      if (arrow > 0) { g.moveTo(40, 64); g.lineTo(62, 30); g.lineTo(84, 64); } else { g.moveTo(40, 32); g.lineTo(62, 66); g.lineTo(84, 32); }
      g.fill();
    }
    g.shadowBlur = 0;
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

// кнопки, решётка переговорного устройства, «колокольчик» вызова диспетчера
function buttonPanelTexture() {
  const [c, g] = canvas(128, 460);
  g.fillStyle = '#8f9497'; g.fillRect(0, 0, 128, 460);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeRect(3, 3, 122, 454);
  g.fillStyle = '#2b2d2f';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) { g.beginPath(); g.arc(34 + x * 15, 26 + y * 12, 3, 0, Math.PI * 2); g.fill(); }
  const labels = ['0', '−1', '−2', '−3', 'SOS'];
  labels.forEach((l, i) => {
    const y = 110 + i * 68;
    g.fillStyle = '#2b2d2f'; g.beginPath(); g.arc(64, y, 24, 0, Math.PI * 2); g.fill();
    g.strokeStyle = i === 3 ? '#ffb347' : '#c9cdd0'; g.lineWidth = 4; g.beginPath(); g.arc(64, y, 24, 0, Math.PI * 2); g.stroke();
    g.fillStyle = i === 3 ? '#ffb347' : '#e6e8ea'; g.font = '700 22px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(l, 64, y + 1);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// рифлёный алюминий порога
function sillTexture() {
  const [c, g] = canvas(256, 32);
  g.fillStyle = '#9aa0a4'; g.fillRect(0, 0, 256, 32);
  for (let x = 0; x < 256; x += 8) { g.fillStyle = '#5d6266'; g.fillRect(x, 0, 3, 32); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// решётка вентиляции под потолком
function grilleTexture() {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#b6babd'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#1d1e20';
  for (let y = 6; y < 60; y += 8) for (let x = 6; x < 124; x += 8) g.fillRect(x, y, 4, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ламинат под орех для панелей кабины
function laminate() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#6e4a2e'; g.fillRect(0, 0, 256, 512);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < 256; x++) {
    const w = Math.sin(x * 0.09 + Math.sin(x * 0.021) * 3) * 0.5 + 0.5;
    g.fillStyle = `rgba(${40 + w * 50},${24 + w * 30},${12 + w * 18},0.5)`;
    g.fillRect(x, 0, 1, 512);
  }
  for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(30,18,8,${0.06 + r() * 0.15})`; g.fillRect(r() * 256, 0, 1, 512); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// light — яркость света в кабине (на тёмной парковке меньше, в поле больше);
// shell — материал внешней обшивки отдельно стоящего лифта (в цвет уровня)
export function createElevator(renderer, { standalone = false, light = 1, shell = null } = {}) {
  const { W, H, D, T, O, OH } = CAB;
  const g = new THREE.Group();
  const env = roomEnv(renderer);
  const steel = new THREE.MeshStandardMaterial({ map: brushedSteel(), metalness: 0.85, roughness: 0.38, envMap: env, envMapIntensity: 0.26 });
  const doorTex = brushedSteel(37, 1024); doorTex.rotation = Math.PI / 2; doorTex.center.set(0.5, 0.5);
  const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, metalness: 0.9, roughness: 0.28, envMap: env, envMapIntensity: 0.45 });
  const polished = new THREE.MeshStandardMaterial({ color: 0xc9cdd0, metalness: 1, roughness: 0.26, envMap: env, envMapIntensity: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.4, roughness: 0.5, envMap: env });
  const seam = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.6, roughness: 0.5 });
  const rubberTex = studRubber(); rubberTex.repeat.set(3, 3);
  const floorMat = new THREE.MeshStandardMaterial({ map: rubberTex, roughness: 0.8 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

  // короб кабины: снизу и по краям — шлифованная сталь, по стенам — тёплые панели под дерево
  const woodMat = new THREE.MeshStandardMaterial({ map: laminate(), roughness: 0.55, envMap: env, envMapIntensity: 0.25 });
  add(new THREE.BoxGeometry(W, 0.05, D), floorMat, 0, 0.025, -D / 2);
  add(new THREE.BoxGeometry(W, 0.05, D), steel, 0, H - 0.025, -D / 2);
  add(new THREE.BoxGeometry(W, H, T), steel, 0, H / 2, -D + T / 2);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(T, H, D), steel, s * (W / 2 - T / 2), H / 2, -D / 2);
  const side = (W - O) / 2;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(side, H, T), steel, s * (O / 2 + side / 2), H / 2, -T / 2);
  add(new THREE.BoxGeometry(O, H - OH, T), steel, 0, OH + (H - OH) / 2, -T / 2);
  // панели под дерево на боковых стенах и внизу задней, зеркало вверху задней стены
  for (const s of [-1, 1]) for (const z of [-D * 0.27, -D * 0.73]) add(new THREE.BoxGeometry(0.012, 1.5, D * 0.44), woodMat, s * (W / 2 - T - 0.006), 1.05, z);
  add(new THREE.BoxGeometry(W - 0.2, 0.62, 0.012), woodMat, 0, 0.5, -D + T + 0.006);
  const mirror = new THREE.MeshStandardMaterial({ color: 0x7d8286, metalness: 1, roughness: 0.2, envMap: env, envMapIntensity: 0.2 });
  add(new THREE.BoxGeometry(W - 0.5, 1.05, 0.008), mirror, 0, 1.55, -D + T + 0.004);
  for (const x of [-W / 6, W / 6]) add(new THREE.BoxGeometry(0.008, 0.55, 0.006), seam, x, 0.5, -D + T + 0.014);
  // плинтус-отбойник по периметру
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.12, D - 0.12), polished, s * (W / 2 - T - 0.006), 0.11, -D / 2);
  add(new THREE.BoxGeometry(W - 0.12, 0.12, 0.012), polished, 0, 0.11, -D + T + 0.006);
  // портал снаружи: облицовка стены (в цвет места) с проёмом, за ней — карманы, куда уезжают
  // створки; вокруг проёма — рамка из шлифованной стали со скруглёнными гранями
  const FW = 0.93, FH = H + 0.22, FZ0 = 0.052, FZ1 = 0.074;
  const face = shell || steel;
  const sideW = FW - O / 2;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(sideW, FH, FZ1 - FZ0), face, s * (O / 2 + sideW / 2), FH / 2, (FZ0 + FZ1) / 2);
  add(new THREE.BoxGeometry(O, FH - OH, FZ1 - FZ0), face, 0, OH + (FH - OH) / 2, (FZ0 + FZ1) / 2);
  // торцы портала: закрывают щель кармана сбоку
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, FH, FZ1 + 0.03), face, s * (FW - 0.01), FH / 2, (FZ1 - 0.03) / 2);
  const portalMat = new THREE.MeshStandardMaterial({ map: brushedSteel(53, 512), metalness: 0.9, roughness: 0.3, envMap: env, envMapIntensity: 0.5 });
  const jamb = new RoundedBoxGeometry(0.06, OH + 0.06, 0.03, 2, 0.008);
  for (const s of [-1, 1]) add(jamb, portalMat, s * (O / 2 + 0.03), (OH + 0.06) / 2, FZ1 + 0.013);
  add(new RoundedBoxGeometry(O + 0.12, 0.06, 0.03, 2, 0.008), portalMat, 0, OH + 0.03, FZ1 + 0.013);
  // порог: рифлёный алюминий во всю глубину — под створками и рамкой, с пазом для башмаков
  const sillTex = sillTexture(); sillTex.wrapS = THREE.RepeatWrapping; sillTex.repeat.set(1.4, 1);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(O + 0.12, 0.012, 0.21), new THREE.MeshStandardMaterial({ map: sillTex, metalness: 0.8, roughness: 0.42, envMap: env, envMapIntensity: 0.4 }));
  sill.position.set(0, 0.056, 0.045); g.add(sill);
  const groove = new THREE.Mesh(new THREE.BoxGeometry(O + 0.1, 0.004, 0.008), dark);
  groove.position.set(0, 0.0625, 0.03); g.add(groove);
  // поручень на кронштейнах
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd8dadb, metalness: 1, roughness: 0.18, envMap: env, envMapIntensity: 0.6 });
  const rail = new THREE.CylinderGeometry(0.018, 0.018, W - 0.3, 14); rail.rotateZ(Math.PI / 2);
  add(rail, railMat, 0, 0.92, -D + T + 0.07);
  const railS = new THREE.CylinderGeometry(0.018, 0.018, D - 0.4, 14); railS.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) add(railS, railMat, s * (W / 2 - T - 0.07), 0.92, -D / 2 - 0.1);
  const bracket = new THREE.CylinderGeometry(0.009, 0.009, 0.07, 8); bracket.rotateX(Math.PI / 2);
  for (const x of [-0.5, 0, 0.5]) add(bracket, railMat, x, 0.92, -D + T + 0.035);
  // решётка вентиляции и табличка
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshStandardMaterial({ map: grilleTexture(), metalness: 0.6, roughness: 0.5 }));
  grille.rotation.x = Math.PI / 2; grille.position.set(0, H - 0.051, -D + 0.25); g.add(grille);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshStandardMaterial({
    map: labelTexture(['ЛИФТ ПАССАЖИРСКИЙ', '400 КГ · 5 ЧЕЛ'], { w: 320, h: 160, bg: '#cfd2d4', fg: '#25272a', sizes: [26, 30] }), metalness: 0.5, roughness: 0.4,
  }));
  plate.position.set(-(O / 2 + side / 2), 1.52, -T - 0.003); plate.rotation.y = Math.PI; g.add(plate);

  // двери: две створки из шлифованной стали со скруглёнными кромками, по шву — чёрный
  // резиновый уплотнитель; открываясь, уезжают в карманы за облицовкой
  const LW = O / 2 + 0.02, LZ = 0.03;
  const leafG = new RoundedBoxGeometry(LW, OH + 0.015, 0.032, 2, 0.005);
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.85 });
  const leaves = [-1, 1].map((s) => {
    const leaf = add(leafG, doorMat, s * (LW / 2 + 0.0015), (OH + 0.015) / 2 + 0.06, LZ);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.008, OH - 0.02, 0.026), rubber);
    strip.position.set(-s * (LW / 2 - 0.002), 0, 0.004); leaf.add(strip);
    return leaf;
  });
  const leafX = (k) => LW / 2 + 0.0015 + k * (O / 2 + 0.004);

  // свет: панель под потолком и лампа
  const P = 1.35 * light;
  const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P, P * 0.98, P * 0.92) });
  const lightPanel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, D - 0.7), panelMat);
  lightPanel.rotation.x = Math.PI / 2; lightPanel.position.set(0, H - 0.052, -D / 2 + 0.12);
  g.add(lightPanel);
  // рамка плафона; сам свет мягкий: лампа слабее и гаснет быстрее — без пятен-бликов на стали
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xbfc3c6, metalness: 0.7, roughness: 0.4, envMap: env, envMapIntensity: 0.3 });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(W - 0.44, 0.02, 0.03), frameMat, 0, H - 0.06, -D / 2 + 0.12 + s * (D - 0.7) / 2);
    add(new THREE.BoxGeometry(0.03, 0.02, D - 0.64), frameMat, s * (W - 0.5) / 2, H - 0.06, -D / 2 + 0.12);
  }
  const lamp = new THREE.PointLight(0xfff2dc, 0.75 * light, 2.4, 2);
  lamp.position.set(0, H - 0.3, -D / 2);
  g.add(lamp);

  // табло снаружи и внутри, кнопки, вызов снаружи
  const disp = makeDisplay();
  const dispMat = new THREE.MeshBasicMaterial({ map: disp.tex, color: new THREE.Color(1.5, 1.5, 1.5) });
  const outDisp = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.135), dispMat);
  outDisp.position.set(0, OH + 0.2, FZ1 + 0.002); g.add(outDisp);
  const inDisp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), dispMat);
  inDisp.position.set(0, OH + 0.09, -T - 0.003); inDisp.rotation.y = Math.PI; g.add(inDisp);
  const btns = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.43), new THREE.MeshBasicMaterial({ map: buttonPanelTexture(), color: 0xd0d0d0 }));
  btns.position.set(-(O / 2 + side / 2), 1.1, -T - 0.003); btns.rotation.y = Math.PI; g.add(btns);
  const callPlate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.012), polished);
  callPlate.position.set(O / 2 + 0.22, 1.1, FZ1 + 0.006); g.add(callPlate);
  const callMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.5) });
  for (const y of [1.14, 1.06]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.022, 20), callMat); b.position.set(O / 2 + 0.22, y, FZ1 + 0.0125); g.add(b); }

  // над дверью снаружи — табличка «ЛИФТ» и лампа-стрелка «вниз»
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1), new THREE.MeshBasicMaterial({
    map: labelTexture(['ЛИФТ'], { w: 256, h: 64, bg: '#1b1c1e', fg: '#d9dcde', sizes: [40] }), color: 0xc8c8c8,
  }));
  sign.position.set(0, OH + 0.34, FZ1 + 0.002); g.add(sign);
  const arrow = new THREE.Mesh(new THREE.CircleGeometry(0.03, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.9, 0.3) }));
  arrow.rotation.z = -Math.PI / 2; arrow.position.set(O / 2 + 0.22, OH + 0.2, FZ1 + 0.003); g.add(arrow);

  if (standalone) {
    // будка: обшивка снаружи в цвет места (обои, плитка, бетон…), карниз, цоколь, стальные уголки;
    // спереди — портал с карманами для створок (он шире кабины)
    const skin = shell || steel;
    add(new THREE.BoxGeometry(W + 0.14, H + 0.22, 0.07), skin, 0, (H + 0.22) / 2, -D - 0.035);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.07, H + 0.22, D + 0.07), skin, s * (W / 2 + 0.035), (H + 0.22) / 2, -D / 2 - 0.035);
    add(new THREE.BoxGeometry(FW * 2 + 0.06, 0.12, D + 0.24), dark, 0, H + 0.28, -D / 2 + 0.01);
    add(new THREE.BoxGeometry(FW * 2, 0.3, D + 0.17), dark, 0, -0.12, -D / 2 + 0.01);
    for (const sx of [-1, 1]) for (const sz of [-0.03, -D - 0.07]) add(new THREE.BoxGeometry(0.05, H + 0.22, 0.05), polished, sx * (W / 2 + 0.07), (H + 0.22) / 2, sz);
  }

  disp.draw('0');
  let open = 0;
  const once = { doors: false, ding: false };
  const api = {
    group: g,
    lamp,
    once,
    get open() { return open; },
    setOpen(k) {
      open = THREE.MathUtils.clamp(k, 0, 1);
      leaves.forEach((l, i) => { l.position.x = (i ? 1 : -1) * leafX(open); });
    },
    setDisplay(text, arrow = 0) { disp.draw(text, arrow); },
    setLight(k) { lamp.intensity = 0.75 * light * k; panelMat.color.setRGB(P * k, P * 0.98 * k, P * 0.92 * k); },
  };
  return api;
}

// табло в поездке: этажи бегут по списку floors (откуда → куда)
function floorAt(floors, p) {
  const k = THREE.MathUtils.clamp((p - 0.16) / 0.68, 0, 0.999);
  return floors[Math.min(floors.length - 1, Math.floor(k * floors.length))];
}

// уезжаем (a: 0…1, первая половина перехода): двери закрываются, кабину трясёт
export function depart(el, a, pos, target, { audio, now }, floors) {
  const close = THREE.MathUtils.smoothstep(a, 0.02, 0.28);
  if (a < 0.02) el.once.doors = false;
  else if (!el.once.doors) { el.once.doors = true; audio.doors(); }
  el.setOpen(1 - close);
  const ride = THREE.MathUtils.smoothstep(a, 0.3, 0.45);
  el.setDisplay(a < 0.32 ? floors[0] : floorAt(floors, a * 0.5), a < 0.32 ? 0 : -1);
  el.setLight(1 - (Math.sin(now * 37) > 0.94 ? 0.6 : 0) * ride);
  audio.elevator(ride);
  shake(pos, target, now, ride);
}

// приехали (b: 0…1, вторая половина): тряска стихает, звонок, двери расходятся
export function arrive(el, b, pos, target, { audio, now }, floors) {
  const ride = 1 - THREE.MathUtils.smoothstep(b, 0.2, 0.36);
  el.setDisplay(b < 0.36 ? floorAt(floors, 0.5 + b * 0.5) : floors[floors.length - 1], b < 0.36 ? -1 : 0);
  if (b < 0.3) { el.once.ding = false; el.once.doors = false; }
  if (b > 0.38 && !el.once.ding) { el.once.ding = true; audio.ding(); }
  if (b > 0.44 && !el.once.doors) { el.once.doors = true; audio.doors(); }
  el.setOpen(THREE.MathUtils.smoothstep(b, 0.44, 0.82));
  el.setLight(1 - (Math.sin(now * 37) > 0.94 ? 0.6 : 0) * ride);
  audio.elevator(b < 1 ? ride : 0);
  shake(pos, target, now, ride);
}

function shake(pos, target, now, k) {
  pos.x += Math.sin(now * 31) * 0.004 * k;
  pos.y += Math.sin(now * 23) * 0.006 * k - k * 0.02;
  target.y += Math.sin(now * 17) * 0.01 * k;
}

// двери, пока по уровню просто идёшь: открываются, когда подходишь к лифту
export function doorsByDistance(el, dist, dt, audio) {
  const want = dist < 0.3 ? 1 : 1 - THREE.MathUtils.smoothstep(dist, 2.2, 5.5);
  if (want > 0.02 && el.open < 0.02) audio.doors();
  el.setOpen(el.open + (want - el.open) * Math.min(1, dt * 2.2));
}
