# 편의점 야간근무 — 게임 설계 문서

> 부제: 새벽 3시, 혼자 남았다.
> 장르: 랜덤 디펜스 / 캐주얼 전략 / 로그라이크 / 밈 코미디 / 웹게임

이 문서는 코드를 작성하기 전에 확정한 전체 구조다. 구현 중 밸런스 수치는 바뀌지만
시스템 간 경계와 데이터 흐름은 이 문서를 기준으로 유지한다.

---

## 1. 전체 게임 아키텍처

```
┌────────────────────────────────────────────────────────────────────┐
│ React (UI 레이어)                                                  │
│  StartScreen · GameScreen(HUD + Canvas + BottomPanel) · GameOver   │
│  MetaShop · Banner(연출 텍스트)                                     │
│         ▲ snapshot(10Hz, useSyncExternalStore)      │ actions       │
│         │                                           ▼               │
├─────────┴───────────────────────────────────────────────────────────┤
│ Engine (순수 TypeScript, React·DOM 의존 없음)                        │
│  GameState (단일 가변 객체)                                          │
│  tick(dt) 순서:                                                     │
│    1. WaveSystem   — 웨이브 타이머, 스폰 큐 처리                     │
│    2. EventSystem  — 랜덤 이벤트 발생/만료                            │
│    3. EnemySystem  — 이동, 행동(AI), 상태이상, 계산대 도달 피해        │
│    4. UnitSystem   — 오라 계산, 타겟팅, 공격, 스킬, 투사체            │
│    5. RewardSystem — 처치 보상, 웨이브 클리어 보상, 통계              │
│    6. 정리         — 사망/도달 개체 제거, 게임오버 판정               │
│  dispatch(action): DRAW / MERGE / SELL / MOVE / PAUSE / SPEED ...   │
│  events: FX 큐(배너, 화면흔들림, 사운드 트리거) → Renderer/Audio/UI  │
├─────────────────────────────────────────────────────────────────────┤
│ Renderer (Canvas 2D)      │ Audio (WebAudio 합성)  │ Save (localStorage)│
│  매장 배경, 유닛, 손님,    │  효과음 전부 코드 합성   │  기록/메타/해금    │
│  투사체, 파티클, 말풍선    │  외부 에셋 0개          │  버전 마이그레이션 │
└─────────────────────────────────────────────────────────────────────┘
```

### 핵심 원칙
- **엔진은 React를 모른다.** `Engine`은 순수 TS 클래스. 노드에서도 돌아가므로 헤드리스
  시뮬레이션(밸런스 테스트)이 가능하다 (`scripts/sim.ts`).
- **렌더러는 상태를 읽기만 한다.** Canvas는 rAF마다 `engine.state`를 직접 읽어 그린다.
  React는 60fps로 리렌더하지 않고 10Hz 스냅샷만 받는다 (HUD/패널용).
- **연출은 이벤트 큐로.** 엔진은 "LEGENDARY 등장", "보스 등장" 같은 FX 이벤트를 큐에 넣고
  렌더러/오디오/UI가 각자 소비한다. 엔진 로직과 연출이 섞이지 않는다.
- **결정론적 RNG.** 시드 기반 RNG(`mulberry32`)를 사용해서 시뮬레이션 재현이 가능하다.
- **데이터 주도.** 유닛/손님/보스/이벤트/웨이브는 전부 `data/*.ts` 테이블. 밸런스 조정은
  코드 로직을 건드리지 않고 테이블만 수정한다.

---

## 2. 폴더 구조

