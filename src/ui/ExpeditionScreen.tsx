import type { Affinity } from '../game/session';
import {
  DEFEAT_LOSS,
  FINALE_NAMES,
  REST,
  ROOM_HINTS,
  ROOM_NAMES,
  ROOMS_BEFORE_FINALE,
  doors,
  type Door,
  type Expedition,
  type ExpeditionEnd,
} from '../data/expedition';
import { STYLE_NAMES } from '../data/mapgen';
import { MONSTERS } from '../data/units';
import { SCHOOL_NAMES } from '../data/skills';
import { UI_ICONS } from '../data/ui-icons';
import { Bar } from './BattleScreen';
import { Icon } from './Icon';

/** Путь по Червоточине: пройденные залы, текущий, финал. */
function Track({ exp }: { exp: Expedition }) {
  const steps = Array.from({ length: ROOMS_BEFORE_FINALE + 1 }, (_, i) =>
    i === 0 ? 'Вход' : i === ROOMS_BEFORE_FINALE ? FINALE_NAMES[exp.finale] : 'Развилка',
  );
  return (
    <ol className="track">
      {steps.map((name, i) => (
        <li key={i} className={i < exp.depth ? 'done' : i === exp.depth ? 'current' : ''}>
          <span className="track-dot">{i < exp.depth ? '✓' : i + 1}</span>
          {name}
        </li>
      ))}
    </ol>
  );
}

/** Кто ждёт в зале: «Червеглот ×2, Иглобрюх». */
function Monsters({ door }: { door: Door }) {
  const counts = new Map<string, number>();
  for (const m of door.map.monsters) counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
  return (
    <ul className="door-monsters">
      {[...counts].map(([type, n]) => {
        const def = MONSTERS[type];
        return (
          <li key={type} style={{ color: `#${def.color.toString(16).padStart(6, '0')}` }}>
            <Icon name={def.icon} size={18} />
            <span>
              {def.name}
              {n > 1 && ` ×${n}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ExpeditionScreen({
  exp,
  affinity,
  onRest,
  onEnter,
  onRetreat,
}: {
  exp: Expedition;
  affinity: Affinity;
  onRest: (choice: 'hp' | 'mana') => void;
  onEnter: (door: Door) => void;
  onRetreat: () => void;
}) {
  const options = doors(exp);
  const hpGain = Math.min(exp.maxHp - exp.hp, Math.round(exp.maxHp * REST.hpShare));
  const manaGain = Math.min(exp.maxMana - exp.mana, Math.round(exp.maxMana * REST.manaShare));
  return (
    <div className="expedition">
      <header className="setup-head">
        <h1>Червоточина класса {exp.dangerClass}</h1>
        <p>
          {STYLE_NAMES[exp.style][0].toUpperCase() + STYLE_NAMES[exp.style].slice(1)} · зерно {exp.seed} · разведка Службы
          контроля: в глубине — {FINALE_NAMES[exp.finale].toLowerCase()}
        </p>
      </header>

      <Track exp={exp} />

      <div className="expedition-status card">
        <div>
          <div className="card-label">Одарённый · {SCHOOL_NAMES[affinity]}</div>
          <Bar value={exp.hp} max={exp.maxHp} kind="hp" />
          <Bar value={exp.mana} max={exp.maxMana} kind="mana" />
        </div>
        <div className="loot">
          <Icon name={UI_ICONS.shards} size={34} />
          <div>
            <b>{exp.shards}</b> осколков
            <span className="mono">при поражении потеряете {Math.round(DEFEAT_LOSS * 100)}%</span>
          </div>
        </div>
      </div>

      {!exp.rested && (
        <section>
          <h2>Привал</h2>
          <p className="hint first">
            Вы перевели дух: вернулось {Math.round(REST.autoManaShare * 100)}% маны. Есть время ещё на что-то одно.
          </p>
          <div className="weapons">
            <button className="weapon" onClick={() => onRest('hp')}>
              <strong className="with-icon">
                <Icon name={UI_ICONS.restHp} size={22} />
                Перевязать раны
              </strong>
              <span className="mono">+{hpGain} здоровья</span>
              <span>Бинты из аптечки Службы. Срок годности — не спрашивайте.</span>
            </button>
            <button className="weapon" onClick={() => onRest('mana')}>
              <strong className="with-icon">
                <Icon name={UI_ICONS.focus} size={22} />
                Помедитировать
              </strong>
              <span className="mono">+{manaGain} маны</span>
              <span>Вдох, выдох, не думать о том, что шуршит за стеной.</span>
            </button>
          </div>
        </section>
      )}

      {exp.rested && (
        <section>
          <h2>{options.length > 1 ? 'Развилка: куда дальше?' : 'Дальше'}</h2>
          <div className="doors">
            {options.map((door) => (
              <button key={door.room} className={`weapon door door-${door.room}`} onClick={() => onEnter(door)}>
                <strong className="with-icon">
                  <Icon name={UI_ICONS.door} size={22} />
                  {ROOM_NAMES[door.room]}
                </strong>
                <span className="mono">+{door.reward} осколков</span>
                <Monsters door={door} />
                <span>{ROOM_HINTS[door.room]}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {exp.depth > 0 && (
        <div>
          <button className="ghost" onClick={onRetreat}>
            Выйти с добычей ({exp.shards} осколков)
          </button>
          <p className="hint">Червоточина останется открытой — её закроет кто-нибудь другой. Наверное.</p>
        </div>
      )}
    </div>
  );
}

const END_TEXT: Record<ExpeditionEnd, { title: string; text: string }> = {
  closed: {
    title: 'Червоточина закрыта!',
    text: 'Служба контроля благодарит за работу и просит заполнить отчёт в трёх экземплярах. Осколки ваши.',
  },
  retreat: {
    title: 'Вы вышли с добычей',
    text: 'Тактическое отступление — тоже победа. Особенно если с карманами, полными осколков.',
  },
  defeat: {
    title: 'Вас вынесли из Червоточины',
    text: 'Спасатели Службы дотащили вас до выхода, но половина добычи осталась внутри. Страховка такое не покрывает.',
  },
};

export function ExpeditionSummary({
  exp,
  end,
  kept,
  total,
  onAgain,
  onExit,
}: {
  exp: Expedition;
  end: ExpeditionEnd;
  kept: number;
  total: number;
  onAgain: () => void;
  onExit: () => void;
}) {
  const { title, text } = END_TEXT[end];
  return (
    <div className="expedition">
      <header className="setup-head">
        <h1>{title}</h1>
        <p>
          Червоточина класса {exp.dangerClass} · пройдено залов: {exp.depth} из {ROOMS_BEFORE_FINALE + 1}
        </p>
      </header>
      <Track exp={exp} />
      <div className="card summary">
        <p>{text}</p>
        <div className="loot">
          <Icon name={UI_ICONS.shards} size={34} />
          <div>
            <b>+{kept}</b> осколков
            {kept < exp.shards && <span className="mono">потеряно {exp.shards - kept}</span>}
            <span className="mono">на складе: {total}</span>
          </div>
        </div>
      </div>
      <div className="result-actions start-row">
        <button className="primary" onClick={onAgain}>
          Новый поход
        </button>
        <button className="ghost" onClick={onExit}>
          К выбору персонажа
        </button>
      </div>
    </div>
  );
}
