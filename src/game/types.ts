// 모든 시스템이 공유하는 타입. 엔진/렌더러/UI 는 이 파일만 의존한다.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'special';
export type Tier = 1 | 2 | 3 | 4 | 5;

export interface RNG {
  next(): number; // [0,1)
  range(min: number, max: number): number;
  int(min: number, max: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

// ───────────────────────── 유닛 ─────────────────────────

export type UnitRole = 'dps' | 'aoe' | 'support' | 'control';
export type AttackKind = 'projectile' | 'instant' | 'aoe' | 'none';
export type Targeting = 'first' | 'strongest' | 'nearest' | 'random';

export interface OnHitEffect {
  slow?: { pct: number; dur: number };
  stun?: { chance: number; dur: number };
  dot?: { dps: number; dur: number };
  knockback?: number;
  critChance?: number;
  critMult?: number;
  randomMult?: [number, number];
  coinOnKill?: number;
}

export type AuraKind = 'atkSpeed' | 'dmg' | 'enemySlow' | 'coin';

export interface AuraDef {
  kind: AuraKind;
  radius: number;
  value: number; // atkSpeed/dmg: +배율(0.25 = +25%), enemySlow: 감속 비율, coin: 추가 코인 배율
}

export type SkillKind =
  | 'slowAll' // 범위 내 손님 이동속도 감소
  | 'stunOne' // 손님 1명 정지
  | 'burn' // 범위 내 모든 손님 지속 피해
  | 'pullAll' // 범위 내 손님 뒤로 끌어당기기
  | 'megaSlash' // 범위 내 다수 손님 큰 피해
  | 'freeze' // 범위 정지
  | 'jackpot' // 랜덤 대박 피해
  | 'coinBurst'; // 코인 획득

export interface SkillDef {
  id: string;
  name: string;
  cooldown: number;
  kind: SkillKind;
  value: number;
  dur?: number;
  radius?: number;
  line?: string; // 시전 대사
}

export interface UnitDef {
  id: string;
  name: string;
  rarity: Rarity;
  role: UnitRole;
  desc: string;
  quote: string;
  dmg: number;
  interval: number;
  range: number;
  attack: AttackKind;
  aoeRadius?: number;
  targeting: Targeting;
  onHit?: OnHitEffect;
  aura?: AuraDef;
  skill?: SkillDef;
  sprite: string;
  color: string;
  projectile?: string; // 투사체 스프라이트 키
  mergeOnly?: boolean; // 뽑기로는 안 나오고 합성으로만 등장
}

export interface Unit {
  id: number;
  defId: string;
  tier: Tier;
  slot: number;
  cooldown: number;
  skillCd: number;
  disabledUntil: number;
  buffs: { atkSpeed: number; dmg: number };
  kills: number;
  damage: number;
  bornAt: number;
  // 렌더 전용 힌트(엔진이 갱신): 최근 공격 시각/방향
  lastAttackAt: number;
  facing: 1 | -1;
}

export interface Slot {
  index: number;
  x: number;
  y: number;
  row: number;
  unitId: number | null;
  blocked?: boolean; // '혼자 근무' 조건에서 봉쇄된 칸
}

// ───────────────────────── 손님 ─────────────────────────

export type EnemyTag = 'boss' | 'group' | 'fast' | 'tank' | 'zombie' | 'special';
export type Immunity = 'slow' | 'stun' | 'knockback';

export type BossPatternKind =
  | 'lunchbox' // 폐기 직전 도시락: 체력 구간마다 조각 소환, 감속 면역
  | 'party' // 새벽 3시 단체: 주기적으로 무리 소환, 속도 맥동
  | 'inspector' // 본사 직원: 주기적으로 유닛 하나를 점검(비활성)
  | 'closing'; // 월말 매출 마감: 보호막 페이즈, 코인 흡수, 상태이상 면역

export type EnemyBehavior =
  | { kind: 'walk' }
  | { kind: 'drunk'; wobbleEvery: number; backDur: number }
  | { kind: 'linger'; atDist: number; duration: number; growPerSec: number }
  | { kind: 'askPrice'; every: number; stopDur: number; blockRadius: number }
  | { kind: 'charger'; every: number; disableDur: number; radius: number }
  | { kind: 'panic'; speedUp: number; dur: number }
  | { kind: 'buffer'; radius: number; speedBuff: number }
  | { kind: 'blink'; visibleFor: number; hiddenFor: number }
  // ATM 손님: 도중에 멈춰 서서 현금을 뽑는다 (플레이어 코인을 훔침)
  | { kind: 'steal'; every: number; stopDur: number; amount: number }
  // 커플 손님: 주변 손님을 서로 회복시킨다
  | { kind: 'healer'; radius: number; healPerSec: number }
  // 라이브 켠 손님: 주변 손님에게 주기적으로 보호막을 씌운다
  | { kind: 'shielder'; every: number; radius: number; shieldPct: number; targets: number }
  | { kind: 'boss'; pattern: BossPatternKind };

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  bounty: number;
  storeDamage: number;
  size: number;
  behavior: EnemyBehavior;
  tags: EnemyTag[];
  lines: string[];
  deathLines?: string[];
  sprite: string;
  color: string;
  minWave: number;
  weight: number;
  immune?: Immunity[];
  groupSize?: [number, number]; // 술 취한 친구들처럼 뭉쳐서 나오는 경우
  bagCost?: number; // 봉투 손님: 처치 시 뺏어가는 코인
  // ───── 카운터 속성 ─────
  // 27종 중 22종의 계산대 도달률이 0~2%였다. 위협 조건이 '빠른가' 하나뿐이라
  // 모든 상황의 답이 DPS였다 (docs/AUDIT.md 문제 3·7절).
  // 손님마다 '요구하는 답'을 다르게 만든다.
  armor?: number; // 장갑: 피격당 고정 피해 감소. 다단히트가 안 통하고 한 방이 큰 공격이 통한다
  swarm?: { radius: number; perAlly: number; max: number }; // 무리: 뭉칠수록 빨라진다. 범위 공격으로 솎아내야 한다
}

export interface Enemy {
  id: number;
  defId: string;
  hp: number;
  maxHp: number;
  dist: number;
  baseSpeed: number;
  speedMult: number; // 라면 손님 성장, 화장실 패닉 등 개체 자체 배율
  slow: { pct: number; until: number };
  stun: number;
  dot: { dps: number; until: number };
  hidden: boolean;
  stateTimer: number;
  stateFlag: number;
  bubble?: { text: string; until: number };
  groupId?: number;
  isBoss: boolean;
  bossPhase: number;
  shield: number; // 월말 마감 보스 보호막
  swarmBoost: number; // 무리 가속 (렌더 표시용)
  spawnedWave: number;
  reached: boolean;
  dead: boolean;
  hitFlash: number;
  x: number; // 렌더 캐시 (경로 계산 결과)
  y: number;
  facing: 1 | -1;
}

export interface SpawnEntry {
  at: number; // 웨이브 시작 후 초
  defId: string;
  count: number;
  groupId?: number;
  hpMult?: number;
  spawned?: number; // 필드 상한으로 일부만 스폰된 경우 진행 카운터
}

// ───────────────────────── 투사체/연출 ─────────────────────────

export interface Projectile {
  id: number;
  x: number;
  y: number;
  targetId: number;
  speed: number;
  dmg: number;
  fromUnitId: number;
  sprite: string;
  color: string;
  aoeRadius: number;
  onHit?: OnHitEffect;
  life: number;
}

export type FxEvent =
  | { type: 'banner'; text: string; sub?: string; style: 'legendary' | 'warning' | 'boss' | 'info' | 'good' | 'bad' | 'record' | 'clear'; dur?: number }
  | { type: 'shake'; amount: number }
  | { type: 'flash'; color: string }
  | { type: 'sfx'; id: SfxId }
  | { type: 'unitSpawn'; unitId: number; rarity: Rarity }
  | { type: 'merge'; slot: number; rarity: Rarity; upgraded: boolean }
  | { type: 'hit'; x: number; y: number; color: string; big?: boolean }
  | { type: 'death'; x: number; y: number; color: string; boss?: boolean }
  | { type: 'explode'; x: number; y: number; radius: number; color: string }
  | { type: 'skill'; x: number; y: number; radius: number; color: string; kind: SkillKind };

export type SfxId =
  | 'draw'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'merge'
  | 'mergeUp'
  | 'attack'
  | 'hit'
  | 'spawn'
  | 'boss'
  | 'warning'
  | 'gameover'
  | 'waveClear'
  | 'coin'
  | 'event'
  | 'damage'
  | 'sell'
  | 'click'
  | 'deny'
  | 'skill'
  | 'record'
  | 'achievement'
  | 'rareEvent'
  | 'missionClear'
  | 'certificate'
  | 'cat'
  | 'secret';

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
  size: number;
}

