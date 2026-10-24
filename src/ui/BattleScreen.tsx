import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { BattleSession, Mode } from '../game/session';
import { PhaserView } from '../game/PhaserView';
import { SKILLS, SCHOOL_NAMES } from '../data/skills';
import { RULES } from '../engine/battle';
import type { Status, StatusId, Unit } from '../engine/types';

const STATUS_NAMES: Record<StatusId, string> = {
  burn: 'Горение',
  bleed: 'Кровотечение',
  blind: 'Ослепление',
  slow: 'Замедление',
  haste: 'Ускорение',
  damageBoost: 'Усиление урона',
  fireBoost: 'Ярость пламени',
  shield: 'Щит',
  weaponBoost: 'Усиленный удар',
};

const STATUS_HINT: Record<StatusId, (v: number) => string> = {
  burn: (v) => `${v} урона огнём в начале хода`,
  bleed: (v) => `${v} урона за каждую клетку`,
  blind: (v) => `−${v} к дальности`,
  slow: (v) => `−${v} ОП`,
  haste: (v) => `+${v} ОП`,
  damageBoost: (v) => `+${v}% ко всему урону`,
  fireBoost: (v) => `+${v}% к урону огнём`,
  shield: (v) => `поглотит ${v} урона`,
  weaponBoost: (v) => `+${v}% к следующему удару`,
};

const RESIST_NAMES: Record<string, string> = {
  physical: 'физ.',
  fire: 'огонь',
  light: 'свет',
  blood: 'кровь',
  space: 'простр.',
};

function useSession(session: BattleSession) {
  useSyncExternalStore(session.subscribe, session.getVersion);
}

function Bar({ value, max, kind }: { value: number; max: number; kind: 'hp' | 'mana' }) {
  return (
    <div className={`bar bar-${kind}`}>
      <div className="bar-fill" style={{ width: `${(100 * value) / Math.max(1, max)}%` }} />
      <span>
        {value} / {max}
      </span>
    </div>
  );
}

function Statuses({ statuses }: { statuses: Status[] }) {
  if (!statuses.length) return null;
  return (
    <div className="statuses">
      {statuses.map((s) => (
        <span key={s.id} className={`chip status-${s.id}`} title={STATUS_HINT[s.id](s.value)}>
          {STATUS_NAMES[s.id]} · {s.duration}
        </span>
      ))}
    </div>
  );
}

function UnitCard({ unit, title }: { unit: Unit; title?: string }) {
  const resists = Object.entries(unit.resist).filter(([, v]) => v);
  return (
    <div className={`card unit-card team-${unit.team}`}>
      {title && <div className="card-label">{title}</div>}
      <div className="unit-name">
        <span className="glyph" style={{ background: `#${unit.color.toString(16).padStart(6, '0')}` }}>
          {unit.glyph}
        </span>
        {unit.name}
        {unit.tags.includes('undead') && <span className="tag">нежить</span>}
      </div>
      <Bar value={unit.hp} max={unit.maxHp} kind="hp" />
      {unit.maxMana > 0 && <Bar value={unit.mana} max={unit.maxMana} kind="mana" />}
      <div className="points">
        <span>
          <b>{unit.ap}</b> ОД
        </span>
        <span>
          <b>{unit.mp}</b> ОП
        </span>
        <span>
          <b>{unit.initiative}</b> иниц.
        </span>
      </div>
      {resists.length > 0 && (
        <div className="resists">
          Сопр.: {resists.map(([k, v]) => `${RESIST_NAMES[k]} ${v! > 0 ? '+' : ''}${v}%`).join(', ')}
        </div>
      )}
      <Statuses statuses={unit.statuses} />
    </div>
  );
}

interface ActionInfo {
  title: string;
  meta: string;
  text: string;
}

