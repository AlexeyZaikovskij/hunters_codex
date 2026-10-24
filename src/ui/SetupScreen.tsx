import { useEffect, useState } from 'react';
import { checkServer, type ServerStatus } from '../lib/supabase';
import type { Affinity, SessionSetup } from '../game/session';
import { SKILLS, SCHOOL_SKILLS } from '../data/skills';
import { WEAPONS } from '../data/weapons';
import { TRAINING_WORMHOLE } from '../data/maps';
import { BODY_SLOTS, DEFAULT_BODY_SKILLS } from '../data/units';
import type { Location } from '../engine/types';

const AFFINITIES: { id: Affinity; name: string; tagline: string }[] = [
  { id: 'fire', name: 'Огонь', tagline: 'Урон по площади и горение. Всё решается громко.' },
  { id: 'light', name: 'Свет', tagline: 'Лечение, щиты и особая нелюбовь к нежити.' },
  { id: 'blood', name: 'Кровь', tagline: 'Платит здоровьем за силу и забирает его у врагов.' },
  { id: 'space', name: 'Пространство', tagline: 'Телепорты, отбрасывания и падения с высоты.' },
];

export function SetupScreen({ onStart }: { onStart: (s: SessionSetup) => void }) {
  const [affinity, setAffinity] = useState<Affinity>('fire');
  const [weaponId, setWeaponId] = useState('sword');
  const [location, setLocation] = useState<Location>('wormhole');
  const [bodySkills, setBodySkills] = useState<string[]>(DEFAULT_BODY_SKILLS);
  const toggleBody = (id: string) =>
    setBodySkills((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < BODY_SLOTS ? [...cur, id] : cur,
    );
  const weapon = WEAPONS.find((w) => w.id === weaponId)!;
  const weaponBlocked = !!weapon.technology && location === 'wormhole';
  const [server, setServer] = useState<ServerStatus | 'checking'>('checking');

  useEffect(() => {
    checkServer().then(setServer, () => setServer('error'));
  }, []);

  return (
    <div className="setup">
      <header className="setup-head">
        <h1>Atrium</h1>
        <p>Прототип боя · {TRAINING_WORMHOLE.name}</p>
        <p className={`server server-${server}`}>
          Сервер:{' '}
          {
            {
              checking: 'проверка…',
              online: 'подключён',
              offline: 'не настроен (игра работает офлайн)',
              error: 'нет связи',
            }[server]
          }
        </p>
      </header>

      <section>
        <h2>Пробуждение: склонность</h2>
        <div className="affinities">
          {AFFINITIES.map((a) => (
            <button
              key={a.id}
              className={`affinity school-${a.id} ${affinity === a.id ? 'selected' : ''}`}
              onClick={() => setAffinity(a.id)}
            >
              <strong>{a.name}</strong>
              <span>{a.tagline}</span>
              <ul>
                {SCHOOL_SKILLS[a.id].map((id) => (
                  <li key={id}>{SKILLS[id].name}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>
          Усиление тела: {bodySkills.length} из {BODY_SLOTS}
        </h2>
        <div className="weapons">
          {SCHOOL_SKILLS.body.map((id) => {
            const s = SKILLS[id];
            const on = bodySkills.includes(id);
            return (
              <button
                key={id}
                className={`weapon ${on ? 'selected' : ''}`}
                disabled={!on && bodySkills.length >= BODY_SLOTS}
                onClick={() => toggleBody(id)}
              >
                <strong>{s.name}</strong>
                <span className="mono">
                  {s.apCost} ОД · {s.manaCost} маны{s.cooldown ? ` · перезарядка ${s.cooldown}` : ''}
                </span>
                <span>{s.description}</span>
              </button>
            );
          })}
        </div>
        {bodySkills.includes('vigilance') && weapon.range[0] > 1 && (
          <p className="warn">Бдительность работает только с оружием ближнего боя.</p>
        )}
      </section>

      <section>
        <h2>Оружие</h2>
        <div className="weapons">
          {WEAPONS.map((w) => (
            <button
              key={w.id}
              className={`weapon ${weaponId === w.id ? 'selected' : ''}`}
              onClick={() => setWeaponId(w.id)}
            >
              <strong>{w.name}</strong>
              <span className="mono">
                {w.apCost} ОД · {w.range[0]}–{w.range[1]} · {w.min}–{w.max}
              </span>
              <span>{w.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Место боя</h2>
        <div className="toggle">
          <button className={location === 'wormhole' ? 'selected' : ''} onClick={() => setLocation('wormhole')}>
            Внутри Червоточины
          </button>
          <button className={location === 'surface' ? 'selected' : ''} onClick={() => setLocation('surface')}>
            Прорыв на поверхности
          </button>
        </div>
        {weaponBlocked && <p className="warn">Пистолет — обычная техника: в Червоточине он не выстрелит.</p>}
      </section>

      <button
        className="primary start"
        disabled={bodySkills.length < BODY_SLOTS}
        onClick={() => onStart({ map: TRAINING_WORMHOLE, affinity, weapon, location, bodySkills })}
      >
        В бой
      </button>
    </div>
  );
}
