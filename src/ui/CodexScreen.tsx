import { useState } from 'react';
import { UNIT_DEFS } from '../game/data/units';
import { ENEMY_DEFS } from '../game/data/enemies';
import { RARITY_COLOR, RARITY_LABEL } from '../game/config';
import type { SaveData } from '../game/save/storage';
import { UnitIcon } from './UnitIcon';
import { Icon } from './Icon';

// 도감에 손님 특징 한 줄과 관련 사건을 붙여 준다 (데이터가 없는 항목은 표시하지 않는다)
const ENEMY_NOTE: Record<string, { trait: string; event?: string }> = {
  basic: { trait: '평범하게 걸어와서 평범하게 계산한다.' },
  runner: { trait: '막차를 놓친 사람. 방어선을 그냥 지나친다.' },
  cig: { trait: '빠르게 들어와 빠르게 나간다.', event: '담배 입고' },
  drunk: { trait: '술에 취해 이동속도가 불안정하다.', event: '옆 술집이 문을 닫았다' },
  price: { trait: '멈춰 서서 가격을 묻는다. 뒤가 막힌다.' },
  ramen: { trait: '라면 코너에서 머물며 점점 강해진다.' },
  delivery: { trait: '배달 콜이 밀렸다. 빠르다.', event: '배달 폭주' },
  party: { trait: '여럿이 한꺼번에 들어온다.' },
  drunkSquad: { trait: '뭉쳐서 이동한다. 뒤처지면 따라붙는다.', event: '옆 술집이 문을 닫았다' },
  atm: { trait: '멈춰 서서 현금을 뽑는다. 그동안 코인이 줄어든다.' },
  bag: { trait: '처치하면 봉투값을 요구한다.', event: '봉투값 인상' },
  couple: { trait: '둘이 붙어 다니며 주변 손님을 회복시킨다.' },
  karen3am: { trait: '새벽 3시의 그 사람. 빠르고 질기고 아프다.', event: '진상 출현' },
  charger: { trait: '충전기를 찾으며 유닛 하나를 마비시킨다.' },
  parcelGuy: { trait: '택배 박스가 크다. 느리지만 잘 안 죽는다.' },
  toilet: { trait: '급하다. 맞으면 더 빨라진다.' },
  caller: { trait: '사장님을 부른다. 주변 손님이 빨라진다.' },
  ghost: { trait: '깜빡인다. 안 보일 때는 때릴 수 없다.' },
  student: { trait: '야자가 끝났다. 셋에서 다섯이 우르르 온다.' },
  influencer: { trait: '라이브 중. 앞선 손님들에게 보호막을 씌운다.' },
  zombie: { trait: '으어어… 컵라면…', event: '좀비 소문' },
  bikeCourier: { trait: '3분 남았다. 감속도 넉백도 안 통한다.' },
  lunchPiece: { trait: '도시락에서 떨어져 나온 조각.' },
  partyMember: { trait: '단체 손님의 일행.' },
};

export function CodexScreen({ save }: { save: SaveData }) {
  const [tab, setTab] = useState<'unit' | 'enemy'>('unit');
  const [open, setOpen] = useState<string | null>(null);

  const unitFound = UNIT_DEFS.filter((u) => save.unlockedUnits.includes(u.id)).length;
  const enemyFound = ENEMY_DEFS.filter((e) => save.seenEnemies.includes(e.id)).length;

  return (
    <div className="codex">
      <div className="ach-tabs">
        <button className={tab === 'unit' ? 'active' : ''} onClick={() => setTab('unit')}>
          유닛 {unitFound}/{UNIT_DEFS.length}
        </button>
        <button className={tab === 'enemy' ? 'active' : ''} onClick={() => setTab('enemy')}>
          손님 {enemyFound}/{ENEMY_DEFS.length}
        </button>
      </div>

      <div className="bar bar-ach">
        <div className="bar-fill" style={{ width: `${((tab === 'unit' ? unitFound / UNIT_DEFS.length : enemyFound / ENEMY_DEFS.length) * 100).toFixed(0)}%` }} />
      </div>

      {tab === 'unit' && (
        <div className="codex-grid">
          {UNIT_DEFS.map((u) => {
            const known = save.unlockedUnits.includes(u.id);
            const st = save.unitStats[u.id];
            const isOpen = open === u.id;
            return (
              <button
                key={u.id}
                className={`codex-item ${known ? '' : 'locked'} ${isOpen ? 'open' : ''}`}
                onClick={() => known && setOpen(isOpen ? null : u.id)}
              >
                <span className="codex-rarity" style={{ background: known ? RARITY_COLOR[u.rarity] : '#3a2f63' }} />
                <span className="codex-body">
                  <UnitIcon defId={u.id} size={38} dim={!known} />
                  <span className="codex-name">{known ? u.name : '???'}</span>
                  <span className="codex-sub px">{known ? RARITY_LABEL[u.rarity] : '???'}</span>
                  {isOpen && st && (
                    <span className="codex-detail">
                      <span className="codex-desc">{u.desc}</span>
                      <span className="codex-rows">
                        <i>획득 {st.draws}회</i>
                        <i>MVP {st.mvp}회</i>
                        <i>합성 {st.merges}회</i>
                        <i>최고 T{st.maxTier}</i>
                        <i>총 피해 {st.damage.toLocaleString()}</i>
                      </span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'enemy' && (
        <div className="codex-grid">
          {ENEMY_DEFS.map((e) => {
            const known = save.seenEnemies.includes(e.id);
            const st = save.enemyStats[e.id];
            const isOpen = open === e.id;
            const note = ENEMY_NOTE[e.id];
            return (
              <button
                key={e.id}
                className={`codex-item ${known ? '' : 'locked'} ${isOpen ? 'open' : ''}`}
                onClick={() => known && setOpen(isOpen ? null : e.id)}
              >
                <span className="codex-rarity" style={{ background: known ? e.color : '#3a2f63' }} />
                <span className="codex-body">
                  <UnitIcon defId={e.id} size={38} enemy dim={!known} />
                  <span className="codex-name">{known ? e.name : '???'}</span>
                  <span className="codex-sub px">{known ? `W${e.minWave > 900 ? '?' : e.minWave}` : '???'}</span>
                  {isOpen && (
                    <span className="codex-detail">
                      {note && <span className="codex-desc">{note.trait}</span>}
                      {st && (
                        <span className="codex-rows">
                          <i>발견 {st.seen}회</i>
                          <i>처치 {st.kills}명</i>
                          {st.reached > 0 && <i className="bad">통과 {st.reached}회</i>}
                          {st.damage > 0 && <i className="bad">받은 피해 {st.damage}</i>}
                          {st.bestKillsInRun > 0 && <i>한 판 최다 {st.bestKillsInRun}</i>}
                        </span>
                      )}
                      {note?.event && <span className="codex-event">관련 사건 「{note.event}」</span>}
                      {e.lines[0] && <span className="codex-quote">"{e.lines[0]}"</span>}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="shop-note">
        <Icon name="bulb" size={13} strokeWidth={2.2} /> 카드를 누르면 기록이 펼쳐집니다.
      </div>
    </div>
  );
}
