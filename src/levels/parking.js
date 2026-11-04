// Уровень −2 · парковка. Своя подземная парковка целиком, без дыр: пол, потолок, балки и стены
// — на текстурах, снятых с фотоскана «parking garage» (SPLEEN VISION, CC BY 4.0), поэтому всё
// выглядит одним местом. Пилоны с «зеброй», разметка мест по обе стороны прохода с колёсными
// упорами, люминесцентные светильники (часть мигает, часть мёртвая), темнота вдали.
// Навыки — на жёлтых табличках на пилонах. Приезжаешь на лифте с бассейна; в конце — лифт вниз.
import * as THREE from 'three';
import { Route } from '../route.js';
import { paintSign, floorStencil, labelTexture, canvas, toTexture, rng, slicer } from '../textures.js';
import { createElevator, CAB, depart, arrive, doorsByDistance } from '../elevator.js';
import { farPointAhead } from '../smiler.js';
import { SKILLS } from '../content.js';

// старая видеокассета на полу — находка
function makeCassette() {
  const g = new THREE.Group();
  const shell = new THREE.MeshLambertMaterial({ color: 0x1a1918 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.188, 0.025, 0.104), shell);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.05), new THREE.MeshLambertMaterial({
    map: labelTexture(['ЗАПИСЬ №0', 'НЕ ПЕРЕМАТЫВАТЬ'], { w: 512, h: 170, sizes: [54, 30] }),
    emissive: 0xffffff, emissiveIntensity: 0.12,
  }));
  label.rotation.x = -Math.PI / 2; label.position.set(0, 0.0127, -0.01);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.022), new THREE.MeshLambertMaterial({ color: 0x3a2a20 }));
  win.rotation.x = -Math.PI / 2; win.position.set(0, 0.0128, 0.03);
  g.add(body, label, win);
  g.traverse((o) => { if (o.isMesh) o.userData = { egg: 'tape' }; });
  return g;
}

