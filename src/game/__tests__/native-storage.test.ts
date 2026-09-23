import { beforeEach, expect, it, vi } from 'vitest';
const prefs = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: prefs }));
beforeEach(() => {
  vi.resetModules();
  prefs.get.mockReset().mockResolvedValue({ value: null });
  prefs.set.mockReset().mockResolvedValue(undefined);
  prefs.remove.mockReset().mockResolvedValue(undefined);
});
it('시작할 때 네이티브 저장을 읽고 쓰기/삭제 순서를 보존한다', async () => {
  prefs.get.mockImplementation(async ({ key }) => ({ value: key === 'cvs-night-shift:v1' ? 'saved' : null }));
  const store = await import('../../platform/storage');
  await store.initializeStorage();
  expect(store.readStored('cvs-night-shift:v1')).toBe('saved');
  const order: string[] = [];
  prefs.set.mockImplementation(async ({ value }) => { order.push(value); });
  prefs.remove.mockImplementation(async () => { order.push('removed'); });
  const a = store.writeStored('zunran:run:v1', 'old');
  const b = store.writeStored('zunran:run:v1', 'new');
  const c = store.writeStored('zunran:run:v1', null);
  expect(await Promise.all([a, b, c])).toEqual([true, true, true]);
  expect(order).toEqual(['old', 'new', 'removed']);
});
it('네이티브 저장 실패를 성공으로 알리지 않고 다음 쓰기는 재시도할 수 있다', async () => {
  const store = await import('../../platform/storage');
  prefs.set.mockRejectedValueOnce(new Error('disk full'));
  expect(await store.writeStored('cvs-night-shift:v1', 'first')).toBe(false);
  expect(await store.writeStored('cvs-night-shift:v1', 'retry')).toBe(true);
});
it('초기 읽기 실패 시 빈 기록으로 덮어쓰지 않고 부팅을 중단한다', async () => {
  const store = await import('../../platform/storage');
  prefs.get.mockRejectedValueOnce(new Error('unavailable'));
  await expect(store.initializeStorage()).rejects.toThrow('unavailable');
  expect(prefs.set).not.toHaveBeenCalled();
});
