import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from '../game/engine/Engine';
import { Renderer } from '../game/render/Renderer';
import { audio } from '../game/audio/sfx';
import type { GameAction, MetaEffects, UISnapshot } from '../game/types';
import { SLOT_HIT_RADIUS, THREE_AM_WAVE } from '../game/config';
import type { BannerItem } from './Banner';

export interface UseGameOptions {
  meta: MetaEffects;
  bestWave: number;
  muted: boolean;
  autoMerge: boolean;
  onGameOver: (engine: Engine) => void;
}

// Engine ↔ React 브리지.
// - rAF 루프에서 engine.tick + renderer.render
// - UI 스냅샷은 10Hz 로만 setState (React 리렌더 최소화)
// - FX 큐를 배너/사운드/파티클로 분배
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
  const lastAutoMerge = useRef(0);
  const timers = useRef(new Set<number>());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1500);
  }, []);

  const actRef = useRef<(a: GameAction) => void>(() => {});
  const act = useCallback(
    (action: GameAction) => {
      const engine = engineRef.current;
      if (!engine) return;
      const r = engine.dispatch(action);
      if (!r.ok && r.reason) showToast(r.reason);
      setSnap(engine.snapshot());
    },
    [showToast],
  );
  actRef.current = act;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new Engine({ meta: opts.meta, bestWave: opts.bestWave });
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
          if (f.type === 'sfx') audio.play(f.id);
          else if (f.type === 'banner') newBanners.push({ id: bannerId.current++, text: f.text, sub: f.sub, style: f.style, dur: f.dur ?? 2 });
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

  // 캔버스 탭 → 슬롯 판정
  const onCanvasPointer = useCallback(
    (clientX: number, clientY: number) => {
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (!engine || !renderer) return;
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
      if (best >= 0) act({ type: 'TAP_SLOT', slot: best });
      else if (engine.state.selectedUnitId !== null) act({ type: 'SELECT', unitId: null });
    },
    [act],
  );

  return { canvasRef, snap, banners, act, toast, onCanvasPointer, engineRef };
}
