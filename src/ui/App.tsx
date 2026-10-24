import { useMemo, useState } from 'react';
import { BattleSession, type SessionSetup } from '../game/session';
import { generateWormhole, randomSeed } from '../data/mapgen';
import {
  afterVictory,
  isComplete,
  rest,
  shardsKept,
  startExpedition,
  type Door,
  type Expedition,
  type ExpeditionEnd,
} from '../data/expedition';
import { createHero } from '../data/units';
import { addShards } from '../game/stash';
import { SetupScreen, type ExpeditionStart, type SetupChoice } from './SetupScreen';
import { BattleScreen } from './BattleScreen';
import { ExpeditionScreen, ExpeditionSummary } from './ExpeditionScreen';

/** Поход: персонаж, состояние Червоточины, текущий зал и итог. */
interface Run {
  start: ExpeditionStart;
  exp: Expedition;
  door: Door | null;
  end: { kind: ExpeditionEnd; kept: number; total: number } | null;
}

function newRun(start: ExpeditionStart): Run {
  const hero = createHero(start.affinity, start.weapon, { x: 0, y: 0 }, start.bodySkills);
  return { start, exp: startExpedition(start.seed, start.dangerClass, hero), door: null, end: null };
}

export function App() {
  const [setup, setSetup] = useState<SessionSetup | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  // Последний выбор — чтобы после боя не выбирать всё заново.
  const [last, setLast] = useState<SetupChoice | undefined>();
  const [attempt, setAttempt] = useState(0);
  // Новая сессия на каждую попытку и на каждый зал похода.
  const session = useMemo(() => (setup ? new BattleSession(setup) : null), [setup, attempt]);

  const toSetup = () => {
    setSetup(null);
    setRun(null);
  };

  const finishRun = (r: Run, kind: ExpeditionEnd) => {
    const kept = shardsKept(r.exp, kind);
    const total = addShards(kept);
    setSetup(null);
    setRun({ ...r, door: null, end: { kind, kept, total } });
  };

  if (run && !setup) {
    if (run.end)
      return (
        <ExpeditionSummary
          exp={run.exp}
          end={run.end.kind}
          kept={run.end.kept}
          total={run.end.total}
          onAgain={() => setRun(newRun({ ...run.start, seed: randomSeed() }))}
          onExit={toSetup}
        />
      );
    return (
      <ExpeditionScreen
        exp={run.exp}
        affinity={run.start.affinity}
        onRest={(choice) => setRun({ ...run, exp: rest(run.exp, choice) })}
        onEnter={(door) => {
          setRun({ ...run, door });
          setSetup({
            map: door.map,
            affinity: run.start.affinity,
            weapon: run.start.weapon,
            location: 'wormhole',
            bodySkills: run.start.bodySkills,
            heroState: { hp: run.exp.hp, mana: run.exp.mana },
          });
          setAttempt((a) => a + 1);
        }}
        onRetreat={() => finishRun(run, 'retreat')}
      />
    );
  }

  if (!session)
    return (
      <SetupScreen
        initial={last}
        onStart={(s) => {
          setLast({ kind: 'battle', setup: s });
          setSetup(s);
        }}
        onExpedition={(start) => {
          setLast({ kind: 'expedition', start });
          setRun(newRun(start));
        }}
      />
    );

  if (run?.door) {
    const { door, exp } = run;
    return (
      <BattleScreen
        key={attempt}
        session={session}
        expedition={{
          room: door.room,
          depth: exp.depth,
          onWin: () => {
            const next = afterVictory(exp, door, session.hero);
            const r = { ...run, exp: next, door: null };
            if (isComplete(next)) finishRun(r, 'closed');
            else {
              setSetup(null);
              setRun(r);
            }
          },
          onLose: () => finishRun(run, 'defeat'),
        }}
        onRetry={() => {}}
        onExit={toSetup}
      />
    );
  }

  const { dangerClass } = session.setup.map;
  return (
    <BattleScreen
      key={attempt}
      session={session}
      onRetry={() => setAttempt((a) => a + 1)}
      onNewMap={
        dangerClass
          ? () => {
              const next = { ...session.setup, map: generateWormhole({ seed: randomSeed(), dangerClass }) };
              setLast({ kind: 'battle', setup: next });
              setSetup(next);
              setAttempt((a) => a + 1);
            }
          : undefined
      }
      onExit={toSetup}
    />
  );
}
