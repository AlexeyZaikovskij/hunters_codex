import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LOOPED_ANIMS as LOOPED, UNIT_MODELS, type ModelAnim, type ModelDef } from '../data/models';
import type { Dir } from '../engine/types';

// «Фотостудия»: при загрузке боя 3D-модели рендерятся в кадры спрайтов — 4 направления × кадры анимаций.
// Само поле остаётся 2D (Phaser), three.js нужен только здесь и грузится, только когда выбраны 3D-модели.

/** Размер одного кадра в пикселях. */
const FRAME = 192;
const COLUMNS = 16;
/** Высота «стандартной» фигуры в единицах сцены; кадр вмещает её с запасом сверху. */
const STD_HEIGHT = 1.8;
const VIEW_HEIGHT = STD_HEIGHT * 1.45;
/** Камера смотрит сверху под 30° — так же, как наклонена изометрия (ромб 2:1). */
const ELEVATION = Math.PI / 6;

const MODEL_DIRS: Dir[] = ['right', 'down', 'left', 'up'];

const FRAMES: Record<ModelAnim, number> = { idle: 8, walk: 8, attack: 8, cast: 8, hit: 5, death: 8 };

export interface UnitSheet {
  canvas: HTMLCanvasElement;
  /** Размер кадра в пикселях. */
  frameSize: number;
  /** Номер первого кадра анимации в направлении и число кадров. */
  frames: Partial<Record<ModelAnim, Record<Dir, { start: number; count: number }>>>;
  /** Где в кадре точка «ноги на земле» (доли кадра). */
  origin: { x: number; y: number };
  /** Сколько длится анимация в оригинале (секунды) — чтобы проигрывать с родной скоростью. */
  durations: Partial<Record<ModelAnim, number>>;
}

const MODEL_URLS = import.meta.glob('../assets/models/*.glb', { query: '?url', import: 'default', eager: true }) as Record<
  string,
  string
>;
const urlOf = (file: string) => {
  const url = MODEL_URLS[`../assets/models/${file}`];
  if (!url) throw new Error(`Нет модели ${file}`);
  return url;
};

let cache: Promise<Record<string, UnitSheet>> | null = null;

/**
 * Рендерит спрайты всех персонажей, у которых есть модель. screenAngle — угол направления на экране
 * (из проекции поля), чтобы «вправо по сетке» у модели совпадало с «вправо» на поле.
 * Результат кэшируется: следующий бой начинается сразу.
 */
export function renderUnitSheets(screenAngle: (dir: Dir) => number): Promise<Record<string, UnitSheet>> {
  cache ??= renderAll(screenAngle).catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}

async function renderAll(screenAngle: (dir: Dir) => number) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(FRAME, FRAME);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe6eeff, 0x51463a, 2.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xb0c4ff, 1.6);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  const camera = new THREE.OrthographicCamera(-VIEW_HEIGHT / 2, VIEW_HEIGHT / 2, VIEW_HEIGHT / 2, -VIEW_HEIGHT / 2, 0.1, 100);
  const target = new THREE.Vector3(0, STD_HEIGHT * 0.45, 0);
  camera.position.set(0, target.y + Math.sin(ELEVATION) * 20, Math.cos(ELEVATION) * 20);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const ground = new THREE.Vector3(0, 0, 0).project(camera);
  const origin = { x: (ground.x + 1) / 2, y: (1 - ground.y) / 2 };

  const loader = new GLTFLoader();
  const sheets: Record<string, UnitSheet> = {};
  try {
    for (const [kind, def] of Object.entries(UNIT_MODELS)) {
      sheets[kind] = await renderModel(loader, renderer, scene, camera, def, screenAngle, origin);
    }
  } finally {
    renderer.dispose();
  }
  return sheets;
}

async function renderModel(
  loader: GLTFLoader,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  def: ModelDef,
  screenAngle: (dir: Dir) => number,
  origin: { x: number; y: number },
): Promise<UnitSheet> {
  const gltf: GLTF = await loader.loadAsync(urlOf(def.file));
  const model = gltf.scene;
  for (const a of def.attach ?? []) {
    const item = (await loader.loadAsync(urlOf(a.file))).scene;
    // three.js убирает точки из имён узлов: handslot.r → handslotr.
    const bone = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(a.bone));
    if (!bone) throw new Error(`${def.file}: нет кости ${a.bone}`);
    bone.add(item);
  }

  // Масштаб: рост модели (в позе покоя) → def.height стандартных фигур; ноги на земле.
  const holder = new THREE.Group();
  holder.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const k = (STD_HEIGHT * def.height) / Math.max(size.y, 1e-3);
  model.scale.setScalar(k);
  model.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
  scene.add(holder);

  const mixer = new THREE.AnimationMixer(model);
  const clip = (name?: string) => (name ? gltf.animations.find((c) => c.name === name) : undefined);

  const anims = (Object.keys(FRAMES) as ModelAnim[]).filter((a) => clip(def.anims[a]));
  const total = anims.reduce((n, a) => n + FRAMES[a] * MODEL_DIRS.length, 0);
  const canvas = document.createElement('canvas');
  canvas.width = FRAME * COLUMNS;
  canvas.height = FRAME * Math.ceil(total / COLUMNS);
  const ctx = canvas.getContext('2d')!;

  const frames: UnitSheet['frames'] = {};
  const durations: UnitSheet['durations'] = {};
  let index = 0;
  for (const anim of anims) {
    const c = clip(def.anims[anim])!;
    durations[anim] = c.duration;
    const count = FRAMES[anim];
    const byDir = {} as Record<Dir, { start: number; count: number }>;
    for (const dir of MODEL_DIRS) {
      byDir[dir] = { start: index, count };
      // Направление на экране → направление на земле: вертикаль экрана сжата синусом наклона камеры.
      const theta = screenAngle(dir);
      holder.rotation.y = Math.atan2(Math.cos(theta), Math.sin(theta) / Math.sin(ELEVATION)) + ((def.yaw ?? 0) * Math.PI) / 180;
      mixer.stopAllAction();
      const action = mixer.clipAction(c);
      action.reset();
      action.setLoop(LOOPED[anim] ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = true;
      action.play();
      for (let i = 0; i < count; i++) {
        // Зацикленные — равномерно по кругу; одноразовые — от начала до последнего кадра включительно.
        const t = LOOPED[anim] ? (i / count) * c.duration : (i / (count - 1)) * (c.duration - 1e-3);
        mixer.setTime(t);
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, (index % COLUMNS) * FRAME, Math.floor(index / COLUMNS) * FRAME);
        index++;
      }
    }
    frames[anim] = byDir;
  }
  scene.remove(holder);
  mixer.stopAllAction();
  return { canvas, frameSize: FRAME, frames, origin, durations };
}
