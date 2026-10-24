// Печать сгенерированных Червоточин в консоль: npm run maps -- [класс E|D] [сколько]
import { generateWormhole, type DangerClass } from '../src/data/mapgen';

const dangerClass = (process.argv[2] as DangerClass) || 'E';
const count = Number(process.argv[3]) || 3;
const GLYPH: Record<string, string> = { gnawer: 'Ч', spitter: 'И', bone_guard: 'К' };

for (const style of ['cave', 'ruins', 'open'] as const)
  for (let i = 0; i < count; i++) {
    const seed = 100 + i;
    const m = generateWormhole({ seed, dangerClass, style });
    const rows = Array.from({ length: m.height }, () => Array(m.width).fill('·'));
    for (const o of m.obstacles) rows[o.y][o.x] = '#';
    rows[m.heroStart.y][m.heroStart.x] = 'Я';
    for (const mon of m.monsters) rows[mon.pos.y][mon.pos.x] = GLYPH[mon.type];
    console.log(`\n${m.name} · зерно ${seed} · препятствий ${m.obstacles.length}`);
    console.log(rows.map((r) => r.join(' ')).join('\n'));
  }