// пилон: бетон с фотографии стены, внизу серо-голубая полоса оттуда же и красно-белая «зебра»
function columnSkin(wallImg) {
  const W = 256, H = 1024;
  const [c, g] = canvas(W, H);
  const iw = wallImg.width, ih = wallImg.height;
  g.drawImage(wallImg, 0, 0, iw * 0.4, ih * 0.6, 0, 0, W, H * 0.84);
  g.drawImage(wallImg, 0, ih * 0.68, iw * 0.4, ih * 0.24, 0, H * 0.84, W, H * 0.16);
  g.save();
  g.beginPath(); g.rect(0, H * 0.56, W, H * 0.26); g.clip();
  g.fillStyle = '#e4dfd3'; g.fillRect(0, H * 0.56, W, H * 0.26);
  g.fillStyle = '#c9472a';
  for (let k = -6; k < 12; k++) {
    g.beginPath();
    const y0 = H * 0.56 + k * 64;
    g.moveTo(0, y0); g.lineTo(W, y0 - 110); g.lineTo(W, y0 - 70); g.lineTo(0, y0 + 40); g.fill();
  }
  g.restore();
  // грязь и сколы по «зебре»
  const rand = rng(11);
  for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(40,36,30,${rand() * 0.3})`; g.fillRect(rand() * W, H * 0.55 + rand() * H * 0.3, 1 + rand() * 5, 1 + rand() * 4); }
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// белая разметка: краска стёрта шинами, края неровные
function lineTexture(seed = 5) {
  const rand = rng(seed);
  const [c, g] = canvas(64, 1024);
  g.clearRect(0, 0, 64, 1024);
  g.fillStyle = 'rgba(232,228,214,0.95)'; g.fillRect(4, 0, 56, 1024);
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 900; k++) { g.globalAlpha = 0.2 + rand() * 0.8; g.fillRect(rand() * 64, rand() * 1024, 1 + rand() * 6, 1 + rand() * 10); }
  for (let k = 0; k < 6; k++) { g.globalAlpha = 0.5; g.fillRect(0, rand() * 1024, 64, 20 + rand() * 60); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createParking({ renderer, lowPower }) {
  const tick = slicer();
  await document.fonts.load('700 100px "Oswald"').catch(() => {});
  const loader = new THREE.TextureLoader();
  const [floorTex, ceilTex, wallTex] = await Promise.all(['textures/park_floor.jpg', 'textures/park_ceiling.jpg', 'textures/park_wall.jpg'].map((u) => loader.loadAsync(u)));
  for (const t of [floorTex, ceilTex, wallTex]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.anisotropy = 8;
  }
  const scene = new THREE.Scene();
  const dark = new THREE.Color(0x070605);
  scene.background = dark;
  scene.fog = new THREE.FogExp2(dark, 0.06);

  const H = 3.2, EYE = 1.6;
  // пролёты между пилонами: первый — с табличкой уровня, дальше по пролёту на каждые две технологии
  const SPANS = 1 + SKILLS.reduce((a, g) => a + Math.ceil(g.items.length / 2), 0);
  const STEP = 5.4, X0 = -9.6;
  const exitX = X0 - (SPANS + 0.6) * STEP;
  const EAST = 8.7, NORTH = -15.2, SOUTH = 18.2, MID = 1.5;
  const K0 = -3, K1 = SPANS + 1; // пилоны от начала до торцевой стены

  // пол и потолок: 2,4 м брусчатки и 3,6 м бетона на повтор, зеркально — без видимых швов
  const lenX = EAST - exitX, cxX = (EAST + exitX) / 2, lenZ = SOUTH - NORTH;
  const fT = floorTex.clone(); fT.repeat.set(lenX / 2.4, lenZ / 2.4); fT.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(lenX, lenZ), new THREE.MeshLambertMaterial({ map: fT, color: 0xf2ecdf }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cxX, 0, (NORTH + SOUTH) / 2);
  const cT = ceilTex.clone(); cT.repeat.set(lenX / 3.6, lenZ / 3.6); cT.needsUpdate = true;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(lenX, lenZ), new THREE.MeshLambertMaterial({ map: cT, color: 0xd8d2c4 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cxX, H, (NORTH + SOUTH) / 2);
  scene.add(floor, ceil);
  await tick();

  // стены: панели с фотографии (без полоски пола внизу), по 1,9 м
  const wallMat = (len) => {
    const t = wallTex.clone(); t.repeat.set(len / 1.9, 0.94); t.offset.set(0, 0.06); t.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: t, color: 0xe6e0d2 });
  };
  const wall = (len, x, z, ry, h = H, y = H / 2) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wallMat(len));
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
  };
  const walls = [
    wall(lenX, cxX, NORTH, 0), wall(lenX, cxX, SOUTH, Math.PI), wall(lenZ, EAST, (NORTH + SOUTH) / 2, -Math.PI / 2),
  ];
  // торцевая стена с проёмом под лифт
  const gapHalf = CAB.W / 2 + 0.12;
  const lA = (MID - gapHalf) - NORTH, lB = SOUTH - (MID + gapHalf);
  walls.push(wall(lA, exitX, NORTH + lA / 2, Math.PI / 2), wall(lB, exitX, MID + gapHalf + lB / 2, Math.PI / 2));
  walls.push(wall(gapHalf * 2, exitX, MID, Math.PI / 2, H - CAB.H - 0.22, CAB.H + 0.22 + (H - CAB.H - 0.22) / 2));
  await tick();

  // балки поперёк прохода
  const bT = ceilTex.clone(); bT.repeat.set(1, lenZ / 3.6); bT.needsUpdate = true;
  const beamMat = new THREE.MeshLambertMaterial({ map: bT, color: 0xdcd6c8 });
  const mtx = new THREE.Matrix4();
  const beamCount = K1 - K0 + 1;
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.42, lenZ), beamMat, beamCount);
  for (let k = K0; k <= K1; k++) beams.setMatrixAt(k - K0, mtx.makeTranslation(X0 - k * STEP, H - 0.21, (NORTH + SOUTH) / 2));
  scene.add(beams);

  // пилоны-«лезвия» поперёк прохода: широкая грань смотрит навстречу идущему — на ней табличка
  const colMat = new THREE.MeshLambertMaterial({ map: columnSkin(wallTex.image) });
  const colG = new THREE.BoxGeometry(0.42, H, 1.25); colG.translate(0, H / 2, 0);
  const ROWS = [-2.1, 5.1, -10.4, 13.4];
  const cols = new THREE.InstancedMesh(colG, colMat, beamCount * ROWS.length);
  let ci = 0;
  for (let k = K0; k <= K1; k++) for (const z of ROWS) cols.setMatrixAt(ci++, mtx.makeTranslation(X0 - k * STEP, 0, z));
  scene.add(cols);
  await tick();

  // разметка мест по обе стороны прохода: линии с «Т» у проезда и колёсные упоры у стены
  const lineMat = new THREE.MeshLambertMaterial({ map: lineTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const lineG = new THREE.PlaneGeometry(0.12, 4.8); lineG.rotateX(-Math.PI / 2);
  const tG = new THREE.PlaneGeometry(0.7, 0.12); tG.rotateX(-Math.PI / 2);
  const stopMat = new THREE.MeshLambertMaterial({ map: ceilTex, color: 0xb8b2a6 });
  const stopG = new THREE.BoxGeometry(1.5, 0.13, 0.16);
  const bays = [];
  for (let k = K0; k < K1; k++) for (let b = 0; b < 3; b++) bays.push(X0 - k * STEP - 0.9 - b * 1.8 - (b > 0 ? 0 : 0));
  const lines = new THREE.InstancedMesh(lineG, lineMat, bays.length * 2);
  const tees = new THREE.InstancedMesh(tG, lineMat, bays.length * 2);
  const stops = new THREE.InstancedMesh(stopG, stopMat, bays.length * 2);
  bays.forEach((x, i) => {
    lines.setMatrixAt(i * 2, mtx.makeTranslation(x, 0.004, -2.4 - 2.4));
    lines.setMatrixAt(i * 2 + 1, mtx.makeTranslation(x, 0.004, 5.4 + 2.4));
    tees.setMatrixAt(i * 2, mtx.makeTranslation(x, 0.005, -2.4));
    tees.setMatrixAt(i * 2 + 1, mtx.makeTranslation(x, 0.005, 5.4));
    stops.setMatrixAt(i * 2, mtx.makeTranslation(x - 0.9, 0.065, -6.7));
    stops.setMatrixAt(i * 2 + 1, mtx.makeTranslation(x - 0.9, 0.065, 9.7));
  });
  scene.add(lines, tees, stops);

  // две надписи краской по полу проезда: номер уровня у лифта, откуда приходишь, и «ЛИФТ»
  // перед лифтом вниз — без стрелок; буквы вытянуты по ходу движения
  const stencilMat = (text, seed) => new THREE.MeshLambertMaterial({ map: floorStencil(text, { seed }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const stencilG = new THREE.PlaneGeometry(2.3, 4.0); stencilG.rotateX(-Math.PI / 2);
  for (const [text, x, seed] of [['−2', 2.4, 31], ['ЛИФТ', exitX + 4.6, 37]]) {
    const m = new THREE.Mesh(stencilG, stencilMat(text, seed));
    m.rotation.y = Math.PI / 2; m.position.set(x, 0.006, MID);
    scene.add(m);
  }

  // светильники: металлический корпус и две трубки; часть мигает, часть мёртвая
  const lamps = [];
  for (let i = 0; i < (SPANS + 5) * 2; i++) {
    const x = 6.4 - i * (STEP / 2);
    if (x < exitX + 2.2) break;
    const z = i % 2 ? 0.2 : 2.8;
    const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
    const state = i < 4 ? 'on' : (r < 0.16 ? 'off' : r < 0.34 ? 'flicker' : 'on');
    lamps.push({ pos: new THREE.Vector3(x, H - 0.05, z), state, seed: i * 7.3, order: i });
  }
  const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(1.34, 0.07, 0.26), new THREE.MeshLambertMaterial({ color: 0x8a8a86 }), lamps.length);
  const tubeG = new THREE.CylinderGeometry(0.02, 0.02, 1.22, 8); tubeG.rotateZ(Math.PI / 2);
  const tubes = new THREE.InstancedMesh(tubeG, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), lamps.length * 2);
  const warm = new THREE.Color(2.6, 2.35, 1.7);
  lamps.forEach((l, i) => {
    housing.setMatrixAt(i, mtx.makeTranslation(l.pos.x, H - 0.04, l.pos.z));
    for (const s of [0, 1]) {
      tubes.setMatrixAt(i * 2 + s, mtx.makeTranslation(l.pos.x, H - 0.1, l.pos.z + (s ? 0.06 : -0.06)));
      tubes.setColorAt(i * 2 + s, warm);
    }
  });
  scene.add(housing, tubes);
  const lights = Array.from({ length: lowPower ? 4 : 6 }, () => {
    const l = new THREE.PointLight(0xffd98f, 0, 11, 1.7);
    scene.add(l);
    return l;
  });
  // тусклый рассеянный свет: темнота остаётся, но пол, потолок и пилоны читаются
  const hemi = new THREE.HemisphereLight(0xffe2a6, 0x1d170d, 2.4);
  scene.add(hemi);
  await tick();

  // --- навыки на табличках ---
  const paint = (tex, w, h, glow = 0.45) => new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  let span = 1;
  const groupAt = [];
  SKILLS.forEach((grp, gi) => {
    const startSpan = span;
    grp.items.forEach((name, k) => {
      const i = startSpan + Math.floor(k / 2);
      const side = k % 2 ? 1 : -1;
      const m = paint(paintSign(name, { seed: 80 + gi * 10 + k, code: `${gi + 1}${String.fromCharCode(65 + k)}` }), 1.2, 0.35);
      m.position.set(X0 - i * STEP + 0.215, 1.62, side < 0 ? ROWS[0] : ROWS[1]);
      m.rotation.y = Math.PI / 2;
      scene.add(m);
    });
    span += Math.ceil(grp.items.length / 2);
    groupAt.push({ id: `cap-s${gi}`, x0: X0 - (startSpan - 0.9) * STEP, x1: X0 - (span - 0.75) * STEP });
  });
  const lv = paint(paintSign('УРОВЕНЬ −2', { seed: 7, bg: '#d9d2bd', code: 'P' }), 1.2, 0.35);
  lv.position.set(X0 + 0.215, 1.62, ROWS[0]); lv.rotation.y = Math.PI / 2;
  scene.add(lv);
  await tick();

  // --- лифты ---
  const el = createElevator(renderer, { light: 0.4, shell: wallMat(1.9) });
  el.group.position.set(exitX + 0.02, 0, MID);
  el.group.rotation.y = Math.PI / 2;
  scene.add(el.group);
  const liftSign = paint(paintSign('ЛИФТ', { seed: 9, bg: '#d9d2bd', code: '↕' }), 1.0, 0.29, 0.5);
  liftSign.rotation.y = Math.PI / 2; liftSign.position.set(exitX + 0.01, CAB.H + 0.5, MID - 1.55);
  scene.add(liftSign);
  const doorLamp = new THREE.PointLight(0xffe4b0, 5, 8, 1.6);
  doorLamp.position.set(exitX + 1.4, H - 0.4, MID);
  scene.add(doorLamp);
  const IN_X = 6.85;
  const liftIn = createElevator(renderer, { standalone: true, light: 0.55, shell: wallMat(1.9) });
  liftIn.group.position.set(IN_X, 0, MID);
  liftIn.group.rotation.y = -Math.PI / 2;
  scene.add(liftIn.group);

  // находка: чужая кассета у пилона
  const tape = makeCassette();
  tape.position.set(X0 - 3 * STEP + 1.1, 0.013, ROWS[0] + 1.25);
  tape.rotation.y = 0.5;
  scene.add(tape);
  const picks = [];
  tape.traverse((o) => { if (o.isMesh) picks.push(o); });

  // --- маршрут: из лифта вдоль пилонов к лифту в торце, внутрь и разворот ---
  const inside = exitX - CAB.D / 2;
  const route = new Route([
    { p: [IN_X + CAB.D / 2, EYE, MID], look: [-12, EYE - 0.15, MID] },
    { p: [5.2, EYE, MID + 0.05], look: [-12, EYE - 0.15, MID] },
    { p: [1.0, EYE, MID], look: [-16, EYE - 0.2, MID - 0.1] },
    { p: [-5.0, EYE, MID], look: [-20, EYE - 0.25, MID] },
    ...Array.from({ length: span }, (_, i) => {
      const x = X0 - (i + 0.5) * STEP;
      return { p: [x, EYE, MID + Math.sin(i * 1.3) * 0.25], look: [x - 9, EYE - 0.2 + Math.sin(i * 0.9) * 0.05, MID + Math.sin(i * 1.7) * 0.6] };
    }),
    { p: [exitX + 4.2, EYE, MID], look: [exitX - 2, EYE - 0.15, MID] },
    { p: [exitX + 1.5, EYE, MID], look: [exitX - 3, EYE - 0.1, MID] },
    { p: [inside + 0.25, EYE, MID], look: [inside - 2, EYE - 0.2, MID + 0.5] },
    { p: [inside + 0.05, EYE, MID + 0.05], look: [inside, EYE - 0.1, MID + 2.1] },
    { p: [inside, EYE, MID], look: [exitX + 6, EYE - 0.1, MID] },
  ]);
  const sOfX = (x) => {
    let best = 0, bd = 1e9;
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    for (let s = 0; s <= route.length; s += 0.25) { route.sample(s, p, t); const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  const stations = [
    { id: 'cap-park', from: sOfX(5.4), to: sOfX(-3.5) },
    ...groupAt.map((g) => ({ id: g.id, from: sOfX(g.x0), to: sOfX(g.x1) })),
    { id: 'cap-lift', from: sOfX(exitX + 3), to: route.length + 1 },
  ];

  // --- лампы, провалы света, улыбка в темноте ---
  const near = [];
  const c = new THREE.Color();
  let wake = 1, lastLit = -1, nextBlackout = 6, blackout = 0, riding = false, haunted = false, tExt = 0, nextTry = 0;
  const hauntObjects = [cols, ...walls];
  function lampLevel(l, now) {
    if (l.state === 'off') return 0.04;
    if (l.state === 'flicker') return Math.sin(now * 21 + l.seed) > 0.55 || Math.sin(now * 2.7 + l.seed) > 0.92 ? 0.12 : 1;
    return 1;
  }
  function update(dt, now, { camera, audio, playing, kick, smilers, walking }) {
    if (playing && now > nextBlackout) {
      blackout = 0.3; nextBlackout = now + 10 + Math.random() * 12;
      audio.flicker(); kick(0.3);
    }
    blackout = Math.max(0, blackout - dt);
    const dip = blackout > 0 ? (Math.sin(blackout * 80) > 0 ? 0.1 : 0.5) : 1;
    // улыбка: в темноте между дальними пилонами, один раз — пока идёшь
    if (playing && !haunted && smilers.left > 0 && camera.position.x < X0 - STEP && camera.position.x > exitX + 8) {
      if (walking > 0.25) tExt += dt;
      if (tExt > 2 && walking > 0.25 && now > nextTry) {
        nextTry = now + 0.5;
        const p = farPointAhead(camera, hauntObjects, { min: 13, max: 24, spread: 0.45 });
        if (p && smilers.spawn(scene, p, { dur: 2.4 })) haunted = true;
      }
    }
    const lit = Math.floor(wake * 8);
    if (lit !== lastLit && lit > lastLit && lit > 0) audio.lampOn();
    lastLit = lit;
    hemi.intensity = 2.4 * THREE.MathUtils.smoothstep(wake, 0.15, 0.6) * dip;
    near.length = 0;
    for (const l of lamps) {
      if (l.state === 'off') continue;
      const dx = l.pos.x - camera.position.x;
      if (dx > 4 || dx < -26) continue;
      near.push(l);
    }
    near.sort((a, b) => a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
    lights.forEach((p, i) => {
      const l = near[i];
      if (!l) { p.intensity = 0; return; }
      const on = l.order / 4 < wake * 8 ? 1 : 0;
      p.position.copy(l.pos).setY(H - 0.4);
      p.intensity = 18 * lampLevel(l, now) * dip * on;
    });
    lamps.forEach((l, i) => {
      const on = l.order / 4 < wake * 8 ? 1 : 0;
      c.copy(warm).multiplyScalar(Math.max(0.03, lampLevel(l, now) * dip * on));
      tubes.setColorAt(i * 2, c); tubes.setColorAt(i * 2 + 1, c);
    });
    tubes.instanceColor.needsUpdate = true;
    // двери лифта: открываются, когда подходишь; пока едем — ими управляет переход
    if (!riding) {
      doorsByDistance(el, camera.position.x - exitX, dt, audio);
      el.setDisplay('−2');
      el.setLight(1);
    }
    riding = false;
    doorLamp.intensity = 5 * dip * THREE.MathUtils.smoothstep(wake, 0.3, 0.8);
  }

  // приезд с бассейна: двери расходятся — а трубки парковки зажигаются одна за другой
  function enter(b, pos, target, ctx) {
    arrive(liftIn, b, pos, target, ctx, ['−1', '−2']);
    wake = THREE.MathUtils.smoothstep(b, 0.4, 1);
  }
  // выход: лифт вниз, на последний уровень
  function exit(a, pos, target, ctx) {
    riding = true;
    depart(el, a, pos, target, ctx, ['−2', '?', '??', '−3']);
  }
  function leave({ audio }) { audio.elevator(0); }

  return {
    id: 'parking',
    label: 'УРОВЕНЬ −2 · ПАРКОВКА',
    scene, route, stations, update, enter, exit, leave, picks,
    floor: 'parking',
    transition: 7, // поездка в лифте
    exitGlitch: 0.4,
    glitchSharp: 7, // помехи — только в миг «склейки» лифтов, остальное время видно поездку
    bloom: { strength: 0.6, radius: 0.65, threshold: 1.25 },
    exposure: 1.0,
    grade: { tint: [1.04, 0.99, 0.8], sat: 0.74 },
  };
}
