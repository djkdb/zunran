import type { GameState } from '../types';
import { buildWave } from '../data/waves';
import { waveClearBonus, THREE_AM_WAVE, isBossWave } from '../config';
import { spawnEnemy } from './enemySystem';
import { addCoins } from './economy';
import { sfx, addFloater } from './helpers';

export function startWave(state: GameState, wave: number): void {
  state.wave = wave;
  const plan = buildWave(wave, state.rng);
  state.spawnQueue = plan.entries;
  state.waveDuration = plan.duration;
  state.waveTimer = plan.duration;
  state.waveElapsed = 0;
  state.waveEnemyIds = new Set();
  state.waveCleared = false;
  state.waveReached = false;
  state.stats.bestWave = Math.max(state.stats.bestWave ?? 0, wave);

  if (plan.script === 'threeAm') {
    state.threeAmTriggered = true;
    state.fx.push({ type: 'banner', text: '새벽 3시입니다.', sub: '…뭔가 잘못됐다', style: 'warning', dur: 3 });
    state.fx.push({ type: 'shake', amount: 10 });
    state.fx.push({ type: 'flash', color: '#ef4444' });
    sfx(state, 'warning');
  } else if (plan.boss) {
    // 보스 배너는 스폰 시 출력. 여기서는 예고만.
    state.fx.push({ type: 'banner', text: `WAVE ${wave}`, sub: 'BOSS 접근 중', style: 'warning', dur: 1.6 });
    sfx(state, 'warning');
  } else if (wave > 1) {
    state.fx.push({ type: 'banner', text: `WAVE ${wave}`, sub: waveHint(wave), style: 'info', dur: 1.2 });
  }
  if (state.bestWaveRecord > 0 && wave > state.bestWaveRecord && !state.recordAnnounced) {
    state.recordAnnounced = true;
    state.fx.push({ type: 'banner', text: 'NEW RECORD', sub: `${wave}웨이브 돌파!`, style: 'record', dur: 2.4 });
    sfx(state, 'record');
  }
}

function waveHint(wave: number): string {
  if (wave === 3) return '담배 손님이 오기 시작한다';
  if (wave === 4) return '술 취한 손님 등장';
  if (wave === 5) return '"이거 얼마예요?"';
  if (wave === 6) return '라면 손님은 오래 머문다';
  if (wave === 7) return '배달 콜이 밀린다';
  if (wave === 8) return '단체 손님 주의';
  if (wave === 9) return '회식이 끝났다';
  if (wave === 11) return '봉투값 20원';
  if (wave === 14) return '충전기 있어요?';
  if (wave === 15) return '택배 박스가 크다';
  if (wave === 16) return '화장실 비밀번호는?';
  if (wave === 17) return '사장님 불러주세요';
  if (wave === 18) return '…누구세요?';
  if (wave === 22) return '으어어…';
  if (wave >= 41) return '교대가 오지 않는다';
  return '';
}

export function updateWave(state: GameState, dt: number): void {
  state.waveTimer -= dt;
  state.waveElapsed += dt;

  // 스폰 큐 처리
  while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.waveElapsed) {
    const entry = state.spawnQueue[0];
    let spawnedAll = true;
    for (let i = 0; i < entry.count; i++) {
      const e = spawnEnemy(state, entry.defId, { hpMult: entry.hpMult, dist: -i * 24, groupId: entry.groupId, silent: i > 0 });
      if (!e) {
        spawnedAll = false;
        break;
      }
      state.waveEnemyIds.add(e.id);
    }
    if (!spawnedAll) break; // 필드 개체 상한. 다음 틱에 재시도
    state.spawnQueue.shift();
  }

  // 웨이브 클리어 판정 (스폰 끝 + 이번 웨이브 손님 전원 처리)
  if (!state.waveCleared && state.spawnQueue.length === 0 && state.waveEnemyIds.size > 0) {
    let allDead = true;
    for (const e of state.enemies) {
      if (state.waveEnemyIds.has(e.id)) {
        if (e.reached) state.waveReached = true;
        if (!e.dead && !e.reached) {
          allDead = false;
          break;
        }
      }
    }
    if (allDead) {
      state.waveCleared = true;
      if (!state.waveReached) {
        const bonus = Math.round(waveClearBonus(state.wave) * state.modifiers.coinGain);
        addCoins(state, bonus);
        state.fx.push({ type: 'banner', text: `WAVE ${state.wave} CLEAR`, sub: `+${bonus}원`, style: 'clear', dur: 1.4 });
        addFloater(state, { x: 320, y: 560, text: `+${bonus}원 웨이브 클리어`, color: '#fde047', size: 15, life: 1.4 });
        sfx(state, 'waveClear');
        // 초반: 클리어하면 바로 다음 웨이브 (지루함 방지)
        if (state.wave <= 3) state.waveTimer = Math.min(state.waveTimer, 3);
        else state.waveTimer = Math.min(state.waveTimer, 6);
      }
    }
  }

  if (state.waveTimer <= 0) {
    startWave(state, state.wave + 1);
  }
}

export function isThreeAm(state: GameState): boolean {
  return state.wave >= THREE_AM_WAVE;
}
export { isBossWave };
