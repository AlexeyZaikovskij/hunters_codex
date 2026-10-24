// 3D-модели персонажей (CC0): KayKit — Kay Lousberg (kaylousberg.com), Quaternius (quaternius.com).
// В игре модели «фотографируются» в спрайты при загрузке боя (src/game/models3d.ts).
// Файлы в src/assets/models/ уже урезаны до нужных анимаций: `npm run models -- <папка с исходниками>`.

export type ModelAnim = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'death';

/** Какие анимации повторяются по кругу, остальные играются один раз. */
export const LOOPED_ANIMS: Record<ModelAnim, boolean> = { idle: true, walk: true, attack: false, cast: false, hit: false, death: false };

export interface ModelDef {
  /** Имя файла в src/assets/models/ (после урезания). */
  file: string;
  /** Исходный файл из набора — для скрипта урезания. */
  source: string;
  /** Высота модели на поле в долях стандартной фигуры (1 — рост человека). */
  height: number;
  /** Поворот, если модель в файле смотрит не вперёд (+Z), в градусах. */
  yaw?: number;
  /** Лишние части модели (запасное оружие, книги). */
  hide?: string[];
  /** Оружие и щиты из отдельных файлов: крепятся к кости руки. */
  attach?: { file: string; source: string; bone: string }[];
  /** Какой клип из файла играть для каждого действия. Нет клипа — берётся idle. */
  anims: Partial<Record<ModelAnim, string>> & { idle: string };
}

export const UNIT_MODELS: Record<string, ModelDef> = {
  hero: {
    file: 'mage.glb',
    source: 'mage.glb',
    height: 1,
    hide: ['Spellbook', 'Spellbook_open', '1H_Wand'],
    anims: {
      idle: 'Idle',
      walk: 'Walking_A',
      attack: '1H_Melee_Attack_Chop',
      cast: 'Spellcast_Shoot',
      hit: 'Hit_A',
      death: 'Death_A',
    },
  },
  bone_guard: {
    file: 'skeleton_warrior.glb',
    source: 'skeleton_warrior.glb',
    height: 1.05,
    attach: [
      { file: 'skeleton_blade.glb', source: 'Skeleton_Blade.gltf', bone: 'handslot.r' },
      { file: 'skeleton_shield.glb', source: 'Skeleton_Shield_Small_A.gltf', bone: 'handslot.l' },
    ],
    anims: {
      idle: 'Idle_Combat',
      walk: 'Walking_A',
      attack: '1H_Melee_Attack_Chop',
      hit: 'Hit_A',
      death: 'Death_C_Skeletons',
    },
  },
  gnawer: {
    file: 'spider.glb',
    source: 'spider.glb',
    height: 0.42,
    anims: {
      idle: 'SpiderArmature|Spider_Idle',
      walk: 'SpiderArmature|Spider_Walk',
      attack: 'SpiderArmature|Spider_Attack',
      death: 'SpiderArmature|Spider_Death',
    },
  },
  // Червематка — тот же паук, только вдвое крупнее и гораздо злее.
  brood_mother: {
    file: 'spider.glb',
    source: 'spider.glb',
    height: 0.8,
    anims: {
      idle: 'SpiderArmature|Spider_Idle',
      walk: 'SpiderArmature|Spider_Walk',
      attack: 'SpiderArmature|Spider_Attack',
      death: 'SpiderArmature|Spider_Death',
    },
  },
  spitter: {
    file: 'spiky_blob.glb',
    source: 'spiky_blob.glb',
    height: 0.7,
    anims: {
      idle: 'CharacterArmature|Idle',
      walk: 'CharacterArmature|Walk',
      attack: 'CharacterArmature|Bite_Front',
      hit: 'CharacterArmature|HitRecieve',
      death: 'CharacterArmature|Death',
    },
  },
};
