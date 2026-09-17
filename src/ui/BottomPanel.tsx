import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameAction, UISnapshot } from '../game/types';
import { UNIT_BY_ID } from '../game/data/units';
import { recipeStatus, recipeResultName } from '../game/data/recipes';
import { RARITY_COLOR, RARITY_LABEL, tierDmgMult } from '../game/config';
import { UnitIcon } from './UnitIcon';
import { Icon, TierTicks } from './Icon';

interface Props {
  snap: UISnapshot;
  act: (a: GameAction) => void;
  denied: number;
}

export function BottomPanel({ snap, act, denied }: Props) {
  // 거절된 조작이 생길 때마다 뽑기 버튼을 한 번 흔든다.
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (denied === 0) return;
    setShake(true);
    const t = window.setTimeout(() => setShake(false), 260);
    return () => clearTimeout(t);
  }, [denied]);

  const mergeables = snap.groups.filter((g) => g.mergeable);
  // 조합: 진행도 순으로 정렬된 것 중 위에서 두 개만 보여준다.
  // 0/2 여도 보여줘야 판 시작부터 "이번엔 이걸 노린다"가 생긴다 — 그게 레시피의 존재 이유다.
  // 전부 나열하면 읽히지 않으므로 두 줄로 자른다.
  const allRecipes = recipeStatus(snap.groups);
  const recipes = allRecipes.filter((r) => r.ready).length > 0 ? allRecipes.filter((r) => r.ready) : allRecipes.slice(0, 1);
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
  // 합성 줄이나 선택 카드가 나타나면 그 아래 보유 목록이 통째로 밀려서
  // 방금 누르려던 칩이 손가락 밑에서 사라진다. 목록의 화면상 위치를 고정한다.
  //
  // 단, 맨 위(스크롤 0)를 보고 있을 때는 절대 건드리지 않는다.
  // 뽑기 버튼이 맨 위에 있어서, 뽑을 때마다 선택 카드가 생기며 화면이 내려가면
  // 버튼이 손가락 밑에서 사라져 연속으로 못 뽑는다. 그때의 기준점은 목록이 아니라 위쪽이다.
  const panelRef = useRef<HTMLElement>(null);
  const invRef = useRef<HTMLDivElement>(null);
  const prevInvTop = useRef<number | null>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const inv = invRef.current;
    if (!panel || !inv) return;
    const top = inv.offsetTop;
    if (prevInvTop.current !== null && top !== prevInvTop.current && panel.scrollTop > 0) {
      const max = Math.max(0, panel.scrollHeight - panel.clientHeight);
      panel.scrollTop = Math.min(max, Math.max(0, panel.scrollTop + (top - prevInvTop.current)));
    }
    prevInvTop.current = top;
  });

  const needsConfirm = !!sel && (sel.rarity !== 'common' || (snap.selected?.tier ?? 1) > 1);
  const odds = snap.rarityOdds;
  const free = snap.freeDraws > 0;
  return (
    <section className="panel" ref={panelRef}>
      <div className="panel-top">
        <button
          className={`draw-btn ${snap.canDraw ? '' : 'disabled'} ${free ? 'free' : ''} ${shake ? 'denied' : ''}`}
          onClick={() => act({ type: 'DRAW' })}
          disabled={snap.phase !== 'playing'}
        >
          <Icon name="draw" size={26} strokeWidth={2.2} />
          <span className="draw-body">
            <span className="draw-title">유닛 뽑기</span>
            <span className={`draw-slots ${snap.emptySlots === 0 ? 'full' : ''}`}>
              {snap.emptySlots === 0 ? 'SLOT FULL · 정리하세요' : `SLOT ${snap.emptySlots}/${snap.totalSlots} FREE`}
            </span>
          </span>
          <span className="draw-cost">{free ? `무료 ×${snap.freeDraws}` : snap.drawCost}</span>
        </button>
      </div>

      <div className="odds" aria-label="뽑기 확률">
        <span className="odds-n">N {Math.round(odds.common * 100)}</span>
        <span className="odds-r">R {Math.round(odds.rare * 100)}</span>
        <span className="odds-e">E {(odds.epic * 100).toFixed(1)}</span>
        <span className="odds-l">L {(odds.legendary * 100).toFixed(1)}</span>
      </div>

      {/* 본사 발주: 등급을 지정해서 산다. 운이 나쁜 판을 돈으로 되돌리는 유일한 수단이다. */}
      <div className="order-row" aria-label="본사 발주">
        <span className="order-label">본사 발주</span>
        {(['rare', 'epic', 'legendary'] as const).map((r) => {
          const cost = snap.orderCost[r];
          const ok = snap.phase === 'playing' && snap.emptySlots > 0 && snap.coins >= cost;
          return (
            <button
              key={r}
              className={`order-btn ${r} ${ok ? '' : 'disabled'}`}
              disabled={snap.phase !== 'playing'}
              onClick={() => act({ type: 'ORDER', rarity: r })}
              title={`${RARITY_LABEL[r]} 확정 · ${cost}원`}
            >
              <span className="order-rank">{RARITY_LABEL[r]}</span>
              <span className="order-cost">{cost >= 10000 ? `${Math.round(cost / 1000)}k` : cost}</span>
            </button>
          );
        })}
      </div>

      <div className="skill-row">
        <button
          className={`skill-btn shutter ${snap.skillReady.shutter ? 'ready' : ''}`}
          disabled={!snap.skillReady.shutter || snap.phase !== 'playing'}
          onClick={() => act({ type: 'USE_SKILL', skill: 'shutter' })}
        >
          <span className="skill-cd" style={{ width: `${snap.skillReady.shutter ? 0 : (snap.shutterCd / (45 * snap.perma.skillCdMult)) * 100}%` }} />
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
          <span className="skill-cd" style={{ width: `${snap.skillReady.dump ? 0 : (snap.dumpCd / (70 * snap.perma.skillCdMult)) * 100}%` }} />
          <Icon name="boss" size={18} strokeWidth={2.4} />
          <span className="skill-text">
            <b>폐기 처리</b>
            <i>{snap.skillReady.dump ? 'READY' : `${Math.ceil(snap.dumpCd)} SEC`}</i>
          </span>
        </button>
      </div>

      {snap.junkCount > 0 && snap.emptySlots === 0 && (
        <button
          className="clean-btn urgent"
          onClick={() => act({ type: 'SELL_JUNK' })}
          title="짝이 없는 1티어 일반 유닛을 전부 판매"
        >
          <Icon name="broom" size={16} strokeWidth={2.4} />
          칸이 다 찼어요 · 정리하고 뽑기
          <span className="px">
            {snap.junkCount}개 +{snap.junkValue}
          </span>
        </button>
      )}

      {recipes.length > 0 && (
        <div className="recipe-row">
          {recipes.slice(0, 2).map(({ def, ready, have }) => (
            <button
              key={def.id}
              className={`recipe-btn ${ready ? 'ready' : ''}`}
              disabled={!ready}
              onClick={() => act({ type: 'COMBINE', recipeId: def.id })}
            >
              <UnitIcon defId={def.result} size={30} />
              <span className="recipe-label">
                <span className="recipe-name">{recipeResultName(def)}</span>
                <span className="recipe-hint">{ready ? def.hint : `${def.hint} · 재료 ${have}/${def.materials.length}`}</span>
              </span>
              <span className="recipe-cta px">{ready ? '조합' : `${have}/${def.materials.length}`}</span>
            </button>
          ))}
        </div>
      )}

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
          <div className={`selected-rarity r-${sel.rarity}`} style={{ ['--rc' as string]: RARITY_COLOR[sel.rarity] }} />
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
              {snap.wave <= 6 && <div className="selected-hint">끌어서 옮기거나, 빈 칸을 탭해 배치하세요</div>}
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

      <div className="inventory" ref={invRef}>
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
                <span className={`inv-rarity r-${def.rarity}`} style={{ ['--rc' as string]: RARITY_COLOR[def.rarity] }} />
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
