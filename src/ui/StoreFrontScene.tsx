import { useEffect, useRef } from 'react';
import { rasterize } from '../game/render/sprites';

// 새벽 3시 편의점 앞. 시작 화면의 배경이자 이 게임의 첫인상이다.
//
// 홈 화면이 "상자 여섯 개가 쌓인 웹페이지"처럼 보이던 문제를 고치기 위해 만들었다.
// 게임은 켜는 순간 분위기가 있어야 한다 — 읽을 게 아니라 볼 게 있어야 한다.
//
// 캔버스 한 장에 밤하늘 · 건너편 건물 · 편의점 유리창 · 깜빡이는 24H 간판 ·
// 가끔 지나가는 손님을 그린다. 손님 스프라이트는 게임에서 쓰는 것을 그대로 쓴다.

const W = 360;

// 지점마다 거리가 다르다. 지나가는 사람 수가 곧 난이도라서,
// 그림만 봐도 어느 쪽이 빡센 자리인지 읽힌다.
export interface SceneVariant {
  sky: [string, string, string];
  buildings: number; // 건너편 건물 실루엣 수 (0 = 허허벌판)
  litRatio: number; // 켜진 창문 비율
  neon: number; // 옆 가게 네온 간판 수
  walkEvery: [number, number]; // 손님 간격(ms)
  maxWalkers: number;
}

export const SCENE_VARIANTS: Record<string, SceneVariant> = {
  // 국도변 시골점 — 건너편에 아무것도 없다. 별만 많다.
  country: { sky: ['#0a0716', '#141029', '#1d1738'], buildings: 1, litRatio: 0.25, neon: 0, walkEvery: [4200, 7000], maxWalkers: 1 },
  // 동네 골목점 — 건물이 몇 채, 창문이 반쯤 켜져 있다.
  alley: { sky: ['#0b0818', '#171034', '#241a44'], buildings: 3, litRatio: 0.66, neon: 1, walkEvery: [1400, 3400], maxWalkers: 3 },
  // 역앞 술집가점 — 네온이 줄지어 있고 사람이 끊이지 않는다.
  downtown: { sky: ['#12081f', '#2a0f3d', '#3d1a4a'], buildings: 5, litRatio: 0.92, neon: 3, walkEvery: [320, 900], maxWalkers: 6 },
};

interface Props {
  muted?: boolean;
  variant?: string; // SCENE_VARIANTS 의 키 (없으면 alley)
  height?: number; // 캔버스 높이. 좌표는 땅선 기준이라 하늘만 넓어진다
  fade?: boolean; // 아래쪽을 어둡게 (제목을 얹는 홈 화면용)
  dim?: boolean; // 잠긴 지점: 셔터 내린 밤
}

interface Walker {
  x: number;
  speed: number;
  sprite: string;
  scale: number;
  flip: boolean;
}

const WALK_SPRITES = ['e_basic', 'e_runner', 'e_drunk', 'e_cig', 'e_delivery'];

