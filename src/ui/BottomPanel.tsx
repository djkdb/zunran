import { useEffect, useState } from 'react';
import type { GameAction, UISnapshot } from '../game/types';
import { UNIT_BY_ID } from '../game/data/units';
import { RARITY_COLOR, RARITY_LABEL, tierDmgMult } from '../game/config';
import { UnitIcon } from './UnitIcon';
import { Icon, TierTicks } from './Icon';

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
  // 값나가는 유닛은 실수로 팔리지 않게 한 번 더 묻는다
  const [confirmSell, setConfirmSell] = useState<number | null>(null);
  const selectedId = snap.selected?.unitId ?? null;
  useEffect(() => {
    setConfirmSell(null);
  }, [selectedId]);
  useEffect(() => {
    if (confirmSell === null) return;
    const t = window.setTimeout(() => setConfirmSell(null), 2500);
    return () => clearTimeout(t);
  }, [confirmSell]);
  const needsConfirm = !!sel && (sel.rarity !== 'common' || (snap.selected?.tier ?? 1) > 1);
  const odds = snap.rarityOdds;
  const free = snap.freeDraws > 0;
  return (
    <section className="panel">
      <div className="panel-top">
        <button
          className={`draw-btn ${snap.canDraw ? '' : 'disabled'} ${free ? 'free' : ''}`}
          onClick={() => act({ type: 'DRAW' })}
          disabled={snap.phase !== 'playing'}
        >
          <Icon name="draw" size={26} strokeWidth={2.2} />
          <span className="draw-body">
            <span className="draw-title">유닛 뽑기</span>
            <span className="draw-slots">
              SLOT {snap.emptySlots}/{snap.totalSlots} FREE
            </span>
          </span>
          <span className="draw-cost">{free ? `무료 ×${snap.freeDraws}` : snap.drawCost}</span>
        </button>
        <div className="controls">
          <button className="ctrl" onClick={() => act({ type: 'TOGGLE_PAUSE' })} aria-label={snap.paused ? '계속하기' : '일시정지'}>
            <Icon name={snap.paused ? 'play' : 'pause'} size={15} />
          </button>
          <button
            className={`ctrl ${snap.speed === 2 ? 'active' : ''}`}
            onClick={() => act({ type: 'SET_SPEED', speed: snap.speed === 1 ? 2 : 1 })}
            aria-label="2배속"
            aria-pressed={snap.speed === 2}
          >
            ×{snap.speed}
          </button>
          <button className="ctrl" onClick={onToggleMute} aria-label={muted ? '소리 켜기' : '소리 끄기'} aria-pressed={muted}>
            <Icon name={muted ? 'mute' : 'sound'} size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="odds" aria-label="뽑기 확률">
        <span className="odds-n">N {Math.round(odds.common * 100)}</span>
        <span className="odds-r">R {Math.round(odds.rare * 100)}</span>
        <span className="odds-e">E {(odds.epic * 100).toFixed(1)}</span>
        <span className="odds-l">L {(odds.legendary * 100).toFixed(1)}</span>
      </div>

      <div className="skill-row">
        <button
          className={`skill-btn shutter ${snap.skillReady.shutter ? 'ready' : ''}`}
          disabled={!snap.skillReady.shutter || snap.phase !== 'playing'}
          onClick={() => act({ type: 'USE_SKILL', skill: 'shutter' })}
        >
          <span className="skill-cd" style={{ width: `${snap.skillReady.shutter ? 0 : (snap.shutterCd / 45) * 100}%` }} />
          <Icon name="store" size={18} strokeWidth={2.4} />
          <span className="skill-text">
            <b>셔터 내려</b>
            <i>{snap.skillReady.shutter ? 'READY' : `${Math.ceil(snap.shutterCd)} SEC`}</i>
          </span>
        </button>
        <button
          className={`skill-btn dump ${snap.skillReady.dump ? 'ready' : ''}`}
          disabled={!snap.skillReady.dump || snap.phase !== 'playing'}
          onClick={() => act({ type: 'USE_SKILL', skill: 'dump' })}
        >
          <span className="skill-cd" style={{ width: `${snap.skillReady.dump ? 0 : (snap.dumpCd / 70) * 100}%` }} />
          <Icon name="boss" size={18} strokeWidth={2.4} />
          <span className="skill-text">
            <b>폐기 처리</b>
            <i>{snap.skillReady.dump ? 'READY' : `${Math.ceil(snap.dumpCd)} SEC`}</i>
          </span>
        </button>
      </div>

      <div className="quick-row">
        <button className={`quick-btn ${autoMerge ? 'active' : ''}`} onClick={onToggleAutoMerge} aria-pressed={autoMerge}>
          <Icon name="merge" size={17} strokeWidth={2.4} />
          자동 합성 {autoMerge ? 'ON' : 'OFF'}
        </button>
        <button
          className={`quick-btn ${snap.junkCount > 0 ? '' : 'disabled'}`}
          disabled={snap.junkCount === 0}
          onClick={() => act({ type: 'SELL_JUNK' })}
          title="짝이 없는 1티어 일반 유닛을 전부 판매"
        >
          <Icon name="broom" size={17} strokeWidth={2.4} />
          정리 {snap.junkCount > 0 ? `${snap.junkCount}개 +${snap.junkValue}` : ''}
        </button>
      </div>

      {mergeables.length > 0 && (
        <div className="merge-row">
          {mergeables.map((g) => {
            const def = UNIT_BY_ID[g.defId];
            return (
              <button key={`${g.defId}-${g.tier}`} className="merge-btn" onClick={() => act({ type: 'MERGE', defId: g.defId, tier: g.tier })}>
                <UnitIcon defId={g.defId} size={30} />
                <span className="merge-label">
                  <span>
                    {def.name} ×{g.count}
                  </span>
                  <TierTicks tier={g.tier} color="var(--pink)" />
                </span>
                <span className="merge-arrow">
                  MERGE
                  <Icon name="merge" size={14} strokeWidth={2.4} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {sel && snap.selected && (
        <div className="selected-card">
          <div className="selected-rarity" style={{ background: RARITY_COLOR[sel.rarity] }} />
          <div className="selected-main">
            <UnitIcon defId={sel.id} size={36} />
            <div className="selected-info">
              <div className="selected-name">
                <span className="selected-rank" style={{ background: RARITY_COLOR[sel.rarity] }}>
                  {RARITY_LABEL[sel.rarity]}
                </span>
                {sel.name}
                <TierTicks tier={snap.selected.tier} color={RARITY_COLOR[sel.rarity]} />
              </div>
              <div className="selected-desc">{sel.desc}</div>
              <div className="selected-stats">
                {sel.dmg > 0 && <span>피해 {Math.round(sel.dmg * tierDmgMult(snap.selected.tier))}</span>}
                {sel.interval > 0 && <span>간격 {sel.interval.toFixed(1)}s</span>}
                {sel.skill && <span>{sel.skill.name}</span>}
                <span>처치 {snap.selected.kills}</span>
                <span>누적 {snap.selected.damage.toLocaleString()}</span>
              </div>
              <div className="selected-aisle">
                {snap.selected.aisle} 배치 · <b>{snap.selected.aisleBonus}</b>
                {snap.selected.groupCount >= 2 && <span className="selected-group">같은 유닛 {snap.selected.groupCount}개 (합성 {3 - snap.selected.groupCount > 0 ? `${3 - snap.selected.groupCount}개 남음` : '가능'})</span>}
              </div>
              <div className="selected-hint">끌어서 옮기거나, 빈 칸을 탭해 배치하세요</div>
            </div>
          </div>
          <div className="selected-actions">
            <button
              className={`sell-btn ${confirmSell === snap.selected.unitId ? 'confirm' : ''}`}
              onClick={() => {
                const id = snap.selected!.unitId;
                if (needsConfirm && confirmSell !== id) {
                  setConfirmSell(id);
                  return;
                }
                act({ type: 'SELL', unitId: id });
              }}
            >
              {confirmSell === snap.selected.unitId ? '정말 판매?' : `판매 +${snap.selected.sellPrice}`}
            </button>
            <button className="ctrl small" onClick={() => act({ type: 'SELECT', unitId: null })}>
              닫기
            </button>
          </div>
        </div>
      )}

      <div className="inventory">
        {snap.groups.length === 0 && <div className="inventory-empty">유닛을 뽑아서 편의점을 지키세요. 같은 유닛 3개 = 합성!</div>}
        {snap.groups.map((g) => {
            const def = UNIT_BY_ID[g.defId];
            return (
              <button
                key={`${g.defId}-${g.tier}`}
                className={`inv-chip ${g.mergeable ? 'mergeable' : ''}`}
                onClick={() => act({ type: 'SELECT', unitId: g.unitIds[0] })}
                title={def.desc}
              >
                <span className="inv-rarity" style={{ background: RARITY_COLOR[def.rarity] }} />
                <span className="inv-body">
                  <UnitIcon defId={g.defId} size={26} />
                  <span className="inv-text">
                    <span className="inv-name">{def.name}</span>
                    {g.mergeable ? <span className="inv-merge-hint">MERGE!</span> : <TierTicks tier={g.tier} color={RARITY_COLOR[def.rarity]} />}
                  </span>
                  <span className="inv-count">×{g.count}</span>
                </span>
              </button>
            );
          })}
      </div>
    </section>
  );
}
