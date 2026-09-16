import { useState } from 'react';
import type { DailyRecord, SaveData } from '../game/save/storage';
import type { DailySet } from '../game/daily';
import { META_UPGRADES } from '../game/save/meta';
import { ACHIEVEMENTS } from '../game/data/achievements';
import { formatTime } from '../game/config';
import { TIPS } from '../game/data/dialogue';
import { Icon } from './Icon';
import { AchievementsScreen } from './AchievementsScreen';
import { CodexScreen } from './CodexScreen';
import { HistoryScreen } from './HistoryScreen';
import { RankScreen } from './RankScreen';
import { NicknameField } from './NicknameField';
import type { MetaUpgradeId } from '../game/types';

interface Props {
  save: SaveData;
  daily: DailySet;
  todayRecord: DailyRecord | null;
  onStart: (daily: boolean) => void;
  onBuy: (id: MetaUpgradeId) => void;
  onToggleMute: () => void;
  onSetNickname: (name: string) => void;
  onToggleRankOptIn: () => void;
  onReset: () => void;
}

type Tab = 'main' | 'shop' | 'codex' | 'ach' | 'history' | 'rank';

export function StartScreen({ save, daily, todayRecord, onStart, onBuy, onToggleMute, onSetNickname, onToggleRankOptIn, onReset }: Props) {
  const [tab, setTab] = useState<Tab>('main');
  const tip = TIPS[save.totalPlays % TIPS.length];
  const achCount = save.achievements.length;

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
            {/* 이름을 아직 안 정했으면 먼저 받는다. 기록이 '익명 알바'로 올라가 버리면 되돌리기 번거롭다. */}
            {save.rankOptIn && !save.nickname && (
              <div className="nick-card">
                <NicknameField value="" onSave={onSetNickname} label="랭킹에 올릴 이름" cta="저장" />
                <div className="nick-hint">판이 끝나면 이 이름으로 랭킹에 올라갑니다. 나중에 바꿔도 됩니다.</div>
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
            <div className="shop-note">야간 수당은 한 판이 끝날 때 획득 코인의 10% + 웨이브·처치 보너스로 지급됩니다. 오늘의 미션을 깨면 추가로 받습니다.</div>
          </div>
        )}

        {tab === 'codex' && <CodexScreen save={save} />}
        {tab === 'ach' && <AchievementsScreen save={save} />}
        {tab === 'history' && <HistoryScreen save={save} />}
        {tab === 'rank' && <RankScreen save={save} onSetNickname={onSetNickname} onToggleOptIn={onToggleRankOptIn} />}

        <nav className="tabs">
          <button className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')} aria-label="시작">
            시작
          </button>
          <button className={tab === 'shop' ? 'active' : ''} onClick={() => setTab('shop')} aria-label="강화 상점">
            강화
          </button>
          <button className={tab === 'codex' ? 'active' : ''} onClick={() => setTab('codex')} aria-label="도감">
            도감
          </button>
          <button className={tab === 'ach' ? 'active' : ''} onClick={() => setTab('ach')} aria-label="업적">
            <Icon name="trophy" size={14} strokeWidth={2.4} />
            <span className="px">
              {achCount}/{ACHIEVEMENTS.length}
            </span>
          </button>
          <button className={tab === 'rank' ? 'active' : ''} onClick={() => setTab('rank')} aria-label="랭킹">
            랭킹
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')} aria-label="근무 기록">
            <Icon name="chart" size={15} strokeWidth={2.4} />
          </button>
          <button onClick={onToggleMute} aria-label={save.muted ? '소리 켜기' : '소리 끄기'} aria-pressed={save.muted}>
            <Icon name={save.muted ? 'mute' : 'sound'} size={16} strokeWidth={2.2} />
          </button>
        </nav>
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
  );
}