export function StoreFrontScene({ muted = false, variant = 'alley', height = 260, fade = true, dim = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const V = SCENE_VARIANTS[variant] ?? SCENE_VARIANTS.alley;
    const H = height;
    // 좌표는 전부 땅선 기준이다. 높이를 바꾸면 하늘만 넓어지고 가게는 그대로 앉아 있어야 한다.
    const GROUND = H - Math.round(H * 0.27);
    const STORE_TOP = GROUND - 82;
    const BLD_BOT = STORE_TOP + 18;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    // 별은 한 번만 정한다 (매 프레임 흔들리면 눈이 아프다)
    const starCount = Math.max(8, Math.round(44 * (1 - V.buildings * 0.1) * Math.min(1, H / 200)));
    const stars = Array.from({ length: starCount }, (_, i) => ({
      x: ((i * 137) % W) + (i % 3),
      // 낮은 캔버스(지점 카드)에서는 BLD_BOT - 50 이 음수가 되어
      // 나머지 연산이 음수 좌표를 뱉는다. 하늘 높이를 최소 8px 로 잡는다.
      y: (i * 53) % Math.max(8, BLD_BOT - 50),
      a: 0.25 + ((i * 37) % 60) / 100,
      t: (i * 19) % 100,
    }));
    // 건너편 건물의 창문
    const windows = Array.from({ length: V.buildings * 11 }, (_, i) => ({
      x: 6 + ((i * 29) % (W - 20)),
      y: BLD_BOT - 38 + ((i * 17) % 34),
      lit: ((i * 37) % 100) / 100 < V.litRatio,
    }));

    const walkers: Walker[] = [];
    let raf = 0;
    let t0 = performance.now();
    let nextWalker = 600;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;

      // ── 밤하늘 ──
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, V.sky[0]);
      sky.addColorStop(0.45, V.sky[1]);
      sky.addColorStop(1, V.sky[2]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        const tw = 0.6 + 0.4 * Math.sin(now / 900 + s.t);
        ctx.fillStyle = `rgba(239,234,255,${s.a * tw})`;
        ctx.fillRect(s.x, s.y, 1, 1);
      }

      // ── 건너편 건물 실루엣 ──
      if (V.buildings > 0) {
        ctx.fillStyle = '#100b24';
        ctx.fillRect(0, BLD_BOT - 44, W, 44);
        ctx.fillStyle = '#0c0820';
        const shapes: [number, number, number][] = [[0, 50, 74], [126, 54, 58], [248, 48, 88], [80, 44, 42], [196, 52, 48]];
        for (let i = 0; i < Math.min(V.buildings, shapes.length); i++) {
          const [x, h2, w2] = shapes[i];
          ctx.fillRect(x, BLD_BOT - h2, w2, h2);
        }
      }
      for (const w of windows) {
        ctx.fillStyle = w.lit ? 'rgba(255,216,77,0.16)' : 'rgba(239,234,255,0.05)';
        ctx.fillRect(w.x, w.y - 4, 3, 4);
      }

      // ── 옆 가게 네온 ──
      // 가게보다 먼저 그린다. 뒤에 그리면 24H 간판을 가로지른다.
      // 우리 가게 자리(sx 62~298)는 피해서 양옆에만 세운다.
      for (let i = 0; i < V.neon; i++) {
        const nx = i === 0 ? 24 : i === 1 ? 316 : 46;
        const flick = Math.floor(now / 90 + i * 7) % 41 === 0 ? 0.3 : 1;
        ctx.globalAlpha = flick * (0.55 + 0.2 * Math.sin(now / 700 + i));
        ctx.fillStyle = i % 2 === 0 ? '#ff4d8d' : '#ffd84d';
        ctx.fillRect(nx, BLD_BOT - 42, 7, 26);
        ctx.globalAlpha = 1;
      }

      // ── 도로 · 인도 ──
      ctx.fillStyle = '#0e0a1e';
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = '#1b1338';
      ctx.fillRect(0, GROUND - 6, W, 7);

      // ── 편의점 본체 ──
      const sx = 62;
      const sw = 236;
      ctx.fillStyle = '#241c45';
      ctx.fillRect(sx, STORE_TOP, sw, 76);
      // 민트/크림 띠 간판과 계단형 처마.
      ctx.fillStyle = '#4b4167';
      ctx.fillRect(sx - 4, STORE_TOP - 3, sw + 8, 7);
      ctx.fillStyle = '#4fe3d0';
      ctx.fillRect(sx, STORE_TOP + 4, sw, 3);
      ctx.fillStyle = '#e6d9b5';
      ctx.fillRect(sx, STORE_TOP + 7, sw, 3);
      // 유리창 (안쪽 조명)
      const glow = ctx.createLinearGradient(0, STORE_TOP + 12, 0, STORE_TOP + 74);
      glow.addColorStop(0, 'rgba(180,255,245,0.20)');
      glow.addColorStop(1, 'rgba(180,255,245,0.05)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx + 8, STORE_TOP + 12, sw - 16, 58);
      // 창틀
      ctx.fillStyle = '#332a5c';
      for (let x = sx + 8; x < sx + sw - 8; x += 44) ctx.fillRect(x, STORE_TOP + 12, 2, 58);
      ctx.fillRect(sx + 8, STORE_TOP + 12, sw - 16, 2);
      // 안쪽 진열대 실루엣
      ctx.fillStyle = 'rgba(79,227,208,0.18)';
      ctx.fillRect(sx + 18, STORE_TOP + 44, 52, 12);
      ctx.fillRect(sx + 96, STORE_TOP + 44, 52, 12);
      ctx.fillRect(sx + 174, STORE_TOP + 44, 44, 12);
      // 유리 너머 색별 상품과 가격표. 작은 크기에서도 편의점으로 읽힌다.
      const products = ['#73b8c2', '#cbb16e', '#ab779b', '#8fa86f'];
      for (const left of [sx + 18, sx + 174]) {
        for (let col = 0; col < 5; col++) {
          ctx.fillStyle = products[col % products.length];
          ctx.fillRect(left + col * 8, STORE_TOP + 38, 5, 9);
          ctx.fillRect(left + col * 8, STORE_TOP + 53, 5, 7);
          ctx.fillStyle = '#ddd3bd';
          ctx.fillRect(left + col * 8, STORE_TOP + 48, 4, 2);
        }
      }
      // 가게 밖 음료 자판기와 작은 입간판.
      ctx.fillStyle = '#332a50';
      ctx.fillRect(sx + sw + 7, STORE_TOP + 33, 22, 43);
      ctx.fillStyle = '#76b7b5';
      ctx.fillRect(sx + sw + 10, STORE_TOP + 37, 16, 22);
      for (let row = 0; row < 3; row++) {
        ctx.fillStyle = products[row];
        for (let col = 0; col < 3; col++) ctx.fillRect(sx + sw + 12 + col * 4, STORE_TOP + 40 + row * 6, 2, 4);
      }
      ctx.fillStyle = '#151024';
      ctx.fillRect(sx + sw + 12, STORE_TOP + 65, 12, 5);
      ctx.fillStyle = '#cbb16e';
      ctx.fillRect(sx - 23, STORE_TOP + 52, 16, 24);
      ctx.fillStyle = '#261b38';
      ctx.fillRect(sx - 21, STORE_TOP + 54, 12, 17);
      ctx.fillStyle = '#efe1b7';
      ctx.fillRect(sx - 19, STORE_TOP + 58, 8, 2);
      ctx.fillRect(sx - 19, STORE_TOP + 63, 5, 2);
      // 카운터 안의 알바 (이 게임의 주인공)
      const alba = rasterize('alba') ?? rasterize('e_basic');
      if (alba) ctx.drawImage(alba, sx + 150, STORE_TOP + 30, 24, 24);
      // 출입문
      ctx.fillStyle = '#0d0a1c';
      ctx.fillRect(sx + sw / 2 - 18, STORE_TOP + 32, 36, 44);
      ctx.fillStyle = 'rgba(180,255,245,0.12)';
      ctx.fillRect(sx + sw / 2 - 15, STORE_TOP + 36, 30, 40);

      // ── 24H 네온 간판 (가끔 깜빡인다) ──
      const flickerSeed = Math.floor(now / 120);
      const flicker = flickerSeed % 53 === 0 || flickerSeed % 53 === 2 ? 0.35 : 1;
      const pulse = 0.82 + 0.18 * Math.sin(now / 520);
      ctx.save();
      ctx.globalAlpha = flicker * pulse;
      // 간판 뒤 발광
      const signY = STORE_TOP - 10;
      const halo = ctx.createRadialGradient(sx + sw / 2, signY, 4, sx + sw / 2, signY, 96);
      halo.addColorStop(0, 'rgba(79,227,208,0.34)');
      halo.addColorStop(1, 'rgba(79,227,208,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(sx - 60, STORE_TOP - 44, sw + 120, 76);
      ctx.fillStyle = '#0d0a1c';
      ctx.fillRect(sx + sw / 2 - 52, signY - 12, 104, 24);
      ctx.strokeStyle = '#4fe3d0';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + sw / 2 - 52, signY - 12, 104, 24);
      ctx.fillStyle = '#4fe3d0';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('24H', sx + sw / 2, signY + 1);
      ctx.restore();

      // ── 지나가는 손님 ──
      nextWalker -= dt * 1000;
      if (nextWalker <= 0 && walkers.length < V.maxWalkers) {
        const right = Math.random() < 0.5;
        walkers.push({
          x: right ? -20 : W + 20,
          speed: (right ? 1 : -1) * (14 + Math.random() * 26),
          sprite: WALK_SPRITES[Math.floor(Math.random() * WALK_SPRITES.length)],
          scale: 20 + Math.random() * 6,
          flip: !right,
        });
        nextWalker = V.walkEvery[0] + Math.random() * (V.walkEvery[1] - V.walkEvery[0]);
      }
      for (const w of walkers) {
        w.x += w.speed * dt;
        const img = rasterize(w.sprite);
        if (!img) continue;
        ctx.save();
        ctx.translate(w.x, GROUND);
        ctx.scale(w.flip ? -1 : 1, 1);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(img, -w.scale / 2, -w.scale, w.scale, w.scale);
        ctx.restore();
        // 바닥 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(w.x, GROUND + 1, w.scale * 0.3, w.scale * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = walkers.length - 1; i >= 0; i--) {
        if (walkers[i].x < -40 || walkers[i].x > W + 40) walkers.splice(i, 1);
      }

      // ── 아래쪽 어둡게 (제목이 얹힐 자리) ──
      if (fade) {
        const g2 = ctx.createLinearGradient(0, H - 78, 0, H - 44);
        g2.addColorStop(0, 'rgba(18,14,36,0)');
        g2.addColorStop(1, 'rgba(18,14,36,0.97)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, H - 78, W, 34);
        ctx.fillStyle = 'rgba(18,14,36,0.97)';
        ctx.fillRect(0, H - 44, W, 44);
      }
      // 잠긴 지점은 아직 남의 가게다. 밤만 깔아 둔다.
      if (dim) {
        ctx.fillStyle = 'rgba(11,8,24,0.62)';
        ctx.fillRect(0, 0, W, H);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [variant, height, fade, dim]);

  void muted;
  return <canvas className="front-scene" ref={ref} aria-hidden="true" style={{ aspectRatio: `${W} / ${height}` }} />;
}
