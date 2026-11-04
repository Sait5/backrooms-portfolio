// «Улыбающиеся» из Закулисья: светящиеся глаза и зубастая улыбка в темноте, вдалеке.
// За весь просмотр — не больше трёх появлений, по паре секунд, с мерцанием; если подойти
// ближе пяти метров — исчезает сразу. Уровни сами решают, где и когда (во время провала света,
// в темноте парковки, в окне дома).
import * as THREE from 'three';
import { smilerTexture } from './textures.js';

export function createSmilers({ audio, kick, limit = 3 }) {
  const mat = new THREE.MeshBasicMaterial({
    map: smilerTexture(), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, color: new THREE.Color(1.9, 1.85, 1.7),
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.56), mat);
  mesh.renderOrder = 10;
  mesh.visible = false;
  let left = limit, life = 0, t = 0;

  function hide() { life = 0; mesh.visible = false; mesh.removeFromParent(); }

  return {
    get left() { return left; },
    get active() { return life > 0; },
    spawn(scene, pos, { dur = 2.2, scale = 1 } = {}) {
      if (left <= 0 || life > 0) return false;
      left--; life = dur; t = 0;
      scene.add(mesh);
      mesh.position.copy(pos);
      mesh.scale.setScalar(scale);
      mesh.visible = true;
      audio.sting();
      return true;
    },
    update(dt, camera) {
      if (life <= 0) return;
      t += dt;
      mesh.quaternion.copy(camera.quaternion);
      const fadeIn = t < 0.35 ? (Math.sin(t * 80) > 0 ? 1 : 0.12) : 1;
      const fadeOut = life - t < 0.3 ? (Math.sin(t * 90) > 0 ? 1 : 0) : 1;
      mat.opacity = fadeIn * fadeOut * (0.92 + Math.sin(t * 7.3) * 0.08);
      if (t >= life || mesh.position.distanceTo(camera.position) < 5) { hide(); kick(0.45); }
    },
    hide,
  };
}

// точка «вдалеке впереди»: луч по взгляду (с небольшим отклонением вбок) до первой преграды
const ray = new THREE.Raycaster();
const dir = new THREE.Vector3();
export function farPointAhead(camera, objects, { min = 10, max = 24, spread = 0.3, lift = 0.05 } = {}) {
  camera.getWorldDirection(dir);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) return null;
  dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 2 * spread);
  ray.set(camera.position, dir);
  ray.far = max + 1;
  const hit = ray.intersectObjects(objects, false)[0];
  const d = Math.min(max, hit ? hit.distance - 0.9 : max);
  if (d < min) return null;
  return camera.position.clone().addScaledVector(dir, d).add(new THREE.Vector3(0, lift, 0));
}
