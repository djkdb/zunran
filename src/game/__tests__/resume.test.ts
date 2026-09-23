import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { createRng } from '../engine/rng';
import { STAGES } from '../data/stages';
import { REWARD_CARDS } from '../data/rewards';

function advance(engine: Engine, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    if (engine.state.phase === 'reward') engine.dispatch({ type: 'CHOOSE_REWARD', defId: engine.state.rewardOffers[0].defId });
    engine.tick(1 / 60);
    engine.drainFx();
  }
}
const persisted = (engine: Engine) => JSON.parse(JSON.parse(engine.checkpoint()).payload);
describe('중단한 근무 복원', () => {
  it('RNG 현재 위치를 보존한다', () => {
    const rng = createRng(42);
    for (let i = 0; i < 93; i++) rng.next();
    const restored = createRng(rng.getState());
    expect(Array.from({ length: 50 }, () => restored.next())).toEqual(Array.from({ length: 50 }, () => rng.next()));
  });
  it.each(STAGES.map((s) => s.id))('%s: 전투, 뽑기, RNG, 고정 스텝을 그대로 이어간다', (stageId) => {
    const engine = new Engine({ seed: 1234, stageId });
    engine.state.coins = 100000;
    for (let i = 0; i < 7; i++) engine.dispatch({ type: 'DRAW' });
    advance(engine, 450);
    engine.tick(0.009);
    const restored = Engine.restore(engine.checkpoint())!;
    expect(restored).not.toBeNull();
    expect(restored.state.waveEnemyIds).toBeInstanceOf(Set);
    expect(persisted(restored)).toEqual(persisted(engine));
    for (const e of [engine, restored]) { e.dispatch({ type: 'DRAW' }); advance(e, 1200); }
    expect(persisted(restored)).toEqual(persisted(engine));
  });
  it('보상 선택 대기와 종료 대기도 저장된다', () => {
    const engine = new Engine({ seed: 1 });
    engine.state.phase = 'reward';
    engine.state.rewardOffers = REWARD_CARDS.slice(0, 3).map((c) => ({ defId: c.id, kind: 'stat', name: c.name, desc: c.desc, icon: c.icon, tone: c.tone }));
    const restored = Engine.restore(engine.checkpoint())!;
    expect(restored.state.phase).toBe('reward');
    expect(restored.dispatch({ type: 'CHOOSE_REWARD', defId: engine.state.rewardOffers[0].defId }).ok).toBe(true);
    engine.dispatch({ type: 'GIVE_UP' });
    expect(Engine.restore(engine.checkpoint())!.state.phase).toBe('gameover');
  });
  it('손상된 저장을 복원하지 않는다', () => {
    expect(Engine.restore('{bad')).toBeNull();
    const raw = new Engine().checkpoint();
    expect(Engine.restore(raw.slice(0, -20))).toBeNull();
    expect(Engine.restore(raw.replace('"checksum":', '"checksum":1'))).toBeNull();
  });
});