export function BattleScreen({
  session,
  onRetry,
  onExit,
}: {
  session: BattleSession;
  onRetry: () => void;
  onExit: () => void;
}) {
  useSession(session);
  const { battle, mode, hover } = session;
  const hero = session.hero;
  const [info, setInfo] = useState<ActionInfo | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [session.log.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= hero.skills.length) session.select({ kind: 'skill', id: hero.skills[n - 1] });
      else if (e.key === 'q' || e.key === 'й') session.select({ kind: 'weapon' });
      else if (e.key === 'f' || e.key === 'а') void session.focus();
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        void session.endTurn();
      } else if (e.key === 'Escape') session.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, hero]);

  const hovered = hover ? battle.unitAt(hover) : undefined;
  const isActive = (m: Mode) => JSON.stringify(m) === JSON.stringify(mode);
  const myTurn = session.isPlayerTurn;
  const weapon = hero.weapon!;
  const weaponErr = battle.weaponError(hero);

  return (
    <div className="battle">
      <header className="battle-head">
        <div>
          <h1>Atrium</h1>
          <span className="sub">
            {session.setup.map.name} · {session.setup.location === 'wormhole' ? 'внутри Червоточины' : 'прорыв на поверхности'}
          </span>
        </div>
        <div className="turn-info">
          <span>Раунд {battle.round}</span>
          <span className={`turn-badge ${battle.current.team}`}>
            {battle.result !== 'ongoing' ? 'Бой окончен' : myTurn ? 'Ваш ход' : session.busy && battle.current.team === 'player' ? '…' : `Ходит: ${battle.current.name}`}
          </span>
        </div>
        <button className="ghost" onClick={onExit}>
          Сменить склонность
        </button>
      </header>

      <aside className="left">
        <UnitCard unit={hero} title={`Склонность: ${SCHOOL_NAMES[session.setup.affinity]}`} />
        <div className="card">
          <div className="card-label">Порядок ходов</div>
          <ol className="order">
            {battle.order
              .map((id) => battle.unit(id))
              .filter((u) => u.alive)
              .map((u) => (
                <li key={u.id} className={`${u.id === battle.current.id ? 'current' : ''} team-${u.team}`}>
                  <span className="glyph small" style={{ background: `#${u.color.toString(16).padStart(6, '0')}` }}>
                    {u.glyph}
                  </span>
                  {u.name}
                  <span className="mono">{u.hp}</span>
                </li>
              ))}
          </ol>
        </div>
        {hovered && hovered !== hero && <UnitCard unit={hovered} title="Под курсором" />}
      </aside>

      <main className="center">
        <PhaserView session={session} />
        {session.message && <div className="toast">{session.message}</div>}
        {battle.result !== 'ongoing' && !session.busy && (
          <div className="result">
            <h2>{battle.result === 'victory' ? 'Победа!' : 'Поражение'}</h2>
            <p>
              {battle.result === 'victory'
                ? 'Червоточина зачищена. Служба контроля благодарит и просит заполнить отчёт в трёх экземплярах.'
                : 'Вас вынесли из Червоточины. Служба контроля напоминает: страховка не покрывает «я думал, он слабый».'}
            </p>
            <div className="result-actions">
              <button className="primary" onClick={onRetry}>
                Ещё раз
              </button>
              <button className="ghost" onClick={onExit}>
                Сменить склонность
              </button>
            </div>
          </div>
        )}
      </main>

      <aside className="right card">
        <div className="card-label">Журнал боя</div>
        <div className="log" ref={logRef}>
          {session.log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        <div className="help">
          ЛКМ — ход/применить · ПКМ или Esc — отмена
          <br />
          1–8 умения · Q оружие · F сосредоточиться · Пробел — конец хода
        </div>
      </aside>

      <footer className="actions">
        {info && (
          <div className="action-info">
            <strong>{info.title}</strong>
            <span className="mono">{info.meta}</span>
            <p>{info.text}</p>
          </div>
        )}
        <div className="slots">
          {hero.skills.map((id, i) => {
            const s = SKILLS[id];
            const err = battle.skillError(hero, id);
            const cd = hero.cooldowns[id] ?? 0;
            const hpCost = s.hpCost?.flat ? ` · ${s.hpCost.flat} ОЗ` : s.hpCost?.percentOfCurrent ? ` · ${s.hpCost.percentOfCurrent}% ОЗ` : '';
            const range = s.target === 'self' ? 'на себя' : `${s.range[0]}–${s.range[1]}${s.line ? ' прямая' : ''}`;
            return (
              <button
                key={id}
                className={`slot school-${s.school} ${isActive({ kind: 'skill', id }) ? 'active' : ''} ${err || !myTurn ? 'disabled' : ''}`}
                onClick={() => session.select({ kind: 'skill', id })}
                onMouseEnter={() =>
                  setInfo({
                    title: `${s.name} · ${SCHOOL_NAMES[s.school]}`,
                    meta: `${s.apCost} ОД · ${s.manaCost} маны${hpCost} · ${range}${s.cooldown ? ` · перезарядка ${s.cooldown}` : ''}${s.needsLos ? '' : ' · без обзора'}`,
                    text: err ? `${s.description} (${err})` : s.description,
                  })
                }
                onMouseLeave={() => setInfo(null)}
              >
                <span className="key">{i + 1}</span>
                <span className="slot-name">{s.name}</span>
                <span className="slot-cost">
                  {s.apCost} ОД{s.manaCost ? ` · ${s.manaCost} М` : ''}
                </span>
                {cd > 0 && <span className="cd">{cd}</span>}
              </button>
            );
          })}
        </div>
        <div className="slots extra">
          <button
            className={`slot school-weapon ${isActive({ kind: 'weapon' }) ? 'active' : ''} ${weaponErr || !myTurn ? 'disabled' : ''}`}
            onClick={() => session.select({ kind: 'weapon' })}
            onMouseEnter={() =>
              setInfo({
                title: `${weapon.name} · оружие`,
                meta: `${weapon.apCost} ОД · ${weapon.range[0]}–${weapon.range[1]} · ${weapon.min}–${weapon.max} урона · не больше ${RULES.maxWeaponAttacksPerTurn} ударов за ход`,
                text: weaponErr ? `${weapon.description} (${weaponErr})` : weapon.description,
              })
            }
            onMouseLeave={() => setInfo(null)}
          >
            <span className="key">Q</span>
            <span className="slot-name">{weapon.name}</span>
            <span className="slot-cost">{weapon.apCost} ОД</span>
          </button>
          <button
            className={`slot school-focus ${!myTurn || hero.focusedThisTurn || hero.ap < RULES.focusAp ? 'disabled' : ''}`}
            onClick={() => void session.focus()}
            onMouseEnter={() =>
              setInfo({
                title: 'Сосредоточиться',
                meta: `${RULES.focusAp} ОД · раз в ход`,
                text: `Перевести дух: +${RULES.focusMana} маны.`,
              })
            }
            onMouseLeave={() => setInfo(null)}
          >
            <span className="key">F</span>
            <span className="slot-name">Сосредоточиться</span>
            <span className="slot-cost">{RULES.focusAp} ОД</span>
          </button>
          <button className="slot end-turn" disabled={!myTurn} onClick={() => void session.endTurn()}>
            <span className="key">␣</span>
            <span className="slot-name">Конец хода</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
