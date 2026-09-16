import { describe, it, expect } from 'vitest';
import { validateScore, sanitizeName, minRunSeconds, maxKills } from '../rank/validate';
import { insertEntry, normalizeBoard, rankOf, renameEntries } from '../rank/board';
import type { RankEntry, ScorePayload } from '../rank/types';
import { MAX_BOARD_ENTRIES } from '../rank/types';
import { defaultSave, migrate, SAVE_VERSION } from '../save/storage';
import { buildPayload } from '../rank/payload';

const base = (over: Partial<ScorePayload> = {}): ScorePayload => ({
  v: 1,
  playerId: 'a'.repeat(32),
  name: '알바생',
  wave: 20,
  time: 400,
  kills: 300,
  combo: 40,
  merges: 30,
  draws: 90,
  bossKills: 2,
  coins: 20000,
  mvp: 'partTimer',
  title: '무난한 밤',
  challengeId: null,
  date: '2026-09-16',
  ...over,
});

const entry = (over: Partial<RankEntry> = {}): RankEntry => ({
  id: 'p0000001',
  name: '알바생',
  wave: 20,
  time: 400,
  kills: 300,
  combo: 40,
  mvp: null,
  title: '',
  at: 1,
  ...over,
});

describe('기록 검증', () => {
  it('정상 기록은 통과한다', () => {
    expect(validateScore(base()).ok).toBe(true);
  });

  it('실제 플레이 값(웨이브 33 기준)을 거부하지 않는다', () => {
    // 시뮬레이터 autoClean 전략의 대표 기록
    expect(validateScore(base({ wave: 33, time: 780, kills: 900, combo: 160, merges: 70, draws: 190, bossKills: 3, coins: 90000 })).ok).toBe(true);
  });

  it('시간 대비 웨이브가 말이 안 되면 거부한다', () => {
    const r = validateScore(base({ wave: 60, time: 30 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/time/);
  });

  it('등장 가능한 손님보다 많이 잡을 수 없다', () => {
    expect(validateScore(base({ kills: 99999 })).ok).toBe(false);
  });

  it('콤보는 처치 수를 넘을 수 없다', () => {
    expect(validateScore(base({ combo: 301, kills: 300 })).ok).toBe(false);
  });

  it('보스 처치 수 상한을 넘으면 거부한다', () => {
    expect(validateScore(base({ wave: 12, time: 400, bossKills: 9 })).ok).toBe(false);
  });

  it('뽑기 없이 합성만 많은 기록은 거부한다', () => {
    expect(validateScore(base({ draws: 0, merges: 50 })).ok).toBe(false);
  });

  it('형식이 깨진 값을 거부한다', () => {
    expect(validateScore(base({ wave: Number.NaN }))).toMatchObject({ ok: false });
    expect(validateScore(base({ wave: -1 }))).toMatchObject({ ok: false });
    expect(validateScore(base({ date: 'yesterday' }))).toMatchObject({ ok: false });
    expect(validateScore(base({ playerId: 'x' }))).toMatchObject({ ok: false });
    expect(validateScore({ ...base(), v: 2 } as unknown as ScorePayload)).toMatchObject({ ok: false });
  });

  it('빠른 정상 플레이(2배속 + 웨이브 전멸)를 거부하지 않는다', () => {
    // scripts/rankbounds.ts 실측: 메타 만렙 최속 진행의 절반(2배속) 시간이 하한의 1.38배 이상.
    // 대표값 몇 개를 고정해 둔다 — 밸런스가 바뀌어 하한이 실제 플레이를 앞지르면 여기서 걸린다.
    const fast: [number, number][] = [
      [10, 90],
      [20, 200],
      [33, 360],
      [50, 570],
    ];
    for (const [wave, time] of fast) {
      expect({ wave, bound: Math.round(minRunSeconds(wave)) }).toMatchObject({ wave });
      expect(minRunSeconds(wave)).toBeLessThan(time);
    }
  });

  it('상한 함수는 웨이브에 따라 단조 증가한다', () => {
    for (let w = 5; w < 60; w++) {
      expect(minRunSeconds(w)).toBeGreaterThan(minRunSeconds(w - 1));
      expect(maxKills(w)).toBeGreaterThan(maxKills(w - 1));
    }
  });
});

describe('이름 정리', () => {
  it('제어문자와 줄바꿈을 지우고 길이를 자른다', () => {
    expect(sanitizeName(`나쁜${String.fromCharCode(10)}이름${String.fromCharCode(0)}`)).toBe('나쁜이름');
    expect(sanitizeName('가'.repeat(40))).toHaveLength(12);
    expect(sanitizeName('   ')).toBe('익명 알바');
    expect(sanitizeName(undefined)).toBe('익명 알바');
  });
});

describe('보드 정렬·삽입', () => {
  it('웨이브 → 시간 → 처치 순으로 정렬한다', () => {
    const { entries } = insertEntry([entry({ id: 'b', wave: 25 }), entry({ id: 'c', wave: 20, time: 300 })], entry({ id: 'a', wave: 30 }));
    expect(entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('한 사람의 기록은 최고 하나만 남는다', () => {
    const first = insertEntry([], entry({ id: 'a', wave: 20 }));
    const second = insertEntry(first.entries, entry({ id: 'a', wave: 30 }));
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0].wave).toBe(30);
    expect(second.improved).toBe(true);
  });

  it('더 낮은 기록은 기존 기록을 덮어쓰지 않는다', () => {
    const first = insertEntry([], entry({ id: 'a', wave: 30 }));
    const second = insertEntry(first.entries, entry({ id: 'a', wave: 10 }));
    expect(second.entries[0].wave).toBe(30);
    expect(second.improved).toBe(false);
  });

  it('보드 길이를 제한한다', () => {
    let entries: RankEntry[] = [];
    for (let i = 0; i < MAX_BOARD_ENTRIES + 30; i++) {
      entries = insertEntry(entries, entry({ id: `p${i}`, wave: i + 1 })).entries;
    }
    expect(entries).toHaveLength(MAX_BOARD_ENTRIES);
    expect(entries[0].wave).toBe(MAX_BOARD_ENTRIES + 30);
  });

  it('기록은 최고를 남기되 표시 이름은 최신으로 갱신한다', () => {
    const first = insertEntry([], entry({ id: 'a', wave: 30, name: '옛이름' }));
    const second = insertEntry(first.entries, entry({ id: 'a', wave: 10, name: '새이름' }));
    expect(second.entries[0].wave).toBe(30); // 기록은 그대로
    expect(second.entries[0].name).toBe('새이름'); // 이름만 갱신
    expect(second.improved).toBe(false);
  });

  it('이름만 바꾸면 기록은 그대로다', () => {
    const entries = [entry({ id: 'a', wave: 30, name: '옛이름' }), entry({ id: 'b', wave: 20, name: '남' })];
    const out = renameEntries(entries, 'a', '새이름');
    expect(out.changed).toBe(true);
    expect(out.entries[0]).toMatchObject({ wave: 30, name: '새이름' });
    expect(out.entries[1].name).toBe('남'); // 남의 이름은 안 건드린다
    expect(renameEntries(out.entries, 'a', '새이름').changed).toBe(false); // 같은 이름이면 쓰기 없음
    expect(renameEntries(entries, 'zzz', 'x').changed).toBe(false);
  });

  it('내 순위를 찾는다', () => {
    const entries = [entry({ id: 'a', wave: 30 }), entry({ id: 'b', wave: 20 })];
    expect(rankOf(entries, 'b')).toBe(2);
    expect(rankOf(entries, 'z')).toBeNull();
  });
});

describe('보드 이름', () => {
  it('허용된 이름만 통과시킨다', () => {
    expect(normalizeBoard('all', '2026-09-16')).toBe('all');
    expect(normalizeBoard('daily', '2026-09-16')).toBe('daily:2026-09-16');
    expect(normalizeBoard('daily-2026-01-02', '2026-09-16')).toBe('daily:2026-01-02');
    expect(normalizeBoard('board:../secret', '2026-09-16')).toBeNull();
    expect(normalizeBoard('rl:abc', '2026-09-16')).toBeNull();
  });
});

describe('저장 데이터 v3', () => {
  it('기존 저장에 랭킹 필드를 채워 넣는다', () => {
    const old = { version: 2, bestWave: 12, metaPoints: 500, achievements: ['first'] };
    const out = migrate(old as never);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.bestWave).toBe(12);
    expect(out.metaPoints).toBe(500);
    expect(out.achievements).toEqual(['first']);
    expect(out.playerId.length).toBeGreaterThanOrEqual(8);
    expect(out.nickname).toBe('');
    expect(out.rankOptIn).toBe(true);
  });

  it('이미 있는 playerId 는 바꾸지 않는다', () => {
    const id = 'b'.repeat(32);
    expect(migrate({ version: 3, playerId: id } as never).playerId).toBe(id);
  });
});

describe('전송 payload', () => {
  it('저장된 이름이 없으면 익명으로 나간다', () => {
    const save = defaultSave();
    const p = buildPayload(
      { wave: 10, time: 200, kills: 100, bestCombo: 20, merges: 10, draws: 40, bossKills: 1, coins: 5000, mvp: null, runTitle: '조용한 밤', challengeId: null },
      save,
      '2026-09-16',
    );
    expect(p.name).toBe('익명 알바');
    expect(p.playerId).toBe(save.playerId);
    expect(validateScore(p).ok).toBe(true);
  });
});
