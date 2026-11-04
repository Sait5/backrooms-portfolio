// Картинка с видеокассеты: дрожание строк, смещение цветов, размытие по горизонтали,
// строчная развёртка, шум, полоса трекинга, «сбой» при переходах (uGlitch),
// перемотка (uFF), засветка (uFlash) и цветокоррекция под каждый уровень (uTint, uSat).
import * as THREE from 'three';

export const VHSShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGlitch: { value: 0 },
    uFF: { value: 0 },
    uFlash: { value: 0 },
    uTint: { value: new THREE.Vector3(1.03, 1.0, 0.84) },
    uSat: { value: 0.82 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGlitch;
    uniform float uFF; uniform float uFlash; uniform vec3 uTint; uniform float uSat;
    varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      float frame = floor(uTime * 30.0);
      float line = floor(uv.y * uRes.y * 0.5);

      // дрожание строк и сдвиг при сбое
      float jitter = (rand(vec2(line, frame)) - 0.5) * 0.0011;
      jitter += uGlitch * (rand(vec2(floor(uv.y * 40.0), frame)) - 0.5) * 0.08;
      // полоса трекинга, медленно ползущая снизу вверх
      float bandY = fract(uTime * 0.045) * 1.4 - 0.2;
      float band = exp(-pow((uv.y - bandY) / 0.018, 2.0));
      jitter += band * (rand(vec2(line, frame + 3.0)) - 0.5) * 0.02;
      // перемотка: две шумные полосы бегут вниз, картинка «плывёт»
      float ff = 0.0;
      if (uFF > 0.0) {
        float y1 = fract(vUv.y + uTime * 1.9), y2 = fract(vUv.y + uTime * 1.9 + 0.47);
        ff = smoothstep(0.0, 0.015, y1) * smoothstep(0.075, 0.04, y1) + smoothstep(0.0, 0.01, y2) * smoothstep(0.045, 0.025, y2);
        jitter += uFF * (ff * (rand(vec2(line, frame + 7.0)) - 0.5) * 0.09 + sin(vUv.y * 30.0 + uTime * 40.0) * 0.003);
      }
      uv.x += jitter;

      // смещение цветов и мягкость по горизонтали
      float ca = 0.0022 + uGlitch * 0.012 + uFF * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
      vec3 smear = (texture2D(tDiffuse, uv + vec2(0.0018, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(0.0018, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(0.004, 0.0)).rgb) / 3.0;
      col = mix(col, smear, 0.4);

      // засветка: камеру «ослепило» светом
      col = mix(col, vec3(1.0, 0.99, 0.94), uFlash);

      // плёночная цветокоррекция: приподнятые чёрные, оттенок уровня, чуть меньше насыщенности
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = col * uTint + vec3(0.03, 0.028, 0.02);

      // развёртка, шум, белые искры ленты
      col *= 0.9 + 0.1 * sin(vUv.y * uRes.y * 1.5708);
      col += (rand(vUv * uRes + frame) - 0.5) * 0.075;
      col += step(0.9993, rand(vec2(frame, floor(vUv.y * 180.0)) + floor(vUv.x * 6.0))) * 0.6 * (0.3 + band + uGlitch);
      col += band * 0.06;

      // сбой и перемотка: снег
      col = mix(col, vec3(rand(vUv * uRes + frame * 1.7)), clamp(uGlitch * 0.55 + ff * uFF * 0.7, 0.0, 1.0));

      vec2 c = vUv - 0.5;
      col *= 1.0 - dot(c, c) * 0.95;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