```
src/
  main.tsx                 진입점
  App.tsx                  화면 라우팅(start / game / gameover)
  styles.css               전역 스타일 + 반응형 레이아웃
  game/
    types.ts               모든 공용 타입 (GameState, Unit, Enemy, ...)
    config.ts              상수: 필드 크기, 경로, 슬롯, 확률, 비용, 스케일 공식
    data/
      units.ts             유닛 정의 테이블 (UnitDef)
      enemies.ts           손님 정의 테이블 (EnemyDef) + 보스
      waves.ts             웨이브 생성기 (웨이브 번호 → 스폰 목록)
      events.ts            랜덤 이벤트 정의 (EventDef)
      dialogue.ts          손님 대사, 밈 텍스트, 뽑기 멘트
    engine/
      rng.ts               시드 RNG
      Engine.ts            GameState 생성, tick, dispatch, FX 큐
      waveSystem.ts        웨이브/스폰
      enemySystem.ts       손님 이동/행동/상태이상
      unitSystem.ts        타겟팅/공격/투사체/오라/스킬
      mergeSystem.ts       합성
      eventSystem.ts       랜덤 이벤트
      economy.ts           보상/코인/통계
    render/
      sprites.ts           16x16 픽셀 스프라이트 정의 + 캐시
      Renderer.ts          Canvas 렌더링(배경, 개체, 파티클, 말풍선, 흔들림)
    audio/
      sfx.ts               WebAudio 효과음/간단 BGM
    save/
      storage.ts           localStorage 스키마/마이그레이션
      meta.ts              메타 업그레이드 정의/효과 계산
  ui/
    useEngine.ts           Engine ↔ React 브리지
    GameScreen.tsx         레이아웃(HUD/캔버스/하단패널)
    Hud.tsx                상단 정보
    BottomPanel.tsx        뽑기/합성/보유 유닛/선택 유닛
    Banner.tsx             중앙 연출 텍스트
    StartScreen.tsx        시작 화면 + 메타 상점
    GameOverScreen.tsx     영업 종료 화면
scripts/
  sim.ts                   헤드리스 밸런스 시뮬레이터
docs/
  DESIGN.md                이 문서
```

---

## 3. 게임 상태 구조 (GameState)

```ts
interface GameState {
  phase: 'playing' | 'gameover';
  seed: number;
  rng: RNG;                      // 시드 RNG
  time: number;                  // 게임 내 경과 초 (속도 배율 적용)
  realTime: number;              // 실제 생존 초 (속도 배율 미적용, 기록용)
  speed: 1 | 2;
  paused: boolean;

  hp: number; maxHp: number;     // 편의점 체력
  coins: number;                 // 보유 코인
  drawCount: number;             // 뽑기 횟수 (비용 상승용)

  wave: number;                  // 현재 웨이브 (1부터)
  waveTimer: number;             // 현재 웨이브 남은 시간
  waveDuration: number;
  spawnQueue: SpawnEntry[];      // 이번 웨이브 스폰 예약 (시간순)
  waveEnemyIds: Set<number>;     // 이번 웨이브 소속 손님 (클리어 판정)

  units: Unit[];                 // 배치된 유닛
  slots: Slot[];                 // 고정 슬롯(21개). unitId 참조
  enemies: Enemy[];
  projectiles: Projectile[];

  activeEvents: ActiveEvent[];   // 진행 중 이벤트 (만료 시간 포함)
  nextEventAt: number;           // 다음 랜덤 이벤트 시각
  modifiers: Modifiers;          // 이벤트/오라가 합산된 전역 배율

  selectedUnitId: number | null; // UI 선택 (이동/판매)
  stats: RunStats;               // 처치 수, 획득 코인, 유닛별 피해량 등
  fx: FxEvent[];                 // 이번 틱 발생한 연출 이벤트(소비 후 비움)
  floaters: Floater[];           // 떠오르는 텍스트/말풍선 (렌더용)
  shake: number;                 // 화면 흔들림 잔량
  nextId: number;
  meta: MetaEffects;             // 메타 업그레이드 효과(시작 시 고정)
}
```

RunStats: `kills, coinsEarned, coinsSpent, draws, merges, bossKills, bestWave,
unitDamage: Record<defId, number>, unitKills: Record<defId, number>, legendaryDraws`.

---

## 4. 유닛 데이터 구조

