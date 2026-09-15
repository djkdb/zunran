# UI 방향 시안

`전체적 디자인이 너무 AI 티 난다`는 피드백에 대한 디자인 캔버스 원본입니다.
게임 필드(픽셀 매장)는 그대로 두고, 그걸 감싼 껍데기(HUD·버튼·칩·타이포)만 바꾸는 세 방향을 그렸습니다.

| 파일 | 내용 |
| --- | --- |
**1차 (AI 티 제거)** — A 간판 채택, 코드 적용 완료

| 파일 | 내용 |
| --- | --- |
| `Now.dc.html` | 최초 화면 진단 (AI 티가 나는 5가지 이유) |
| `Main.dc.html` | A · 간판 — 납작한 원색, 각진 모서리, 가격표 스티커, Black Han Sans |
| `Shipped.dc.html` | A안을 코드에 적용한 실제 화면 |
| `Receipt.dc.html` | B · 영수증 — 감열지, 고정폭 글꼴, 절취선, 바코드, 붉은 도장 |
| `Monitor.dc.html` | C · 심야 모니터 — 호박색 인광, 스캔라인, 타임스탬프, REC |
| `Spec.dc.html` | A안 구성 요소 규격 (색·글자·버튼·막대·칩·배너·아이콘) |

**2차 (간판이 전단지처럼 싸구려로 읽힌다는 피드백)** — 셸을 어둡게 가져가는 3안

| 파일 | 내용 |
| --- | --- |
| `Current.dc.html` | 현재 적용된 간판 스타일 (비교용) |
| `Midnight.dc.html` | D · 심야 — 잉크 블랙, 얇은 선, 넉넉한 여백, 민트 한 점. IBM Plex Sans KR |
| `Arcade.dc.html` | E · 아케이드 — 계단형 픽셀 테두리, 짙은 보라 위 네온. Do Hyeon + Silkscreen |
| `Sleek.dc.html` | F · 슬릭 — 차콜 위 반투명 카드, 앰버 한 점, 세리프 이름. Hahmlet + Noto Sans KR |

| 파일 | 내용 |
| --- | --- |
| `canvas.json` | 캔버스 배치·페이지·메모 (page-1 새 방향, page-2 지난 시안) |
| `field.jpg`, `now.jpg`, `shipped.jpg` | 실제 게임 캡처 (시안에 삽입) |

퍼블리시된 캔버스: https://claude.ai/artifact/KAJ84mSTweixbbftpVFyQy

## 다시 만들기

`.dc.html` 원본을 고친 뒤 캔버스를 새로 생성한다. 결과 HTML(2.5MB)은 git 에 올리지 않는다.

```bash
cd design
node "<design 스킬 경로>/seed-canvas.mjs" \
  --template "<design 스킬 경로>/payload.template.html" \
  --out cvs-night-shift-ui-directions.html \
  --title "편의점 야간근무 UI 방향" \
  --artboard Main.dc.html --artboard Current.dc.html --artboard Midnight.dc.html \
  --artboard Arcade.dc.html --artboard Sleek.dc.html --artboard Now.dc.html \
  --artboard Receipt.dc.html --artboard Monitor.dc.html --artboard Shipped.dc.html \
  --artboard Spec.dc.html \
  --image field.jpg --image now.jpg --image shipped.jpg --canvas canvas.json
```

캡처 이미지는 `npm run preview` 를 띄운 상태에서 Playwright 로 만들었다.

## 적용 상태

**1차**: A(간판)로 확정해 코드에 반영했다. 구현 규격은 `Spec.dc.html` 과 `src/styles.css` 상단 주석 참고.

**2차**: 간판이 전단지처럼 싸구려로 읽힌다는 피드백을 받아 D·E·F 세 방향을 새로 그렸다. 선택 대기 중.
셋 다 셸을 어둡게 가져가 필드와 한 화면으로 묶는 것이 공통 전제다.
