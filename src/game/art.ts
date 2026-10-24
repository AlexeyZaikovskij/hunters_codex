// Какой графикой рисовать поле боя. Выбор игрока хранится в браузере.

export type ArtStyle = 'pixel' | 'painted' | 'iso';

export const ART_NAMES: Record<ArtStyle, string> = {
  pixel: 'Пиксельная',
  painted: 'Рисованная',
  iso: 'Изометрия',
};

const STORAGE_KEY = 'atrium.art';

export function getArtStyle(): ArtStyle {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'pixel' || v === 'painted' || v === 'iso') return v;
  } catch {
    // Хранилище недоступно (приватный режим) — берём по умолчанию.
  }
  return 'painted';
}

export function setArtStyle(style: ArtStyle) {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Не сохранится между визитами — не страшно.
  }
}
