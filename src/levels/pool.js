// Уровень −1 · бассейны: модель «Azure Swimming Pool Pripyat» (Yarik16, CC BY 4.0), переделанная
// под Backrooms: всё в белой мозаике (своя процедурная, наложена по мировым координатам), потолок —
// матовые панели, дорожки убраны, вода бирюзовая с отражением и бликами, на дне — каустика, свет —
// солнце сквозь окна. Проекты — на старых кинескопных телевизорах вдоль бортика, клик по экрану
// открывает проект. Приезжаешь и уезжаешь на лифте.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Route } from '../route.js';
import { poolTiles, tvPlastic, tvFront, cableRubber, labelTexture, canvas, toTexture, rng, slicer } from '../textures.js';
import { createElevator, depart, arrive, doorsByDistance, CAB } from '../elevator.js';
import { PROJECTS } from '../content.js';

const TILE_COMMON = /* glsl */ `
  varying vec3 vWP; varying vec3 vWN;
  uniform sampler2D tTile; uniform sampler2D tTileN; uniform sampler2D tTileR;
  uniform float uScale; uniform float uTime; uniform float uWaterY;
  uniform vec2 uPoolMin; uniform vec2 uPoolMax;
  vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  // каустика: светлые «жилки» на границах подвижных ячеек, два слоя разного масштаба
  float cellEdge(vec2 p, float t){
    vec2 g = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = hash2(g + o);
      vec2 r = o + 0.5 + 0.42 * sin(t * 0.8 + 6.2831 * h) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    return sqrt(d2) - sqrt(d1);
  }
  float caustic(vec2 p, float t){
    float a = cellEdge(p, t);
    float b = cellEdge(p * 1.9 + 4.3, t * 1.27);
    return pow(1.0 - smoothstep(0.0, 0.22, a), 3.0) * 0.55 + pow(1.0 - smoothstep(0.0, 0.18, b), 3.0) * 0.35;
  }
`;
const TILE_MAP = /* glsl */ `
  vec3 tw = pow(abs(normalize(vWN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
  vec2 uvX = vWP.zy * uScale; vec2 uvY = vWP.xz * uScale; vec2 uvZ = vWP.xy * uScale;
  diffuseColor.rgb *= texture2D(tTile, uvX).rgb * tw.x + texture2D(tTile, uvY).rgb * tw.y + texture2D(tTile, uvZ).rgb * tw.z;
`;
const TILE_ROUGH = /* glsl */ `
  float roughnessFactor = roughness * (texture2D(tTileR, uvX).r * tw.x + texture2D(tTileR, uvY).r * tw.y + texture2D(tTileR, uvZ).r * tw.z);
`;
const TILE_NORMAL = /* glsl */ `
  {
    vec3 nX = texture2D(tTileN, uvX).xyz * 2.0 - 1.0;
    vec3 nY = texture2D(tTileN, uvY).xyz * 2.0 - 1.0;
    vec3 nZ = texture2D(tTileN, uvZ).xyz * 2.0 - 1.0;
    vec3 wn = normalize(vWN);
    #ifdef DOUBLE_SIDED
      wn *= faceDirection;
    #endif
    vec3 pert = vec3(0.0, nX.y, nX.x) * tw.x + vec3(nY.x, 0.0, nY.y) * tw.y + vec3(nZ.x, nZ.y, 0.0) * tw.z;
    normal = normalize((viewMatrix * vec4(normalize(wn + pert * 0.55), 0.0)).xyz);
  }
`;
const TILE_WATER = /* glsl */ `
  {
    float inside = step(uPoolMin.x - 0.05, vWP.x) * step(vWP.x, uPoolMax.x + 0.05) * step(uPoolMin.y - 0.05, vWP.z) * step(vWP.z, uPoolMax.y + 0.05);
    if (inside > 0.5 && vWP.y < uWaterY - 0.02) {
      float depth = clamp((uWaterY - vWP.y) / 4.5, 0.0, 1.0);
      float c = caustic(vWP.xz * 0.55 + vWP.y * 0.12, uTime);
      outgoingLight += diffuseColor.rgb * c * (0.95 - depth * 0.5) * vec3(0.85, 1.0, 1.0);
      outgoingLight *= mix(vec3(1.0), vec3(0.4, 0.85, 0.9), 0.32 + depth * 0.58);
    }
  }
`;

