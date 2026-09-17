import { useState } from 'react';
import type { DailyRecord, SaveData } from '../game/save/storage';
import type { DailySet } from '../game/daily';
import { META_UPGRADES } from '../game/save/meta';
import { ACHIEVEMENTS, totalAchievementReward } from '../game/data/achievements';
import { TIPS } from '../game/data/dialogue';
import { Icon, type IconName } from './Icon';
import { AchievementsScreen } from './AchievementsScreen';
import { CodexScreen } from './CodexScreen';
import { HistoryScreen } from './HistoryScreen';
import { RankScreen } from './RankScreen';
import { NicknameField } from './NicknameField';
import { OrderScreen } from './OrderScreen';
import { PIN_SLOTS, type Order } from '../game/data/deck';
import { UnitIcon } from './UnitIcon';
import { nextUnlock } from '../game/data/unlocks';
import type { MetaUpgradeId } from '../game/types';

interface Props {
  save: SaveData;
  daily: DailySet;
  todayRecord: DailyRecord | null;
  onStart: (daily: boolean) => void;
  onBuy: (id: MetaUpgradeId) => void;
  onToggleMute: () => void;
  onToggleHaptics: () => void;
  onSetNickname: (name: string) => void;
  onToggleRankOptIn: () => void;
  order: Order;
  onSetOrder: (order: Order) => void;
  onReplayIntro: () => void;
  onReset: () => void;
}

type Tab = 'main' | 'shop' | 'rank' | 'codex' | 'ach' | 'history';

// 처음 하는 사람도 뭐가 있는지 보이도록 전부 라벨을 단다. 순서 = 중요도.
const TABS: { id: Tab; label: string; aria: string; icon: IconName }[] = [
  { id: 'main', label: '시작', aria: '시작', icon: 'store' },
  { id: 'shop', label: '강화', aria: '강화 상점', icon: 'cash' },
  { id: 'rank', label: '랭킹', aria: '랭킹', icon: 'chart' },
  { id: 'codex', label: '도감', aria: '도감', icon: 'book' },
  { id: 'ach', label: '업적', aria: '업적', icon: 'trophy' },
  { id: 'history', label: '기록', aria: '근무 기록', icon: 'clock' },
];

