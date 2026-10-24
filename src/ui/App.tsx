import { useMemo, useState } from 'react';
import { BattleSession, type SessionSetup } from '../game/session';
import { generateWormhole, randomSeed } from '../data/mapgen';
import { SetupScreen } from './SetupScreen';
import { BattleScreen } from './BattleScreen';

export function App() {
  const [setup, setSetup] = useState<SessionSetup | null>(null);
  // Последний выбор — чтобы после боя не выбирать всё заново.
  const [last, setLast] = useState<SessionSetup | undefined>();
  const [attempt, setAttempt] = useState(0);
  // Новая сессия на каждую попытку.
  const session = useMemo(() => (setup ? new BattleSession(setup) : null), [setup, attempt]);

  if (!session)
    return (
      <SetupScreen
        initial={last}
        onStart={(s) => {
          setLast(s);
          setSetup(s);
        }}
      />
    );
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
              setLast(next);
              setSetup(next);
              setAttempt((a) => a + 1);
            }
          : undefined
      }
      onExit={() => setSetup(null)}
    />
  );
}