// ───────────────────────── 이벤트 ─────────────────────────

export interface Modifiers {
  enemySpeed: number;
  unitAtkSpeed: number;
  unitDmg: number;
  coinGain: number;
  unitDmgById: Record<string, number>;
  enemySpeedById: Record<string, number>;
  darkness: number; // 정전 연출 (0~1)
  rain: boolean;
  auraMult: number; // 지원 유닛(CCTV 등) 오라 배율 (CCTV 점검 이벤트)
}

export type EventMood = 'good' | 'bad' | 'neutral';

export interface EventDef {
  id: string;
  title: string;
  desc: string;
  minWave: number;
  weight: number;
  duration: number;
  mood: EventMood;
  modifiers?: Partial<Omit<Modifiers, 'unitDmgById' | 'enemySpeedById'>> & {
    unitDmgById?: Record<string, number>;
    enemySpeedById?: Record<string, number>;
  };
  // 즉시 효과. Engine 인스턴스 대신 좁은 컨텍스트만 준다 (데이터 파일이 엔진에 의존하지 않도록).
  apply?: (ctx: EventContext) => void;
  expire?: (ctx: EventContext) => void;
  // 2택 사건. 28종이 전부 강제 발생이라 좋은 일도 나쁜 일도 그냥 일어났다
  // (docs/AUDIT.md 5절). 선택지가 붙는 순간 같은 사건이 결정이 된다.
  // 전부에 붙이지는 않는다 — 판당 사건이 10번쯤이라 매번 멈추면 피로해진다.
  choices?: EventChoice[];
}

