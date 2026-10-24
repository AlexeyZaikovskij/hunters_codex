import { useEffect, useState } from 'react';
import { checkServer, type ServerStatus } from '../lib/supabase';
import type { Affinity, SessionSetup } from '../game/session';
import { SKILLS, SCHOOL_SKILLS } from '../data/skills';
import { WEAPONS } from '../data/weapons';
import { TRAINING_WORMHOLE } from '../data/maps';
import { Icon } from './Icon';
import { generateWormhole, randomSeed, type DangerClass } from '../data/mapgen';
import { BODY_SLOTS, DEFAULT_BODY_SKILLS } from '../data/units';
import type { Location, WeaponDef } from '../engine/types';
import { getShards } from '../game/stash';
import { FINALE_NAMES, ROOMS_BEFORE_FINALE } from '../data/expedition';
import { ART_NAMES, getArtStyle, setArtStyle, type ArtStyle } from '../game/art';

const AFFINITIES: { id: Affinity; name: string; tagline: string }[] = [
  { id: 'fire', name: 'Огонь', tagline: 'Урон по площади и горение. Всё решается громко.' },
  { id: 'light', name: 'Свет', tagline: 'Лечение, щиты и особая нелюбовь к нежити.' },
  { id: 'blood', name: 'Кровь', tagline: 'Платит здоровьем за силу и забирает его у врагов.' },
  { id: 'space', name: 'Пространство', tagline: 'Телепорты, отбрасывания и падения с высоты.' },
];

type MapKind = 'expedition' | 'random' | 'training';

/** С чем идём в поход: персонаж и Червоточина. */
export interface ExpeditionStart {
  affinity: Affinity;
  weapon: WeaponDef;
  bodySkills: string[];
  dangerClass: DangerClass;
  seed: number;
}

/** Последний выбор игрока — одиночный бой или поход. */
export type SetupChoice = { kind: 'battle'; setup: SessionSetup } | { kind: 'expedition'; start: ExpeditionStart };

