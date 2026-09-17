import { useMemo } from 'react';
import { DECK_SLOTS, deckOfRarity, slotsFor } from '../game/data/deck';
import { UNIT_BY_ID, unitsOfRarity } from '../game/data/units';
import { UNIT_UNLOCK_WAVE, isUnlocked } from '../game/data/unlocks';
import { RARITY_COLOR, RARITY_LABEL } from '../game/config';
import type { Rarity } from '../game/types';
import { UnitIcon } from './UnitIcon';
import { Icon } from './Icon';

interface Props {
  deck: string[];
  bestWave: number;
  onChange: (deck: string[]) => void;
  onClose: () => void;
}

// 런 전에 덱을 짜는 화면. 등급마다 칸이 정해져 있어서 "어떤 일반을 쓸까"가 매번 선택이 된다.
export function DeckScreen({ deck, bestWave, onChange, onClose }: Props) {
  const byRarity = useMemo(
    () => DECK_SLOTS.map(({ rarity, count }) => ({ rarity, count, picked: deckOfRarity(deck, rarity), pool: unitsOfRarity(rarity) })),
    [deck],
  );

  // 같은 등급 안에서만 교체한다. 칸이 찼으면 가장 먼저 넣은 것을 밀어낸다.
  const toggle = (defId: string, rarity: Rarity) => {
    const picked = deckOfRarity(deck, rarity);
    const next = picked.includes(defId) ? picked.filter((id) => id !== defId) : [...picked, defId].slice(-slotsFor(rarity));
    const others = deck.filter((id) => UNIT_BY_ID[id]?.rarity !== rarity);
    onChange([...others, ...next]);
  };

  return (
    <div className="deck">
      <div className="deck-head">
        <div>
          <div className="deck-title">덱 구성</div>
          <div className="deck-sub">여기 넣은 유닛만 뽑기에서 나옵니다. 합성 승급도 덱 안에서 나옵니다.</div>
        </div>
        <button className="deck-close" onClick={onClose} aria-label="닫기">
          <Icon name="check" size={18} strokeWidth={2.6} />
          완료
        </button>
      </div>

      {byRarity.map(({ rarity, count, picked, pool }) => (
        <section className="deck-group" key={rarity}>
          <div className="deck-group-head">
            <span className="deck-rarity" style={{ color: RARITY_COLOR[rarity] }}>
              {RARITY_LABEL[rarity]}
            </span>
            <span className="deck-count px" style={{ color: picked.length === count ? RARITY_COLOR[rarity] : 'var(--off)' }}>
              {picked.length}/{count}
            </span>
          </div>
          <div className="deck-pool">
            {pool.map((u) => {
              const locked = !isUnlocked(u.id, bestWave);
              const on = picked.includes(u.id);
              return (
                <button
                  key={u.id}
                  className={`deck-card ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}
                  style={on ? { ['--fc' as string]: RARITY_COLOR[rarity] } : undefined}
                  disabled={locked}
                  aria-pressed={on}
                  onClick={() => toggle(u.id, rarity)}
                >
                  <UnitIcon defId={u.id} size={38} dim={locked} />
                  <span className="deck-name">{locked ? '???' : u.name}</span>
                  {locked ? (
                    <span className="deck-lock px">W{UNIT_UNLOCK_WAVE[u.id]}</span>
                  ) : (
                    <span className="deck-role">{u.desc}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="deck-note">
        전설·특수 유닛은 덱과 무관하게 나옵니다. 잠긴 유닛은 최고 웨이브가 표시된 숫자에 닿으면 열립니다 (현재 최고 {bestWave || 0}).
      </div>
    </div>
  );
}
