import { useCallback, useState } from 'react';
import type { Engine } from './game/engine/Engine';
import type { MetaUpgradeId } from './game/types';
import { loadSave, writeSave, resetSave, type SaveData } from './game/save/storage';
import { META_UPGRADES, metaEffects, metaPointsForRun } from './game/save/meta';
import { GAMEOVER_QUIPS } from './game/data/dialogue';
import { audio } from './game/audio/sfx';
import { StartScreen } from './ui/StartScreen';
import { GameScreen } from './ui/GameScreen';
import { GameOverScreen } from './ui/GameOverScreen';

export interface RunResult {
  wave: number;
  time: number;
  kills: number;
  coins: number;
  draws: number;
  merges: number;
  bossKills: number;
  mvp: string | null;
  mvpDamage: number;
  newRecord: boolean;
  metaPoints: number;
  quip: string;
}

type Screen = 'start' | 'game';

export function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [screen, setScreen] = useState<Screen>('start');
  const [runKey, setRunKey] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);

  const persist = useCallback((next: SaveData) => {
    setSave(next);
    writeSave(next);
  }, []);

  const startGame = useCallback(() => {
    audio.unlock();
    setResult(null);
    setRunKey((k) => k + 1);
    setScreen('game');
  }, []);

  const onGameOver = useCallback(
    (engine: Engine) => {
      const s = engine.state;
      const mvp = engine.mvpUnit();
      const points = metaPointsForRun(s.stats.coinsEarned, s.wave, s.stats.kills);
      const newRecord = s.wave > save.bestWave || (s.wave === save.bestWave && s.realTime > save.bestTime);
      const res: RunResult = {
        wave: s.wave,
        time: s.realTime,
        kills: s.stats.kills,
        coins: s.stats.coinsEarned,
        draws: s.stats.draws,
        merges: s.stats.merges,
        bossKills: s.stats.bossKills,
        mvp: mvp?.defId ?? null,
        mvpDamage: mvp?.damage ?? 0,
        newRecord,
        metaPoints: points,
        quip: GAMEOVER_QUIPS[Math.floor(Math.random() * GAMEOVER_QUIPS.length)],
      };
      const next: SaveData = {
        ...save,
        bestWave: Math.max(save.bestWave, s.wave),
        bestTime: Math.max(save.bestTime, s.realTime),
        bestKills: Math.max(save.bestKills, s.stats.kills),
        totalPlays: save.totalPlays + 1,
        totalKills: save.totalKills + s.stats.kills,
        unlockedUnits: Array.from(new Set([...save.unlockedUnits, ...s.stats.seenUnits])),
        seenEnemies: Array.from(new Set([...save.seenEnemies, ...s.stats.seenEnemies])),
        metaPoints: save.metaPoints + points,
        lastRun: { wave: s.wave, time: s.realTime, kills: s.stats.kills, coins: s.stats.coinsEarned, mvp: mvp?.defId ?? null, at: Date.now() },
        hintsSeen: true,
      };
      persist(next);
      setResult(res);
      if (newRecord) audio.play('record');
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

  const toggleAutoMerge = useCallback(() => {
    persist({ ...save, autoMerge: !save.autoMerge });
  }, [save, persist]);

  const toggleMute = useCallback(() => {
    audio.unlock();
    const muted = !save.muted;
    audio.setMuted(muted);
    persist({ ...save, muted });
  }, [save, persist]);

  const meta = metaEffects(save.metaLevels);

  if (screen === 'start') {
    return <StartScreen save={save} onStart={startGame} onBuy={buy} onToggleMute={toggleMute} onReset={() => setSave(resetSave())} />;
  }
  return (
    <div className="app">
      <GameScreen
        key={runKey}
        meta={meta}
        bestWave={save.bestWave}
        muted={save.muted}
        autoMerge={save.autoMerge}
        showHints={!save.hintsSeen}
        onToggleMute={toggleMute}
        onToggleAutoMerge={toggleAutoMerge}
        onGameOver={onGameOver}
      />
      {result && <GameOverScreen result={result} onRestart={startGame} onMenu={() => setScreen('start')} />}
    </div>
  );
}
