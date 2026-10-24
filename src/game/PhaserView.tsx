import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BattleScene, makeProjection } from './BattleScene';
import { getArtStyle } from './art';
import type { BattleSession } from './session';

/** Встраивает поле боя Phaser в React. Игра создаётся один раз на сессию. */
export function PhaserView({ session }: { session: BattleSession }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const proj = makeProjection(getArtStyle(), session.battle.grid);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: proj.width,
      height: proj.height,
      backgroundColor: '#12141c',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      banner: false,
    });
    game.scene.add('battle', BattleScene, true, { session });
    if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
    return () => game.destroy(true);
  }, [session]);

  return <div className="board" ref={host} />;
}
