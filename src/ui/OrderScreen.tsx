import { PIN_SLOTS, BAN_SLOTS, PIN_TARGET_COPIES, bannableIn, type Order } from '../game/data/deck';
import { UNIT_DEFS, UNIT_BY_ID } from '../game/data/units';
import { UNIT_UNLOCK_WAVE, isUnlocked } from '../game/data/unlocks';
import { RECIPES, recipeResultName } from '../game/data/recipes';
import { RARITY_COLOR, RARITY_LABEL } from '../game/config';
import type { Rarity } from '../game/types';
import { UnitIcon } from './UnitIcon';
import { Icon } from './Icon';

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

interface Props {
  order: Order;
  bestWave: number;
  onChange: (order: Order) => void;
  onClose: () => void;
}

// 「오늘 발주」 — 지명 2종 + 제외 2종. 나머지 전부는 그대로 랜덤이다.
// 뽑기 풀을 좁히지 않는 이유는 data/deck.ts 주석 참고.
export function OrderScreen({ order, bestWave, onChange, onClose }: Props) {
  const cycle = (id: string) => {
    const pinned = order.pins.includes(id);
    const banned = order.bans.includes(id);
    // 한 번 누르면 지명 → 다시 누르면 제외 → 다시 누르면 해제
    if (pinned) {
      const rarity = UNIT_BY_ID[id].rarity;
      const canBan = bannableIn(rarity, [...order.bans, id]);
      onChange({
        pins: order.pins.filter((x) => x !== id),
        bans: canBan ? [...order.bans, id].slice(-BAN_SLOTS) : order.bans,
      });
      return;
    }
    if (banned) {
      onChange({ ...order, bans: order.bans.filter((x) => x !== id) });
      return;
    }
    onChange({ pins: [...order.pins, id].slice(-PIN_SLOTS), bans: order.bans.filter((x) => x !== id) });
  };

  return (
    <div className="deck">
      <div className="deck-head">
        <div>
          <div className="deck-title">오늘 발주</div>
          <div className="deck-sub">
            <b>지명</b>한 물건은 초반에 <b>{PIN_TARGET_COPIES}장</b>까지 먼저 옵니다 — 합성해서 조합 재료로 쓸 만큼.
            <b className="ban">제외</b>한 물건은 오늘 안 옵니다. 나머지는 전부 그대로 랜덤입니다.
          </div>
        </div>
        <button className="deck-close" onClick={onClose} aria-label="닫기">
          <Icon name="check" size={18} strokeWidth={2.6} />
          완료
        </button>
      </div>

      <div className="order-summary">
        <span className="order-tag pin">
          지명 {order.pins.length}/{PIN_SLOTS}
        </span>
        <span className="order-names">{order.pins.map((id) => UNIT_BY_ID[id]?.name).join(' · ') || '없음'}</span>
        <span className="order-tag ban">
          제외 {order.bans.length}/{BAN_SLOTS}
        </span>
        <span className="order-names">{order.bans.map((id) => UNIT_BY_ID[id]?.name).join(' · ') || '없음'}</span>
      </div>

      {RARITIES.map((rarity) => {
        const pool = UNIT_DEFS.filter((u) => u.rarity === rarity && !u.mergeOnly);
        if (pool.length === 0) return null;
        return (
          <section className="deck-group" key={rarity}>
            <div className="deck-group-head">
              <span className="deck-rarity" style={{ color: RARITY_COLOR[rarity] }}>
                {RARITY_LABEL[rarity]}
              </span>
            </div>
            <div className="deck-pool">
              {pool.map((u) => {
                const locked = !isUnlocked(u.id, bestWave);
                const pinned = order.pins.includes(u.id);
                const banned = order.bans.includes(u.id);
                return (
                  <button
                    key={u.id}
                    className={`deck-card ${pinned ? 'pinned' : ''} ${banned ? 'banned' : ''} ${locked ? 'locked' : ''}`}
                    disabled={locked}
                    onClick={() => cycle(u.id)}
                  >
                    <UnitIcon defId={u.id} size={38} dim={locked || banned} />
                    <span className="deck-name">{locked ? '???' : u.name}</span>
                    {locked ? (
                      <span className="deck-lock px">W{UNIT_UNLOCK_WAVE[u.id]}</span>
                    ) : (
                      <span className="deck-role">{pinned ? `지명 — 초반에 ${PIN_TARGET_COPIES}장까지 온다` : banned ? '제외 — 오늘 안 온다' : u.desc}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="deck-plan">
        <div className="deck-plan-head">지명으로 노릴 수 있는 조합</div>
        {RECIPES.map((r) => {
          const have = r.materials.filter((m) => order.pins.includes(m.defId)).length;
          return (
            <div className={`deck-plan-row ${have > 0 ? 'on' : ''}`} key={r.id}>
              <UnitIcon defId={r.result} size={26} dim={have === 0} />
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
        카드를 누르면 <b>지명 → 제외 → 해제</b> 순서로 바뀝니다. 발주는 비워둬도 됩니다 — 그러면 완전히 랜덤한 밤이 됩니다.
      </div>
    </div>
  );
}