export interface EventChoice {
  label: string;
  desc: string;
  apply: (ctx: EventContext) => void;
}

export interface EventContext {
  state: GameState;
  spawn(defId: string, count: number, opts?: { hpMult?: number; spread?: number }): void;
  addCoins(n: number, reason?: string): void;
  disableRandomUnit(dur: number): number | null;
  knockbackAll(px: number): void;
  freeDraw(): void;
  banner(text: string, sub: string | undefined, style: Extract<FxEvent, { type: 'banner' }>['style']): void;
  rng: RNG;
}

export interface ActiveEvent {
  defId: string;
  until: number;
  title: string;
  mood: EventMood;
}

// ───────────────────────── 통계 / 메타 ─────────────────────────

export interface RunStats {
  kills: number;
  coinsEarned: number;
  coinsSpent: number;
  draws: number;
  merges: number;
  bossKills: number;
  legendaryDraws: number;
  unitDamage: Record<string, number>;
  unitKills: Record<string, number>;
  maxTierReached: number;
  eventsSeen: number;
  bestCombo: number;
  skillsUsed: number;
  bestWave: number;
  drawsByRarity: Record<Rarity, number>;
  seenUnits: string[];
  seenEnemies: string[];
  // ── 보고서·도감·업적용 추적 (한 판 동안만 쌓고, 게임오버 때 Save 로 합친다) ──
  eventIds: string[]; // 이번 판에 실제로 발생한 이벤트 id (중복 포함, 순서대로)
  reached: number; // 계산대에 도달한 손님 수
  reachedBy: Record<string, number>; // 손님별 도달 횟수
  storeDamageBy: Record<string, number>; // 손님별로 매장에 입힌 피해
  enemyKills: Record<string, number>; // 손님별 처치 수
  enemySeen: Record<string, number>; // 손님별 등장 수
  unitDraws: Record<string, number>; // 유닛별 뽑은 횟수
  unitMerges: Record<string, number>; // 유닛별 합성 횟수 (재료 기준)
  unitMaxTier: Record<string, number>; // 유닛별 이번 판 최고 티어
  catVisits: number; // 고양이를 만난 횟수
  lastDamageClock: string; // 마지막으로 체력이 깎인 순간의 게임 내 시계
  recipesMade: number; // 조합 레시피 완성 횟수
  orders: number; // 본사 발주(등급 지정 뽑기) 횟수
}