```ts
type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'special';

interface UnitDef {
  id: string;            // 'onigiri'
  name: string;          // '삼각김밥'
  rarity: Rarity;
  role: 'dps' | 'aoe' | 'support' | 'control';
  desc: string;          // 한 줄 설명
  quote: string;         // 등장 멘트
  dmg: number;           // 티어1 기본 피해
  interval: number;      // 공격 간격(초). 0 = 공격 안 함
  range: number;         // 사거리(px)
  attack: 'projectile' | 'instant' | 'aoe' | 'none';
  aoeRadius?: number;    // 착탄 범위
  targeting: 'first' | 'strongest' | 'nearest' | 'random';
  onHit?: {              // 명중 시 효과
    slow?: { pct: number; dur: number };
    stun?: { chance: number; dur: number };
    dot?: { dps: number; dur: number };
    knockback?: number;  // 경로 상 뒤로 밀기(px)
    critChance?: number; critMult?: number;
    randomMult?: [number, number]; // 로또: 피해 배율 랜덤
  };
  aura?: {               // 주변 유닛/손님 지속 효과
    kind: 'atkSpeed' | 'dmg' | 'enemySlow' | 'coin';
    radius: number; value: number;
  };
  skill?: {              // 주기적 액티브 스킬
    id: string; name: string; cooldown: number;
    kind: 'slowAll' | 'stunOne' | 'burn' | 'pullAll' | 'megaSlash' | ...;
    value: number; dur?: number; radius?: number;
  };
  sprite: string;        // sprites.ts 키
  color: string;         // UI 강조색
}

interface Unit {
  id: number; defId: string; tier: 1|2|3|4|5;
  slot: number;                 // 슬롯 인덱스
  cooldown: number; skillCd: number;
  disabledUntil: number;        // 본사 점검 등으로 비활성
  buffs: { atkSpeed: number; dmg: number }; // 오라/이벤트 합산 (매 틱 재계산)
  kills: number; damage: number;
  bornAt: number;               // 등장 연출용
}
```

**티어 스케일**: 피해 = `dmg × 3.4^(tier-1)`. 사거리 +8/티어, 공격 간격 -4%/티어.
합성 3개 → 1개이므로 3.4배는 "합성이 항상 이득"이 되게 하는 값이다.
`dmg` 는 희귀도별 밸런스를 이미 반영한 값이다 (일반 ≈ 10~15 DPS, 희귀 ≈ 25~30, 에픽 ≈ 60~75, 전설 ≈ 130+범위).
오라(냉장고/CCTV/택배 접수기)는 티어당 +40%.

---

## 5. 적(손님) 데이터 구조

```ts
interface EnemyDef {
  id: string; name: string;
  hp: number; speed: number;    // px/s
  bounty: number;               // 처치 코인
  storeDamage: number;          // 계산대 도달 시 편의점 피해
  size: number;                 // 렌더 크기(배율)
  behavior: EnemyBehavior;      // 아래 참고
  tags: ('boss'|'group'|'fast'|'tank'|'zombie'|'special')[];
  lines: string[];              // 등장/중간 대사
  sprite: string; color: string;
  minWave: number;              // 등장 시작 웨이브
  weight: number;               // 웨이브 구성 가중치
  immune?: ('slow'|'stun'|'knockback')[];
}

type EnemyBehavior =
  | { kind: 'walk' }
  | { kind: 'drunk'; wobbleEvery: number; backDur: number }             // 주기적으로 뒤로 비틀거림
  | { kind: 'linger'; atDist: number; duration: number; growPerSec: number } // 라면 코너에서 머물며 강해짐
  | { kind: 'askPrice'; every: number; stopDur: number; blockRadius: number }
  | { kind: 'charger'; every: number; disableDur: number; radius: number } // 근처 유닛 마비
  | { kind: 'panic'; speedUp: number; dur: number }                     // 화장실: 맞으면 가속
  | { kind: 'buffer'; radius: number; speedBuff: number }               // 사장님 불러
  | { kind: 'blink'; visibleFor: number; hiddenFor: number }            // 유령
  | { kind: 'boss'; pattern: BossPatternKind };

interface Enemy {
  id: number; defId: string;
  hp: number; maxHp: number;
  dist: number;                 // 경로 진행 거리(px). 위치는 경로에서 계산
  baseSpeed: number;
  slow: { pct: number; until: number };
  stun: number;                 // 남은 시간
  dot: { dps: number; until: number };
  hidden: boolean;              // 타겟 불가
  stateTimer: number; stateFlag: number;  // 행동 AI용
  bubble?: { text: string; until: number };
  groupId?: number;             // 술 취한 친구들(붙어서 이동)
  isBoss: boolean; bossPhase: number;
  spawnedWave: number;
  reached: boolean;
}
```