function tileMaterial(tiles, shared, color = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tTile: { value: tiles.map }, tTileN: { value: tiles.normal }, tTileR: { value: tiles.rough },
      uScale: { value: 1 / 2.0 }, uTime: shared.uTime, uWaterY: shared.uWaterY,
      uPoolMin: shared.uPoolMin, uPoolMax: shared.uPoolMax,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TILE_COMMON)
      .replace('#include <map_fragment>', TILE_MAP)
      .replace('#include <roughnessmap_fragment>', TILE_ROUGH)
      .replace('#include <normal_fragment_maps>', TILE_NORMAL)
      .replace('#include <opaque_fragment>', TILE_WATER + '\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'pool-tile';
  return m;
}

// вода: отражение зала с рябью, по краям (под углом) зеркалит сильнее, сверху видно дно
const WaterShader = {
  name: 'PoolWater',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 },
    ...THREE.UniformsLib.fog,
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWP;
    #include <common>
    #include <fog_pars_vertex>
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime;
    varying vec4 vUv; varying vec3 vWP;
    #include <common>
    #include <fog_pars_fragment>
    void main(){
      vec2 p = vWP.xz;
      vec2 d = vec2(sin(p.x * 1.3 + uTime * 0.8) + 0.6 * sin(p.y * 1.7 - uTime * 0.6) + 0.3 * sin((p.x + p.y) * 2.9 + uTime * 1.3),
                    cos(p.y * 1.1 + uTime * 0.7) + 0.6 * cos(p.x * 1.9 - uTime * 0.9) + 0.3 * cos((p.x - p.y) * 3.3 - uTime * 1.1));
      vec4 uv = vUv; uv.xy += d * 0.009 * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 V = normalize(cameraPosition - vWP);
      vec3 N = normalize(vec3(d.x * 0.035, 1.0, d.y * 0.035));
      float fres = 0.03 + 0.97 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
      float glint = pow(max(0.0, sin(p.x * 7.0 + uTime * 2.1) * sin(p.y * 6.0 - uTime * 1.7)), 30.0) * 0.5;
      vec3 col = mix(color, refl, clamp(0.25 + fres, 0.0, 1.0)) + glint;
      gl_FragColor = vec4(col, clamp(0.3 + fres * 0.85, 0.0, 0.93));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
};

