import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { BattleScene, makeProjection } from './BattleScene';
import { getArtStyle } from './art';
import type { BattleSession } from './session';
import type { UnitSheet } from './models3d';

/** Встраивает поле боя Phaser в React. Игра создаётся один раз на сессию. */
export function PhaserView({ session }: { session: BattleSession }) {
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const art = getArtStyle();
    const proj = makeProjection(art, session.battle.grid);
    let game: Phaser.Game | null = null;
    let cancelled = false;
    const start = (sheets?: Record<string, UnitSheet>) => {
      if (cancelled) return;
      setLoading(false);
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current!,
        width: proj.width,
        height: proj.height,
        backgroundColor: '#12141c',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        banner: false,
      });
      game.scene.add('battle', BattleScene, true, { session, sheets });
      if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
    };
    if (art === 'iso') {
      // 3D-модели: three.js грузится только здесь; не вышло (нет WebGL) — бой с рисованными фигурками.
      setLoading(true);
      import('./models3d')
        .then((m) => m.renderUnitSheets((dir) => proj.angle(dir)))
        .then(start, (e) => {
          console.warn('3D-модели не загрузились, берём рисованные фигурки', e);
          start();
        });
    } else start();
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [session]);

  return <div className="board" ref={host}>{loading && <div className="board-loading">Загружаем модели…</div>}</div>;
}
