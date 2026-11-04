// Уровень 0: модель «Backrooms VR» (VTX, CC BY 4.0). Свет в ней запечён в текстуры,
// поэтому материалы переводятся в «неосвещаемые» — картинка ровно такая, какой её запёк автор.
// Маршрут: коридор → комната с креслом → длинный коридор → большие залы → лифт у двери «EXIT».
// По дороге — рассказ о себе по частям; в длинном коридоре на ходу может мелькнуть улыбка;
// у кресла стоит бутылка миндальной воды (находка).
import * as THREE from 'three';
import { Route } from '../route.js';
import { farPointAhead } from '../smiler.js';
import { canvas } from '../textures.js';
import { createElevator, depart, doorsByDistance, CAB } from '../elevator.js';

const FLOOR = -0.12;
const EYE = FLOOR + 1.6;

// бутылка миндальной воды: тело вращения, полупрозрачный пластик, этикетка
function almondWater() {
  const pts = [[0, 0], [0.07, 0], [0.074, 0.01], [0.074, 0.17], [0.06, 0.2], [0.028, 0.235], [0.024, 0.26], [0, 0.26]].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 32);
  const [c, g] = canvas(256, 256);
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, '#9fb7bf'); gr.addColorStop(0.18, '#e6f1f3'); gr.addColorStop(0.3, '#b9cdd2'); gr.addColorStop(0.75, '#8aa3ab'); gr.addColorStop(1, '#9fb7bf');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  // этикетка (по высоте 0.06–0.15 м → v 0.23–0.58)
  g.fillStyle = '#f1e6c8'; g.fillRect(0, 256 * (1 - 0.58), 256, 256 * 0.35);
  g.fillStyle = '#6b4a2a'; g.font = '700 22px "Oswald", sans-serif'; g.textAlign = 'center';
  g.fillText('МИНДАЛЬНАЯ', 70, 256 * 0.52); g.fillText('ВОДА', 70, 256 * 0.6);
  g.fillStyle = '#b07a3a'; g.beginPath(); g.ellipse(190, 256 * 0.56, 22, 14, 0.4, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: 0xd8cfae, transparent: true, opacity: 0.93 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 20), new THREE.MeshBasicMaterial({ color: 0x5f7f9a }));
  cap.position.y = 0.271;
  const grp = new THREE.Group();
  grp.add(body, cap);
  return { grp, pick: body };
}

