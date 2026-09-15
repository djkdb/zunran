# UI 방향 시안

`전체적 디자인이 너무 AI 티 난다`는 피드백에 대한 디자인 캔버스 원본입니다.
게임 필드(픽셀 매장)는 그대로 두고, 그걸 감싼 껍데기(HUD·버튼·칩·타이포)만 바꾸는 세 방향을 그렸습니다.

| 파일 | 내용 |
| --- | --- |
| `Now.dc.html` | 이전 화면 진단 (AI 티가 나는 5가지 이유) |
| `Main.dc.html` | **A · 간판 (채택)** — 납작한 원색, 각진 모서리, 가격표 스티커, Black Han Sans |
| `Shipped.dc.html` | A안을 코드에 적용한 실제 화면 |
| `Receipt.dc.html` | B · 영수증 — 감열지, 고정폭 글꼴, 절취선, 바코드, 붉은 도장 |
| `Monitor.dc.html` | C · 심야 모니터 — 호박색 인광, 스캔라인, 타임스탬프, REC |
| `Spec.dc.html` | A안 구성 요소 규격 (색·글자·버튼·막대·칩·배너·아이콘) |
| `canvas.json` | 캔버스 배치와 메모 |
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
  --artboard Main.dc.html --artboard Now.dc.html --artboard Shipped.dc.html \
  --artboard Spec.dc.html --artboard Receipt.dc.html --artboard Monitor.dc.html \
  --image field.jpg --image now.jpg --image shipped.jpg --canvas canvas.json
```

캡처 이미지는 `npm run preview` 를 띄운 상태에서 Playwright 로 만들었다.

## 적용 상태

**A(간판)으로 확정되어 코드에 반영 완료.** 구현 규격은 `Spec.dc.html` 과 `src/styles.css` 상단 주석 참고.
B·C 는 미채택이며 기록용으로 남겨둔다.
