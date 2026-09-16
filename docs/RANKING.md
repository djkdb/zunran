# 글로벌 랭킹판

모두의 실제 플레이 기록이 올라가는 랭킹판이다. 판이 끝나면 자동으로 전송되고,
시작 화면의 **랭킹** 탭에서 볼 수 있다.

## 구조

```
브라우저                         Cloudflare Pages
─────────                        ────────────────
게임 종료
  └ src/game/rank/payload.ts     POST /api/rank/submit
      buildPayload()        ───▶   functions/api/rank/submit.ts
                                     └ validateScore()  ← 기록 검증
                                     └ insertEntry()    ← KV 읽고-고쳐-쓰기
랭킹 탭
  └ src/ui/RankScreen.tsx        GET /api/rank/daily | all
                            ───▶   functions/api/rank/[board].ts
```

정렬·삽입 규칙(`src/game/rank/board.ts`)과 검증 규칙(`src/game/rank/validate.ts`)은
클라이언트·서버·테스트가 같은 파일을 쓴다. 규칙이 갈라질 일이 없다.

## 보드

| 보드 | 키 | 올라가는 기록 |
| --- | --- | --- |
| 오늘의 근무 | `board:daily:YYYY-MM-DD` | ZUNRAN DAILY 규칙으로 뛴 판 |
| 전체 최고 | `board:all` | 일반 근무 |

데일리는 그날 모두가 같은 시드·같은 규칙으로 뛰므로 전체 보드와 섞지 않는다.
한 보드에 한 사람당 최고 기록 하나만 남고, 보드당 상위 100개를 보관한다.
순위는 **웨이브 → 소요 시간 → 처치 수** 순으로 매긴다.

## 설치 (Cloudflare 대시보드, 가장 간단)

1. Cloudflare 대시보드 → **Storage & Databases → KV → Create namespace**
   이름은 아무거나 (예: `zunran-rank`).
2. **Workers & Pages → 프로젝트(zunran) → Settings → Bindings → Add → KV namespace**
   - Variable name: `RANK_KV`  ← 이 이름이어야 한다
   - KV namespace: 1번에서 만든 것
   - Production 과 Preview 양쪽에 걸어 준다.
3. 재배포. `functions/` 디렉터리는 저장소 루트에 있으므로 Pages 가 자동으로 잡는다.

CLI 로 하려면 `wrangler.toml.example` 을 `wrangler.toml` 로 복사해서 쓴다.

## 바인딩이 없으면

API 는 503 `{"ok":false,"reason":"no-kv"}` 를 돌려주고, 게임은 그대로 돌아간다.
랭킹 탭에는 "랭킹 서버가 아직 연결되지 않았습니다"가 뜨고 **내 기록** 탭은
기기에 저장된 기록으로 정상 동작한다. 전송 실패는 게임 흐름을 막지 않는다.

## 표시 이름

이름을 정하기 전에는 기록을 **올리지 않고 보류**한다. 판이 끝나면 게임오버 화면이
이름을 물어보고, 넣으면 그때 전송한다. 아무 이름으로나 올려 두면 되돌리기 번거롭다.

나중에 이름을 바꾸면 `POST /api/rank/rename` 이 이미 올라간 기록의 이름도 같이 바꾼다
(전체 보드 + 그날 데일리 보드). 기록 숫자는 건드리지 않는다. KV 의 `expirationTtl`
최소값이 60초라 1분에 한 번으로 제한되는데, 막혀도 문제없다 - 이름은 기기에 이미
저장됐고 다음 판 기록을 올릴 때 보드 이름이 갱신된다(`insertEntry` 가 기록은 최고를
남기고 이름만 최신으로 덮는다).

## 기록 검증이 하는 일 / 못 하는 일

`validateScore()` 는 숫자끼리 앞뒤가 맞는지를 본다.

- 웨이브에 도달하려면 최소 이만큼 시간이 걸린다 (2배속 감안)
- 그 웨이브까지 나올 수 있는 손님 수보다 많이 잡을 수 없다
- 콤보 ≤ 처치 수, 보스 처치 ≤ ⌊웨이브/10⌋+1
- 합성 1회에 유닛 3개가 들어가므로 뽑기 수 대비 합성 수에 상한이 있다
- 코인 상한, 값의 형식·부호·범위
- 한 사람이 1분 안에 두 번 올릴 수 없다 (최단 런도 수 분이 걸린다)

**못 하는 것**: 게임을 실제로 다시 돌려 보는 검증은 하지 않는다. 10분짜리 런을
워커에서 재생하는 건 CPU 한도 안에서 불가능하다. 따라서 "그럴듯한 범위 안에서
조작한 기록"은 통과할 수 있다. 캐주얼한 조작은 걸러지지만, 작정한 조작은 막지 못한다.

## 개인정보

서버에 올라가는 것은 표시 이름, 기록 숫자, 기기 식별자 **앞 8자**뿐이다.
기기 식별자는 브라우저에서 만든 임의의 값이고 계정·이메일과 무관하다.
랭킹 탭에서 **랭킹 등록**을 끄면 아무것도 전송하지 않는다.

## 로컬에서 확인

`vite dev` / `vite preview` 에는 Functions 가 없다. `/api/*` 가 JSON 이 아닌
응답을 주므로 "서버 미연결"로 표시된다. 실제로 돌려 보려면:

```
npm run build
npx wrangler pages dev dist --kv RANK_KV
```
