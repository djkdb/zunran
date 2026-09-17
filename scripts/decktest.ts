// 덱이 실제로 뽑기와 합성 승급을 가두는지 확인한다.
import { Engine } from '../src/game/engine/Engine';
import { UNIT_BY_ID } from '../src/game/data/units';
import { normalizeDeck, DECK_SIZE } from '../src/game/data/deck';
import { unlockedUnits } from '../src/game/data/unlocks';

const full = unlockedUnits(999);
const deck = normalizeDeck(['onigiri', 'fridge', 'pos', 'cctv', 'lotto'], full);
console.log('덱:', deck.map((id) => UNIT_BY_ID[id].name).join(', '), `(${deck.length}/${DECK_SIZE}장)`);

function run(useDeck: boolean) {
  const seen = new Map<string, number>();
  for (let seed = 1; seed <= 60; seed++) {
    const e = new Engine({ seed, deck: useDeck ? deck : undefined });
    for (let i = 0; i < 40; i++) {
      e.state.coins = 99999;
      const before = e.state.units.length;
      e.dispatch({ type: 'DRAW' });
      if (e.state.units.length === before) break;
      // 칸을 비워 계속 뽑을 수 있게
      const u = e.state.units[e.state.units.length - 1];
      seen.set(u.defId, (seen.get(u.defId) ?? 0) + 1);
      e.dispatch({ type: 'SELL', unitId: u.id });
    }
  }
  return seen;
}

for (const [label, useDeck] of [['덱 없음', false], ['덱 적용', true]] as const) {
  const seen = run(useDeck);
  const total = [...seen.values()].reduce((a, b) => a + b, 0);
  const rows = [...seen.entries()].sort((a, b) => b[1] - a[1]);
  const off = rows.filter(([id]) => !deck.includes(id) && UNIT_BY_ID[id].rarity !== 'legendary' && UNIT_BY_ID[id].rarity !== 'special');
  console.log(`\n[${label}] 뽑기 ${total}회, 등장 유닛 ${rows.length}종`);
  console.log('  ' + rows.map(([id, n]) => `${UNIT_BY_ID[id].name} ${((n / total) * 100).toFixed(0)}%`).join(' · '));
  console.log(`  덱 밖(일반·희귀·에픽) 등장: ${off.length}종 ${off.length === 0 ? '← 갇힘 OK' : '← 새어나감 NG'}`);
}
