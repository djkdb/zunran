import { it, expect } from 'vitest';
import { studySummary, type Study } from '../../platform/study';
it('재방문은 실행이 아니라 실제 플레이이며 관찰 시간이 끝나야 집계한다', () => {
  const day = 86400000;
  const study: Study = { version: 1, id: 'synthetic-test', enrolledAt: 0, events: [{ type: 'play', at: 1000 }, { type: 'open', at: day + 1000 }] };
  expect(studySummary(study, day).d1).toBe('관찰 중');
  expect(studySummary(study, 2 * day + 1000).d1).toBe('기록 없음');
  study.events.push({ type: 'play', at: day + 1000 });
  expect(studySummary(study, 2 * day + 1000).d1).toBe('재플레이');
  expect(studySummary(study, 2 * day + 1000).d7).toBe('관찰 중');
});
