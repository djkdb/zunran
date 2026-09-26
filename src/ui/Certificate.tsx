import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunResult } from '../App';
import { UNIT_BY_ID } from '../game/data/units';
import { formatTime } from '../game/config';
import { audio } from '../game/audio/sfx';
import { Icon } from './Icon';

// 근무 인증서를 Canvas 로 직접 그린다.
// DOM 캡처 라이브러리를 새로 넣지 않고, 외부 서버도 쓰지 않는다.
// 인증서에 박히는 주소. 인스타에 올라간 이미지가 스스로 길을 알려줘야 한다.
export const SITE = 'zunran.pages.dev';

const W = 540;
const H = 648;

const C = {
  bg: '#120e24',
  panel: '#1b1533',
  edge: '#3a2f63',
  mint: '#4fe3d0',
  pink: '#ff4d8d',
  gold: '#ffd84d',
  text: '#efeaff',
  dim: '#8a7fb8',
  off: '#6b6194',
};

// 3px 링 + 모서리 노치 (게임 UI 와 같은 픽셀 테두리)
function pxFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, t = 3) {
  ctx.fillStyle = color;
  ctx.fillRect(x + t, y, w - t * 2, t);
  ctx.fillRect(x + t, y + h - t, w - t * 2, t);
  ctx.fillRect(x, y + t, t, h - t * 2);
  ctx.fillRect(x + w - t, y + t, t, h - t * 2);
}

function drawCertificate(ctx: CanvasRenderingContext2D, r: RunResult): void {
  const mvpName = r.mvp ? (UNIT_BY_ID[r.mvp]?.name ?? '-') : '-';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // 배경 체크 무늬 (매장 바닥)
  ctx.fillStyle = '#171231';
  for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 === 0 ? 0 : 24; x < W; x += 48) ctx.fillRect(x, y, 24, 24);

  const pad = 26;
  pxFrame(ctx, pad, pad, W - pad * 2, H - pad * 2, C.mint);

  ctx.textAlign = 'center';
  ctx.fillStyle = C.mint;
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.fillText('ZUNRAN NIGHT SHIFT', W / 2, pad + 42);

  ctx.fillStyle = C.text;
  ctx.font = 'bold 34px "Do Hyeon", system-ui, sans-serif';
  ctx.fillText('야간근무 인증서', W / 2, pad + 88);

  // 런 제목
  const titleY = pad + 118;
  ctx.fillStyle = '#2b1030';
  ctx.fillRect(pad + 18, titleY, W - (pad + 18) * 2, 46);
  pxFrame(ctx, pad + 18, titleY, W - (pad + 18) * 2, 46, C.pink);
  ctx.fillStyle = C.pink;
  ctx.font = 'bold 21px "Do Hyeon", system-ui, sans-serif';
  ctx.fillText(`「${r.runTitle}」`, W / 2, titleY + 31);

  // 숫자 4칸
  const cells: [string, string][] = [
    ['WAVE', String(r.wave)],
    ['근무시간', formatTime(r.time)],
    ['처리한 손님', String(r.kills)],
    ['최고 콤보', String(r.bestCombo)],
  ];
  const gridY = titleY + 66;
  const cw = (W - pad * 2 - 18 * 2 - 12) / 2;
  const ch = 92;
  cells.forEach(([label, value], i) => {
    const x = pad + 18 + (i % 2) * (cw + 12);
    const y = gridY + Math.floor(i / 2) * (ch + 12);
    ctx.fillStyle = C.panel;
    ctx.fillRect(x, y, cw, ch);
    pxFrame(ctx, x, y, cw, ch, C.edge);
    ctx.fillStyle = C.off;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(label, x + cw / 2, y + 27);
    ctx.fillStyle = C.mint;
    ctx.font = 'bold 34px ui-monospace, monospace';
    ctx.fillText(value, x + cw / 2, y + 68);
  });

  // MVP
  const mvpY = gridY + (ch + 12) * 2;
  ctx.fillStyle = C.panel;
  ctx.fillRect(pad + 18, mvpY, W - (pad + 18) * 2, 74);
  pxFrame(ctx, pad + 18, mvpY, W - (pad + 18) * 2, 74, C.gold);
  ctx.fillStyle = C.off;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('오늘의 MVP', W / 2, mvpY + 26);
  ctx.fillStyle = C.gold;
  ctx.font = 'bold 26px "Do Hyeon", system-ui, sans-serif';
  ctx.fillText(`${mvpName} T${r.mvpTier}`, W / 2, mvpY + 57);

  // 배지 줄 (데일리 / 미션 / 신기록)
  const badges: [string, string][] = [];
  if (r.challengeName) badges.push([r.challengeName, C.mint]);
  if (r.missionCleared) badges.push(['MISSION CLEAR', C.gold]);
  if (r.newRecord) badges.push(['NEW RECORD', C.pink]);
  if (badges.length > 0) {
    const by = mvpY + 96;
    ctx.font = 'bold 13px ui-monospace, monospace';
    const widths = badges.map(([t]) => ctx.measureText(t).width + 22);
    let bx = (W - (widths.reduce((a, b) => a + b, 0) + (badges.length - 1) * 8)) / 2;
    badges.forEach(([t, col], i) => {
      ctx.fillStyle = col;
      ctx.fillRect(bx, by, widths[i], 26);
      ctx.fillStyle = C.bg;
      ctx.textAlign = 'center';
      ctx.fillText(t, bx + widths[i] / 2, by + 18);
      bx += widths[i] + 8;
    });
  }

  // 마무리 문구
  ctx.textAlign = 'center';
  ctx.fillStyle = C.dim;
  ctx.font = 'bold 16px "Do Hyeon", system-ui, sans-serif';
  ctx.fillText('나는 새벽을 버텼다.', W / 2, H - pad - 48);
  ctx.fillStyle = C.off;
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(new Date().toLocaleDateString('ko-KR'), W / 2, H - pad - 28);

  // 주소. 인스타에 올라간 인증서를 본 사람이 어디로 가야 할지 알 수 있어야 한다.
  // 유입은 링크로 들어오는데 나가는 이미지에는 주소가 없었다 — 고리가 한쪽만 있었다.
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(239, 234, 255, 0.45)';
  ctx.fillText(SITE, W / 2, H - pad - 9); // 테두리 안쪽. 밖으로 내면 캔버스 끝에 잘린다
}

