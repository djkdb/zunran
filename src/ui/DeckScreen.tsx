import { useMemo } from 'react';
import { DECK_SLOTS, deckOfRarity, slotsFor } from '../game/data/deck';
import { UNIT_BY_ID, unitsOfRarity } from '../game/data/units';
import { UNIT_UNLOCK_WAVE, isUnlocked } from '../game/data/unlocks';
import { RARITY_COLOR, RARITY_LABEL } from '../game/config';
import type { Rarity } from '../game/types';
import { UnitIcon } from './UnitIcon';
import { Icon } from './Icon';
import { RECIPES, recipeResultName } from '../game/data/recipes';
import { DECK_BIAS } from '../game/data/deck';

interface Props {
  deck: string[];
  bestWave: number;
  onChange: (deck: string[]) => void;
  onClose: () => void;
}

// 발주 화면.
//
// 이건 '덱'이 아니다. 넣은 유닛만 나오게 가두면 판 안의 다양성이 13.8종 → 8.2종으로
// 떨어져 랜덤 디펜스의 재미가 죽는다(실측). 그래서 넣은 것이 '더 자주' 올 뿐이고,
// 안 넣은 것도 온다.
//
// 그럼 왜 하느냐 — 조합 레시피를 노리기 위해서다. 발주 없이는 레시피 4개 중 3개가
// 완성률 0~3% 로 사실상 불가능하고, 재료를 발주에 넣으면 45~83% 가 된다.
// 그래서 이 화면은 "무엇을 노릴 수 있는지"를 같이 보여준다.
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
          <div className="deck-title">오늘 발주</div>
          <div className="deck-sub">
            넣은 물건이 <b>{Math.round(DECK_BIAS * 100)}%</b> 확률로 먼저 옵니다. 안 넣은 것도 옵니다 — 노리는 조합의 재료를 넣으세요.
          </div>
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

      <section className="deck-plan">
        <div className="deck-plan-head">이 발주로 노릴 수 있는 조합</div>
        {RECIPES.map((r) => {
          const have = r.materials.filter((m) => deck.includes(m.defId)).length;
          const ready = have === r.materials.length;
          return (
            <div className={`deck-plan-row ${ready ? 'on' : ''}`} key={r.id}>
              <UnitIcon defId={r.result} size={26} dim={!ready} />
              <span className="deck-plan-name">{recipeResultName(r)}</span>
              <span className="deck-plan-hint">{r.hint}</span>
              <span className="deck-plan-count px">
                {have}/{r.materials.length}
              </span>
            </div>
          );
        })}
      </section>

      <div className="deck-note">
        특수 유닛은 발주와 무관합니다. 잠긴 물건은 최고 웨이브가 표시된 숫자에 닿으면 열립니다 (현재 최고 {bestWave || 0}).
      </div>
    </div>
  );
}
