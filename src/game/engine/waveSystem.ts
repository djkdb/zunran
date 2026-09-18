import type { GameState } from '../types';
import { buildWave, THEME_INFO } from '../data/waves';
import { waveClearBonus, waveIncome, THREE_AM_WAVE, isBossWave, isRewardWave, needsPrep, PREP_SECONDS } from '../config';
import { openRewardChoice } from './rewardSystem';
import { spawnEnemy } from './enemySystem';
import { ENEMY_BY_ID } from '../data/enemies';
import { addCoins } from './economy';
import { sfx, addFloater } from './helpers';

export function startWave(state: GameState, wave: number): void {
  state.wave = wave;
  const plan = buildWave(wave, state.rng, state.challenge?.enemyCountMult ?? 1, state.themeSchedule[wave] ?? 'mixed', state.stage.traffic);
  // "새벽 장사" 도박을 골랐다면 이 웨이브만 손님이 확 늘어난다 (보상은 economy 에서 2배)
  if (state.riskWave === wave) {
    const extra = plan.entries
      .filter((e) => e.defId !== 'boss_lunchbox' && !e.defId.startsWith('boss_'))
      .slice(0, Math.ceil(plan.entries.length * 0.6))
      .map((e) => ({ ...e, at: e.at + 0.6, spawned: 0 }));
    plan.entries = [...plan.entries, ...extra].sort((a, b) => a.at - b.at);
  }
  // 필드 상한으로 아직 못 나온 보스는 다음 웨이브 맨 앞으로 이월 (보스 스킵 방지)
  const leftoverBoss = state.spawnQueue.filter((e) => ENEMY_BY_ID[e.defId]?.tags.includes('boss')).map((e) => ({ ...e, at: 0, spawned: 0 }));
  state.spawnQueue = [...leftoverBoss, ...plan.entries];
  state.waveDuration = plan.duration;
  state.waveTheme = plan.theme;
  state.waveTimer = plan.duration;
  state.waveElapsed = 0;
  state.waveEnemyIds = new Set();
  state.waveCleared = false;
  state.waveReached = false;
  state.stats.bestWave = Math.max(state.stats.bestWave ?? 0, wave);
  if (wave > 1) {
    const income = Math.round(waveIncome(wave) * state.modifiers.coinGain * state.perma.incomeMult * state.stage.traffic.coin);
    addCoins(state, income);
    addFloater(state, { x: 320, y: 60, text: `시급 +${income}원`, color: '#fde047', size: 13, life: 1.3 });
  }

  if (plan.script === 'threeAm') {
    state.threeAmTriggered = true;
    state.fx.push({ type: 'banner', text: '03:00', sub: '새벽 3시입니다. …뭔가 잘못됐다', style: 'warning', dur: 3.2 });
    state.fx.push({ type: 'shake', amount: 14 });
    state.fx.push({ type: 'flash', color: '#ff4d8d' });
    sfx(state, 'warning');
    sfx(state, 'secret');
  } else if (plan.boss) {
    // 보스 배너는 스폰 시 출력. 여기서는 예고만.
    state.fx.push({ type: 'banner', text: `웨이브 ${wave}`, sub: '보스 접근 중', style: 'warning', dur: 1.6 });
    sfx(state, 'warning');
  } else if (wave === THREE_AM_WAVE - 4) {
    // 02:00 — 새벽 3시 전조. 여기서부터 화면 색조도 한 단계 어두워진다.
    state.fx.push({ type: 'banner', text: '02:00', sub: '손님이 이상해지기 시작한다', style: 'warning', dur: 2 });
    sfx(state, 'warning');
  } else if (wave > 1) {
    // 테마가 있으면 그걸 먼저 알린다 — 대비할 수 있어야 판단이 생긴다.
    const info = plan.theme !== 'mixed' ? THEME_INFO[plan.theme] : null;
    state.fx.push({
      type: 'banner',
      text: info ? `웨이브 ${wave} · ${info.label}` : `웨이브 ${wave}`,
      sub: info ? info.hint : waveHint(wave),
      style: info ? 'warning' : 'info',
      dur: info ? 1.8 : 1.2,
    });
    if (info) sfx(state, 'warning');
  }
  if (state.riskWave === wave) {
    state.fx.push({ type: 'banner', text: '새벽 장사', sub: '손님이 두 배로 몰려온다 · 코인도 두 배', style: 'warning', dur: 2.2 });
    state.fx.push({ type: 'shake', amount: 8 });
    sfx(state, 'warning');
  }
  // 3웨이브마다(그리고 보스 직후) 보상 카드를 고른다 — 로그라이크의 핵심 선택 지점
  if (isRewardWave(wave)) openRewardChoice(state);
  if (state.bestWaveRecord > 0 && wave > state.bestWaveRecord && !state.recordAnnounced) {
    state.recordAnnounced = true;
    state.fx.push({ type: 'banner', text: '신기록', sub: `${wave}웨이브 돌파`, style: 'record', dur: 2.4 });
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
  // 준비 시간. 스폰과 웨이브 시계만 멈춘다 — 남은 손님은 계속 걸어오고
  // 유닛도 계속 쏜다. 멈추는 게 아니라 '숨 돌릴 틈' 이다.
  if (state.prep > 0) {
    state.prep -= dt;
    if (state.prep <= 0) {
      state.prep = 0;
      startWave(state, state.wave + 1);
    }
    return;
  }

  state.waveTimer -= dt;
  state.waveElapsed += dt;

  // 스폰 큐 처리
  while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.waveElapsed) {
    const entry = state.spawnQueue[0];
    let i = entry.spawned ?? 0;
    for (; i < entry.count; i++) {
      const e = spawnEnemy(state, entry.defId, { hpMult: entry.hpMult, dist: -i * 24, groupId: entry.groupId, silent: i > 0 });
      if (!e) break;
    }
    entry.spawned = i;
    if (i < entry.count) break; // 필드 개체 상한. 다음 틱에 남은 개체부터 재시도
    state.spawnQueue.shift();
  }

  // 웨이브 클리어 판정 (스폰 끝 + 이번 웨이브 손님 전원 처리)
  if (!state.waveCleared && state.spawnQueue.length === 0 && state.waveEnemyIds.size > 0) {
    let allDead = true;
    for (const e of state.enemies) {
      if (state.waveEnemyIds.has(e.id) && !e.dead && !e.reached) {
        allDead = false;
        break;
      }
    }
    if (allDead) {
      state.waveCleared = true;
      if (!state.waveReached) {
        const bonus = Math.round(waveClearBonus(state.wave) * state.modifiers.coinGain * state.stage.traffic.coin);
        addCoins(state, bonus);
        state.fx.push({ type: 'banner', text: `웨이브 ${state.wave} 클리어`, sub: `+${bonus}원`, style: 'clear', dur: 1.4 });
        addFloater(state, { x: 320, y: 560, text: `+${bonus}원 웨이브 클리어`, color: '#fde047', size: 15, life: 1.4 });
        sfx(state, 'waveClear');
        // 다 잡았으면 기다릴 이유가 없다.
        //
        // 실플레이를 찍어 보니 3분짜리 판에서 처음 13웨이브(약 2분)가 무피해였다.
        // 손이 빠른 사람은 웨이브를 즉시 비우고도 6초를 더 기다렸다 — 13웨이브면
        // 그 대기만 1분이 넘는다.
        //
        // 난이도를 올려 초반을 채우는 대신 대기를 줄인다. 빨리 비우는 사람만
        // 빨라지고, 버거운 사람은 웨이브 시간을 그대로 다 쓴다.
        // 고무줄 난이도가 아니라 '잘하면 빨리 넘어간다' 는 그냥 보상이다.
        if (state.wave <= 3) state.waveTimer = Math.min(state.waveTimer, 1.5);
        else state.waveTimer = Math.min(state.waveTimer, 2.5);
      }
    }
  }

  if (state.waveTimer <= 0) {
    const next = state.wave + 1;
    if (needsPrep(next)) {
      state.prep = PREP_SECONDS;
      const what = next === THREE_AM_WAVE ? '새벽 3시' : '보스';
      state.fx.push({ type: 'banner', text: '준비 시간', sub: `${what}가 옵니다 · ${PREP_SECONDS}초`, style: 'warning', dur: 2.2 });
      sfx(state, 'warning');
      return;
    }
    startWave(state, next);
  }
}

// 준비를 마쳤으면 기다릴 이유가 없다. 남은 시간을 버리고 바로 시작한다.
export function skipPrep(state: GameState): boolean {
  if (state.prep <= 0) return false;
  state.prep = 0;
  startWave(state, state.wave + 1);
  return true;
}

export function isThreeAm(state: GameState): boolean {
  return state.wave >= THREE_AM_WAVE;
}
export { isBossWave };