export function StartScreen({ save, daily, todayRecord, onStart, onBuy, onToggleMute,
  onToggleHaptics, onSetNickname, onToggleRankOptIn, order, onSetOrder, onReplayIntro, onReset }: Props) {
  const [tab, setTab] = useState<Tab>('main');
  const [deckOpen, setDeckOpen] = useState(false);
  const upcoming = nextUnlock(save.bestWave);
  const tip = TIPS[save.totalPlays % TIPS.length];
  const achCount = save.achievements.length;
  // 살 수 있는 업그레이드가 있으면 강화 탭에 점을 찍는다 (있는지도 모르고 지나치지 않게)
  const canAfford = META_UPGRADES.some((u) => {
    const lvl = save.metaLevels[u.id];
    return lvl < u.maxLevel && save.metaPoints >= u.cost(lvl);
  });

  if (deckOpen) {
    return (
      <div className="start">
        <div className="start-inner">
          <OrderScreen order={order} bestWave={save.bestWave} onChange={onSetOrder} onClose={() => setDeckOpen(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="start">
      <div className="start-inner">
        <div className="title-block">
          <button className="title-mute" onClick={onToggleMute} aria-label={save.muted ? '소리 켜기' : '소리 끄기'} aria-pressed={save.muted}>
            <Icon name={save.muted ? 'mute' : 'sound'} size={16} strokeWidth={2.2} />
          </button>
          {/* 진동은 소리와 별개다 — 소리를 끄고 하는 사람이 대부분이라 손의 피드백이 남아야 한다 */}
          <button
            className={`title-mute title-haptics ${save.haptics ? '' : 'off'}`}
            onClick={onToggleHaptics}
            aria-label={save.haptics ? '진동 끄기' : '진동 켜기'}
            aria-pressed={save.haptics}
          >
            <Icon name="gem" size={16} strokeWidth={2.2} />
          </button>
          <span className="title-sign">24H</span>
          <h1 className="title">편의점 야간근무</h1>
          <p className="subtitle">새벽 3시, 혼자 남았다.</p>
        </div>

        <div className="start-content">
        {tab === 'main' && (
          <>
            {/* 이름을 아직 안 정했으면 먼저 받는다. 기록이 '익명 알바'로 올라가 버리면 되돌리기 번거롭다. */}
            {save.rankOptIn && !save.nickname && save.introSeen && (
              <div className="nick-card">
                <NicknameField value="" onSave={onSetNickname} label="랭킹에 올릴 이름" cta="저장" />
                <div className="nick-hint">판이 끝나면 이 이름으로 랭킹에 올라갑니다. 나중에 바꿔도 됩니다.</div>
              </div>
            )}

            <button className="deck-bar" onClick={() => setDeckOpen(true)}>
              <span className="deck-bar-label">
                오늘 발주
                <span className="px">
                  지명 {order.pins.length}/{PIN_SLOTS}
                </span>
              </span>
              <span className="deck-bar-units">
                {order.pins.map((id) => (
                  <UnitIcon key={id} defId={id} size={26} />
                ))}
                {order.bans.map((id) => (
                  <span className="deck-bar-ban" key={id}>
                    <UnitIcon defId={id} size={26} dim />
                  </span>
                ))}
                {order.pins.length === 0 && order.bans.length === 0 && <span className="deck-bar-empty">비워두면 완전 랜덤</span>}
              </span>
              <span className="deck-bar-edit">바꾸기</span>
            </button>
            {upcoming && (
              <div className="unlock-hint">
                <Icon name="gem" size={13} strokeWidth={2.4} />
                웨이브 <b>{upcoming.wave}</b> 도달 시 <b>{upcoming.name}</b> 해금
              </div>
            )}

            <button className="start-btn" onClick={() => onStart(false)}>
              <Icon name="store" size={26} strokeWidth={2.2} />
              야간 근무 시작
            </button>

            {/* ZUNRAN DAILY — 오늘의 규칙 + 오늘의 미션 */}
            <div className="daily-card">
              <div className="daily-head">
                <span className="daily-tag px">ZUNRAN DAILY</span>
                <span className="daily-date px">{daily.date}</span>
              </div>
              <div className="daily-name">{daily.challenge.name}</div>
              <ul className="daily-rules">
                {daily.challenge.desc.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <div className="daily-mission">
                <span className="daily-mission-label px">TODAY'S MISSION</span>
                <div className="daily-goal">{daily.mission.goal}</div>
                {daily.mission.extra && <div className="daily-extra">추가 조건 · {daily.mission.extra}</div>}
                <div className="daily-reward">
                  <Icon name="cash" size={13} strokeWidth={2.4} />
                  야간 수당 +{daily.mission.reward}
                  {todayRecord?.rewarded && <span className="daily-done">수령 완료</span>}
                </div>
              </div>
              {todayRecord && (
                <div className="daily-record">
                  <span>
                    오늘 최고 <b className="px">W{todayRecord.bestWave}</b>
                  </span>
                  <span>
                    콤보 <b className="px">{todayRecord.bestCombo}</b>
                  </span>
                  <span>
                    처치 <b className="px">{todayRecord.bestKills}</b>
                  </span>
                  <span className={todayRecord.missionCleared ? 'daily-clear' : 'daily-fail'}>
                    {todayRecord.missionCleared ? 'MISSION CLEAR' : `${todayRecord.plays}판 시도`}
                  </span>
                </div>
              )}
              <button className="daily-btn" onClick={() => onStart(true)}>
                <Icon name="trophy" size={18} strokeWidth={2.4} />
                오늘의 규칙으로 시작
              </button>
            </div>

            <div className="records">
              <button onClick={() => setTab('rank')}>
                <span>최고 웨이브</span>
                <b>{save.bestWave || '-'}</b>
              </button>
              <button onClick={() => setTab('ach')}>
                <span>업적</span>
                <b>
                  {achCount}
                  <i>/{ACHIEVEMENTS.length}</i>
                </b>
              </button>
              <button onClick={() => setTab('history')}>
                <span>총 근무</span>
                <b>{save.totalPlays}</b>
              </button>
              <button className={canAfford ? 'hot' : ''} onClick={() => setTab('shop')}>
                <span>야간 수당</span>
                <b>{save.metaPoints}</b>
              </button>
            </div>
            {canAfford && (
              <button className="shop-nudge" onClick={() => setTab('shop')}>
                <Icon name="cash" size={15} strokeWidth={2.4} />
                야간 수당으로 강화를 살 수 있습니다
              </button>
            )}

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
                같은 유닛 3개 = 합성 · 2티어부터는 2개 (결과는 랜덤!)
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
                      <span className="shop-lvl">{Number.isFinite(u.maxLevel) ? `Lv.${lvl}/${u.maxLevel}` : `${lvl}년차`}</span>
                    </div>
                    <div className="shop-desc">{maxed ? u.desc(lvl) : `${u.desc(lvl)} → ${u.desc(lvl + 1)}`}</div>
                    {u.note && <div className="shop-sub">{u.note}</div>}
                  </div>
                  <button className={`shop-buy ${can ? '' : 'disabled'}`} disabled={!can} onClick={() => onBuy(u.id)}>
                    {maxed ? 'MAX' : cost}
                  </button>
                </div>
              );
            })}
            <div className="shop-note">
              야간 수당은 한 판이 끝날 때 웨이브·처치·코인으로 지급됩니다. 오늘의 미션과 <b>업적</b>을 깨면 추가로 받습니다 (업적 전부 달성 시 {totalAchievementReward()}원). <b>연차</b>는 최대 레벨이
              없어서 다 산 뒤에도 계속 올릴 수 있습니다.
            </div>
          </div>
        )}

        {tab === 'codex' && <CodexScreen save={save} />}
        {tab === 'ach' && <AchievementsScreen save={save} />}
        {tab === 'history' && <HistoryScreen save={save} />}
        {tab === 'rank' && <RankScreen save={save} onSetNickname={onSetNickname} onToggleOptIn={onToggleRankOptIn} />}
        </div>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} aria-label={t.aria}>
              <Icon name={t.icon} size={15} strokeWidth={2.3} />
              <span className="tab-label">{t.label}</span>
              {t.id === 'shop' && canAfford && <span className="tab-dot" aria-label="구매 가능" />}
            </button>
          ))}
        </nav>
        <div className="start-links">
          <button className="reset-link" onClick={onReplayIntro}>
            오프닝 다시 보기
          </button>
          <button
            className="reset-link"
            onClick={() => {
              if (confirm('모든 기록과 업적, 업그레이드를 삭제할까요?')) onReset();
            }}
          >
            기록 초기화
          </button>
        </div>
      </div>
    </div>
  );
}
