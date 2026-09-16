import { useState } from 'react';
import type { SaveData } from '../game/save/storage';
import { META_UPGRADES } from '../game/save/meta';
import { UNIT_DEFS } from '../game/data/units';
import { ENEMY_DEFS } from '../game/data/enemies';
import { RARITY_COLOR, RARITY_LABEL, formatTime } from '../game/config';
import { TIPS } from '../game/data/dialogue';
import { UnitIcon } from './UnitIcon';
import { Icon } from './Icon';
import type { MetaUpgradeId } from '../game/types';

interface Props {
  save: SaveData;
  onStart: () => void;
  onBuy: (id: MetaUpgradeId) => void;
  onToggleMute: () => void;
  onReset: () => void;
}

export function StartScreen({ save, onStart, onBuy, onToggleMute, onReset }: Props) {
  const [tab, setTab] = useState<'main' | 'shop' | 'codex'>('main');
  const tip = TIPS[save.totalPlays % TIPS.length];
  return (
    <div className="start">
      <div className="start-inner">
        <div className="title-block">
          <span className="title-sign">24H</span>
          <h1 className="title">편의점 야간근무</h1>
          <p className="subtitle">새벽 3시, 혼자 남았다.</p>
        </div>

        {tab === 'main' && (
          <>
            <button className="start-btn" onClick={onStart}>
              <Icon name="store" size={26} strokeWidth={2.2} />
              야간 근무 시작
            </button>
            <div className="records">
              <div>
                <span>최고 웨이브</span>
                <b>{save.bestWave || '-'}</b>
              </div>
              <div>
                <span>최장 생존</span>
                <b>{save.bestTime ? formatTime(save.bestTime) : '-'}</b>
              </div>
              <div>
                <span>총 근무</span>
                <b>{save.totalPlays}</b>
              </div>
              <div>
                <span>야간 수당</span>
                <b>{save.metaPoints}</b>
              </div>
            </div>
            <div className="howto">
              <div className="howto-row">
                <Icon name="draw" size={20} strokeWidth={2.2} />
                코인으로 랜덤 유닛을 뽑는다
              </div>
              <div className="howto-row">
                <Icon name="store" size={20} strokeWidth={2.2} />
                손님이 계산대에 닿으면 매장 체력이 깎인다
              </div>
              <div className="howto-row">
                <Icon name="merge" size={20} strokeWidth={2.2} />
                같은 유닛 3개 = 합성 (결과는 랜덤!)
              </div>
              <div className="howto-row">
                <Icon name="trophy" size={20} strokeWidth={2.2} />
                3웨이브마다 보상 3장 중 하나를 고른다
              </div>
            </div>
            <div className="tip">
              <Icon name="bulb" size={16} strokeWidth={2.2} />
              {tip}
            </div>
          </>
        )}

        {tab === 'shop' && (
          <div className="shop">
            <div className="shop-points">
              <Icon name="cash" size={20} strokeWidth={2.2} />
              보유 야간 수당 {save.metaPoints}
            </div>
            {META_UPGRADES.map((u) => {
              const lvl = save.metaLevels[u.id];
              const maxed = lvl >= u.maxLevel;
              const cost = u.cost(lvl);
              const can = !maxed && save.metaPoints >= cost;
              return (
                <div key={u.id} className="shop-item">
                  <div className="shop-icon">
                    <Icon name={u.icon} size={22} strokeWidth={2.2} />
                  </div>
                  <div className="shop-info">
                    <div className="shop-name">
                      {u.name}
                      <span className="shop-lvl">
                        Lv.{lvl}/{u.maxLevel}
                      </span>
                    </div>
                    <div className="shop-desc">{maxed ? u.desc(lvl) : `${u.desc(lvl)} → ${u.desc(lvl + 1)}`}</div>
                  </div>
                  <button className={`shop-buy ${can ? '' : 'disabled'}`} disabled={!can} onClick={() => onBuy(u.id)}>
                    {maxed ? 'MAX' : cost}
                  </button>
                </div>
              );
            })}
            <div className="shop-note">야간 수당은 한 판이 끝날 때 획득 코인의 10% + 웨이브·처치 보너스로 지급됩니다.</div>
          </div>
        )}

        {tab === 'codex' && (
          <div className="codex">
            <div className="codex-title">
              유닛 도감 {save.unlockedUnits.length}/{UNIT_DEFS.length}
            </div>
            <div className="codex-grid">
              {UNIT_DEFS.map((u) => {
                const known = save.unlockedUnits.includes(u.id);
                return (
                  <div key={u.id} className={`codex-item ${known ? '' : 'locked'}`} title={known ? u.desc : '???'}>
                    <span className="codex-rarity" style={{ background: known ? RARITY_COLOR[u.rarity] : '#3a2f63' }} />
                    <span className="codex-body">
                      <UnitIcon defId={u.id} size={38} dim={!known} />
                      <span className="codex-name">{known ? u.name : '???'}</span>
                      <span className="codex-name" style={{ color: known ? 'var(--off)' : 'var(--off)', fontSize: 9 }}>
                        {RARITY_LABEL[u.rarity]}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="codex-title">
              손님 도감 {save.seenEnemies.length}/{ENEMY_DEFS.length}
            </div>
            <div className="codex-grid">
              {ENEMY_DEFS.map((e) => {
                const known = save.seenEnemies.includes(e.id);
                return (
                  <div key={e.id} className={`codex-item ${known ? '' : 'locked'}`} title={known ? e.lines[0] : '???'}>
                    <span className="codex-rarity" style={{ background: known ? e.color : '#3a2f63' }} />
                    <span className="codex-body">
                      <UnitIcon defId={e.id} size={38} enemy dim={!known} />
                      <span className="codex-name">{known ? e.name : '???'}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <nav className="tabs">
          <button className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>
            시작
          </button>
          <button className={tab === 'shop' ? 'active' : ''} onClick={() => setTab('shop')}>
            강화
          </button>
          <button className={tab === 'codex' ? 'active' : ''} onClick={() => setTab('codex')}>
            도감
          </button>
          <button onClick={onToggleMute} aria-label={save.muted ? '소리 켜기' : '소리 끄기'} aria-pressed={save.muted}>
            <Icon name={save.muted ? 'mute' : 'sound'} size={18} strokeWidth={2.2} />
          </button>
        </nav>
        <button
          className="reset-link"
          onClick={() => {
            if (confirm('모든 기록과 업그레이드를 삭제할까요?')) onReset();
          }}
        >
          기록 초기화
        </button>
      </div>
    </div>
  );
}
