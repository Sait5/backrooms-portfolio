// Звук Закулисья без файлов — всё синтезируется Web Audio. У каждого места свой тихий фон:
// улица во вступлении — далёкий город; уровень 0 — гул ламп дневного света; бассейн — плеск
// и капли в гулком зале; парковка — низкий гул вентиляции, жужжание трубок и далёкие удары;
// поле — ветер. Шаги звучат по-разному на асфальте, ковре, плитке, бетоне и траве.
// Общий уровень низкий: фон должен быть едва слышным, а не давить.
const MASTER = 0.55;
const HUM = 0.016;
const SCENES = ['street', 'lobby', 'pool', 'parking', 'field'];
const WET = { street: 0.05, lobby: 0.12, pool: 0.65, parking: 0.42, field: 0 };

export function createAudio() {
  let ctx = null, master = null, verb = null, verbIn = null, enabled = false;
  let scene = 'street';
  const beds = {};
  let hum = null;

  function noiseBuffer(sec, channels = 1) {
    const b = ctx.createBuffer(channels, Math.max(1, ctx.sampleRate * sec) | 0, ctx.sampleRate);
    for (let c = 0; c < channels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return b;
  }
  function loopNoise() {
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(5); s.loop = true; s.start(); return s;
  }
  function filter(type, f, q = 0.7) {
    const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n;
  }
  function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function lfo(rate, depth, target) {
    const o = ctx.createOscillator(); o.frequency.value = rate;
    const g = gain(depth); o.connect(g).connect(target); o.start();
  }

  // гулкий зал: импульсный отклик из затухающего шума
  function impulse(sec, decay) {
    const b = noiseBuffer(sec, 2);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= Math.pow(1 - i / d.length, decay);
    }
    return b;
  }

  function start() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = gain(0);
    master.connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(3.2, 3.2);
    verbIn = gain(WET[scene]);
    verbIn.connect(verb).connect(master);

    for (const name of SCENES) { beds[name] = gain(name === scene ? 1 : 0); beds[name].connect(master); }

    // улица: далёкий гул города и лёгкий ветер
    loopNoise().connect(filter('lowpass', 210)).connect(gain(0.014)).connect(beds.street);
    const air = gain(0.004);
    loopNoise().connect(filter('bandpass', 900, 0.5)).connect(air);
    lfo(0.12, 0.003, air.gain);
    air.connect(beds.street);

    // лобби: гул 100 Гц с гармониками, слегка «плавает», + глухой шум пустой комнаты
    hum = gain(HUM);
    const humF = filter('lowpass', 900);
    for (const [f, a, type] of [[100, 1, 'triangle'], [200, 0.45, 'sine'], [300, 0.22, 'sine'], [1200, 0.012, 'sine']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = Math.random() * 6 - 3;
      o.connect(gain(a)).connect(humF); o.start();
    }
    lfo(0.31, HUM * 0.2, hum.gain);
    humF.connect(hum).connect(beds.lobby);
    loopNoise().connect(filter('lowpass', 420)).connect(gain(0.011)).connect(beds.lobby);

    // бассейн: плеск у бортика (шум в полосе с медленной волной) и воздух зала
    const lap = gain(0.008);
    loopNoise().connect(filter('bandpass', 320, 0.8)).connect(lap);
    lfo(0.23, 0.006, lap.gain);
    lap.connect(beds.pool); lap.connect(verbIn);
    loopNoise().connect(filter('lowpass', 2600)).connect(gain(0.0035)).connect(beds.pool);

    // парковка: низкий гул, вентиляция и жужжание люминесцентных трубок
    const drone = ctx.createOscillator(); drone.frequency.value = 55; drone.start();
    drone.connect(gain(0.011)).connect(beds.parking);
    loopNoise().connect(filter('lowpass', 170)).connect(gain(0.012)).connect(beds.parking);
    const buzz = ctx.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 120; buzz.start();
    buzz.connect(filter('bandpass', 1900, 2.5)).connect(gain(0.0022)).connect(beds.parking);

    // поле: ветер с порывами
    const wind = gain(0.008);
    loopNoise().connect(filter('bandpass', 480, 0.45)).connect(wind);
    lfo(0.09, 0.005, wind.gain);
    const gust = filter('lowpass', 900); lfo(0.05, 400, gust.frequency);
    wind.connect(gust).connect(beds.field);

    setInterval(events, 700);
  }

  // редкие случайные звуки уровня: капли в бассейне, далёкие удары на парковке
  let nextDrip = 0, nextThump = 0;
  function events() {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    if (scene === 'pool' && t > nextDrip) {
      nextDrip = t + 1.2 + Math.random() * 3.5;
      const o = ctx.createOscillator(); o.type = 'sine';
      const f0 = 1300 + Math.random() * 900;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.09);
      const g = gain(0); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g); g.connect(verbIn); g.connect(beds.pool);
      o.start(t); o.stop(t + 0.16);
    }
    if (scene === 'parking' && t > nextThump) {
      nextThump = t + 7 + Math.random() * 10;
      const s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.5);
      const g = gain(0); g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.45);
      s.connect(filter('lowpass', 260)).connect(g); g.connect(verbIn);
      s.start(t); s.stop(t + 0.5);
    }
  }

  function setEnabled(on) {
    if (on) start();
    enabled = on;
    if (!ctx) return;
    if (on && ctx.state === 'suspended') ctx.resume();
    master.gain.setTargetAtTime(on ? MASTER : 0, ctx.currentTime, 0.4);
  }

  function setScene(name) {
    if (name === scene) return;
    scene = name;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const n of SCENES) beds[n].gain.setTargetAtTime(n === name ? 1 : 0, t, 0.5);
    verbIn.gain.setTargetAtTime(WET[name], t, 0.5);
  }

  // шаг: на асфальте сухой щелчок, на ковре глухой, на плитке звонкий с эхом, на бетоне сухой,
  // по траве шуршание
  const STEP = {
    street: { type: 'bandpass', f: 1300, q: 0.8, peak: 0.04, dec: 0.09, wet: 0.2 },
    lobby: { type: 'lowpass', f: 560, q: 0.7, peak: 0.06, dec: 0.22, wet: 0.2 },
    pool: { type: 'bandpass', f: 1500, q: 0.9, peak: 0.045, dec: 0.1, wet: 1 },
    parking: { type: 'bandpass', f: 900, q: 0.6, peak: 0.05, dec: 0.12, wet: 1 },
    field: { type: 'highpass', f: 1800, q: 0.5, peak: 0.022, dec: 0.2, wet: 0 },
  };
  function step(strength = 1) {
    if (!enabled) return;
    const p = STEP[scene], t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.3);
    const f = filter(p.type, p.f * (0.85 + Math.random() * 0.3), p.q);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.peak * strength, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.dec);
    src.connect(f).connect(g);
    g.connect(master);
    if (p.wet) g.connect(gain(p.wet * 0.5)).connect(verbIn);
    src.start(t); src.stop(t + 0.3);
  }

  // мигнувшая лампа: щелчок и провал гула
  function flicker() {
    if (!enabled) return;
    const t = ctx.currentTime;
    hum.gain.cancelScheduledValues(t);
    hum.gain.setValueAtTime(HUM * 0.25, t);
    hum.gain.linearRampToValueAtTime(HUM, t + 0.18);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1800;
    const g = gain(0); g.gain.setValueAtTime(0.008, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.06);
  }

  // включение светильника на парковке: щелчок реле и короткий «дзынь» трубки
  function lampOn() {
    if (!enabled) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.05);
    const g = gain(0); g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    s.connect(filter('highpass', 1200)).connect(g); g.connect(master); g.connect(verbIn);
    s.start(t); s.stop(t + 0.05);
  }

  // провал сквозь реальность: гул уходит вниз, треск ленты, потом глухой удар о ковёр
  function noclip(dur = 1.4) {
    if (!enabled) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(dur + 0.2);
    const f = filter('bandpass', 1400, 0.7);
    f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.15); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f).connect(g); g.connect(master); g.connect(verbIn);
    s.start(t); s.stop(t + dur + 0.2);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + dur);
    const og = gain(0); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.05, t + 0.2); og.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(og).connect(master); o.start(t); o.stop(t + dur + 0.1);
  }
  function thud() {
    if (!enabled) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.4);
    const g = gain(0); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.35);
    s.connect(filter('lowpass', 240)).connect(g).connect(master);
    s.start(t); s.stop(t + 0.4);
  }

  // «улыбка» в темноте: два низких тона бьются друг о друга, сверху — едва слышный выдох
  function sting() {
    if (!enabled) return;
    const t = ctx.currentTime;
    const env = gain(0);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.05, t + 0.5); env.gain.setTargetAtTime(0, t + 1.6, 0.6);
    for (const f of [41, 43.6, 82.5]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(env); o.start(t); o.stop(t + 4); }
    env.connect(filter('lowpass', 320)).connect(master);
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(2.2);
    const b = gain(0); b.gain.setValueAtTime(0, t + 0.3); b.gain.linearRampToValueAtTime(0.01, t + 1.0); b.gain.linearRampToValueAtTime(0, t + 2.1);
    s.connect(filter('bandpass', 700, 2)).connect(b); b.connect(master); b.connect(verbIn);
    s.start(t); s.stop(t + 2.2);
  }

  // лифт: гул мотора и дрожь тросов (0 — стоит, 1 — едет)
  let motor = null;
  function elevator(k) {
    if (!ctx) return;
    if (!motor) {
      motor = gain(0);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48; o.start();
      o.connect(filter('lowpass', 170)).connect(motor);
      loopNoise().connect(filter('lowpass', 90)).connect(gain(0.8)).connect(motor);
      motor.connect(master);
    }
    motor.gain.setTargetAtTime(enabled ? 0.018 * k : 0, ctx.currentTime, 0.25);
  }
  // приехали: двухтоновый звонок
  function ding() {
    if (!enabled) return;
    const t = ctx.currentTime;
    [[1318.5, 0], [1046.5, 0.32]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = gain(0); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.026, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0003, t + d + 1.4);
      o.connect(g); g.connect(master); g.connect(verbIn); o.start(t + d); o.stop(t + d + 1.5);
    });
  }
  // двери поехали
  function doors() {
    if (!enabled) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(1.2);
    const g = gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02, t + 0.15); g.gain.linearRampToValueAtTime(0, t + 1.1);
    s.connect(filter('bandpass', 260, 0.8)).connect(g).connect(master);
    s.start(t); s.stop(t + 1.2);
  }
  // резиновая утка
  function quack() {
    if (!enabled) return;
    const t = ctx.currentTime;
    for (const d of [0, 0.2]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(560, t + d); o.frequency.exponentialRampToValueAtTime(380, t + d + 0.15);
      const g = gain(0); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.03, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t + d + 0.16);
      o.connect(filter('bandpass', 1150, 3)).connect(g); g.connect(master); g.connect(verbIn);
      o.start(t + d); o.stop(t + d + 0.18);
    }
  }
  // находка
  function chime() {
    if (!enabled) return;
    const t = ctx.currentTime;
    [[880, 0], [1320, 0.09], [1760, 0.18]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = gain(0); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.018, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0003, t + d + 0.6);
      o.connect(g).connect(master); o.start(t + d); o.stop(t + d + 0.65);
    });
  }
  // сбой ленты: шипение со свистом
  function glitch(dur = 0.6) {
    if (!enabled) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur + 0.1);
    const g = gain(0); g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(filter('bandpass', 2600, 0.6)).connect(g).connect(master);
    src.start(t); src.stop(t + dur + 0.1);
  }

  return {
    setEnabled, setScene, step, flicker, lampOn, glitch, noclip, thud, sting, elevator, ding, doors, quack, chime,
    get enabled() { return enabled; },
  };
}
