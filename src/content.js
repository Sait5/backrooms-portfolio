// Всё, что рассказывает запись: кто я, проекты, навыки, контакты.
// Тексты в index.html — для поисковиков и читалок экрана; здесь — данные для 3D (экраны, надписи).
export const PROJECTS = [
  {
    id: 'horizon',
    title: 'Horizon',
    shot: 'shots/horizon.jpg',
    url: 'https://github.com/Sait5/horizon-browser',
  },
  {
    id: 'velocity',
    title: 'Velocity',
    shot: 'shots/velocity.jpg',
    url: 'https://project-rkm9y.vercel.app',
  },
  {
    id: 'intercargo',
    title: 'InterCargo',
    shot: 'shots/intercargo.jpg',
    url: 'https://inter-cargo-6ag6.vercel.app',
  },
  {
    id: 'resonance',
    title: 'Resonance',
    shot: 'shots/resonance.jpg',
    url: 'https://resonance-eta-lemon.vercel.app',
  },
];

// навыки на жёлтых табличках на пилонах парковки: по три пролёта на группу
export const SKILLS = [
  { group: 'ФРОНТЕНД', items: ['VUE 3', 'NUXT', 'REACT', 'NEXT.JS', 'TYPESCRIPT', 'GSAP'] },
  { group: '3D', items: ['THREE.JS', 'R3F', 'TRESJS', 'GLSL', 'BLENDER', 'RAPIER'] },
  { group: 'БЭКЕНД', items: ['NODE.JS', 'EXPRESS', 'POSTGRESQL', 'PRISMA', 'MONGODB', 'SUPABASE'] },
];
