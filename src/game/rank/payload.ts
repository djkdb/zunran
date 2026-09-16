import type { SaveData } from '../save/storage';
import { sanitizeName } from './validate';
import type { ScorePayload } from './types';

export interface RunSummary {
  wave: number;
  time: number;
  kills: number;
  bestCombo: number;
  merges: number;
  draws: number;
  bossKills: number;
  coins: number;
  mvp: string | null;
  runTitle: string;
  challengeId: string | null;
}

export function buildPayload(run: RunSummary, save: SaveData, date: string): ScorePayload {
  return {
    v: 1,
    playerId: save.playerId,
    name: sanitizeName(save.nickname),
    wave: run.wave,
    time: run.time,
    kills: run.kills,
    combo: run.bestCombo,
    merges: run.merges,
    draws: run.draws,
    bossKills: run.bossKills,
    coins: run.coins,
    mvp: run.mvp,
    title: run.runTitle,
    challengeId: run.challengeId,
    date,
  };
}