export function SetupScreen({
  onStart,
  onExpedition,
  initial,
}: {
  onStart: (s: SessionSetup) => void;
  onExpedition: (s: ExpeditionStart) => void;
  initial?: SetupChoice;
}) {
  const prev = initial?.kind === 'battle' ? initial.setup : initial?.start;
  const [affinity, setAffinity] = useState<Affinity>(prev?.affinity ?? 'fire');
  const [weaponId, setWeaponId] = useState(prev?.weapon.id ?? 'sword');
  const [location, setLocation] = useState<Location>(initial?.kind === 'battle' ? initial.setup.location : 'wormhole');
  const [bodySkills, setBodySkills] = useState<string[]>(prev?.bodySkills ?? DEFAULT_BODY_SKILLS);
  const [mapKind, setMapKind] = useState<MapKind>(
    initial?.kind !== 'battle' ? 'expedition' : initial.setup.map.seed === undefined ? 'training' : 'random',
  );
  const [dangerClass, setDangerClass] = useState<DangerClass>(
    (initial?.kind === 'battle' ? initial.setup.map.dangerClass : initial?.start.dangerClass) ?? 'E',
  );
  const shards = getShards();
  // Пустое поле — новая случайная Червоточина; число — повторить конкретную.
  const [seedText, setSeedText] = useState('');
  const [art, setArt] = useState<ArtStyle>(getArtStyle());
  const chooseArt = (a: ArtStyle) => {
    setArt(a);
    setArtStyle(a);
  };
  const toggleBody = (id: string) =>
    setBodySkills((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < BODY_SLOTS ? [...cur, id] : cur,
    );
  const weapon = WEAPONS.find((w) => w.id === weaponId)!;
  const expedition = mapKind === 'expedition';
  const weaponBlocked = !!weapon.technology && (location === 'wormhole' || expedition);
  const [server, setServer] = useState<ServerStatus | 'checking'>('checking');

  useEffect(() => {
    checkServer().then(setServer, () => setServer('error'));
  }, []);

  return (
    <div className="setup">
      <header className="setup-head">
        <h1>Atrium</h1>
        <p>Прототип боя{shards > 0 && ` · на складе ${shards} осколков Червоточин`}</p>
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
              <ul className="skill-list">
                {SCHOOL_SKILLS[a.id].map((id) => (
                  <li key={id}>
                    <Icon name={SKILLS[id].icon} size={16} />
                    {SKILLS[id].name}
                  </li>
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
                <strong className="with-icon">
                  <Icon name={s.icon} size={22} />
                  {s.name}
                </strong>
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
              <strong className="with-icon">
                <Icon name={w.icon} size={22} />
                {w.name}
              </strong>
              <span className="mono">
                {w.apCost} ОД · {w.range[0]}–{w.range[1]} · {w.min}–{w.max}
              </span>
              <span>{w.description}</span>
            </button>
          ))}
        </div>
      </section>

      {!expedition && (
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
      )}

      <section>
        <h2>Червоточина</h2>
        <div className="map-options">
          <div className="toggle">
            <button className={mapKind === 'expedition' ? 'selected' : ''} onClick={() => setMapKind('expedition')}>
              Поход
            </button>
            <button className={mapKind === 'random' ? 'selected' : ''} onClick={() => setMapKind('random')}>
              Один бой
            </button>
            <button className={mapKind === 'training' ? 'selected' : ''} onClick={() => setMapKind('training')}>
              Учебная
            </button>
          </div>
          {mapKind !== 'training' && (
            <>
              <div className="toggle">
                <button className={dangerClass === 'E' ? 'selected' : ''} onClick={() => setDangerClass('E')}>
                  Класс E
                </button>
                <button className={dangerClass === 'D' ? 'selected' : ''} onClick={() => setDangerClass('D')}>
                  Класс D
                </button>
              </div>
              <label className="seed">
                Зерно
                <input
                  inputMode="numeric"
                  placeholder="случайное"
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value.replace(/\D/g, '').slice(0, 9))}
                />
              </label>
            </>
          )}
        </div>
        <p className="hint">
          {expedition
            ? `Поход: ${ROOMS_BEFORE_FINALE} зала с развилками и финал — ${FINALE_NAMES.boss.toLowerCase()} или ${FINALE_NAMES.source.toLowerCase()}. Здоровье и мана переносятся между боями, за каждый зал — осколки Червоточины. Класс ${dangerClass === 'E' ? 'E — по силам новичку' : 'D — пока почти непроходим без развития персонажа'}.${weaponBlocked ? ' Пистолет в Червоточине не стреляет.' : ''}`
            : mapKind === 'training'
            ? `${TRAINING_WORMHOLE.name}: всегда одно и то же поле — удобно сравнивать школы.`
            : dangerClass === 'E'
              ? 'Класс E: 3 монстра. Поле и состав каждый раз новые: пещера, руины или пустошь.'
              : 'Класс D: 4–5 монстров. Для опытных Одарённых — или для смелых.'}
        </p>
      </section>

      <section>
        <h2>Графика поля</h2>
        <div className="toggle">
          {(Object.keys(ART_NAMES) as ArtStyle[]).map((a) => (
            <button key={a} className={art === a ? 'selected' : ''} onClick={() => chooseArt(a)}>
              {ART_NAMES[a]}
            </button>
          ))}
        </div>
        <p className="hint">
          {art === 'pixel'
            ? 'Пиксель-арт Kenney: готовые тайлы и персонажи.'
            : art === 'iso'
              ? 'Изометрия: поле под углом, персонажи — анимированные 3D-модели (первая загрузка — пара секунд).'
              : 'Нарисовано кодом: фактурный пол, объёмные камни, векторные фигурки.'}{' '}
          Для сравнения запустите одно и то же зерно в обоих вариантах.
        </p>
      </section>

      <button
        className="primary start"
        disabled={bodySkills.length < BODY_SLOTS}
        onClick={() => {
          if (expedition) {
            onExpedition({ affinity, weapon, bodySkills, dangerClass, seed: seedText ? Number(seedText) : randomSeed() });
            return;
          }
          const map =
            mapKind === 'training'
              ? TRAINING_WORMHOLE
              : generateWormhole({ seed: seedText ? Number(seedText) : randomSeed(), dangerClass });
          onStart({ map, affinity, weapon, location, bodySkills });
        }}
      >
        {expedition ? 'В поход' : 'В бой'}
      </button>

      <footer className="credits">
        Иконки:{' '}
        <a href="https://game-icons.net" target="_blank" rel="noreferrer">
          game-icons.net
        </a>{' '}
        (Lorc, Delapouite и другие авторы),{' '}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
          CC BY 3.0
        </a>
        . Пиксель-арт:{' '}
        <a href="https://kenney.nl" target="_blank" rel="noreferrer">
          Kenney
        </a>{' '}
        (CC0). 3D-модели:{' '}
        <a href="https://kaylousberg.com" target="_blank" rel="noreferrer">
          KayKit (Kay Lousberg)
        </a>
        ,{' '}
        <a href="https://quaternius.com" target="_blank" rel="noreferrer">
          Quaternius
        </a>{' '}
        (CC0).
      </footer>
    </div>
  );
}
