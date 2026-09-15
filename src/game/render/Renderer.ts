import type { Enemy, FxEvent, GameState, Unit } from '../types';
import { FIELD_W, FIELD_H, PATH, SLOT_ROWS, SLOT_COLS, RARITY_COLOR, CHECKOUT_POS, AISLE_NAMES, THREE_AM_WAVE } from '../config';
import { UNIT_BY_ID } from '../data/units';
import { ENEMY_BY_ID } from '../data/enemies';
import { rasterize, drawFallback, getSprite } from './sprites';
import { unitRange, auraRadius, unitDef } from '../engine/helpers';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: 'spark' | 'ring' | 'puff' | 'star';
  radius?: number;
}

const UNIT_SCALE = 3; // 16px → 48px
const ENEMY_SCALE = 2.6;
const BOSS_SCALE = 2.6;

// Canvas 2D 렌더러. 엔진 상태를 읽기만 하고, FX 이벤트로 파티클/흔들림/플래시를 만든다.
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private particles: Particle[] = [];
  private shake = 0;
  private flash: { color: string; life: number } | null = null;
  private spawnPulse = new Map<number, number>(); // unitId → 남은 등장 연출 시간
  private mergePulse: { slot: number; life: number; color: string } | null = null;
  private lastTime = 0;
  private rainDrops: { x: number; y: number; s: number }[] = [];
  private frame = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 60; i++) this.rainDrops.push({ x: Math.random() * FIELD_W, y: Math.random() * FIELD_H, s: 300 + Math.random() * 200 });
  }

  // 실제 표시 크기(css px)에 맞춰 backing 크기를 잡는다. 모바일에서 과다 렌더, 큰 화면에서 블러 업스케일 방지.
  resize(cssSize: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(1, Math.round(cssSize * dpr));
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    this.ctx.setTransform(px / FIELD_W, 0, 0, px / FIELD_H, 0, 0);
  }

  handleFx(fx: FxEvent[], state: GameState): void {
    for (const f of fx) {
      switch (f.type) {
        case 'shake':
          this.shake = Math.max(this.shake, f.amount);
          break;
        case 'flash':
          this.flash = { color: f.color, life: 0.35 };
          break;
        case 'hit':
          this.burst(f.x, f.y, f.color, f.big ? 12 : 4, f.big ? 140 : 70, 'spark');
          break;
        case 'death':
          this.burst(f.x, f.y, f.color, f.boss ? 40 : 8, f.boss ? 220 : 90, 'puff');
          if (f.boss) this.ring(f.x, f.y, 120, '#ffd23f');
          break;
        case 'explode':
          this.ring(f.x, f.y, f.radius, f.color);
          this.burst(f.x, f.y, f.color, 8, 110, 'spark');
          break;
        case 'skill':
          this.ring(f.x, f.y, f.radius, f.color);
          break;
        case 'unitSpawn': {
          this.spawnPulse.set(f.unitId, 0.6);
          const u = state.units.find((x) => x.id === f.unitId);
          if (u) {
            const s = state.slots[u.slot];
            this.burst(s.x, s.y - 20, RARITY_COLOR[f.rarity], f.rarity === 'legendary' ? 40 : f.rarity === 'epic' ? 20 : 8, f.rarity === 'legendary' ? 200 : 100, 'star');
            if (f.rarity === 'legendary' || f.rarity === 'epic') this.ring(s.x, s.y - 20, 90, RARITY_COLOR[f.rarity]);
          }
          break;
        }
        case 'merge': {
          const s = state.slots[f.slot];
          this.mergePulse = { slot: f.slot, life: 0.7, color: RARITY_COLOR[f.rarity] };
          this.burst(s.x, s.y - 20, RARITY_COLOR[f.rarity], f.upgraded ? 30 : 14, f.upgraded ? 180 : 110, 'star');
          this.ring(s.x, s.y - 20, f.upgraded ? 110 : 60, RARITY_COLOR[f.rarity]);
          break;
        }
        default:
          break;
      }
    }
  }

  private burst(x: number, y: number, color: string, n: number, speed: number, kind: Particle['kind']): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.5 + Math.random() * 0.4, maxLife: 0.9, color, size: kind === 'puff' ? 4 + Math.random() * 4 : 2 + Math.random() * 2, kind });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  private ring(x: number, y: number, radius: number, color: string): void {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color, size: 2, kind: 'ring', radius });
  }

  // ───────────── 메인 렌더 ─────────────

  render(state: GameState, now: number): void {
    const dt = this.lastTime ? Math.min(0.05, (now - this.lastTime) / 1000) : 0.016;
    this.lastTime = now;
    this.frame++;
    const ctx = this.ctx;
    if (!this.bg) this.bg = this.buildBackground();

    // 파티클/연출 진행
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      p.vx *= 0.96;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 40);
    if (this.flash) {
      this.flash.life -= dt;
      if (this.flash.life <= 0) this.flash = null;
    }
    for (const [id, t] of this.spawnPulse) {
      if (t - dt <= 0) this.spawnPulse.delete(id);
      else this.spawnPulse.set(id, t - dt);
    }
    if (this.mergePulse) {
      this.mergePulse.life -= dt;
      if (this.mergePulse.life <= 0) this.mergePulse = null;
    }

    ctx.save();
    ctx.clearRect(0, 0, FIELD_W, FIELD_H);
    if (this.shake > 0) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    ctx.drawImage(this.bg, 0, 0, FIELD_W, FIELD_H);

    this.drawSlots(state);
    this.drawAuras(state);
    // 유닛과 손님을 y 순으로 정렬해 겹침 처리
    const drawables: { y: number; draw: () => void }[] = [];
    for (const u of state.units) drawables.push({ y: state.slots[u.slot].y, draw: () => this.drawUnit(state, u, now) });
    for (const e of state.enemies) drawables.push({ y: e.y, draw: () => this.drawEnemy(state, e, now) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    this.drawProjectiles(state);
    this.drawParticles();
    this.drawBubbles(state);
    this.drawFloaters(state);
    this.drawOverlays(state, now);
    ctx.restore();
  }

  // ───────────── 배경 (한 번만 그려서 캐시) ─────────────

  private buildBackground(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = FIELD_W * dpr;
    c.height = FIELD_H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // 바닥 타일
    ctx.fillStyle = '#1b2230';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    ctx.fillStyle = '#202a3a';
    for (let y = 0; y < FIELD_H; y += 32) for (let x = (y / 32) % 2 === 0 ? 0 : 32; x < FIELD_W; x += 64) ctx.fillRect(x, y, 32, 32);

    // 벽 (상단)
    ctx.fillStyle = '#2b3a52';
    ctx.fillRect(0, 0, FIELD_W, 44);
    ctx.fillStyle = '#354a68';
    ctx.fillRect(0, 40, FIELD_W, 4);
    // 창문 (밤)
    for (let i = 0; i < 4; i++) {
      const x = 150 + i * 120;
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(x, 6, 80, 30);
      ctx.fillStyle = '#1e2a44';
      ctx.fillRect(x + 4, 10, 30, 22);
      ctx.fillRect(x + 46, 10, 30, 22);
      // 별
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(x + 12, 16, 2, 2);
      ctx.fillRect(x + 60, 22, 2, 2);
    }
    // 입구 문 + 24H 간판
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(22, 0, 60, 44);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(26, 4, 52, 36);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(50, 4, 3, 36);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('24H', 52, 30);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('입구', 52, 58);

    // 통로 (손님이 걷는 길): 밝은 바닥
    ctx.strokeStyle = '#2f3b52';
    ctx.lineWidth = 46;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(PATH[1].x, 44);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.strokeStyle = '#3a4862';
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.moveTo(PATH[1].x, 44);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    // 통로 화살표
    ctx.fillStyle = '#4b5b78';
    const arrows: [number, number, number][] = [
      [200, 118, 0],
      [400, 118, 0],
      [588, 200, 90],
      [400, 276, 180],
      [200, 276, 180],
      [52, 356, 90],
      [200, 434, 0],
      [400, 434, 0],
      [588, 510, 90],
      [470, 582, 180],
    ];
    for (const [x, y, rot] of arrows) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(-6, -7);
      ctx.lineTo(6, 0);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 진열대 (슬롯 줄): 통로 사이 블록
    const shelfColors = [
      ['#3b82f6', '#22d3ee', '#a78bfa', '#f472b6'],
      ['#f59e0b', '#ef4444', '#84cc16', '#f97316'],
      ['#ef4444', '#f97316', '#facc15', '#dc2626'],
    ];
    SLOT_ROWS.forEach((y, row) => {
      const top = y - 40;
      const h = 70;
      ctx.fillStyle = '#334155';
      ctx.fillRect(84, top, FIELD_W - 168, h);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(84, top + h - 6, FIELD_W - 168, 6);
      ctx.fillStyle = '#475569';
      ctx.fillRect(84, top, FIELD_W - 168, 3);
      // 상품 (작은 색 블록) — 슬롯 사이 빈 공간에만
      const cols = shelfColors[row];
      for (let x = 92; x < FIELD_W - 92; x += 12) {
        const nearSlot = SLOT_COLS.some((sx) => Math.abs(sx - x) < 30);
        if (nearSlot) continue;
        ctx.fillStyle = cols[Math.floor(x / 12) % cols.length];
        ctx.fillRect(x, top + 8, 8, 10);
        ctx.fillStyle = cols[(Math.floor(x / 12) + 1) % cols.length];
        ctx.fillRect(x, top + 24, 8, 10);
      }
      // 코너 이름표
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(FIELD_W / 2 - 40, top - 14, 80, 14);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(AISLE_NAMES[row], FIELD_W / 2, top - 3);
    });

    // 계산대
    ctx.fillStyle = '#5b3a1e';
    ctx.fillRect(CHECKOUT_POS.x - 70, 560, 140, 50);
    ctx.fillStyle = '#7c4a24';
    ctx.fillRect(CHECKOUT_POS.x - 70, 556, 140, 8);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(CHECKOUT_POS.x - 60, 566, 40, 26);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(CHECKOUT_POS.x - 56, 570, 32, 18);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('계산대', CHECKOUT_POS.x + 20, 585);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('여기 도달하면 피해!', CHECKOUT_POS.x + 20, 600);

    // 조명 (형광등 느낌의 밝은 띠)
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 100; y < FIELD_H; y += 158) ctx.fillRect(0, y - 30, FIELD_W, 60);

    // 비네팅
    const g = ctx.createRadialGradient(FIELD_W / 2, FIELD_H / 2, 200, FIELD_W / 2, FIELD_H / 2, 520);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    return c;
  }

  // ───────────── 슬롯/오라 ─────────────

  private drawSlots(state: GameState): void {
    const ctx = this.ctx;
    const selected = state.selectedUnitId !== null;
    for (const s of state.slots) {
      const empty = s.unitId === null;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (empty) {
        ctx.strokeStyle = selected ? 'rgba(255,210,63,0.95)' : 'rgba(244,241,234,0.32)';
        ctx.setLineDash(selected ? [] : [4, 4]);
        ctx.lineWidth = selected ? 2 : 1;
        ctx.beginPath();
        ctx.rect(-22, -36, 44, 44);
        ctx.stroke();
        if (selected) {
          ctx.fillStyle = 'rgba(255,210,63,0.14)';
          ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 4, 20, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawAuras(state: GameState): void {
    const ctx = this.ctx;
    for (const u of state.units) {
      const def = unitDef(u);
      if (!def.aura) continue;
      const s = state.slots[u.slot];
      const r = auraRadius(def, u.tier);
      const disabled = u.disabledUntil > state.time;
      ctx.save();
      ctx.globalAlpha = disabled ? 0.05 : state.selectedUnitId === u.id ? 0.28 : 0.1;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y - 16, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ───────────── 유닛 ─────────────

  private drawUnit(state: GameState, u: Unit, now: number): void {
    const ctx = this.ctx;
    const def = UNIT_BY_ID[u.defId];
    const s = state.slots[u.slot];
    const selected = state.selectedUnitId === u.id;
    const disabled = u.disabledUntil > state.time;
    const pulse = this.spawnPulse.get(u.id) ?? 0;
    const sinceAttack = state.time - u.lastAttackAt;
    let scale = UNIT_SCALE;
    if (pulse > 0) scale *= 1 + Math.sin((pulse / 0.6) * Math.PI) * 0.35;
    if (sinceAttack < 0.15) scale *= 1 + (0.15 - sinceAttack) * 1.2;
    const w = 16 * scale;

    ctx.save();
    ctx.translate(s.x, s.y);
    // 사거리 (선택 시)
    if (selected && def.attack !== 'none') {
      ctx.strokeStyle = 'rgba(255,210,63,0.8)';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -16, unitRange(u), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 희귀도 받침
    const rc = RARITY_COLOR[def.rarity];
    ctx.fillStyle = rc;
    ctx.globalAlpha = selected ? 0.9 : 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (def.rarity === 'legendary' || def.rarity === 'special') {
      // 전설/특수: 은은한 빛
      const g = ctx.createRadialGradient(0, -16, 4, 0, -16, 40);
      g.addColorStop(0, rc + '55');
      g.addColorStop(1, rc + '00');
      ctx.fillStyle = g;
      ctx.fillRect(-40, -56, 80, 80);
    }
    // 스프라이트 (캐릭터형만 좌우 반전; 사물은 고정)
    const img = rasterize(def.sprite);
    const flip = def.role === 'dps' && def.attack !== 'none' && (def.id === 'alba' || def.id === 'manager' || def.id === 'cat' || def.id === 'veteran') ? u.facing : 1;
    if (img) {
      ctx.save();
      ctx.scale(flip, 1);
      ctx.imageSmoothingEnabled = false;
      if (disabled) ctx.globalAlpha = 0.45;
      ctx.drawImage(img, -w / 2, -w + 8, w, w);
      ctx.restore();
    } else {
      drawFallback(ctx, 0, 8, w, def.color, def.name);
    }
    // 티어 별
    if (u.tier > 1) {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.fillText('★'.repeat(u.tier), 0, -w + 4);
      ctx.fillStyle = u.tier >= 4 ? '#e8497c' : '#ffd23f';
      ctx.fillText('★'.repeat(u.tier), 0, -w + 3);
    }
    if (disabled) {
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔧', 0, -w / 2);
    }
    if (selected) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.rect(-26, -w + 2, 52, w + 8); // 간판 스타일: 각진 선택 틀
      ctx.stroke();
    }
    ctx.restore();

    if (this.mergePulse && this.mergePulse.slot === u.slot) {
      const t = this.mergePulse.life / 0.7;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.strokeStyle = this.mergePulse.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y - 16, 30 + (1 - t) * 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    void now;
  }

  // ───────────── 손님 ─────────────

  private drawEnemy(state: GameState, e: Enemy, now: number): void {
    const ctx = this.ctx;
    const def = ENEMY_BY_ID[e.defId];
    const scale = (e.isBoss ? BOSS_SCALE : ENEMY_SCALE) * def.size;
    const sprite = def.sprite;
    const spriteSize = getSprite(sprite)?.h ?? 16;
    const w = spriteSize * scale;
    const bob = Math.sin(now / 90 + e.id) * (e.stun > 0 ? 0 : 1.5);
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    if (e.hidden) ctx.globalAlpha = 0.22;
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, w * 0.35, w * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // 보스 오라
    if (e.isBoss) {
      const g = ctx.createRadialGradient(0, -w / 2, 10, 0, -w / 2, w);
      g.addColorStop(0, def.color + '66');
      g.addColorStop(1, def.color + '00');
      ctx.fillStyle = g;
      ctx.fillRect(-w, -w * 1.5, w * 2, w * 2);
    }
    const img = rasterize(sprite, e.hitFlash > 0 ? '#ffffff' : undefined);
    if (img) {
      ctx.save();
      ctx.scale(e.facing, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -w / 2, -w + 4, w, w);
      ctx.restore();
      if (e.slow.until > state.time && e.hitFlash <= 0) {
        // 감속: 파란 틴트 오버레이
        const tinted = rasterize(sprite, '#67e8f9');
        if (tinted) {
          ctx.save();
          ctx.scale(e.facing, 1);
          ctx.globalAlpha = 0.35;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tinted, -w / 2, -w + 4, w, w);
          ctx.restore();
        }
      }
    } else {
      drawFallback(ctx, 0, 4, w, def.color, def.name);
    }
    // 상태 표시
    if (e.stun > 0) {
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💫', 0, -w - 2);
    } else if (e.slow.until > state.time) {
      ctx.fillStyle = 'rgba(103,232,249,0.9)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('❄', -w / 2 - 2, -w / 2);
    }
    if (e.dot.until > state.time) {
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔥', w / 2 + 2, -w / 2);
    }
    // 체력바 (피해 입었을 때만; 보스는 항상)
    if (e.hp < e.maxHp || e.isBoss) {
      const bw = e.isBoss ? 60 : 26;
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-bw / 2 - 1, -w - 8, bw + 2, 5);
      ctx.fillStyle = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#fbbf24' : '#ef4444';
      ctx.fillRect(-bw / 2, -w - 7, bw * ratio, 3);
      if (e.shield > 0) {
        ctx.fillStyle = '#c4b5fd';
        ctx.fillRect(-bw / 2, -w - 11, bw * Math.min(1, e.shield / (e.maxHp * 0.1)), 2);
      }
    }
    if (e.isBoss) {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(def.name, 1, -w - 13);
      ctx.fillStyle = '#fca5a5';
      ctx.fillText(def.name, 0, -w - 14);
    }
    ctx.restore();
  }

  private drawProjectiles(state: GameState): void {
    const ctx = this.ctx;
    for (const p of state.projectiles) {
      const img = rasterize(p.sprite) ?? rasterize('p_generic');
      if (img) {
        ctx.imageSmoothingEnabled = false;
        const w = img.width * 2.2;
        const h = img.height * 2.2;
        ctx.drawImage(img, p.x - w / 2, p.y - h / 2, w, h);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const t = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = Math.min(1, t * 1.5);
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.radius ?? 40) * (1 - t * 0.6), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.font = `${8 + p.size * 2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('✦', p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBubbles(state: GameState): void {
    const ctx = this.ctx;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let shown = 0;
    for (const e of state.enemies) {
      if (!e.bubble || e.hidden) continue;
      if (shown++ > 14) break;
      const text = e.bubble.text;
      const w = ctx.measureText(text).width + 12;
      const size = (e.isBoss ? 24 : 16) * ENEMY_SCALE * ENEMY_BY_ID[e.defId].size;
      const x = Math.max(w / 2 + 2, Math.min(FIELD_W - w / 2 - 2, e.x));
      const y = Math.max(14, e.y - size - 22);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.rect(x - w / 2, y - 9, w, 18);
      ctx.fill();
      ctx.strokeStyle = '#14120f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 9);
      ctx.lineTo(x + 4, y + 9);
      ctx.lineTo(x, y + 14);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillText(text, x, y);
    }
    ctx.textBaseline = 'alphabetic';
  }

  private drawFloaters(state: GameState): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      const t = f.life / f.maxLife;
      const y = f.y + (1 - t) * f.vy;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.font = `bold ${f.size}px sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }

  private drawOverlays(state: GameState, now: number): void {
    const ctx = this.ctx;
    const m = state.modifiers;
    // 새벽 3시 이후: 붉은 기운
    if (state.wave >= THREE_AM_WAVE) {
      ctx.fillStyle = 'rgba(120,20,40,0.08)';
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    }
    if (m.darkness > 0) {
      ctx.fillStyle = `rgba(0,0,0,${m.darkness})`;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      // 손전등 느낌: 유닛 주변만 밝게
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (const u of state.units) {
        const s = state.slots[u.slot];
        const g = ctx.createRadialGradient(s.x, s.y - 16, 5, s.x, s.y - 16, 60);
        g.addColorStop(0, 'rgba(0,0,0,0.6)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(s.x - 60, s.y - 76, 120, 120);
      }
      ctx.restore();
    }
    if (m.rain) {
      ctx.strokeStyle = 'rgba(147,197,253,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        d.y += d.s / 60;
        d.x -= 1.2;
        if (d.y > FIELD_H) {
          d.y = -10;
          d.x = Math.random() * FIELD_W;
        }
        if (d.x < 0) d.x = FIELD_W;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 2, d.y + 10);
      }
      ctx.stroke();
    }
    // 체력 위험: 붉은 비네팅 펄스
    if (state.hp / state.maxHp <= 0.25 && state.phase === 'playing') {
      const a = 0.15 + 0.15 * Math.sin(now / 200);
      const g = ctx.createRadialGradient(FIELD_W / 2, FIELD_H / 2, 200, FIELD_W / 2, FIELD_H / 2, 480);
      g.addColorStop(0, 'rgba(239,68,68,0)');
      g.addColorStop(1, `rgba(239,68,68,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    }
    if (this.flash) {
      ctx.globalAlpha = Math.min(0.7, this.flash.life * 2);
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.globalAlpha = 1;
    }
    if (state.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    }
  }

  // 화면 좌표 → 논리 좌표
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * FIELD_W, y: ((clientY - r.top) / r.height) * FIELD_H };
  }
}
