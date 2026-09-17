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
const H = 260; // 아래 56px 은 제목이 얹히는 자리라 비워 둔다
// 좌표는 전부 땅선 기준이다. 높이를 바꾸면 하늘만 넓어지고 가게는 그대로 앉아 있어야 한다.
const GROUND = H - 70; // 손님이 서는 인도 선
const STORE_TOP = GROUND - 82; // 편의점 차양 높이
const BLD_BOT = STORE_TOP + 18; // 건너편 건물이 가게 뒤로 잘리는 선

interface Walker {
  x: number;
  speed: number;
  sprite: string;
  scale: number;
  flip: boolean;
}

const WALK_SPRITES = ['e_basic', 'e_runner', 'e_drunk', 'e_cig', 'e_delivery'];

export function StoreFrontScene({ muted = false }: { muted?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    // 별은 한 번만 정한다 (매 프레임 흔들리면 눈이 아프다)
    const stars = Array.from({ length: 44 }, (_, i) => ({
      x: ((i * 137) % W) + (i % 3),
      y: (i * 53) % (BLD_BOT - 50),
      a: 0.25 + ((i * 37) % 60) / 100,
      t: (i * 19) % 100,
    }));
    // 건너편 건물의 창문
    const windows = Array.from({ length: 34 }, (_, i) => ({
      x: 6 + ((i * 29) % (W - 20)),
      y: BLD_BOT - 38 + ((i * 17) % 34),
      lit: i % 3 !== 0,
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
      sky.addColorStop(0, '#0b0818');
      sky.addColorStop(0.45, '#171034');
      sky.addColorStop(1, '#241a44');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        const tw = 0.6 + 0.4 * Math.sin(now / 900 + s.t);
        ctx.fillStyle = `rgba(239,234,255,${s.a * tw})`;
        ctx.fillRect(s.x, s.y, 1, 1);
      }

      // ── 건너편 건물 실루엣 ──
      ctx.fillStyle = '#100b24';
      ctx.fillRect(0, BLD_BOT - 44, W, 44);
      ctx.fillStyle = '#0c0820';
      ctx.fillRect(0, BLD_BOT - 50, 74, 50);
      ctx.fillRect(126, BLD_BOT - 54, 58, 54);
      ctx.fillRect(248, BLD_BOT - 48, 88, 48);
      for (const w of windows) {
        ctx.fillStyle = w.lit ? 'rgba(255,216,77,0.16)' : 'rgba(239,234,255,0.05)';
        ctx.fillRect(w.x, w.y - 4, 3, 4);
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
      if (nextWalker <= 0 && walkers.length < 3) {
        const right = Math.random() < 0.5;
        walkers.push({
          x: right ? -20 : W + 20,
          speed: (right ? 1 : -1) * (14 + Math.random() * 26),
          sprite: WALK_SPRITES[Math.floor(Math.random() * WALK_SPRITES.length)],
          scale: 20 + Math.random() * 6,
          flip: !right,
        });
        nextWalker = 1400 + Math.random() * 2600;
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
      const fade = ctx.createLinearGradient(0, H - 78, 0, H - 44);
      fade.addColorStop(0, 'rgba(18,14,36,0)');
      fade.addColorStop(1, 'rgba(18,14,36,0.97)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, H - 78, W, 34);
      ctx.fillStyle = 'rgba(18,14,36,0.97)';
      ctx.fillRect(0, H - 44, W, 44);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  void muted;
  return <canvas className="front-scene" ref={ref} aria-hidden="true" />;
}
