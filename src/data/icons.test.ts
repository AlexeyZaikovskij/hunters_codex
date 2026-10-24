import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';
import { SKILLS } from './skills';
import { WEAPONS } from './weapons';
import { HERO_ICON, MONSTERS } from './units';
import { UI_ICONS } from './ui-icons';

// Если тест упал после добавления контента: укажите icon и запустите `npm run icons`.
describe('icons', () => {
  it('every skill, weapon and monster has a bundled icon', () => {
    const missing = [
      ...Object.values(SKILLS).map((s) => [s.id, s.icon]),
      ...WEAPONS.map((w) => [w.id, w.icon]),
      ...Object.entries(MONSTERS).map(([id, m]) => [id, m.icon]),
      ['hero', HERO_ICON],
      ...Object.entries(UI_ICONS),
    ].filter(([, icon]) => !icon || !ICONS[icon]);
    expect(missing).toEqual([]);
  });
});
