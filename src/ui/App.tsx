import { useMemo, useState } from 'react';
import { BattleSession, type SessionSetup } from '../game/session';
import { SetupScreen } from './SetupScreen';
import { BattleScreen } from './BattleScreen';

export function App() {
  const [setup, setSetup] = useState<SessionSetup | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Новая сессия на каждую попытку.
  const session = useMemo(() => (setup ? new BattleSession(setup) : null), [setup, attempt]);

  if (!session) return <SetupScreen onStart={setSetup} />;
  return (
    <BattleScreen
      key={attempt}
      session={session}
      onRetry={() => setAttempt((a) => a + 1)}
      onExit={() => setSetup(null)}
    />
  );
}
