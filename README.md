# Закулисье.VHS — портфолио Балаева Сейт-Ахмета

ссылка на versel: https://backrooms-portfolio-tau.vercel.app/

Портфолио в виде найденной видеокассеты из Закулисья (Backrooms). Ночная улица, провал сквозь
асфальт и четыре уровня вниз на лифте:

- **Уровень 0 · Холл** — кто я;
- **Уровень −1 · Бассейн** — проекты на кинескопных телевизорах (на экран можно нажать);
- **Уровень −2 · Парковка** — навыки на табличках у пилонов;
- **Уровень −3 · Поле** — контакты.

Управление: колесо мыши или ↑ ↓ (W S) — идти, ← → или мышь — осмотреться, кнопки
«◀ НАЗАД / ВПЕРЁД ▶» и «АВТО» внизу экрана. На телефоне — свайп.

## Как устроено

- three.js 0.170 через importmap, без сборки и зависимостей;
- уровни — `src/levels/*.js`, лифт — `src/elevator.js`, плёнка VHS — `src/vhs.js`;
- процедурные текстуры и звук (Web Audio) — `src/textures.js`, `src/audio.js`.

Локально: `node server.js` и открыть http://localhost:5230

## Лицензии

- «Backrooms VR» — VTX, Sketchfab, CC BY 4.0 (уровень 0);
- «Azure Swimming Pool Pripyat» — Yarik16, Sketchfab, CC BY 4.0 (уровень −1);
- «parking garage» — SPLEEN VISION, Sketchfab, CC BY 4.0 (текстуры уровня −2);
- «Grass 004» — ambientCG, CC0 (газон уровня −3);
- three.js — MIT; шрифты IBM Plex Mono и Oswald — SIL Open Font License.

Контакты: Telegram [@Saitama000001](https://t.me/Saitama000001) · GitHub [Sait5](https://github.com/Sait5)
