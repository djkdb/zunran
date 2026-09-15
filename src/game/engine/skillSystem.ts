import type { GameState } from '../types';
import { ENEMY_BY_ID } from '../data/enemies';
import { DUMP_COOLDOWN, DUMP_DAMAGE_BASE, SHUTTER_COOLDOWN, SHUTTER_PUSH, SHUTTER_STUN, enemyHpScale } from '../config';
import { damageEnemy } from './enemySystem';
import { addFloater, sfx } from './helpers';

// 플레이어가 직접 누르는 긴급 스킬 두 개. 손이 심심하지 않게, 그리고 위기 탈출 수단.
export function useSkill(state: GameState, skill: 'shutter' | 'dump'): { ok: boolean; reason?: string } {
  if (state.phase !== 'playing') return { ok: false };
  if (state.skills[skill] > 0) return { ok: false, reason: '아직 준비 중이에요.' };
  const alive = state.enemies.filter((e) => !e.dead && !e.reached);
  if (alive.length === 0) return { ok: false, reason: '아직 손님이 없어요.' };

  if (skill === 'shutter') {
    state.skills.shutter = SHUTTER_COOLDOWN;
    for (const e of alive) {
      const def = ENEMY_BY_ID[e.defId];
      if (!def.immune?.includes('stun')) e.stun = Math.max(e.stun, SHUTTER_STUN);
      if (!def.immune?.includes('knockback') && !e.isBoss) e.dist = Math.max(1, e.dist - SHUTTER_PUSH);
    }
    state.fx.push({ type: 'banner', text: '셔터 내려!', sub: `${alive.length}명 정지`, style: 'warning', dur: 1.6 });
    state.fx.push({ type: 'shake', amount: 12 });
    state.fx.push({ type: 'flash', color: '#1c6fb0' });
    sfx(state, 'warning');
  } else {
    state.skills.dump = DUMP_COOLDOWN;
    const dmg = DUMP_DAMAGE_BASE * enemyHpScale(state.wave) * 0.55;
    for (const e of alive) {
      damageEnemy(state, e, dmg, null, undefined);
      state.fx.push({ type: 'hit', x: e.x, y: e.y, color: '#d93a2b' });
    }
    addFloater(state, { x: 320, y: 300, text: `폐기 처리 ${Math.round(dmg)}`, color: '#d93a2b', size: 18, life: 1.4 });
    state.fx.push({ type: 'banner', text: '폐기 처리', sub: '전부 유통기한 지났습니다', style: 'boss', dur: 1.6 });
    state.fx.push({ type: 'shake', amount: 16 });
    state.fx.push({ type: 'flash', color: '#d93a2b' });
    sfx(state, 'legendary');
  }
  state.stats.skillsUsed++;
  return { ok: true };
}

export function tickSkills(state: GameState, dt: number): void {
  if (state.skills.shutter > 0) state.skills.shutter = Math.max(0, state.skills.shutter - dt);
  if (state.skills.dump > 0) state.skills.dump = Math.max(0, state.skills.dump - dt);
}
