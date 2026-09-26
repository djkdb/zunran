import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameAction, UISnapshot } from '../game/types';
import { UNIT_BY_ID } from '../game/data/units';
import { recipeStatus, recipeResultName } from '../game/data/recipes';
import { nextMove } from '../game/data/nextMove';
import { RARITY_COLOR, RARITY_LABEL, ROLE_LABEL, tierDmgMult, mergeCost } from '../game/config';
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
  const next = nextMove(snap);
  return (
    <section className="panel" ref={panelRef}>
      <div className="panel-top">
        <button
          className={`draw-btn ${snap.canDraw ? '' : 'disabled'} ${free ? 'free' : ''} ${shake ? 'denied' : ''}`}
          onClick={() => act({ type: 'DRAW' })}
          disabled={snap.phase !== 'playing'}
        >
          <Icon name="draw" size={26} strokeWidth={2.2} />
          {/* 못 누를 때는 돈이 얼마나 모였는지 버튼이 직접 차오른다 */}
          {next?.progress != null && <span className="draw-fill" style={{ width: `${Math.round(next.progress * 100)}%` }} />}
          <span className="draw-body">
            <span className="draw-title">유닛 뽑기</span>
            {/* 눌러도 아무 일이 없으면 사람은 계속 누른다. 베타에서 누른 것의
                47% 가 그런 탭이었다. 그 자리에서 할 수 있는 다른 수를 말해준다. */}
            <span className={`draw-slots ${next ? (next.blocked ? 'full' : 'short') : ''}`}>
              {next ? next.text : `SLOT ${snap.emptySlots}/${snap.totalSlots} FREE`}
            </span>
          </span>
          <span className="draw-cost">{free ? `무료 ×${snap.freeDraws}` : snap.drawCost}</span>
        </button>
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

      {/* 합성은 이 게임의 핵심이고 베타 10명 중 9명이 썼다(「한 개만 더」는 10명 전원).
          그런데 인스타 인앱 브라우저(360×600)에서는 조작 패널이 204px 뿐이라
          MERGE 버튼이 화면 밖으로 밀려 있었다 — 뽑기 버튼은 「그동안 합성하세요」라고
          하는데 정작 그 버튼이 안 보이는 상태였다. 자주 쓰는 것을 엄지 밑에 둔다.
          (합성 줄이 생기면 아래가 밀린다. 그 대신 핵심 수단이 늘 보인다.) */}
      {/* 고티어 통합 합성: 3티어부터는 종류가 달라도 합친다.
          같은 유닛만 고집하면 사다리가 3티어에서 끊긴다 (4티어 하나에 같은 유닛 12개). */}
      {snap.tierMerge && (
        <div className="merge-row">
          <button className="merge-btn tier-merge" onClick={() => act({ type: 'MERGE_TIER', tier: snap.tierMerge!.tier })}>
            <span className="tier-merge-badge px">★{snap.tierMerge.tier}</span>
            <span className="merge-label">
              <span>같은 티어 {snap.tierMerge.count}개</span>
              <span className="tier-merge-hint">종류가 달라도 합쳐집니다</span>
            </span>
            <span className="merge-arrow">
              ★{snap.tierMerge.tier + 1}
              <Icon name="merge" size={14} strokeWidth={2.4} />
            </span>
          </button>
        </div>
      )}

      {/* 「한 개만 더」 — 합성까지 하나 남았을 때만 뜬다.
          칸이 꽉 차면 뽑기도 발주도 막히는데, 이건 사자마자 합쳐져서 칸이 하나 빈다.
          쌓이기만 하던 코인의 출구이자, 운이 나쁜 판을 돈으로 되돌리는 수단이다. */}
      {snap.mergeBuy.length > 0 && (
        <div className="merge-row">
          {snap.mergeBuy.map((o) => {
            const def = UNIT_BY_ID[o.defId];
            const ok = snap.coins >= o.cost && snap.phase === 'playing';
            return (
              <button
                key={`buy-${o.defId}`}
                className={`merge-btn buy-one ${ok ? '' : 'disabled'}`}
                disabled={snap.phase !== 'playing'}
                onClick={() => act({ type: 'MERGE_BUY', defId: o.defId })}
              >
                <UnitIcon defId={o.defId} size={30} />
                <span className="merge-label">
                  <span>{def.name} 한 개만 더</span>
                  <span className="buy-one-hint">사면 바로 합성 · 칸이 하나 빈다</span>
                </span>
                <span className="buy-one-cost px">
                  {ok ? o.cost : `−${o.cost - snap.coins}`}
                </span>
              </button>
            );
          })}
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
                {snap.selected.groupCount >= 2 && (
                  <span className="selected-group">
                    같은 유닛 {snap.selected.groupCount}개 (합성{' '}
                    {mergeCost(snap.selected.tier) - snap.selected.groupCount > 0
                      ? `${mergeCost(snap.selected.tier) - snap.selected.groupCount}개 남음`
                      : '가능'}
                    )
                  </span>
                )}
              </div>
              {/* 옆자리 시너지 — 지금 붙어서 얻고 있는 것, 그리고 못 얻고 있는 것.
                  둘은 같은 칸을 놓고 다투므로 어느 쪽을 택할지가 매번 결정이 된다. */}
              <div className="selected-adj">
                {snap.selected.adjSameRole > 0 && (
                  <span className="adj-on">옆 같은 계열 {snap.selected.adjSameRole} · 공격력 +{snap.selected.adjSameRole * 12}%</span>
                )}
                {snap.selected.adjNearSupport && <span className="adj-on mint">옆에 지원 · 공격속도 +14%</span>}
                {snap.selected.adjSameRole === 0 && !snap.selected.adjNearSupport && (
                  <span className="adj-off">옆자리 보너스 없음 · 같은 계열이나 지원 유닛 옆에 붙여보세요</span>
                )}
              </div>
              {snap.wave <= 6 && <div className="selected-hint">끌어서 옮기거나, 빈 칸을 탭해 배치하세요</div>}
            </div>
          </div>
          <div className="selected-actions">
            {/* 잠금 — 정리와 자동 판매가 이 유닛을 건드리지 않는다.
                판당 정리가 15회까지 나와서 아끼는 유닛이 쓸려 나가는 일이 생겼다. */}
            <button
              className={`pin-btn ${snap.selected.pinned ? 'on' : ''}`}
              onClick={() => act({ type: 'TOGGLE_PIN', unitId: snap.selected!.unitId })}
              aria-pressed={snap.selected.pinned}
            >
              <Icon name={snap.selected.pinned ? 'lock' : 'unlock'} size={14} strokeWidth={2.4} />
              {snap.selected.pinned ? '잠김' : '잠금'}
            </button>
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

      {snap.junkCount > 0 && snap.emptySlots === 0 && (
        <button
          className="clean-btn urgent"
          onClick={() => act({ type: 'SELL_JUNK' })}
          title="짝이 없는 1티어 유닛(일반·희귀)을 전부 판매"
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

      {/* 확률·본사 발주는 '지금 누를 것'이 아니라 참고와 고급 수단이다.
          인스타 인앱 브라우저(360×600)에서 조작 패널이 204px 밖에 안 되는데
          이 둘이 위를 차지해서 정작 MERGE 버튼이 화면 밖으로 밀렸다.
          베타 10명에서 합성은 9명이 썼고 발주는 3명(쓰도록 지정한 사람)뿐이다.
          자주 쓰는 것을 엄지 밑에 두고, 참고는 아래로 내린다. */}
      <div className="odds" aria-label="뽑기 확률">
        <span className="odds-n">N {Math.round(odds.common * 100)}</span>
        <span className="odds-r">R {Math.round(odds.rare * 100)}</span>
        <span className="odds-e">E {(odds.epic * 100).toFixed(1)}</span>
        <span className="odds-l">L {(odds.legendary * 100).toFixed(1)}</span>
        {/* 보이지 않으면 마법이다. 왜 같은 계열이 계속 들어오는지 여기서 읽힌다. */}
        {snap.focus.role && snap.focus.weight > 1 && (
          <span className="odds-focus" title="보드가 한 계열로 모이면 그 계열이 더 자주 들어옵니다">
            전문점 · {ROLE_LABEL[snap.focus.role]} ×{snap.focus.weight.toFixed(1)}
          </span>
        )}
      </div>

      {/* 본사 발주: 등급을 지정해서 산다. 운이 나쁜 판을 돈으로 되돌리는 유일한 수단이다. */}
      <div className="order-row" aria-label="본사 발주">
        <span className="order-label">본사 발주</span>
        {(['rare', 'epic', 'legendary'] as const).map((r) => {
          const cost = snap.orderCost[r];
          const short = cost - snap.coins;
          const ok = snap.phase === 'playing' && snap.emptySlots > 0 && snap.coins >= cost;
          return (
            <button
              key={r}
              className={`order-btn ${r} ${ok ? '' : 'disabled'}`}
              disabled={snap.phase !== 'playing'}
              onClick={() => act({ type: 'ORDER', rarity: r })}
              title={`${RARITY_LABEL[r]} 확정 · ${cost}원`}
            >
              {/* 모으는 중이라는 걸 보여준다. 얼마 남았는지 모르면 아무도 참지 않는다.
                  직접 한 판 해 보니 발주를 한 번도 누르지 않고 끝났다. */}
              <span className="order-fill" style={{ width: `${Math.min(100, (snap.coins / Math.max(1, cost)) * 100)}%` }} />
              <span className="order-rank">{RARITY_LABEL[r]}</span>
              <span className="order-cost">
                {ok ? (cost >= 10000 ? `${Math.round(cost / 1000)}k` : cost) : `−${short >= 10000 ? `${Math.round(short / 1000)}k` : short}`}
              </span>
            </button>
          );
        })}
      </div>


      <div className="inventory" ref={invRef}>
        {snap.groups.length === 0 && <div className="inventory-empty">유닛을 뽑아서 편의점을 지키세요. 같은 유닛 3개 = 합성! (2티어부터는 2개)</div>}
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
                    {g.mergeable ? (
                      <span className="inv-merge-hint">MERGE!</span>
                    ) : (
                      <span className="inv-ticks">
                        <TierTicks tier={g.tier} color={RARITY_COLOR[def.rarity]} />
                        {g.pinned && <Icon name="lock" size={10} strokeWidth={2.6} />}
                      </span>
                    )}
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
