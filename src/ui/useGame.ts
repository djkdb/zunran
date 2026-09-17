import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Engine } from '../game/engine/Engine';
import { Renderer } from '../game/render/Renderer';
import { vibe } from '../haptics';
import { audio } from '../game/audio/sfx';
import { UNIT_BY_ID } from '../game/data/units';
import type { ShiftCondition } from '../game/data/shiftConditions';
import type { ChallengeSpec, GameAction, MetaEffects, UISnapshot, UnitGroup } from '../game/types';
import { SLOT_HIT_RADIUS, THREE_AM_WAVE, SELL_REFUND } from '../game/config';
import type { BannerItem } from './Banner';

export interface UseGameOptions {
  meta: MetaEffects;
  bestWave: number;
  muted: boolean;
  autoMerge: boolean;
  autoSell: boolean;
  stageId?: string;
  order?: { pins: string[]; bans: string[] };
  condition?: ShiftCondition | null;
  challenge?: ChallengeSpec | null;
  onGameOver: (engine: Engine) => void;
}

// Engine ↔ React 브리지.
// - rAF 루프에서 engine.tick + renderer.render
// - UI 스냅샷은 10Hz 로만 setState (React 리렌더 최소화)
// - FX 큐를 배너/사운드/파티클로 분배
// 칸이 다 찼을 때 팔 유닛 하나를 고른다.
//  - 짝이 있는(count >= 2) 유닛은 절대 건드리지 않는다. 한두 개만 더 모으면 합성되기 때문.
//  - 전설·특수는 어렵게 얻은 것이라 자동으로 팔지 않는다.
//  - 남은 후보 중 게임이 매긴 판매가가 가장 낮은 것 = 가장 아깝지 않은 것을 판다.
// (예전에는 "1티어 일반·희귀"만 봤는데, 중반 보드는 합성으로 생긴 T2 단독과 T1 짝뿐이라
//  조건에 맞는 게 하나도 없어 칸이 영영 안 비었다.)
export function sellCandidate(groups: UnitGroup[]): number | null {
  let best: { id: number; price: number } | null = null;
  for (const g of groups) {
    if (g.count !== 1) continue;
    const def = UNIT_BY_ID[g.defId];
    if (!def || def.rarity === 'legendary' || def.rarity === 'special') continue;
    const price = SELL_REFUND[def.rarity] * Math.pow(2.2, g.tier - 1);
    if (!best || price < best.price) best = { id: g.unitIds[0], price };
  }
  return best?.id ?? null;
}