// ───────────────────────── 데일리 챌린지 ─────────────────────────

// 하루치 특별 규칙. 새로운 시스템을 만들지 않고 기존 Modifiers 에 상시 곱해진다.
export interface ChallengeSpec {
  id: string;
  name: string;
  desc: string[]; // 화면에 줄 단위로 보여줄 규칙 설명
  goalWave: number;
  modifiers?: Partial<Omit<Modifiers, 'unitDmgById' | 'enemySpeedById'>> & {
    unitDmgById?: Record<string, number>;
    enemySpeedById?: Record<string, number>;
  };
  // 코너(줄)별 유닛 공격력 배율 — 0:음료 1:과자 2:라면
  aisleDmg?: [number, number, number];
  enemyHpMult?: number; // 손님 체력 배율
  enemyCountMult?: number; // 손님 수 배율
  eventWeight?: Record<string, number>; // 특정 이벤트 등장 가중치 배율
  banUnits?: string[]; // 이 판에서 뽑히지 않는 유닛
  boostRarity?: Partial<Record<Rarity, number>>; // 등급 확률 가산
}

export type MetaUpgradeId =
  | 'startCoins'
  | 'startHp'
  | 'drawCost'
  | 'rareChance'
  | 'epicChance'
  | 'coinGain'
  | 'mergeLuck'
  | 'orderDiscount'
  | 'armorPierce'
  | 'veteran';

export interface MetaEffects {
  startCoins: number;
  startHp: number;
  drawCostReduce: number;
  rareBonus: number; // +확률(0.015 = +1.5%p)
  epicBonus: number;
  legendaryBonus: number;
  coinGainMult: number;
  freeDraws: number;
  mergePromoteBonus: number; // 합성 시 상위 등급 승급 확률 +(0.01 = +1%p)
  orderDiscount: number; // 본사 발주 비용 할인 (0.05 = -5%)
  armorPierce: number; // 손님 장갑 관통 (0.05 = 장갑 -5%)
  payMult: number; // 야간 수당 획득 배율 (판 안에는 영향 없음)
}

// ───────────────────────── 게임 상태 ─────────────────────────

export type GamePhase = 'playing' | 'reward' | 'promote' | 'eventChoice' | 'gameover';

// 웨이브 보상으로 쌓이는 영구 강화 (한 판 한정)
export interface PermaBuffs {
  dmg: number; // 배율
  atkSpeed: number;
  range: number; // 더하는 px
  coin: number; // 배율
  drawDiscount: number; // 원
  roleDmg: Record<UnitRole, number>; // 역할별 배율
  critChance: number; // 모든 유닛에 더해지는 치명타 확률
  auraMult: number; // 지원 유닛 오라 배율
  legendaryOdds: number; // 뽑기 전설 확률에 더해지는 값
  orderDiscount: number; // 본사 발주 비용 할인 (0.4 = -40%)
  incomeMult: number; // 웨이브 시급 배율
  aisleMult: number; // 코너 배치 보너스 배율 (1 = 기본)
  skillCdMult: number; // 긴급 스킬 쿨다운 배율
  slowMult: number; // 모든 감속 효과 배율
}

export type RewardTone = 'normal' | 'good' | 'best';

export interface RewardContext {
  state: GameState;
  rng: RNG;
  addCoins(n: number): void;
  grantUnit(rarity: Rarity): string | null;
  upgradeRandomUnit(): string | null;
  banner(text: string, sub: string): void;
}

