import { useCallback, useState } from 'react';
import type { Engine } from './game/engine/Engine';
import type { MetaUpgradeId } from './game/types';
import { loadSave, writeSave, resetSave, type DailyRecord, type RunRecord, type SaveData } from './game/save/storage';
import { META_UPGRADES, metaEffects, metaPointsForRun } from './game/save/meta';
import { mergeRunStats, analyzeDefeat, type DefeatAnalysis } from './game/save/stats';
import { evaluateAchievements, achievementReward, ACHIEVEMENT_BY_ID, type AchievementContext } from './game/data/achievements';
import { pickRunTitle } from './game/data/runTitles';
import { getDaily, dateKey } from './game/daily';
import { normalizeOrder } from './game/data/deck';
import { unlockedUnits } from './game/data/unlocks';
import { createRng } from './game/engine/rng';
import { GAMEOVER_QUIPS } from './game/data/dialogue';
import { audio } from './game/audio/sfx';
import { submitScore, renameScore, type SubmitResult } from './game/rank/api';
import { buildPayload, type RunSummary } from './game/rank/payload';
import { StartScreen } from './ui/StartScreen';
import { GameScreen } from './ui/GameScreen';
import { IntroScene } from './ui/IntroScene';
import { GameOverScreen } from './ui/GameOverScreen';

export interface RunResult {
  wave: number;
  time: number;
  kills: number;
  coins: number;
  coinsLeft: number;
  draws: number;
  merges: number;
  bossKills: number;
  mvp: string | null;
  mvpDamage: number;
  mvpTier: number;
  newRecord: boolean;
  metaPoints: number;
  quip: string;
  bestCombo: number;
  rewards: number;
  // ── 확장 ──
  runTitle: string;
  eventIds: string[];
  defeat: DefeatAnalysis;
  unlocked: string[]; // 이번 판에 새로 딴 업적 id
  challengeId: string | null;
  challengeName: string | null;
  missionGoal: string;
  missionExtra: string | null;
  missionCleared: boolean;
  missionReward: number; // 실제로 지급된 값 (이미 오늘 받았으면 0)
  achReward: number; // 이번 판에 새로 딴 업적 보상 합계
}