export function useGame(opts: UseGameOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [snap, setSnap] = useState<UISnapshot | null>(null);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const bannerId = useRef(1);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const onGameOverRef = useRef(opts.onGameOver);
  onGameOverRef.current = opts.onGameOver;
  const autoMergeRef = useRef(opts.autoMerge);
  autoMergeRef.current = opts.autoMerge;
  const autoSellRef = useRef(opts.autoSell);
  autoSellRef.current = opts.autoSell;
  const lastAutoMerge = useRef(0);
  const lastAutoSell = useRef(0);
  const timers = useRef(new Set<number>());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1500);
  }, []);

  // 거절된 조작의 횟수. 올라갈 때마다 UI 가 한 번 흔들린다.
  const [denied, setDenied] = useState(0);
  const actRef = useRef<(a: GameAction) => void>(() => {});
  const act = useCallback(
    (action: GameAction) => {
      const engine = engineRef.current;
      if (!engine) return;
      const r = engine.dispatch(action);
      if (!r.ok) {
        if (r.reason) showToast(r.reason);
        // 눌렀는데 아무 일도 안 일어나면 버그로 보인다. 흔들고 낮은 음으로 거절을 알린다.
        setDenied((n) => n + 1);
        audio.play('deny');
      }
      setSnap(engine.snapshot());
    },
    [showToast],
  );
  actRef.current = act;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new Engine({ meta: opts.meta, bestWave: opts.bestWave, order: opts.order, condition: opts.condition, challenge: opts.challenge ?? null, stageId: opts.stageId });
    const renderer = new Renderer(canvas);
    engineRef.current = engine;
    rendererRef.current = renderer;
    // 디버그/테스트/릴스 촬영용: 콘솔에서 __game.engine 으로 상태 조작 가능
    (window as unknown as { __game?: unknown }).__game = { engine, renderer };
    audio.setMuted(opts.muted);
    if (audio.isUnlocked()) audio.startBgm();
    setSnap(engine.snapshot());
    const pushBanners = (items: BannerItem[]) => {
      setBanners((prev) => [...prev, ...items]);
      for (const b of items) {
        const t = window.setTimeout(() => {
          timers.current.delete(t);
          setBanners((prev) => prev.filter((x) => x.id !== b.id));
        }, b.dur * 1000);
        timers.current.add(t);
      }
    };
    pushBanners([{ id: bannerId.current++, text: 'WAVE 1', sub: '유닛을 뽑아 배치하세요', style: 'info', dur: 2.5 }]);

    // 캔버스 크기: 부모 컨테이너의 정사각형에 맞춤
    const parent = canvas.parentElement!;
    const fit = () => {
      const r = parent.getBoundingClientRect();
      const size = Math.max(200, Math.floor(Math.min(r.width, r.height)));
      renderer.resize(size);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(parent);

    let raf = 0;
    let last = performance.now();
    let lastSnap = 0;
    let gameOverSent = false;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.tick(dt);
      const fx = engine.drainFx();
      if (fx.length) {
        renderer.handleFx(fx, engine.state);
        const newBanners: BannerItem[] = [];
        for (const f of fx) {
          if (f.type === 'sfx') {
            audio.play(f.id);
            // 소리를 끈 사람도 손으로는 느낄 수 있게, 진동은 음소거와 별개로 둔다.
            if (f.id === 'legendary' || f.id === 'boss') vibe('big');
            else if (f.id === 'damage') vibe('damage');
            else if (f.id === 'gameover') vibe('gameover');
            else if (f.id === 'mergeUp' || f.id === 'record') vibe('hit');
          } else if (f.type === 'banner') {
            newBanners.push({ id: bannerId.current++, text: f.text, sub: f.sub, style: f.style, dur: f.dur ?? 2 });
          }
        }
        if (newBanners.length) pushBanners(newBanners);
      }
      renderer.render(engine.state, now);
      // 자동 합성: 0.45초에 하나씩 (연출이 겹치지 않게)
      if (autoMergeRef.current && engine.state.phase === 'playing' && now - lastAutoMerge.current > 450) {
        const g = engine.snapshot().groups.find((x) => x.mergeable);
        if (g) {
          engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
          lastAutoMerge.current = now;
        }
      }
      // 자동 정리: 칸이 다 찼고 합성할 것도 없을 때, 짝이 없는 1티어 유닛을 하나만 판다.
      // 칸이 남아 있으면 나중에 짝이 생길 수 있으므로 건드리지 않는다.
      // 한 번에 하나씩만 파는 이유: 몰아서 팔면 그 순간 화력이 꺼진다.
      if (autoSellRef.current && engine.state.phase === 'playing' && now - lastAutoSell.current > 900) {
        const sn = engine.snapshot();
        // 합성 가능한 묶음이 있어도 판다. 파는 대상은 항상 짝이 없는(count === 1) 유닛이라
        // 합성 재료를 없앨 일이 없고, 자동 합성이 꺼져 있으면 여기서 막혀 칸이 영영 안 빈다.
        if (sn.emptySlots === 0) {
          const target = sellCandidate(sn.groups);
          if (target) {
            engine.dispatch({ type: 'SELL', unitId: target });
            lastAutoSell.current = now;
          }
        }
      }
      if (now - lastSnap > 100) {
        lastSnap = now;
        setSnap(engine.snapshot());
        audio.setBgmMode(engine.state.bossAlive || engine.state.wave >= THREE_AM_WAVE ? 'tense' : 'normal');
      }
      if (engine.state.phase === 'gameover' && !gameOverSent) {
        gameOverSent = true;
        audio.stopBgm();
        window.setTimeout(() => onGameOverRef.current(engine), 900);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // 오디오 언락 + BGM (첫 사용자 입력 시)
    const unlock = () => {
      audio.unlock();
      audio.startBgm();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    // 탭이 숨겨지면 자동 일시정지
    const onVis = () => {
      if (document.hidden && engine.state.phase === 'playing' && !engine.state.paused) engine.dispatch({ type: 'TOGGLE_PAUSE' });
    };
    document.addEventListener('visibilitychange', onVis);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        actRef.current({ type: 'TOGGLE_PAUSE' });
      } else if (e.key === 'd' || e.key === 'D') actRef.current({ type: 'DRAW' });
      else if (e.key === 'Escape') actRef.current({ type: 'SELECT', unitId: null });
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      audio.stopBgm();
      for (const t of timers.current) clearTimeout(t);
      timers.current.clear();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      engineRef.current = null;
    };
    // 한 판 = 한 번 마운트. opts 변경으로 재생성하지 않는다 (App 이 key 로 리마운트).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

// 논리 좌표에서 가장 가까운 슬롯
  const slotAt = useCallback((clientX: number, clientY: number): number => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!engine || !renderer) return -1;
    const p = renderer.toLogical(clientX, clientY);
    let best = -1;
    let bestD = SLOT_HIT_RADIUS * SLOT_HIT_RADIUS;
    for (const s of engine.state.slots) {
      const dx = s.x - p.x;
      const dy = s.y - 16 - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = s.index;
      }
    }
    return best;
  }, []);

  // 탭과 드래그를 함께 지원한다.
  // - 짧게 누르면(움직임 < 10px) 기존 탭 동작: 선택 / 이동 / 교환
  // - 유닛을 끌면 손가락을 따라오고, 놓은 자리로 이동하거나 교환한다
  const drag = useRef<{ unitId: number; fromSlot: number; moved: boolean; pointerId: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (!engine || !renderer || engine.state.phase !== 'playing') return;
      const slot = slotAt(e.clientX, e.clientY);
      const unitId = slot >= 0 ? engine.state.slots[slot].unitId : null;
      if (slot >= 0 && unitId !== null) {
        drag.current = { unitId, fromSlot: slot, moved: false, pointerId: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = renderer.toLogical(e.clientX, e.clientY);
        renderer.interaction = { dragUnitId: null, dragX: p.x, dragY: p.y, hoverSlot: null };
      } else {
        drag.current = null;
      }
    },
    [slotAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = drag.current;
      const renderer = rendererRef.current;
      if (!d || !renderer || d.pointerId !== e.pointerId) return;
      const p = renderer.toLogical(e.clientX, e.clientY);
      if (!d.moved) {
        const from = engineRef.current?.state.slots[d.fromSlot];
        if (from && Math.hypot(from.x - p.x, from.y - 16 - p.y) < 10) return; // 아직 탭일 수 있다
        d.moved = true;
        engineRef.current?.dispatch({ type: 'SELECT', unitId: d.unitId });
      }
      const over = slotAt(e.clientX, e.clientY);
      renderer.interaction = { dragUnitId: d.unitId, dragX: p.x, dragY: p.y, hoverSlot: over >= 0 && over !== d.fromSlot ? over : null };
    },
    [slotAt],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = drag.current;
      const renderer = rendererRef.current;
      drag.current = null;
      if (renderer) renderer.interaction = { dragUnitId: null, dragX: 0, dragY: 0, hoverSlot: null };
      const engine = engineRef.current;
      if (!engine) return;
      const slot = slotAt(e.clientX, e.clientY);
      if (d && d.moved) {
        if (slot >= 0 && slot !== d.fromSlot) act({ type: 'MOVE', unitId: d.unitId, slot });
        else act({ type: 'SELECT', unitId: d.unitId });
        return;
      }
      // 드래그가 아니면 기존 탭 동작
      if (slot >= 0) act({ type: 'TAP_SLOT', slot });
      else if (engine.state.selectedUnitId !== null) act({ type: 'SELECT', unitId: null });
    },
    [act, slotAt],
  );

  return { canvasRef, snap, banners, act, toast, denied, onPointerDown, onPointerMove, endDrag, engineRef };
}
