import type { GameAction, UISnapshot } from '../game/types';
import { UNIT_BY_ID } from '../game/data/units';
import { RARITY_COLOR, RARITY_LABEL, tierDmgMult } from '../game/config';
import { UnitIcon } from './UnitIcon';

interface Props {
  snap: UISnapshot;
  act: (a: GameAction) => void;
  muted: boolean;
  onToggleMute: () => void;
  autoMerge: boolean;
  onToggleAutoMerge: () => void;
}

export function BottomPanel({ snap, act, muted, onToggleMute, autoMerge, onToggleAutoMerge }: Props) {
  const mergeables = snap.groups.filter((g) => g.mergeable);
  const sel = snap.selected ? UNIT_BY_ID[snap.selected.defId] : null;
  const odds = snap.rarityOdds;
  return (
    <section className="panel">
      <div className="panel-top">
        <button
          className={`draw-btn ${snap.canDraw ? '' : 'disabled'} ${snap.freeDraws > 0 ? 'free' : ''}`}
          onClick={() => act({ type: 'DRAW' })}
          disabled={snap.phase !== 'playing'}
        >
          <span className="draw-title">🎁 유닛 뽑기</span>
          <span className="draw-cost">{snap.freeDraws > 0 ? `무료 ×${snap.freeDraws}` : `${snap.drawCost}원`}</span>
          <span className="draw-slots">
            빈 칸 {snap.emptySlots}/{snap.totalSlots}
          </span>
        </button>
        <div className="controls">
          <button className="ctrl" onClick={() => act({ type: 'TOGGLE_PAUSE' })} aria-label={snap.paused ? '계속하기' : '일시정지'}>
            {snap.paused ? '▶' : '⏸'}
          </button>
          <button className={`ctrl ${snap.speed === 2 ? 'active' : ''}`} onClick={() => act({ type: 'SET_SPEED', speed: snap.speed === 1 ? 2 : 1 })} aria-label="2배속" aria-pressed={snap.speed === 2}>
            ×{snap.speed}
          </button>
          <button className="ctrl" onClick={onToggleMute} aria-label={muted ? '소리 켜기' : '소리 끄기'} aria-pressed={muted}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>
      <div className="odds">
        <span style={{ color: RARITY_COLOR.common }}>일반 {Math.round(odds.common * 100)}%</span>
        <span style={{ color: RARITY_COLOR.rare }}>희귀 {Math.round(odds.rare * 100)}%</span>
        <span style={{ color: RARITY_COLOR.epic }}>에픽 {(odds.epic * 100).toFixed(1)}%</span>
        <span style={{ color: RARITY_COLOR.legendary }}>전설 {(odds.legendary * 100).toFixed(1)}%</span>
      </div>
      <div className="quick-row">
        <button className={`quick-btn ${autoMerge ? 'active' : ''}`} onClick={onToggleAutoMerge} aria-pressed={autoMerge}>
          {autoMerge ? '✨ 자동 합성 ON' : '자동 합성 OFF'}
        </button>
        <button className={`quick-btn ${snap.junkCount > 0 ? '' : 'disabled'}`} disabled={snap.junkCount === 0} onClick={() => act({ type: 'SELL_JUNK' })} title="짝이 없는 ★1 일반 유닛을 전부 판매">
          🧹 정리 {snap.junkCount > 0 ? `${snap.junkCount}개 +${snap.junkValue}원` : ''}
        </button>
      </div>

      {mergeables.length > 0 && (
        <div className="merge-row">
          {mergeables.map((g) => {
            const def = UNIT_BY_ID[g.defId];
            return (
              <button key={`${g.defId}-${g.tier}`} className="merge-btn" style={{ borderColor: RARITY_COLOR[def.rarity] }} onClick={() => act({ type: 'MERGE', defId: g.defId, tier: g.tier })}>
                <UnitIcon defId={g.defId} size={30} />
                <span className="merge-label">
                  {def.name} {'★'.repeat(g.tier)} ×{g.count}
                </span>
                <span className="merge-arrow">→ 합성!</span>
              </button>
            );
          })}
        </div>
      )}

      {sel && snap.selected ? (
        <div className="selected-card" style={{ borderColor: RARITY_COLOR[sel.rarity] }}>
          <UnitIcon defId={sel.id} size={44} />
          <div className="selected-info">
            <div className="selected-name">
              <span style={{ color: RARITY_COLOR[sel.rarity] }}>[{RARITY_LABEL[sel.rarity]}]</span> {sel.name} {'★'.repeat(snap.selected.tier)}
            </div>
            <div className="selected-desc">{sel.desc}</div>
            <div className="selected-stats">
              {sel.dmg > 0 && <span>피해 {Math.round(sel.dmg * tierDmgMult(snap.selected.tier))}</span>}
              {sel.interval > 0 && <span>간격 {sel.interval.toFixed(1)}s</span>}
              {sel.skill && <span>스킬: {sel.skill.name}</span>}
              <span>처치 {snap.selected.kills}</span>
              <span>누적 피해 {snap.selected.damage.toLocaleString()}</span>
            </div>
            <div className="selected-hint">빈 칸을 탭하면 이동 · 다른 유닛을 탭하면 교환</div>
          </div>
          <div className="selected-actions">
            <button className="sell-btn" onClick={() => act({ type: 'SELL', unitId: snap.selected!.unitId })}>
              판매 +{snap.selected.sellPrice}원
            </button>
            <button className="ctrl small" onClick={() => act({ type: 'SELECT', unitId: null })}>
              닫기
            </button>
          </div>
        </div>
      ) : (
        <div className="inventory">
          {snap.groups.length === 0 && <div className="inventory-empty">유닛을 뽑아서 편의점을 지키세요. 같은 유닛 3개 = 합성!</div>}
          {snap.groups.map((g) => {
            const def = UNIT_BY_ID[g.defId];
            return (
              <button key={`${g.defId}-${g.tier}`} className={`inv-chip ${g.mergeable ? 'mergeable' : ''}`} style={{ borderColor: RARITY_COLOR[def.rarity] }} onClick={() => act({ type: 'SELECT', unitId: g.unitIds[0] })} title={def.desc}>
                <UnitIcon defId={g.defId} size={28} />
                <span className="inv-name">{def.name}</span>
                <span className="inv-tier">{'★'.repeat(g.tier)}</span>
                <span className="inv-count">×{g.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
