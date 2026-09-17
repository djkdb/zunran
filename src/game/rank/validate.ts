import { waveDuration, BOSS_WAVE_DURATION, isBossWave } from '../config';
import { MAX_NAME_LEN } from './types';
import type { ScorePayload } from './types';

// 클라이언트는 신뢰할 수 없다. 서버에서 "숫자끼리 앞뒤가 맞는 기록인가"를 검사한다.
// 완전한 치팅 차단은 아니다 - 엔진 전체를 워커에서 재생하기에는 CPU 한도가 모자란다.
// 대신 물리적으로 불가능한 조합(짧은 시간에 높은 웨이브, 스폰보다 많은 처치 등)을 걸러낸다.

// 웨이브 N 에 도달하는 데 최소로 필요한 시간.
// 웨이브를 전멸시키면 타이머가 6초(초반 3초)로 줄고, 여기에 2배속까지 겹친다.
// scripts/rankbounds.ts 로 실측한 최속 진행 대비 1.2~1.6배 여유를 두고 잡았다.
// 초반 3웨이브는 워낙 짧아 의미 있는 하한이 안 나오므로 검사하지 않는다.
export function minRunSeconds(wave: number): number {
  if (wave <= 3) return 0;
  let s = 0;
  for (let w = 1; w < wave; w++) s += isBossWave(w) ? BOSS_WAVE_DURATION : waveDuration(w);
  return s / 3;
}

// 웨이브 N 까지 등장 가능한 손님 수의 상한 (data/waves.ts 의 총량 공식 기준).
// 손님 수 공식이 4+1.8w → 4+2.3w 로 바뀌었고 테마 웨이브는 거기에 ×1.15 가 더 붙는다.
// 공식을 맞춰 두지 않으면 배수만 키워야 해서 상한이 무의미해진다.
export function maxKills(wave: number): number {
  let n = 0;
  for (let w = 1; w <= wave; w++) n += (4 + 2.3 * Math.min(w, 40) + Math.max(0, w - 40)) * 1.15;
  return Math.ceil(n * 2); // 이벤트 스폰 · 보스 소환물 · 데일리 배율까지 감안
}

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const stripped = Array.from(s)
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c >= 0x20 && c !== 0x7f; // 제어문자 제거
    })
    .join('');
  return stripped.trim().slice(0, MAX_NAME_LEN) || '익명 알바';
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateScore(p: ScorePayload): ValidationResult {
  if (!p || p.v !== 1) return { ok: false, reason: 'version' };
  if (typeof p.playerId !== 'string' || p.playerId.length < 8 || p.playerId.length > 64) {
    return { ok: false, reason: 'playerId' };
  }
  if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return { ok: false, reason: 'date' };
  const nums = [p.wave, p.time, p.kills, p.combo, p.merges, p.draws, p.bossKills, p.coins];
  if (!nums.every(isNum)) return { ok: false, reason: 'number' };
  if (nums.some((n) => n < 0)) return { ok: false, reason: 'negative' };
  if (!Number.isInteger(p.wave) || p.wave < 1 || p.wave > 300) return { ok: false, reason: 'wave range' };
  if (p.time < 5 || p.time > 7200) return { ok: false, reason: 'time range' };

  // 웨이브만큼 시간이 흘렀어야 한다
  if (p.time < minRunSeconds(p.wave)) return { ok: false, reason: 'time too short for wave' };
  // 등장한 손님보다 많이 잡을 수 없다
  if (p.kills > maxKills(p.wave)) return { ok: false, reason: 'kills too high for wave' };
  // 콤보는 처치 수를 넘을 수 없다
  if (p.combo > p.kills) return { ok: false, reason: 'combo > kills' };
  // 보스는 10웨이브마다 한 번
  if (p.bossKills > Math.floor(p.wave / 10) + 1) return { ok: false, reason: 'bossKills too high' };
  // 합성 1회에 유닛 3개가 들어가고 1개가 나온다. 공급원은 뽑기 + 보상 지급(소수).
  if (p.merges * 2 > p.draws + 12) return { ok: false, reason: 'merges vs draws' };
  // 코인 상한. 실측 최대가 웨이브당 약 14,000 이고 데일리 코인 배율까지 겹칠 수 있어 크게 잡는다.
  // (코인은 순위에 쓰이지 않는다. 앞뒤가 맞는지만 본다.)
  // 경제 개편으로 웨이브당 누적 코인이 최대 823원까지 내려왔다 (scripts/rankbounds.ts).
  // 예전 상한(웨이브당 40,000)은 이제 아무것도 거르지 못한다. 실측의 6배로 조인다.
  if (p.coins > p.wave * 5000 + 5000) return { ok: false, reason: 'coins too high' };
  return { ok: true };
}
