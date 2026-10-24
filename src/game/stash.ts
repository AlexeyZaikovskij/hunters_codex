// Склад: осколки Червоточин, вынесенные из походов. Пока хранится в браузере; позже переедет на сервер.

const STORAGE_KEY = 'atrium.shards';

export function getShards(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function addShards(amount: number): number {
  const total = getShards() + amount;
  try {
    localStorage.setItem(STORAGE_KEY, String(total));
  } catch {
    // Хранилище недоступно (приватный режим) — осколки не сохранятся между визитами.
  }
  return total;
}
