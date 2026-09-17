import { useState } from 'react';
import type { DailyRecord, SaveData } from '../game/save/storage';
import { STAGES, STAGE_BY_ID, stageUnlocked } from '../game/data/stages';
import { StoreFrontScene } from './StoreFrontScene';
import type { DailySet } from '../game/daily';
import { META_UPGRADES } from '../game/save/meta';
import { ACHIEVEMENTS, totalAchievementReward } from '../game/data/achievements';
import { TIPS } from '../game/data/dialogue';
import { Icon, type IconName } from './Icon';
import { AchievementsScreen } from './AchievementsScreen';
import { CodexScreen } from './CodexScreen';
import { HistoryScreen } from './HistoryScreen';
import { RankScreen } from './RankScreen';
import { OrderScreen } from './OrderScreen';
import { type Order } from '../game/data/deck';
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
  const [dailyOpen, setDailyOpen] = useState(false);
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

  // 아직 못 연 지점 중 가장 가까운 것 (없으면 null)
  const nextBranch = STAGES.find((st) => !stageUnlocked(st, save.bestByStage)) ?? null;

  return (
    <div className="start">
      <div className="start-inner">
        {/* 켜는 순간 보이는 건 상자가 아니라 가게여야 한다 */}
        <div className="hero">
          <StoreFrontScene />
          <div className="hero-toggles">
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
          </div>
          <div className="hero-title">
            <h1 className="title">편의점 야간근무</h1>
            <p className="subtitle">새벽 3시, 혼자 남았다.</p>
          </div>
        </div>

        <div className="start-content">
        {tab === 'main' && (
          <>
            {/* 이름 입력칸은 홈에서 뺐다. 제목 화면에 입력 폼이 있으면 게임이 아니라
                가입 페이지처럼 보인다. 이름은 판이 끝난 뒤(결과 화면)와 랭킹 탭에서 받는다. */}
            {/* 출근 블록: 시작 버튼이 화면의 주인공이고, 준비물은 그 아래 한 줄로 붙는다.
                예전에는 발주·해금·지점·데일리가 모두 같은 크기의 상자라
                무엇을 눌러야 하는지가 안 보였다. */}
            <div className="go-block">
              <button className="start-btn" onClick={() => onStart(false)}>
                <span className="start-btn-main">
                  <Icon name="store" size={26} strokeWidth={2.2} />
                  야간 근무 시작
                </span>
                <span className="start-btn-sub">
                  {STAGE_BY_ID[save.stageId]?.name ?? '국도변 시골점'}
                  {save.bestWave > 0 && <b className="px">최고 W{save.bestWave}</b>}
                </span>
              </button>

              <div className="go-row">
                <button className="go-chip" onClick={() => setDeckOpen(true)}>
                  <span className="go-chip-label">오늘 발주</span>
                  <span className="go-chip-body">
                    {order.pins.length === 0 && order.bans.length === 0 ? (
                      <span className="go-chip-empty">완전 랜덤</span>
                    ) : (
                      <>
                        {order.pins.map((id) => (
                          <UnitIcon key={id} defId={id} size={20} />
                        ))}
                        {order.bans.map((id) => (
                          <span className="deck-bar-ban" key={id}>
                            <UnitIcon defId={id} size={20} dim />
                          </span>
                        ))}
                      </>
                    )}
                  </span>
                </button>

                <button className="go-chip" onClick={() => onStart(false)}>
                  <span className="go-chip-label">지점</span>
                  <span className="go-chip-body">
                    <b>{STAGES.filter((st) => stageUnlocked(st, save.bestByStage)).length}</b>
                    <span className="go-chip-dim">/ {STAGES.length} 열림</span>
                  </span>
                </button>
              </div>

              {(upcoming || nextBranch) && (
                <div className="go-next">
                  {upcoming && (
                    <span>
                      <Icon name="gem" size={11} strokeWidth={2.6} />
                      W{upcoming.wave} · {upcoming.name} 해금
                    </span>
                  )}
                  {nextBranch && (
                    <span>
                      <Icon name="store" size={11} strokeWidth={2.6} />
                      {STAGE_BY_ID[nextBranch.unlockAfter!]?.name} W{nextBranch.unlockWave} · {nextBranch.name} 해금
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ZUNRAN DAILY — 기본은 한 줄로 접는다.
                예전에는 이 카드가 시작 버튼보다 커서 무엇이 주인공인지 알 수 없었다. */}
            <div className={`daily-fold ${dailyOpen ? 'open' : ''}`}>
              <button className="daily-toggle" onClick={() => setDailyOpen((v) => !v)} aria-expanded={dailyOpen}>
                <span className="daily-tag px">ZUNRAN DAILY</span>
                <span className="daily-toggle-name">{daily.challenge.name}</span>
                {todayRecord ? (
                  <span className="daily-toggle-best px">W{todayRecord.bestWave}</span>
                ) : (
                  <span className="daily-toggle-new px">NEW</span>
                )}
                <Icon name={dailyOpen ? 'pause' : 'play'} size={13} strokeWidth={2.4} />
              </button>
              {!dailyOpen && (
                <button className="daily-go" onClick={() => onStart(true)}>
                  <Icon name="trophy" size={13} strokeWidth={2.4} />
                  오늘의 규칙으로 시작
                </button>
              )}

              {dailyOpen && (
                <div className="daily-body">
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
                </div>
              )}

              {dailyOpen && (
                <button className="daily-btn" onClick={() => onStart(true)}>
                  <Icon name="trophy" size={16} strokeWidth={2.4} />
                  오늘의 규칙으로 시작
                </button>
              )}
            </div>

            {/* 기록은 아래 탭으로도 다 들어간다. 여기서 또 큰 버튼 네 개를 쌓으면
                같은 입구가 두 번 나와서 홈이 메뉴판이 된다. 한 줄 띠로만 남긴다. */}
            <div className="rec-strip">
              <button onClick={() => setTab('rank')}>
                최고 <b>{save.bestWave || '-'}</b>
              </button>
              <button onClick={() => setTab('ach')}>
                업적 <b>{achCount}</b>
                <i>/{ACHIEVEMENTS.length}</i>
              </button>
              <button onClick={() => setTab('history')}>
                근무 <b>{save.totalPlays}</b>
              </button>
              <button className={canAfford ? 'hot' : ''} onClick={() => setTab('shop')}>
                {canAfford && <Icon name="cash" size={13} strokeWidth={2.6} />}
                수당 <b>{save.metaPoints}</b>
              </button>
            </div>

            {/* 규칙 설명은 아직 한 판도 안 해 본 사람에게만 보인다.
                계속 남아 있으면 홈이 설명서가 된다. */}
            {save.totalPlays === 0 && (
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
            )}
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