// кинескопный экран: скриншот проекта, бочка, строки, маска, бегущая полоса
function screenMaterial(map, shared) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uTime: shared.uTime, uHover: { value: 0 }, uSeed: { value: Math.random() * 10 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float uTime; uniform float uHover; uniform float uSeed; varying vec2 vUv;
      void main(){
        vec2 c = vUv - 0.5; float r2 = dot(c, c);
        vec2 uv = 0.5 + c * (1.0 + 0.14 * r2);
        uv.x += sin(uv.y * 230.0 + uTime * 9.0) * 0.0005;
        vec2 suv = vec2(uv.x * 0.8334 + 0.0833, uv.y);
        vec3 col = vec3(0.0);
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
          col.r = texture2D(map, suv + vec2(0.0016, 0.0)).r;
          col.g = texture2D(map, suv).g;
          col.b = texture2D(map, suv - vec2(0.0016, 0.0)).b;
        }
        col *= 0.8 + 0.2 * sin(vUv.y * 470.0);
        col *= 0.92 + 0.08 * sin(vUv.x * 1100.0);
        col *= 0.95 + 0.05 * smoothstep(0.0, 0.07, abs(fract(vUv.y - uTime * 0.11 + uSeed) - 0.5));
        col *= 1.0 - smoothstep(0.17, 0.3, r2);
        col += vec3(0.018, 0.026, 0.03) * (1.0 - r2 * 3.0);
        col *= 1.7 + uHover * 0.6 + 0.03 * sin(uTime * 60.0 + uSeed);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// шпон «под орех» для корпусов в деревянном стиле
function woodGrain(seed) {
  const rand = rng(seed);
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#5b3a22'; g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y++) {
    const w = Math.sin(y * 0.08 + Math.sin(y * 0.013) * 4) * 0.5 + 0.5;
    g.fillStyle = `rgba(${40 + w * 50},${24 + w * 30},${12 + w * 16},0.55)`;
    g.fillRect(0, y, 512, 1);
  }
  for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(30,18,8,${0.08 + rand() * 0.2})`; g.fillRect(rand() * 512, rand() * 256, 40 + rand() * 200, 1); }
  const t = toTexture(c); return t;
}

// старый кинескопный телевизор: корпус из крапчатого пластика или под дерево, «горб»
// кинескопа с прорезями, передняя панель с решёткой динамика и кнопками, выпуклый экран
// под стеклом с бликами, ребристые ручки, лампочка питания, комнатная антенна
function makeTV(map, shared, i, env) {
  const wood = i % 2 === 1;
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ map: wood ? woodGrain(60 + i) : tvPlastic(50 + i), roughness: wood ? 0.55 : 0.42, envMap: env, envMapIntensity: 0.5 });
  const backMat = new THREE.MeshStandardMaterial({ map: tvPlastic(70 + i, wood ? [58, 52, 46] : [196, 186, 166]), roughness: 0.5, envMap: env, envMapIntensity: 0.4 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.54, 0.46, 4, 0.035), shell);
  g.add(body);
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.42, 0.34, 4, 0.06), backMat);
  back.position.z = -0.3; g.add(back);
  // прорези на боках, жёлтая наклейка на «горбе», винты по углам передней панели
  const ventMat = new THREE.MeshBasicMaterial({ map: ventTexture(), transparent: true, depthWrite: false });
  for (const s of [-1, 1]) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.14), ventMat);
    v.position.set(s * 0.3405, 0.09, -0.04); v.rotation.y = s * Math.PI / 2; g.add(v);
  }
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.065), new THREE.MeshStandardMaterial({
    map: labelTexture(['ОСТОРОЖНО!', 'ВЫСОКОЕ НАПРЯЖЕНИЕ'], { w: 340, h: 130, bg: '#e8d64a', fg: '#1d1a12', sizes: [34, 24] }), roughness: 0.6,
  }));
  sticker.position.set(0, 0.2115, -0.3); sticker.rotation.x = -Math.PI / 2; g.add(sticker);
  const screwG = new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 10); screwG.rotateX(Math.PI / 2);
  const screwMat = new THREE.MeshStandardMaterial({ color: 0x8d9093, metalness: 1, roughness: 0.35, envMap: env });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const sc = new THREE.Mesh(screwG, screwMat); sc.position.set(sx * 0.285, sy * 0.215, 0.2315); g.add(sc); }
  // прорези охлаждения на «горбе»
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 0.8 });
  for (let k = 0; k < 7; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.004), slotMat);
    s.position.set(0, 0.12 - k * 0.035, -0.472); g.add(s);
  }
  // передняя панель
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.46), new THREE.MeshStandardMaterial({
    map: tvFront(['СИГНАЛ', 'ВОСХОД', 'РАССВЕТ', 'ЭФИР'][i], 80 + i, wood ? '#2f2924' : '#d6ccb6'), roughness: 0.45, envMap: env, envMapIntensity: 0.5,
  }));
  front.position.z = 0.2302; g.add(front);
  const dark = new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.45, envMap: env, envMapIntensity: 0.6 });
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.4, 0.012, 3, 0.03), dark);
  bezel.position.set(-0.06, 0.01, 0.232); g.add(bezel);
  const sg = new THREE.PlaneGeometry(0.46, 0.345, 24, 18);
  const pos = sg.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k) / 0.23, y = pos.getY(k) / 0.1725;
    pos.setZ(k, 0.016 * (1 - x * x * 0.6) * (1 - y * y * 0.6));
  }
  sg.computeVertexNormals();
  const screen = new THREE.Mesh(sg, screenMaterial(map, shared));
  screen.position.set(-0.06, 0.01, 0.237); g.add(screen);
  // стекло кинескопа: почти прозрачное, но с отражением зала
  const glass = new THREE.Mesh(sg.clone(), new THREE.MeshStandardMaterial({ color: 0x0a0c0d, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, envMap: env, envMapIntensity: 2.2, depthWrite: false }));
  glass.position.set(-0.06, 0.01, 0.2395); g.add(glass);
  // ребристые ручки: цилиндр с насечками по кругу
  const knobG = new THREE.CylinderGeometry(0.025, 0.027, 0.034, 32, 1);
  const kp = knobG.attributes.position;
  for (let k = 0; k < kp.count; k++) {
    const a = Math.atan2(kp.getZ(k), kp.getX(k)), r = Math.hypot(kp.getX(k), kp.getZ(k));
    if (r > 0.02) { const rr = r * (1 + (Math.sin(a * 16) > 0 ? 0.04 : 0)); kp.setX(k, Math.cos(a) * rr); kp.setZ(k, Math.sin(a) * rr); }
  }
  knobG.computeVertexNormals();
  knobG.rotateX(Math.PI / 2);
  const knobMat = new THREE.MeshStandardMaterial({ color: wood ? 0xb9b3a6 : 0x2a2724, metalness: wood ? 0.7 : 0.1, roughness: 0.35, envMap: env });
  for (const y of [0.12, 0.035]) { const k = new THREE.Mesh(knobG, knobMat); k.position.set(0.245, y, 0.247); g.add(k); }
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.15) }));
  led.position.set(0.19, -0.19, 0.2312); g.add(led);
  // антенна
  const rodG = new THREE.CylinderGeometry(0.0035, 0.006, 0.55, 8);
  rodG.translate(0, 0.275, 0);
  const metal = new THREE.MeshStandardMaterial({ color: 0xd5d8da, metalness: 1, roughness: 0.2, envMap: env });
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(rodG, metal);
    r.position.set(0.05 * s, 0.27, -0.2); r.rotation.z = -s * (0.38 + i * 0.05); r.rotation.x = -0.12; g.add(r);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), metal);
    tip.position.set(0.05 * s + Math.sin(s * (0.38 + i * 0.05)) * 0.55, 0.27 + Math.cos(0.38 + i * 0.05) * 0.55, -0.2 - 0.066); g.add(tip);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.035, 20), dark);
  base.position.set(0, 0.287, -0.2); g.add(base);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  screen.castShadow = false; glass.castShadow = false;
  return { group: g, screen };
}

// резиновая утка — находка
function makeDuck(env) {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffcf1f, roughness: 0.32, envMap: env, envMapIntensity: 0.8 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff7a12, roughness: 0.35, envMap: env });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.2, envMap: env });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), yellow); body.scale.set(0.095, 0.066, 0.125);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.054, 20, 14), yellow); head.position.set(0, 0.085, 0.06);
  const beak = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), orange); beak.scale.set(0.032, 0.012, 0.03); beak.position.set(0, 0.075, 0.112);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 12), yellow); tail.rotation.x = -2.2; tail.position.set(0, 0.045, -0.12);
  g.add(body, head, beak, tail);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), black); e.position.set(s * 0.03, 0.1, 0.1); g.add(e); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData = { egg: 'duck' }; } });
  return g;
}

// прорези охлаждения на боках корпуса
function ventTexture() {
  const [c, g] = canvas(128, 64);
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = 'rgba(12,11,10,0.92)';
  for (let x = 8; x < 124; x += 10) g.fillRect(x, 8, 4, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function createPool({ loadGLB, renderer, lowPower }) {
  const tick = slicer();
  const gltf = await loadGLB('models/pool.glb');
  const scene = new THREE.Scene();
  const air = new THREE.Color(0xd8e5e4);
  scene.background = air.clone();
  scene.fog = new THREE.FogExp2(air.clone(), 0.006);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;
  pmrem.dispose();

  gltf.scene.updateMatrixWorld(true);
  let water = null;
  gltf.scene.traverse((o) => { if (o.isMesh && o.material.name === 'water') water = o; });
  const wb = new THREE.Box3().setFromObject(water);
  const waterY = wb.max.y;

  const tiles = await poolTiles(3, lowPower ? 1024 : 2048, { tick });
  // потолок — крупные матовые панели, без глянцевой мозаики: снизу он не пестрит
  const panels = await poolTiles(9, 512, { N: 4, tick });
  const shared = {
    uTime: { value: 0 }, uWaterY: { value: waterY },
    uPoolMin: { value: new THREE.Vector2(wb.min.x, wb.min.z) }, uPoolMax: { value: new THREE.Vector2(wb.max.x, wb.max.z) },
  };
  const tile = tileMaterial(tiles, shared);
  const tileAqua = tileMaterial(tiles, shared, 0xbfe2e4);
  const ceilingMat = tileMaterial(panels, shared, 0xe9eeee);
  ceilingMat.roughness = 9;
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9eeee, metalness: 0.35, roughness: 0.3 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe4e6, metalness: 1, roughness: 0.16 });
  const sky = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 2.4, 2.45), side: THREE.DoubleSide });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.1) });
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x223034, metalness: 0.9, roughness: 0.05 });

  const solid = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name;
    let m;
    if (n === 'water') { o.visible = false; return; }
    if (n === 'glass') m = sky;
    else if (n === 'light') m = lamp;
    else if (n === 'mirror_glass') m = darkGlass;
    else if (n === 'material_0') m = chrome;
    else if (/^silver_color|window_frame|^\.028|clock_frame/.test(n)) m = paint;
    else if (/door|^\.021|clock_face/.test(n)) {
      m = new THREE.MeshStandardMaterial({ map: o.material.map, color: 0xf2f2ee, roughness: 0.55 });
    } else if (n === 'tiles-black') m = tileAqua;
    else if (n === 'ceiling') m = ceilingMat;
    else m = tile;
    o.material = m;
    const glowing = m === sky || m === lamp;
    o.castShadow = !glowing;
    o.receiveShadow = !glowing;
    if (!glowing) solid.push(o);
  });
  scene.add(gltf.scene);

  // вода
  const s = lowPower ? 0.35 : 0.5;
  const reflector = new Reflector(new THREE.PlaneGeometry(wb.max.x - wb.min.x, wb.max.z - wb.min.z), {
    textureWidth: Math.round(innerWidth * s), textureHeight: Math.round(innerHeight * s),
    clipBias: 0.003, color: 0x6fcfd0, shader: WaterShader,
  });
  reflector.material.transparent = true;
  reflector.material.depthWrite = false;
  reflector.material.fog = true;
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set((wb.min.x + wb.max.x) / 2, waterY, (wb.min.z + wb.max.z) / 2);
  scene.add(reflector);

  // свет: солнце сквозь большие окна + ровный светлый «воздух» зала
  // плитка почти белая: свет держим так, чтобы она не выходила за 1.0 и не «светилась» сама
  scene.add(new THREE.HemisphereLight(0xeef6ff, 0xc2d0cc, 0.64));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.25);
  sun.position.set(-62, 58, 12);
  sun.target.position.set(0, 0, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 10, far: 200 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // высота пола: луч сверху вниз по модели
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  function floorAt(x, z, from = 6) {
    ray.set(new THREE.Vector3(x, from, z), down);
    const hit = ray.intersectObjects(solid, false)[0];
    return hit ? hit.point.y : 0;
  }
  const deck = floorAt(0, 44);

  // телевизоры с проектами вдоль бортика: каждый смотрит на точку, откуда к нему подходит камера
  const loader = new THREE.TextureLoader();
  const TVS = [
    { at: [-14.8, 45.0], face: [-12.4, 43.4] },
    { at: [-19.25, 31.6], face: [-18.2, 34.2] },
    { at: [-19.25, 11.6], face: [-18.2, 14.2] },
    { at: [-14.4, -21.4], face: [-14.5, -18.4] },
  ];
  const TV_SCALE = 1.3;
  const picks = [];
  const cableTex = cableRubber();
  const screens = [];
  for (let i = 0; i < PROJECTS.length; i++) {
    await tick();
    const p = PROJECTS[i], spot = TVS[i];
    const map = loader.load(p.shot);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const y0 = floorAt(spot.at[0], spot.at[1]);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 1.0), tile);
    plinth.position.set(spot.at[0], y0 + 0.31, spot.at[1]);
    plinth.castShadow = plinth.receiveShadow = true;
    const tv = makeTV(map, shared, i, scene.environment);
    tv.group.scale.setScalar(TV_SCALE);
    const ang = Math.atan2(spot.face[0] - spot.at[0], spot.face[1] - spot.at[1]);
    tv.group.position.set(spot.at[0] + Math.sin(ang) * 0.1, y0 + 0.62 + 0.27 * TV_SCALE, spot.at[1] + Math.cos(ang) * 0.1);
    tv.group.rotation.y = ang;
    plinth.rotation.y = ang;
    scene.add(plinth, tv.group);
    const glow = new THREE.PointLight(0xa8dcff, 1.6, 4.5, 2);
    glow.position.set(spot.at[0] + Math.sin(ang) * 0.7, y0 + 1.0, spot.at[1] + Math.cos(ang) * 0.7);
    scene.add(glow);
    // кабель: из-за телевизора по плитке к воде и под воду
    const bx = spot.at[0] - Math.sin(ang) * 0.5, bz = spot.at[1] - Math.cos(ang) * 0.5;
    // ближайшая точка бортика (телевизор стоит снаружи прямоугольника воды)
    const edge = new THREE.Vector3(THREE.MathUtils.clamp(bx, wb.min.x, wb.max.x), deck + 0.015, THREE.MathUtils.clamp(bz, wb.min.z, wb.max.z));
    const inward = new THREE.Vector3(reflector.position.x - edge.x, 0, reflector.position.z - edge.z).normalize();
    // шнур выходит из вилки на задней стенке, свисает с тумбы, петляет по плитке и уходит под воду
    const R = 0.013;
    const side = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx, y0 + 0.62 + 0.16 * TV_SCALE, bz),
      new THREE.Vector3(bx - Math.sin(ang) * 0.12, y0 + 0.5, bz - Math.cos(ang) * 0.12),
      new THREE.Vector3(bx - Math.sin(ang) * 0.22 + side.x * 0.08, y0 + R, bz - Math.cos(ang) * 0.22 + side.z * 0.08),
      new THREE.Vector3(bx * 0.7 + edge.x * 0.3 + side.x * 0.35, deck + R, bz * 0.7 + edge.z * 0.3 + side.z * 0.35),
      new THREE.Vector3(bx * 0.35 + edge.x * 0.65 - side.x * 0.25, deck + R, bz * 0.35 + edge.z * 0.65 - side.z * 0.25),
      new THREE.Vector3(edge.x - inward.x * 0.05, deck + R, edge.z - inward.z * 0.05),
      new THREE.Vector3(edge.x + inward.x * 0.06, deck - 0.12, edge.z + inward.z * 0.06),
      new THREE.Vector3(edge.x + inward.x * 0.2, waterY - 0.8, edge.z + inward.z * 0.2),
    ], false, 'centripetal');
    const tex = cableTex.clone(); tex.repeat.set(curve.getLength() / 0.12, 1); tex.needsUpdate = true;
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, R, 10), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, envMap: scene.environment, envMapIntensity: 0.7 }));
    cable.castShadow = true; cable.receiveShadow = true;
    const plug = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.5 }));
    plug.position.copy(curve.points[0]); plug.rotation.y = ang; plug.castShadow = true;
    scene.add(cable, plug);
    tv.screen.userData = { url: p.url, title: p.title };
    picks.push(tv.screen);
    screens.push(tv.screen);
  }

  // лифты: на южном бортике — сюда приезжаешь с уровня 0, на северном — уезжаешь на −2
  const IN = { x: 3, door: 43.25 }, OUT = { x: -12, door: -24.2 };
  const liftIn = createElevator(renderer, { standalone: true, light: 0.9, shell: tile });
  liftIn.group.position.set(IN.x, floorAt(IN.x, IN.door + 0.75), IN.door);
  liftIn.group.rotation.y = Math.PI;
  const liftOut = createElevator(renderer, { standalone: true, light: 0.9, shell: tile });
  liftOut.group.position.set(OUT.x, floorAt(OUT.x, OUT.door - 0.75), OUT.door);
  scene.add(liftIn.group, liftOut.group);
  const inZ = IN.door + CAB.D / 2, outZ = OUT.door - CAB.D / 2;

  const E = deck + 1.6;
  const tvLook = (i) => [TVS[i].at[0], deck + 0.62 + 0.34 * TV_SCALE, TVS[i].at[1]];
  // из кабины выходишь прямо по оси дверей и только снаружи поворачиваешь вдоль бортика
  const route = new Route([
    { p: [IN.x, E, inZ], look: [IN.x, E + 0.05, 30] },
    { p: [IN.x, E, IN.door - 0.15], look: [IN.x, E - 0.05, 30] },
    { p: [IN.x - 0.35, E, 41.65], look: [-4, E - 0.3, 40.8] },
    { p: [-5.5, E, 42.4], look: [-13, E - 0.4, 44.5] },
    { p: [-12.3, E, 43.4], look: tvLook(0) },
    { p: [-15.0, E, 40.6], look: [-18.3, E - 0.1, 30] },
    { p: [-18.2, E, 34.4], look: tvLook(1) },
    { p: [-18.3, E, 26.0], look: [-18.4, E, 14] },
    { p: [-18.2, E, 14.4], look: tvLook(2) },
    { p: [-18.3, E, 6.0], look: [-16, E, -12] },
    { p: [-17.8, E, -9.0], look: [-13, E - 0.2, -19] },
    { p: [-14.5, E, -18.3], look: tvLook(3) },
    { p: [-12.4, E, -21.2], look: [OUT.x, E - 0.15, OUT.door - 2] },
    { p: [OUT.x - 0.04, E, OUT.door + 1.9], look: [OUT.x, E - 0.18, outZ - 2] },
    { p: [OUT.x, E, OUT.door + 0.9], look: [OUT.x, E - 0.2, outZ - 2] },
    { p: [OUT.x, E, outZ + 0.25], look: [OUT.x - 0.5, E - 0.2, outZ - 2] },
    { p: [OUT.x + 0.05, E, outZ + 0.05], look: [OUT.x + 2.1, E - 0.1, outZ] },
    { p: [OUT.x, E, outZ], look: [OUT.x, E - 0.1, OUT.door + 6] },
  ]);
  const near = (i, a, b) => ({ from: route.at(i) - a, to: route.at(i) + b });
  const stations = [
    { id: 'cap-pool', from: route.at(2) - 0.4, to: route.at(3) - 0.6 },
    { id: 'cap-p0', ...near(4, 2.2, 1.6) },
    { id: 'cap-p1', ...near(6, 2.4, 2.0) },
    { id: 'cap-p2', ...near(8, 2.4, 2.0) },
    { id: 'cap-p3', ...near(11, 2.4, 1.6) },
    { id: 'cap-lift1', from: route.at(12) + 0.5, to: route.length + 1 },
  ];

  // находка: резиновая утка покачивается на воде у западного бортика
  const duck = makeDuck(scene.environment);
  duck.position.set(-15.6, waterY, 21.5);
  scene.add(duck);
  duck.traverse((o) => { if (o.isMesh) picks.push(o); });

  let riding = false;
  function update(dt, now, { camera, audio }) {
    shared.uTime.value = now;
    reflector.material.uniforms.uTime.value = now;
    duck.position.y = waterY + 0.012 + Math.sin(now * 1.3) * 0.012;
    duck.rotation.set(Math.sin(now * 0.9) * 0.06, now * 0.08, Math.cos(now * 1.1) * 0.05);
    if (!riding) {
      doorsByDistance(liftOut, camera.position.z - OUT.door, dt, audio);
      liftOut.setDisplay('−1'); liftOut.setLight(1);
    }
    riding = false;
  }

  // приезд с уровня 0 и отъезд на −2 — в лифтах
  function enter(b, pos, target, ctx) { arrive(liftIn, b, pos, target, ctx, ['0', '−1']); }
  function exit(a, pos, target, ctx) {
    riding = true;
    depart(liftOut, a, pos, target, ctx, ['−1', '−2']);
  }
  function leave({ audio }) { audio.elevator(0); }

  return {
    id: 'pool',
    label: 'УРОВЕНЬ −1 · БАССЕЙН',
    scene, route, stations, update, enter, exit, leave, picks,
    floor: 'pool',
    transition: 7,
    exitGlitch: 0.4,
    glitchSharp: 7, // помехи — только в миг «склейки» двух лифтов
    // свечение — только у окон и ламп; белая плитка не должна «плыть» молочной пеленой
    bloom: { strength: 0.22, radius: 0.4, threshold: 1.6 },
    exposure: 0.84,
    grade: { tint: [0.99, 1.02, 1.01], sat: 0.92 },
    hover(obj) { for (const sc of screens) sc.material.uniforms.uHover.value = sc === obj ? 1 : 0; },
  };
}
