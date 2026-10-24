// Собирает в src/data/icons.ts только те иконки game-icons.net, которые используются в данных игры.
// Весь набор (4000+ иконок) в игру не попадает. Запуск после добавления контента: npm run icons
//
// Иконки: game-icons.net, авторы — Lorc, Delapouite и другие, лицензия CC BY 3.0.

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { SKILLS } from '../src/data/skills';
import { WEAPONS } from '../src/data/weapons';
import { HERO_ICON, MONSTERS } from '../src/data/units';
import { UI_ICONS } from '../src/data/ui-icons';

const require = createRequire(import.meta.url);
const set = require('@iconify-json/game-icons/icons.json') as {
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
};

const names = new Set<string>([
  HERO_ICON,
  ...Object.values(UI_ICONS),
  ...Object.values(SKILLS).flatMap((s) => (s.icon ? [s.icon] : [])),
  ...WEAPONS.flatMap((w) => (w.icon ? [w.icon] : [])),
  ...Object.values(MONSTERS).map((m) => m.icon),
]);

const out: Record<string, string> = {};
for (const name of [...names].sort()) {
  const icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent ?? ''];
  if (!icon) throw new Error(`Нет иконки «${name}» в game-icons`);
  out[name] = icon.body;
}

const file = `// Сгенерировано scripts/build-icons.ts (npm run icons) — не править вручную.
// Иконки: game-icons.net (Lorc, Delapouite и др.), лицензия CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/

/** Содержимое SVG (viewBox 0 0 512 512), цвет — currentColor. */
export const ICONS: Record<string, string> = ${JSON.stringify(out, null, 2)};
`;
writeFileSync('src/data/icons.ts', file);
console.log(`Иконок: ${Object.keys(out).length} → src/data/icons.ts`);