**체력 스케일**: `hp × (1 + 0.16·w + 0.022·w²)` (w = 웨이브). 웨이브 10 ≈ ×4.8, 20 ≈ ×13,
30 ≈ ×25.6, 40 ≈ ×42.6. 40 이후는 추가로 ×1.1/웨이브. 웨이브 시작마다 "시급" `40 + 9w` 코인 지급(죽음의 소용돌이 방지).

---

## 6. 웨이브 구조

- 웨이브는 **시간제**(기본 22초에서 웨이브마다 0.22초씩 짧아짐, 최소 14초, 보스 36초. 1~10웨이브는 6→0초를 추가로 깎아 16초부터 시작). 시간이 끝나면 살아있는 손님이 있어도
  다음 웨이브가 시작된다 (손님이 누적되며 압박).
- 웨이브 안에서 스폰은 시간 분산: `SpawnEntry { at: number; defId: string; count: number }`.
- 웨이브 클리어 보너스: 다음 웨이브 시작 전에 이번 웨이브 손님(이벤트 스폰·보스 소환물 포함)을 전부 처리하면 `40 + 8·w` 코인. 한 명이라도 계산대에 도달하면 보너스 없음.
- 구성: `waves.ts`의 `buildWave(w, rng)` 가 (1) 총 개체 수 `4 + 1.4w` (2) 해금된 손님 풀에서
  가중치 뽑기 (3) 특정 웨이브의 스크립트(새벽 3시 러시, 보스) 를 합쳐 반환한다.
- 시계: 00:00 시작, 웨이브당 15분 진행. 웨이브 13 시작 = 03:00 → "새벽 3시입니다" 20명 러시 + 진상.
- 해금 순서: 1 기본 / 3 담배 / 4 술취한 / 5 가격 / 6 라면 / 7 배달 / 8 단체 / 9 술친구 /
  10 **보스** / 11 봉투 / 13 새벽3시+진상 / 14 충전기 / 15 택배 / 16 화장실 / 17 사장님불러 /
  18 유령 / 20 **보스** / 22 좀비 / 30 **보스** / 40 **보스** / 이후 10마다 보스 순환.

---

## 7. 합성 구조

- 조건: **같은 유닛 id + 같은 티어 3개**.
- 결과 (RNG):
  - 70%: 같은 유닛 티어+1 (강화)
  - 25%: 한 단계 높은 희귀도의 랜덤 유닛, 같은 티어 (새 상위 유닛)
  - 5%: 특수 — 전설(점장) 또는 special 유닛(편의점 고양이 / 10년차 알바), 같은 티어
  - 전설/special 입력은 항상 티어+1. 티어 5는 합성 불가.
- 결과 유닛은 3개 중 첫 유닛 슬롯에 배치되고 나머지 2개 슬롯은 비워진다.
- UI: 하단 패널에 합성 가능한 그룹이 빛나는 버튼으로 뜬다. 한 번 탭으로 합성.
- 결과 희귀도가 입력보다 높으면 별도 연출(플래시 + 사운드).

---

## 8. 이벤트 구조