export interface RewardCardDef {
  id: string;
  name: string;
  desc: string;
  icon: string; // ui/Icon 의 IconName
  tone: RewardTone;
  // stat: 숫자가 올라간다 / build: 플레이 방식이 바뀐다.
  // 이전 보상 19장은 사실상 전부 stat 이었다 — 판을 바꾸는 카드가 nightRush 하나뿐이었다
  // (docs/AUDIT.md 4-3). 3택에는 항상 build 가 최소 한 장 들어간다.
  kind: 'stat' | 'build';
  weight: number;
  minWave?: number;
  /** 지금 이 판에서 고를 수 있는 카드인지 (예: 유닛이 있어야 하는 카드) */
  available?: (state: GameState) => boolean;
  apply: (ctx: RewardContext) => void;
}

export interface RewardOffer {
  defId: string;
  kind: 'stat' | 'build';
  name: string;
  desc: string;
  icon: string;
  tone: RewardTone;
}

export interface GameState {
  phase: GamePhase;
  seed: number;
  rng: RNG;
  coinDrain: number; // 월말 마감 보스의 코인 흡수 누적치
  time: number;
  realTime: number;
  speed: 1 | 2;
  paused: boolean;

  hp: number;
  maxHp: number;
  coins: number;
  drawCount: number;
  freeDraws: number;
  sinceEpic: number; // 에픽 소프트 천장: 에픽 이상이 안 나온 연속 뽑기 수
  guaranteedRareDraws: number; // 남은 '희귀 이상 확정' 뽑기 수

  wave: number;
  waveTimer: number;
  waveDuration: number;
  waveTheme: import('./data/waves').WaveTheme;
  themeSchedule: import('./data/waves').WaveTheme[]; // 판 시작 때 한 번 정해지는 웨이브별 테마
  waveElapsed: number;
  spawnQueue: SpawnEntry[];
  waveEnemyIds: Set<number>;
  waveCleared: boolean;
  waveReached: boolean;
  bossAlive: boolean;
  lastEventId: string | null;
  bestWaveRecord: number; // 시작 시 저장된 최고 기록 (NEW RECORD 연출용)
  recordAnnounced: boolean;

  units: Unit[];
  slots: Slot[];
  perma: PermaBuffs;
  rewardOffers: RewardOffer[];
  rewardsTaken: string[];
  riskWave: number; // 이 웨이브 번호에는 손님이 더 많이 나오고 보상이 2배
  skills: { shutter: number; dump: number }; // 남은 쿨다운(초)
  combo: { count: number; until: number; best: number };
  enemies: Enemy[];
  projectiles: Projectile[];

  activeEvents: ActiveEvent[];
  nextEventAt: number;
  modifiers: Modifiers;

  selectedUnitId: number | null;
  stats: RunStats;
  fx: FxEvent[];
  floaters: Floater[];
  shake: number;
  nextId: number;
  meta: MetaEffects;

  hitstop: number; // 남은 히트스톱 (초). 이 동안 게임 시간이 멈춘다 — 타격이 묵직해진다.
  order: { pins: string[]; bans: string[] }; // 오늘 발주. 뽑기 풀은 항상 전체다.
  condition: { id: string; scoreMult: number; drawCostMult?: number } | null; // 오늘의 근무 조건
  challenge: ChallengeSpec | null; // ZUNRAN DAILY 규칙 (없으면 일반 근무)

  // 연출 플래그
  threeAmTriggered: boolean;
  lowHpWarned: boolean;
  gameOverReason?: string;
  lastDrawResult?: { defId: string; rarity: Rarity; at: number; ordered?: boolean };
  lastMergeResult?: { defId: string; tier: Tier; rarity: Rarity; kind: 'upgrade' | 'promote' | 'special'; at: number };
  // 합성 승급 2택. 고르기 전까지 게임이 멈춘다 (phase = 'promote').
  promoteChoice: { slot: number; tier: Tier; options: string[]; fromDefId: string } | null;
  // 사건 2택. 고르기 전까지 게임이 멈춘다 (phase = 'eventChoice').
  eventChoice: { defId: string; title: string; desc: string; choices: { label: string; desc: string }[] } | null;
  disabledUnitNotice: number;
}