export function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [screen, setScreen] = useState<'start' | 'intro' | 'game'>('start');
  const [runKey, setRunKey] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  // 랭킹 전송 결과. 서버가 없거나 네트워크가 끊겨도 게임 흐름은 막지 않는다.
  const [rank, setRank] = useState<SubmitResult | null>(null);
  // 이름을 아직 안 정했으면 전송을 보류한다. 아무 이름으로나 올려 두면 되돌리기 번거롭다.
  const [pendingRun, setPendingRun] = useState<RunSummary | null>(null);
  // 오늘의 규칙으로 플레이할지 (시작 화면에서 고른다)
  const [dailyMode, setDailyMode] = useState(false);

  const persist = useCallback((next: SaveData) => {
    setSave(next);
    writeSave(next);
  }, []);

  const beginRun = useCallback((daily: boolean) => {
    setResult(null);
    setRank(null);
    setPendingRun(null);
    setDailyMode(daily);
    setRunKey((k) => k + 1);
    setScreen('game');
  }, []);

  const startGame = useCallback(
    (daily: boolean) => {
      audio.unlock();
      // 첫 판이면 오프닝부터. 여기서 점장 이름(랭킹 표시 이름)도 받는다.
      if (!save.introSeen) {
        setDailyMode(daily);
        setScreen('intro');
        return;
      }
      beginRun(daily);
    },
    [save.introSeen, beginRun],
  );

  // 오프닝이 끝나면(또는 건너뛰면) 본 것으로 기록하고 판을 연다.
  const finishIntro = useCallback(
    (name: string | null) => {
      persist({ ...save, introSeen: true, ...(name ? { nickname: name } : {}) });
      beginRun(dailyMode);
    },
    [save, persist, dailyMode, beginRun],
  );

  const replayIntro = useCallback(() => {
    audio.unlock();
    setScreen('intro');
  }, []);

  const onGameOver = useCallback(
    (engine: Engine) => {
      const s = engine.state;
      const mvp = engine.mvpUnit();
      const mvpId = mvp?.defId ?? null;
      const today = getDaily();
      const at = Date.now();
      const eventCount = (id: string) => s.stats.eventIds.filter((x) => x === id).length;

      // ── 런 제목: 이번 판 기록에서 고른다 (seed 로 재현 가능) ──
      const topEnemy = Object.entries(s.stats.enemySeen).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const titleRng = createRng(s.seed ^ 0x5bf03635);
      const runTitle = pickRunTitle(
        { wave: s.wave, stats: s.stats, mvpName: null, mvpDefId: mvpId, eventCount, topEnemy },
        () => titleRng.next(),
      );

      // ── 오늘의 미션 ──
      const missionCtx = { wave: s.wave, time: s.realTime, stats: s.stats, mvpDefId: mvpId };
      const missionCleared = today.mission.check(missionCtx);
      const prevDaily: DailyRecord | undefined = save.daily[today.date];
      const alreadyRewarded = prevDaily?.rewarded ?? false;
      const missionReward = missionCleared && !alreadyRewarded ? today.mission.reward : 0;

      const newRecord = s.wave > save.bestWave || (s.wave === save.bestWave && s.realTime > save.bestTime);

      // ── 업적 (이번 판 반영 전 save 를 기준으로 판정) ──
      const achCtx: AchievementContext = {
        wave: s.wave,
        time: s.realTime,
        stats: s.stats,
        mvpDefId: mvpId,
        save,
        totalPlays: save.totalPlays + 1,
        eventCount,
        totalEventCount: (id) => (save.eventCounts[id] ?? 0) + eventCount(id),
        coinsLeft: s.coins,
        challengeId: s.challenge?.id ?? null,
        missionCleared,
      };
      const unlocked = evaluateAchievements(achCtx);
      // 업적 보상: 이번 판에 새로 딴 것만 지급한다 (한 번 딴 업적은 다시 주지 않는다)
      const achReward = unlocked.reduce((sum, id) => {
        const def = ACHIEVEMENT_BY_ID[id];
        return sum + (def ? achievementReward(def) : 0);
      }, 0);
      const basePoints = metaPointsForRun(s.stats.coinsEarned, s.wave, s.stats.kills, meta.payMult);
      const points = basePoints + missionReward + achReward;

      const res: RunResult = {
        wave: s.wave,
        time: s.realTime,
        kills: s.stats.kills,
        coins: s.stats.coinsEarned,
        coinsLeft: s.coins,
        draws: s.stats.draws,
        merges: s.stats.merges,
        bossKills: s.stats.bossKills,
        mvp: mvpId,
        mvpDamage: mvp?.damage ?? 0,
        mvpTier: mvp?.tier ?? 1,
        newRecord,
        metaPoints: points,
        quip: GAMEOVER_QUIPS[Math.floor(Math.random() * GAMEOVER_QUIPS.length)],
        bestCombo: s.stats.bestCombo,
        rewards: s.rewardsTaken.length,
        runTitle,
        eventIds: s.stats.eventIds,
        defeat: analyzeDefeat(s.stats, s.coins),
        unlocked,
        challengeId: s.challenge?.id ?? null,
        challengeName: s.challenge?.name ?? null,
        missionGoal: today.mission.goal,
        missionExtra: today.mission.extra,
        missionCleared,
        missionReward,
        achReward,
      };

      const record: RunRecord = {
        wave: s.wave,
        time: s.realTime,
        kills: s.stats.kills,
        merges: s.stats.merges,
        bossKills: s.stats.bossKills,
        mvp: mvpId,
        bestCombo: s.stats.bestCombo,
        runTitle,
        challengeId: s.challenge?.id ?? null,
        missionCleared,
        at,
      };

      const dailyRec: DailyRecord = {
        date: today.date,
        challengeId: today.challenge.id,
        missionId: today.mission.id,
        bestWave: Math.max(prevDaily?.bestWave ?? 0, s.wave),
        bestCombo: Math.max(prevDaily?.bestCombo ?? 0, s.stats.bestCombo),
        bestKills: Math.max(prevDaily?.bestKills ?? 0, s.stats.kills),
        missionCleared: (prevDaily?.missionCleared ?? false) || missionCleared,
        plays: (prevDaily?.plays ?? 0) + 1,
        rewarded: alreadyRewarded || missionReward > 0,
      };

      const merged = mergeRunStats(save, s.stats, mvpId, at);
      const next: SaveData = {
        ...save,
        ...merged,
        bestWave: Math.max(save.bestWave, s.wave),
        bestTime: Math.max(save.bestTime, s.realTime),
        bestKills: Math.max(save.bestKills, s.stats.kills),
        totalPlays: save.totalPlays + 1,
        totalKills: save.totalKills + s.stats.kills,
        unlockedUnits: Array.from(new Set([...save.unlockedUnits, ...s.stats.seenUnits])),
        seenEnemies: Array.from(new Set([...save.seenEnemies, ...s.stats.seenEnemies])),
        metaPoints: save.metaPoints + points,
        achievements: [...save.achievements, ...unlocked],
        achievementsAt: { ...save.achievementsAt, ...Object.fromEntries(unlocked.map((id) => [id, at])) },
        runHistory: [record, ...save.runHistory],
        daily: { ...save.daily, [today.date]: dailyRec },
        lastRun: { wave: s.wave, time: s.realTime, kills: s.stats.kills, coins: s.stats.coinsEarned, mvp: mvpId, at },
        hintsSeen: true,
      };
      persist(next);
      setResult(res);
      if (newRecord) audio.play('record');

      // ── 글로벌 랭킹 전송 (실패해도 조용히 넘어간다) ──
      const summary: RunSummary = {
        wave: s.wave,
        time: s.realTime,
        kills: s.stats.kills,
        bestCombo: s.stats.bestCombo,
        merges: s.stats.merges,
        draws: s.stats.draws,
        bossKills: s.stats.bossKills,
        coins: s.stats.coinsEarned,
        mvp: mvpId,
        runTitle,
        challengeId: s.challenge?.id ?? null,
      };
      if (next.rankOptIn && next.nickname) {
        submitScore(buildPayload(summary, next, today.date)).then(setRank);
      } else if (next.rankOptIn) {
        setPendingRun(summary); // 게임오버 화면에서 이름을 받고 올린다
      }
    },
    [save, persist],
  );

  const buy = useCallback(
    (id: MetaUpgradeId) => {
      const def = META_UPGRADES.find((u) => u.id === id)!;
      const lvl = save.metaLevels[id];
      if (lvl >= def.maxLevel) return;
      const cost = def.cost(lvl);
      if (save.metaPoints < cost) return;
      audio.unlock();
      audio.play('coin');
      persist({ ...save, metaPoints: save.metaPoints - cost, metaLevels: { ...save.metaLevels, [id]: lvl + 1 } });
    },
    [save, persist],
  );

  // 이름을 정하면 이번 판 기록을 그 이름으로 올린다.
  const submitPendingRun = useCallback(
    (nickname: string) => {
      if (!pendingRun) return;
      const next = { ...save, nickname };
      persist(next);
      setPendingRun(null);
      submitScore(buildPayload(pendingRun, next, dateKey())).then(setRank);
    },
    [pendingRun, save, persist],
  );

  const setOrder = useCallback((next: { pins: string[]; bans: string[] }) => persist({ ...save, order: next }), [save, persist]);

  const setNickname = useCallback(
    (nickname: string) => {
      if (nickname === save.nickname) return;
      persist({ ...save, nickname });
      // 이미 올라간 기록의 이름도 같이 바꾼다 (옛 이름이 박혀 있으면 곤란하다)
      if (save.rankOptIn && save.runHistory.length > 0) void renameScore(save.playerId, nickname, dateKey());
    },
    [save, persist],
  );
  const toggleRankOptIn = useCallback(() => persist({ ...save, rankOptIn: !save.rankOptIn }), [save, persist]);

  const toggleAutoMerge = useCallback(() => persist({ ...save, autoMerge: !save.autoMerge }), [save, persist]);
  const toggleAutoSell = useCallback(() => persist({ ...save, autoSell: !save.autoSell }), [save, persist]);

  const toggleMute = useCallback(() => {
    audio.unlock();
    const muted = !save.muted;
    audio.setMuted(muted);
    persist({ ...save, muted });
  }, [save, persist]);

  const meta = metaEffects(save.metaLevels);
  // 저장된 발주를 그대로 믿지 않는다. 해금 상태에 맞춰 늘 유효하게 맞춘다.
  const order = normalizeOrder(save.order, unlockedUnits(save.bestWave));
  const today = getDaily();
  const todayRecord = save.daily[dateKey()] ?? null;

  if (screen === 'start') {
    return (
      <StartScreen
        save={save}
        daily={today}
        todayRecord={todayRecord}
        onStart={startGame}
        onBuy={buy}
        onToggleMute={toggleMute}
        onSetNickname={setNickname}
        onToggleRankOptIn={toggleRankOptIn}
        order={order}
        onSetOrder={setOrder}
        onReplayIntro={replayIntro}
        onReset={() => setSave(resetSave())}
      />
    );
  }
  if (screen === 'intro') {
    return (
      <div className="app">
        <IntroScene onDone={finishIntro} />
      </div>
    );
  }
  return (
    <div className="app">
      <GameScreen
        key={runKey}
        meta={meta}
        bestWave={save.bestWave}
        muted={save.muted}
        autoMerge={save.autoMerge}
        autoSell={save.autoSell}
        showHints={!save.hintsSeen}
        order={order}
        challenge={dailyMode ? today.challenge : null}
        onToggleMute={toggleMute}
        onToggleAutoMerge={toggleAutoMerge}
        onToggleAutoSell={toggleAutoSell}
        onGameOver={onGameOver}
      />
      {result && (
        <GameOverScreen
          result={result}
          save={save}
          rank={rank}
          needName={pendingRun !== null}
          onSubmitName={submitPendingRun}
          onRestart={() => startGame(dailyMode)}
          onMenu={() => setScreen('start')}
        />
      )}
    </div>
  );
}