export async function createLobby({ loadGLB, renderer }) {
  const gltf = await loadGLB('models/lobby.glb');
  const scene = new THREE.Scene();
  const haze = new THREE.Color(0xa38f55);
  scene.background = haze;
  scene.fog = new THREE.FogExp2(haze, 0.026);

  // свет запечён: берём запечённую карту (она же «свечение») в простой неосвещаемый материал
  const mats = [];
  const solids = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    const tex = src.emissiveMap || src.map;
    const glow = src.emissiveIntensity > 1.5 || /emission_red/i.test(src.name);
    const color = tex ? new THREE.Color(1, 1, 1) : (src.emissive && src.emissive.getHex() ? src.emissive.clone() : src.color.clone());
    if (glow) color.multiplyScalar(/red/i.test(src.name) ? 2.4 : 2.1);
    const m = new THREE.MeshBasicMaterial({
      map: tex || null,
      color,
      transparent: src.transparent,
      opacity: src.opacity,
      alphaTest: src.alphaTest,
      side: src.side,
      name: src.name,
    });
    m.userData.base = color.clone();
    o.material = m;
    mats.push(m);
    solids.push(o);
    src.dispose();
  });
  scene.add(gltf.scene);

  // находка: миндальная вода у кресла
  const bottle = almondWater();
  bottle.grp.position.set(-0.98, FLOOR, -0.12);
  bottle.grp.rotation.y = 0.6;
  scene.add(bottle.grp);
  bottle.pick.userData = { egg: 'almond' };
  for (const m of [bottle.pick.material]) { m.userData.base = m.color.clone(); mats.push(m); }

  // лифт стоит за дверью «EXIT» и смотрит на неё: сквозь дверь проходишь ноуклипом
  const EXIT_X = -36.4, DOOR_X = -38.0, LIFT_Z = 12.84;
  // обшивка лифта — те же жёлтые обои, что на стенах уровня
  const [wc, wg] = canvas(256, 256);
  wg.fillStyle = '#cdb978'; wg.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 * 16; x < 256; x += 32) { wg.fillStyle = 'rgba(150,128,60,0.18)'; wg.fillRect(x + 12, y + 8, 6, 14); }
  for (let x = 0; x < 256; x += 64) { wg.fillStyle = 'rgba(120,100,40,0.12)'; wg.fillRect(x, 0, 2, 256); }
  const wpTex = new THREE.CanvasTexture(wc); wpTex.colorSpace = THREE.SRGBColorSpace; wpTex.wrapS = wpTex.wrapT = THREE.RepeatWrapping; wpTex.repeat.set(2, 3);
  const el = createElevator(renderer, { standalone: true, light: 0.8, shell: new THREE.MeshStandardMaterial({ map: wpTex, roughness: 0.9 }) });
  el.group.position.set(DOOR_X, FLOOR, LIFT_Z);
  el.group.rotation.y = Math.PI / 2;
  scene.add(el.group);
  // свет только для лифта: запечённые материалы уровня его не замечают
  scene.add(new THREE.HemisphereLight(0xfff1c8, 0x6a5a30, 1.7));
  const inside = DOOR_X - CAB.D / 2;

  const route = new Route([
    { p: [4.5, EYE, 5.1], look: [-10, 1.4, 5.1] },
    { p: [1.7, EYE, 5.15], look: [-6, 1.35, 4.4] },
    { p: [0.2, EYE, 4.6], look: [-1.4, 1.0, 0.6] },
    { p: [-0.45, EYE, 3.2], look: [-1.75, 0.75, -0.9] },
    { p: [-0.75, EYE, 2.25], look: [-1.8, 0.7, -0.95] },
    { p: [-1.15, EYE, 3.7], look: [-4.5, 1.3, 5.0] },
    { p: [-2.8, EYE, 5.1], look: [-12, 1.4, 5.1] },
    { p: [-10, EYE, 5.1], look: [-20, 1.4, 5.2] },
    { p: [-17.5, EYE, 5.1], look: [-26, 1.3, 7.8] },
    { p: [-23, EYE, 5.8], look: [-29, 1.3, 11.5] },
    { p: [-26.6, EYE, 11.2], look: [-34, 1.3, 12.8] },
    { p: [-31.2, EYE, 12.8], look: [-37, 1.2, LIFT_Z] },
    { p: [EXIT_X + 0.9, EYE, LIFT_Z], look: [EXIT_X - 3, EYE - 0.05, LIFT_Z] },
    { p: [EXIT_X - 0.7, EYE, LIFT_Z], look: [inside - 2, EYE - 0.15, LIFT_Z] },
    { p: [inside + 0.25, EYE, LIFT_Z], look: [inside - 2, EYE - 0.2, LIFT_Z + 0.5] },
    { p: [inside + 0.05, EYE, LIFT_Z + 0.05], look: [inside, EYE - 0.1, LIFT_Z + 2.1] },
    { p: [inside, EYE, LIFT_Z], look: [DOOR_X + 6, EYE - 0.1, LIFT_Z] },
  ]);

  // рассказ о себе по частям: заголовок после приземления, «кто я» — в комнате с креслом,
  // дальше — во второй половине длинного коридора и в залах, не сразу
  const stations = [
    { id: 'cap-title', from: -1, to: route.at(1) + 0.2 },
    { id: 'cap-a1', from: route.at(3) - 0.4, to: route.at(5) + 0.5 },
    { id: 'cap-a2', from: route.at(7) - 1.0, to: route.at(8) - 1.5 },
    { id: 'cap-a3', from: route.at(8) - 0.5, to: route.at(9) + 2.0 },
    { id: 'cap-a4', from: route.at(10) - 1.0, to: route.at(11) + 0.5 },
    { id: 'cap-exit', from: route.at(12) + 0.4, to: route.length + 1 },
  ];

  // «проседание» сети: все лампы гаснут на долю секунды. Один раз, когда идёшь по длинному
  // коридору, свет гаснет надолго — и в конце коридора появляется улыбка
  let nextBlackout = 7, blackout = 0, k = 1, deep = false, haunted = false, inHall = 0, nextTry = 0;
  let riding = false, lastX = 99;
  function update(dt, now, { audio, playing, kick, camera, s, smilers, walking }) {
    // сквозь дверь «EXIT» — ноуклип: плёнку дёргает в момент прохода
    const x = camera.position.x;
    if ((lastX - EXIT_X) * (x - EXIT_X) < 0 && Math.abs(camera.position.z - LIFT_Z) < 1.2) { kick(0.75); audio.glitch(0.4); }
    lastX = x;
    if (!riding) {
      doorsByDistance(el, camera.position.x - DOOR_X, dt, audio);
      el.setDisplay('0'); el.setLight(1); audio.elevator(0);
    }
    riding = false;
    if (playing && !haunted && smilers.left > 0 && s > route.at(6) + 1.5 && s < route.at(8) - 2) {
      if (walking > 0.25) inHall += dt;
      if (inHall > 1.0 && walking > 0.25 && blackout <= 0 && now > nextTry) {
        nextTry = now + 0.4;
        const p = farPointAhead(camera, solids, { min: 12, max: 26, spread: 0.12 });
        if (p) {
          haunted = true; deep = true; blackout = 2.3;
          audio.flicker(); kick(0.3);
          setTimeout(() => { if (deep) smilers.spawn(scene, p, { dur: 1.7, scale: 1.4 }); }, 280);
        }
      }
    }
    if (playing && now > nextBlackout && blackout <= 0) {
      blackout = 0.24; nextBlackout = now + 9 + Math.random() * 12;
      audio.flicker(); kick(0.25);
    }
    blackout = Math.max(0, blackout - dt);
    if (blackout <= 0 && deep) { deep = false; kick(0.35); audio.flicker(); }
    let dip = 1;
    if (blackout > 0) dip = deep ? (blackout > 2.1 || blackout < 0.12 ? 0.5 : 0.09 + 0.03 * Math.sin(now * 40)) : (Math.sin(blackout * 90) > 0 ? 0.18 : 0.55);
    const breath = 1 - 0.012 * (Math.sin(now * 13.7) * 0.5 + 0.5);
    const nk = dip * breath;
    if (Math.abs(nk - k) > 0.001) {
      k = nk;
      for (const m of mats) m.color.copy(m.userData.base).multiplyScalar(k);
    }
  }

  // выход: лифт вниз, на уровень −1
  function exit(a, pos, target, ctx) {
    riding = true;
    depart(el, a, pos, target, ctx, ['0', '−1']);
  }

  return {
    id: 'lobby',
    label: 'УРОВЕНЬ 0 · ХОЛЛ',
    scene, route, stations, update, exit,
    picks: [bottle.pick],
    floor: 'lobby',
    transition: 7,
    exitGlitch: 0.4,
    glitchSharp: 7, // помехи — только в миг «склейки» двух лифтов
    bloom: { strength: 0.55, radius: 0.7, threshold: 0.86 },
    exposure: 1.0,
    grade: { tint: [1.03, 1.0, 0.84], sat: 0.82 },
  };
}
