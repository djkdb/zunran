# UI 방향 시안

`전체적 디자인이 너무 AI 티 난다`는 피드백에 대한 디자인 캔버스 원본입니다.
게임 필드(픽셀 매장)는 그대로 두고, 그걸 감싼 껍데기(HUD·버튼·칩·타이포)만 바꾸는 세 방향을 그렸습니다.

| 파일 | 내용 |
| --- | --- |
| `Now.dc.html` | 현재 화면 진단 (AI 티가 나는 5가지 이유) |
| `Main.dc.html` | A · 간판 — 납작한 원색, 각진 모서리, 가격표 스티커, Black Han Sans |
| `Receipt.dc.html` | B · 영수증 — 감열지, 고정폭 글꼴, 절취선, 바코드, 붉은 도장 |
| `Monitor.dc.html` | C · 심야 모니터 — 호박색 인광, 스캔라인, 타임스탬프, REC |
| `Spec.dc.html` | A안 구성 요소 규격 (색·글자·버튼·막대·칩·배너·아이콘) |
| `canvas.json` | 캔버스 배치와 메모 |
| `field.jpg`, `now.jpg` | 실제 게임 캡처 (시안에 삽입) |

퍼블리시된 캔버스: https://claude.ai/artifact/KAJ84mSTweixbbftpVFyQy

## 다시 만들기

`.dc.html` 원본을 고친 뒤 캔버스를 새로 생성한다. 결과 HTML(2.5MB)은 git 에 올리지 않는다.

```bash
cd design
node "<design 스킬 경로>/seed-canvas.mjs" \
  --template "<design 스킬 경로>/payload.template.html" \
  --out cvs-night-shift-ui-directions.html \
  --title "편의점 야간근무 UI 방향" \
  --artboard Main.dc.html --artboard Now.dc.html --artboard Receipt.dc.html \
  --artboard Monitor.dc.html --artboard Spec.dc.html \
  --image field.jpg --image now.jpg --canvas canvas.json
```

`field.jpg` / `now.jpg` 는 `npm run preview` 를 띄운 상태에서 Playwright 로 캡처했다.