```ts
interface EventDef {
  id: string; title: string; desc: string;
  minWave: number; weight: number;
  duration: number;            // 0이면 즉시형
  kind: 'good' | 'bad' | 'neutral';
  apply: (state, ctx) => void;   // 즉시 효과 (스폰, 코인 등)
  modifiers?: Partial<Modifiers>; // 지속 효과(배율). 만료 시 자동 해제
}
interface Modifiers {
  enemySpeed: number; unitAtkSpeed: number; unitDmg: number;
  coinGain: number; auraMult: number;    // auraMult: CCTV 등 지원 오라 배율
  unitDmgById: Record<string, number>;   // 특정 유닛 타입 배율
  enemySpeedById: Record<string, number>;
  darkness: number; rain: boolean;       // 연출 플래그
}
```
- 웨이브 3부터 32~48초마다 하나 발생. 보스 웨이브 중에는 발생하지 않는다.
- 배너 텍스트 + 사운드로 알리고 지속형은 HUD에 남은 시간 표시.
- 23종 구현 (요구 15종). 진상 등장 이벤트는 진상 해금(웨이브 13) 이후에만 나온다.

---

## 9. 저장 데이터 구조 (localStorage)

키: `cvs-night-shift:v1`

```ts
interface SaveData {
  version: 1;
  bestWave: number;
  bestTime: number;            // 초
  bestKills: number;
  totalPlays: number;
  totalKills: number;
  unlockedUnits: string[];     // 한 번이라도 획득한 유닛 id (도감)
  seenEnemies: string[];
  metaPoints: number;          // 야간 수당 (메타 화폐)
  metaLevels: Record<MetaUpgradeId, number>;
  muted: boolean;
  lastRun?: { wave; time; kills; coins; mvp };
}
```
- 로드 시 버전 확인 → 누락 필드는 기본값으로 채움 (마이그레이션).
- 매 게임오버 시 저장. 메타 상점 구매 시 즉시 저장. try/catch로 사파리 프라이빗 모드 대응.
- 메타 화폐: 한 판에서 획득한 코인의 10% + 웨이브×5 + 처치 수×0.2 를 "야간 수당"으로 지급.

메타 업그레이드(각 5레벨): 시작 코인 +100 / 초기 체력 +15 / 뽑기 비용 -6 /
희귀 확률 +1.5%p / 에픽·전설 확률 +0.7%p·0.2%p / 코인 획득 +6%.

---

## 10. UI 구조

```
세로(모바일/릴스 9:16)                 가로(PC)
┌──────────────┐                      ┌───────────────┬─────────┐
│ HUD (시간/웨이브/체력/코인/기록)│      │ HUD           │         │
├──────────────┤                      ├───────────────┤  하단   │
│              │                      │               │  패널   │
│  Canvas(정사각)│                     │  Canvas(정사각) │ (우측)  │
│              │                      │               │         │
├──────────────┤                      │               │         │
│ 하단 패널     │                      │               │         │
│ [유닛 뽑기 120원]│                    │               │         │
│ 합성 버튼들 / 보유 유닛 │              └───────────────┴─────────┘
└──────────────┘
```

- 필드 논리 좌표 640×640. CSS로 컨테이너에 맞춰 스케일(정사각 유지). 진열대 3줄 × 7칸 = 21 슬롯.
- 경로(S자): 입구(좌상) → 음료 코너(1열, 우로) → 과자 코너(2열, 좌로) → 라면 코너(3열, 우로)
  → 계산대(하단 중앙).
- 조작: 탭/클릭 하나로 전부. 유닛 탭 → 선택(정보/판매) → 빈 슬롯 탭 = 이동, 다른 유닛 탭 = 교환.
- 배너(Banner): 중앙 대형 텍스트. LEGENDARY / WARNING / 보스 이름 / WAVE CLEAR / 새벽 3시입니다.
- 버튼 최소 높이 48px. 뽑기 버튼은 화면에서 가장 크고 밝은 요소.