// ───────────────────────── 액션 ─────────────────────────

export type GameAction =
  | { type: 'DRAW' }
  | { type: 'ORDER'; rarity: 'rare' | 'epic' | 'legendary' } // 본사 발주: 등급 지정 뽑기
  | { type: 'MERGE'; defId: string; tier: Tier }
  | { type: 'MERGE_TIER'; tier: Tier } // 고티어: 종류가 달라도 같은 티어끼리 합친다
  | { type: 'SELL'; unitId: number }
  | { type: 'SELECT'; unitId: number | null }
  | { type: 'MOVE'; unitId: number; slot: number }
  | { type: 'TAP_SLOT'; slot: number } // UI 편의: 선택 상태에 따라 선택/이동/교환
  | { type: 'SELL_JUNK' } // 합성 짝이 없는 티어1 일반 유닛 일괄 판매
  | { type: 'CHOOSE_REWARD'; defId: string }
  | { type: 'CHOOSE_PROMOTE'; defId: string } // 합성 승급 2택
  | { type: 'CHOOSE_EVENT'; index: number } // 사건 2택
  | { type: 'USE_SKILL'; skill: 'shutter' | 'dump' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'SET_SPEED'; speed: 1 | 2 }
  | { type: 'COMBINE'; recipeId: string }
  | { type: 'GIVE_UP' };

// UI 스냅샷 (React 는 이 요약만 10Hz 로 받는다)
export interface UnitGroup {
  defId: string;
  tier: Tier;
  count: number;
  unitIds: number[];
  mergeable: boolean;
}

export interface UISnapshot {
  version: number;
  phase: GamePhase;
  clock: string;
  wave: number;
  waveTimer: number;
  waveDuration: number;
  waveTheme: import('./data/waves').WaveTheme;
  nextWaveTheme: import('./data/waves').WaveTheme;
  survivedSec: number;
  hp: number;
  maxHp: number;
  coins: number;
  drawCost: number;
  freeDraws: number;
  canDraw: boolean;
  orderCost: { rare: number; epic: number; legendary: number };
  emptySlots: number;
  totalSlots: number;
  speed: 1 | 2;
  paused: boolean;
  enemyCount: number;
  // 계산대 직전 구간(마지막 통로)에 들어선 손님 수.
  // 방어가 임계점을 넘기 전에는 0명이 뚫리고 넘는 순간 전부 뚫린다 —
  // 체력만 보면 아무 경고가 없다가 한 웨이브에 반 토막 난다.
  // "밀리고 있다"를 체력이 깎이기 전에 보여주는 신호다.
  nearCheckout: number;
  bossAlive: boolean;
  bossHp: number;
  bossMaxHp: number;
  bossName: string;
  groups: UnitGroup[];
  // 고티어 통합 합성: 종류가 달라도 합칠 수 있는 티어와 그 개수
  tierMerge: { tier: Tier; count: number } | null;
  selected: { unitId: number; defId: string; tier: Tier; kills: number; damage: number; sellPrice: number; aisle: string; aisleBonus: string; groupCount: number } | null;
  activeEvents: { title: string; remain: number; mood: EventMood }[];
  stats: RunStats;
  unitCount: number;
  rarityOdds: Record<Exclude<Rarity, 'special'>, number>;
  disabledUnits: number;
  nextIsBoss: boolean;
  junkCount: number; // 정리 판매 대상 수
  junkValue: number;
  rewardOffers: RewardOffer[];
  promoteChoice: { slot: number; tier: Tier; options: string[]; fromDefId: string } | null;
  eventChoice: { defId: string; title: string; desc: string; choices: { label: string; desc: string }[] } | null;
  rewardsTaken: number;
  perma: PermaBuffs;
  shutterCd: number;
  dumpCd: number;
  skillReady: { shutter: boolean; dump: boolean };
  combo: number;
  bestCombo: number;
  riskWave: boolean;
}
