// 앱 아이콘 생성. 게임의 아케이드 스타일(짙은 보라 + 민트 3px 테두리 + 24H 간판)을
// 그대로 쓴다. Chromium 으로 그려서 PNG 로 뽑는다 — 외부 디자인 툴이 필요 없다.
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Silkscreen 의 라틴(U+0000-00FF) 서브셋만 필요하다. 여러 서브셋을 한 family 로
// 겹쳐 등록하면 unicode-range 없이는 뒤엣것이 이겨 글자가 빠진다 — 파일을 정확히 고른다.
const css = readFileSync('public/fonts.css', 'utf8');
const latinBold = [...css.matchAll(/@font-face \{(.*?)\}/gs)]
  .map((m) => m[1])
  .filter((b) => b.includes('Silkscreen') && b.includes('font-weight: 700') && b.includes('U+0000-00FF'))
  .map((b) => /url\(\.\/fonts\/([^)]+)\)/.exec(b)[1])[0];
if (!latinBold) throw new Error('Silkscreen 라틴 서브셋을 찾지 못했다');
// about:blank 문서에서는 file:// 하위 리소스가 차단된다. woff2 를 그대로 인라인한다.
const b64 = readFileSync(resolve('public/fonts', latinBold)).toString('base64');
const faces = `@font-face{font-family:PX;src:url(data:font/woff2;base64,${b64}) format('woff2');font-display:block;}`;

// pad = 마스커블용 안전 영역 (원형으로 잘려도 내용이 안 잘리게 여백을 키운다)
const page = (size, pad) => `<!doctype html><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${size}px;height:${size}px;background:#120e24;overflow:hidden}
.wrap{position:relative;width:100%;height:100%;display:grid;place-items:center;padding:${pad}px}
.card{position:relative;width:100%;height:100%;display:grid;place-items:center;background:#1b1533;
  --b:${Math.round(size * 0.028)}px;--n:${Math.round(size * 0.028)}px;
  background-image:linear-gradient(#4fe3d0,#4fe3d0),linear-gradient(#4fe3d0,#4fe3d0),linear-gradient(#4fe3d0,#4fe3d0),linear-gradient(#4fe3d0,#4fe3d0);
  background-repeat:no-repeat;
  background-size:calc(100% - var(--n)*2) var(--b),calc(100% - var(--n)*2) var(--b),var(--b) calc(100% - var(--n)*2),var(--b) calc(100% - var(--n)*2);
  background-position:var(--n) 0,var(--n) 100%,0 var(--n),100% var(--n);}
.sign{font-family:PX;font-weight:700;font-size:${Math.round(size * 0.27)}px;color:#120e24;background:#4fe3d0;
  padding:${Math.round(size * 0.035)}px ${Math.round(size * 0.055)}px;letter-spacing:0.04em;line-height:1;}
.bar{position:absolute;left:${Math.round(size * 0.17)}px;right:${Math.round(size * 0.17)}px;
  bottom:${Math.round(size * 0.2)}px;height:${Math.round(size * 0.05)}px;display:flex;gap:${Math.round(size * 0.022)}px}
.bar i{flex:1;background:#2b2352}
.bar i:nth-child(-n+3){background:#ff4d8d}
</style><div class="wrap"><div class="card"><div class="sign">24H</div>
<div class="bar"><i></i><i></i><i></i><i></i><i></i></div></div></div>`;

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const targets = [
  ['icon-1024.png', 1024, 0],
  ['icon-512.png', 512, 0],
  ['icon-192.png', 192, 0],
  ['apple-touch-icon.png', 180, 0],
  ['icon-512-maskable.png', 512, 56], // 안전 영역 확보
];
for (const [name, size, pad] of targets) {
  const c = await b.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  await p.setContent(page(size, pad));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  const ok = await p.evaluate(() => document.fonts.check('700 40px PX'));
  if (!ok) throw new Error('픽셀 폰트가 로드되지 않았다 — 아이콘이 폴백 글꼴로 나온다');
  writeFileSync(`public/icons/${name}`, await p.screenshot({ omitBackground: false }));
  console.log(`${name}  ${size}x${size}`);
  await c.close();
}
await b.close();