export function Certificate({ result, onClose }: { result: RunResult; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCertificate(ctx, result);
    audio.play('certificate');
  }, [result]);

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const c = ref.current;
        if (!c) return resolve(null);
        c.toBlob((b) => resolve(b), 'image/png');
      }),
    [],
  );

  const flash = (t: string, ms = 1800) => {
    setMsg(t);
    window.setTimeout(() => setMsg(null), ms);
  };

  const share = useCallback(async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], 'zunran-night-shift.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    // 1순위: Web Share (모바일)
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: '편의점 야간근무', text: `「${result.runTitle}」 WAVE ${result.wave}` });
        return;
      } catch {
        return; // 사용자가 취소한 경우
      }
    }
    // 2순위: 클립보드 이미지 복사
    try {
      const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (CI && navigator.clipboard?.write) {
        await navigator.clipboard.write([new CI({ 'image/png': blob })]);
        flash('인증서를 클립보드에 복사했어요');
        return;
      }
    } catch {
      // 클립보드 권한 없음 → 다운로드로
    }
    download();
  }, [result, toBlob]);

  const download = useCallback(async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zunran-w${result.wave}-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    // 인앱 브라우저(인스타·카톡)에서는 a[download] 가 대개 아무 일도 안 한다.
    // 그런데도 「저장했어요」라고 단정하고 있었다 — 성공 여부를 알 방법이 없으면
    // 단정하지 않고, 어느 쪽이든 통하는 길을 같이 알려준다.
    flash('저장했어요 · 안 되면 이미지를 길게 눌러 저장하세요', 3200);
  }, [result, toBlob]);

  return (
    <div className="cert-overlay" role="dialog" aria-label="근무 인증서" onClick={onClose}>
      <div className="cert-panel" onClick={(e) => e.stopPropagation()}>
        <canvas ref={ref} className="cert-canvas" style={{ width: W, height: H }} aria-label="야간근무 인증서" />
        <div className="cert-actions">
          <button className="menu-btn" onClick={share}>
            <Icon name="copy" size={16} strokeWidth={2.2} />
            공유하기
          </button>
          <button className="menu-btn" onClick={download}>
            <Icon name="cash" size={16} strokeWidth={2.2} />
            이미지 저장
          </button>
          <button className="menu-btn" onClick={onClose}>
            닫기
          </button>
        </div>
        {msg && <div className="cert-msg">{msg}</div>}
      </div>
    </div>
  );
}
