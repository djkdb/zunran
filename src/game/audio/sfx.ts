import type { SfxId } from '../types';

// 외부 오디오 파일 없이 WebAudio 로 전부 합성한다. 로딩 0초, 용량 0.
// AudioContext 는 브라우저 정책상 사용자 제스처 후에만 시작되므로 unlock() 을 첫 클릭/터치에서 호출한다.
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private lastPlay = new Map<SfxId, number>();
  private bgmTimer: number | null = null;
  private bgmNext = 0;
  private bgmStep = 0;
  private bgmMode: 'normal' | 'tense' = 'normal';
  private bgmGain: GainNode | null = null;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.16;
      this.bgmGain.connect(this.master);
    } catch {
      this.ctx = null;
    }
  }

  isUnlocked(): boolean {
    return this.ctx !== null;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }
  isMuted(): boolean {
    return this.muted;
  }

  // ───────────── 기본 합성기 ─────────────

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, at = 0, filterFreq = 1200, q = 1): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + at;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  // ───────────── 효과음 ─────────────

  play(id: SfxId): void {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const throttle: Partial<Record<SfxId, number>> = { attack: 90, hit: 70, coin: 60, spawn: 120, click: 40 };
    const th = throttle[id];
    if (th) {
      const last = this.lastPlay.get(id) ?? 0;
      if (now - last < th) return;
      this.lastPlay.set(id, now);
    }
    switch (id) {
      case 'draw':
        this.tone(440, 0.08, 'square', 0.12, 0, 660);
        break;
      case 'rare':
        this.tone(660, 0.12, 'sine', 0.18);
        this.tone(880, 0.18, 'sine', 0.18, 0.1);
        break;
      case 'epic':
        this.tone(523, 0.12, 'triangle', 0.2);
        this.tone(659, 0.12, 'triangle', 0.2, 0.1);
        this.tone(784, 0.25, 'triangle', 0.22, 0.2);
        this.noise(0.3, 0.08, 0.2, 3000, 2);
        break;
      case 'legendary':
        this.tone(60, 0.5, 'sine', 0.5);
        this.noise(0.5, 0.2, 0, 400, 0.7);
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.14, 0.12 + i * 0.09));
        this.tone(1568, 0.9, 'triangle', 0.2, 0.7);
        this.tone(2093, 0.9, 'sine', 0.12, 0.75);
        break;
      case 'merge':
        this.noise(0.25, 0.12, 0, 800, 1);
        this.tone(300, 0.2, 'sine', 0.15, 0, 900);
        this.tone(1200, 0.25, 'sine', 0.14, 0.18);
        break;
      case 'mergeUp':
        this.noise(0.3, 0.14, 0, 900, 1);
        this.tone(300, 0.25, 'sine', 0.16, 0, 1200);
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, 0.2 + i * 0.07));
        break;
      case 'attack':
        this.tone(900, 0.04, 'square', 0.035, 0, 600);
        break;
      case 'hit':
        this.noise(0.06, 0.06, 0, 1800, 1.5);
        break;
      case 'spawn':
        this.tone(220, 0.09, 'sine', 0.07, 0, 150);
        break;
      case 'boss':
        this.tone(70, 0.9, 'sawtooth', 0.3);
        this.tone(73, 0.9, 'sawtooth', 0.2);
        this.noise(0.2, 0.25, 0, 200, 0.6);
        this.noise(0.2, 0.25, 0.35, 200, 0.6);
        this.noise(0.4, 0.3, 0.7, 180, 0.6);
        break;
      case 'warning':
        for (let i = 0; i < 3; i++) {
          this.tone(740, 0.14, 'square', 0.12, i * 0.3);
          this.tone(520, 0.14, 'square', 0.12, i * 0.3 + 0.15);
        }
        break;
      case 'gameover':
        [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.2, i * 0.35));
        this.tone(131, 1.4, 'sawtooth', 0.15, 1.3);
        break;
      case 'waveClear':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'square', 0.1, i * 0.09));
        this.tone(1046, 0.4, 'triangle', 0.14, 0.28);
        break;
      case 'coin':
        this.tone(1760, 0.07, 'square', 0.05, 0, 2200);
        break;
      case 'event':
        this.tone(880, 0.18, 'sine', 0.16);
        this.tone(660, 0.3, 'sine', 0.16, 0.18);
        break;
      case 'damage':
        this.tone(120, 0.25, 'sawtooth', 0.22, 0, 50);
        this.noise(0.15, 0.2, 0, 300, 0.8);
        break;
      case 'sell':
        this.noise(0.08, 0.15, 0, 2500, 2);
        this.tone(2093, 0.25, 'sine', 0.12, 0.06);
        this.tone(2637, 0.3, 'sine', 0.1, 0.12);
        break;
      case 'click':
        this.tone(1200, 0.03, 'square', 0.04);
        break;
      // 거절: 조작이 먹히지 않았을 때. 낮고 짧게 두 번 — 클릭음과 확실히 구분된다.
      case 'deny':
        this.tone(180, 0.07, 'square', 0.05);
        this.tone(120, 0.09, 'square', 0.05, 0.06);
        break;
      case 'skill':
        this.tone(400, 0.25, 'sawtooth', 0.08, 0, 1400);
        break;
      case 'record':
        [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.3, 'square', 0.12, i * 0.12));
        this.tone(1568, 0.8, 'triangle', 0.16, 0.5);
        break;
      case 'achievement':
        // 위로 올라가는 3음 + 반짝이는 꼬리
        [523, 659, 880].forEach((f, i) => this.tone(f, 0.22, 'square', 0.13, i * 0.09));
        this.tone(1318, 0.5, 'triangle', 0.1, 0.3);
        break;
      case 'rareEvent':
        // 뭔가 이상한 일이 생겼다: 낮게 깔렸다가 확 올라간다
        this.tone(160, 0.5, 'sawtooth', 0.09, 0, 900);
        [880, 1174].forEach((f, i) => this.tone(f, 0.28, 'square', 0.1, 0.2 + i * 0.1));
        break;
      case 'missionClear':
        [784, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'square', 0.12, i * 0.1));
        break;
      case 'certificate':
        // 영수증 뽑히는 소리 느낌: 짧은 노이즈 + 띵
        this.noise(0.22, 0.05);
        this.tone(1047, 0.35, 'triangle', 0.12, 0.18);
        break;
      case 'cat':
        // 야옹: 올라갔다 내려온다
        this.tone(660, 0.16, 'sine', 0.13, 0, 980);
        this.tone(880, 0.24, 'sine', 0.11, 0.14, 520);
        break;
      case 'secret':
        [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.1, i * 0.13));
        break;
    }
  }

  // ───────────── BGM (간단한 루프) ─────────────

  startBgm(): void {
    if (!this.ctx || this.bgmTimer !== null) return;
    this.bgmNext = this.ctx.currentTime + 0.1;
    this.bgmStep = 0;
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 100);
  }
  stopBgm(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
  setBgmMode(mode: 'normal' | 'tense'): void {
    this.bgmMode = mode;
  }

  private scheduleBgm(): void {
    if (!this.ctx || !this.bgmGain) return;
    const tense = this.bgmMode === 'tense';
    const stepDur = tense ? 0.13 : 0.16;
    // 16스텝 루프. 베이스 + 아르페지오. 긴장 모드는 단조 + 빠르게.
    const bass = tense ? [55, 55, 65.4, 55, 58.3, 58.3, 65.4, 49] : [65.4, 65.4, 82.4, 65.4, 73.4, 73.4, 98, 82.4];
    const arp = tense ? [220, 261.6, 311.1, 261.6, 233, 277.2, 349.2, 277.2] : [261.6, 329.6, 392, 329.6, 293.7, 369.9, 440, 369.9];
    while (this.bgmNext < this.ctx.currentTime + 0.25) {
      const step = this.bgmStep % 16;
      const t0 = this.bgmNext;
      if (step % 2 === 0) this.bgmTone(bass[(step / 2) % 8], stepDur * 1.8, 'triangle', 0.5, t0);
      if (step % 2 === 1 || tense) this.bgmTone(arp[Math.floor(step / 2) % 8] * (step % 4 === 3 ? 2 : 1), stepDur * 0.9, 'square', 0.12, t0);
      if (step % 4 === 0) this.bgmNoise(0.05, 0.25, t0);
      if (step % 8 === 4) this.bgmNoise(0.12, 0.2, t0, 2500);
      this.bgmNext += stepDur;
      this.bgmStep++;
    }
  }

  private bgmTone(freq: number, dur: number, type: OscillatorType, vol: number, t0: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.bgmGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  private bgmNoise(dur: number, vol: number, t0: number, freq = 600): void {
    if (!this.ctx || !this.bgmGain) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.bgmGain);
    src.start(t0);
  }
}

export const audio = new AudioEngine();
