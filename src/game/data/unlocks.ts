import { UNIT_DEFS } from './units';

// 유닛 해금. 처음부터 전부 열려 있으면 덱을 짜는 재미가 첫 판에 소진된다.
// 누적 최고 웨이브로 하나씩 열려서, "더 멀리 가면 덱이 넓어진다"가 성립한다.
//
// 여기 없는 유닛은 처음부터 열려 있다. 합성 전용(mergeOnly)은 덱에 못 넣으므로 제외.
export const UNIT_UNLOCK_WAVE: Record<string, number> = {
  // 일반 — 첫 판에 둘, 나머지는 금방
  ramenShelf: 3,
  fridge: 6,
  // 희귀
  coffee: 5,
  cctv: 9,
  vacuum: 13,
  freezer: 17,
  hotbar: 8,
  // 희귀
  scanner: 11,
  tteok: 15,
  // 에픽
  lotto: 12,
  parcel: 20,
  slush: 24,
  // 전설 — 점장은 처음부터, 나머지는 멀리 간 보상
  owner: 28,
  dawnCleaner: 34,
};

export interface UnlockInfo {
  defId: string;
  name: string;
  wave: number;
}

// 아직 안 열린 것 중 가장 가까운 해금 (게임오버 화면의 "다음 해금까지" 표시용)
export function nextUnlock(bestWave: number): UnlockInfo | null {
  let best: UnlockInfo | null = null;
  for (const def of UNIT_DEFS) {
    if (def.mergeOnly) continue;
    const need = UNIT_UNLOCK_WAVE[def.id];
    if (need === undefined || need <= bestWave) continue;
    if (!best || need < best.wave) best = { defId: def.id, name: def.name, wave: need };
  }
  return best;
}

// 최고 웨이브 기준으로 해금된 유닛 목록 (덱에 넣을 수 있는 것만)
export function unlockedUnits(bestWave: number): string[] {
  return UNIT_DEFS.filter((d) => !d.mergeOnly && (UNIT_UNLOCK_WAVE[d.id] ?? 0) <= bestWave).map((d) => d.id);
}

export function isUnlocked(defId: string, bestWave: number): boolean {
  return (UNIT_UNLOCK_WAVE[defId] ?? 0) <= bestWave;
}
