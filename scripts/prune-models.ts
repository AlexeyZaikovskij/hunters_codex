// Урезает 3D-модели из наборов до того, что нужно игре: только используемые анимации, без лишних частей.
// Запуск: npm run models -- <папка с исходными файлами>. Результат — src/assets/models/.

import { NodeIO } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { UNIT_MODELS } from '../src/data/models';

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('Укажите папку с исходными моделями: npm run models -- <папка>');
  process.exit(1);
}
const outDir = join(import.meta.dirname, '..', 'src', 'assets', 'models');
mkdirSync(outDir, { recursive: true });
const io = new NodeIO();

async function convert(source: string, file: string, keepAnims: string[], hide: string[] = []) {
  const doc = await io.read(join(srcDir, source));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (keepAnims.includes(a.getName())) continue;
    // Каналы и семплеры держат ссылки на данные: без явного удаления prune их не выбросит.
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  for (const n of root.listNodes()) if (hide.includes(n.getName())) n.dispose();
  const missing = keepAnims.filter((name) => !root.listAnimations().some((a) => a.getName() === name));
  if (missing.length) throw new Error(`${source}: нет анимаций ${missing.join(', ')}`);
  await doc.transform(prune(), dedup());
  const out = join(outDir, file);
  await io.write(out, doc);
  console.log(`${file}: ${Math.round(statSync(out).size / 1024)} КБ`);
}

for (const def of Object.values(UNIT_MODELS)) {
  await convert(def.source, def.file, [...new Set(Object.values(def.anims))], def.hide);
  for (const a of def.attach ?? []) await convert(a.source, a.file, []);
}
