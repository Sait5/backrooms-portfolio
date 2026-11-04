// Маршрут камеры по уровню: сплайн точек пути и параллельный сплайн «куда смотреть».
// Параметр — пройденные метры, поэтому скорость шага не зависит от расстояния между точками.
import * as THREE from 'three';

export class Route {
  // points: [{ p: [x, y, z], look: [x, y, z] }]
  constructor(points) {
    this.pos = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q.p)), false, 'centripetal');
    this.look = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q.look)), false, 'centripetal');
    this.pos.arcLengthDivisions = 3000;
    this.length = this.pos.getLength();
  }

  sample(s, outPos, outLook) {
    const u = THREE.MathUtils.clamp(s / this.length, 0, 1);
    const t = this.pos.getUtoTmapping(u);
    this.pos.getPoint(t, outPos);
    this.look.getPoint(t, outLook);
  }

  // направление движения в точке (для шага за пределы маршрута при переходах)
  tangent(s, out) {
    const u = THREE.MathUtils.clamp(s / this.length, 0, 1);
    return this.pos.getTangentAt(u, out);
  }

  // сколько метров пройдено к i-й опорной точке — чтобы привязывать титры к точкам маршрута
  at(i) {
    const lengths = this.pos.getLengths();
    const k = (i / (this.pos.points.length - 1)) * (lengths.length - 1);
    const k0 = Math.floor(k), k1 = Math.min(k0 + 1, lengths.length - 1);
    return lengths[k0] + (lengths[k1] - lengths[k0]) * (k - k0);
  }
}
