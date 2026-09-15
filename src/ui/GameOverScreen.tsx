import { useState } from 'react';
import { UNIT_BY_ID } from '../game/data/units';
import { formatTime, RARITY_COLOR } from '../game/config';
import { UnitIcon } from './UnitIcon';
import type { RunResult } from '../App';

export function GameOverScreen({ result, onRestart, onMenu }: { result: RunResult; onRestart: () => void; onMenu: () => void }) {
  const mvp = result.mvp ? UNIT_BY_ID[result.mvp] : null;
  const [copied, setCopied] = useState(false);
  const shareText = `🏪 편의점 야간근무 — 새벽 3시, 혼자 남았다.\nWAVE ${result.wave} · 생존 ${formatTime(result.time)} · 손님 ${result.kills}명 처리${mvp ? ` · MVP ${mvp.name}` : ''}${result.newRecord ? ' · 🏆 NEW RECORD' : ''}\n${location.href}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 조용히 무시
    }
  };
  return (
    <div className="gameover">
      <div className="gameover-card">
        <div className="gameover-title">영업 종료</div>
        <div className="gameover-quip">{result.quip}</div>
        {result.newRecord && <div className="new-record">🏆 NEW RECORD!</div>}
        <div className="gameover-stats">
          <div>
            <span>생존 시간</span>
            <b>{formatTime(result.time)}</b>
          </div>
          <div>
            <span>최고 웨이브</span>
            <b>WAVE {result.wave}</b>
          </div>
          <div>
            <span>처리한 손님</span>
            <b>{result.kills}명</b>
          </div>
          <div>
            <span>획득 코인</span>
            <b>{result.coins.toLocaleString()}원</b>
          </div>
          <div>
            <span>뽑기 / 합성</span>
            <b>
              {result.draws} / {result.merges}
            </b>
          </div>
          <div>
            <span>보스 처치</span>
            <b>{result.bossKills}</b>
          </div>
        </div>
        {mvp && (
          <div className="mvp" style={{ borderColor: RARITY_COLOR[mvp.rarity] }}>
            <UnitIcon defId={mvp.id} size={44} />
            <div>
              <div className="mvp-label">이번 근무 MVP</div>
              <div className="mvp-name">{mvp.name}</div>
              <div className="mvp-dmg">누적 피해 {result.mvpDamage.toLocaleString()}</div>
            </div>
          </div>
        )}
        <div className="gameover-summary">이번 야간근무에서 처리한 손님: {result.kills}명</div>
        <div className="gameover-points">💵 야간 수당 +{result.metaPoints}</div>
        <div className="gameover-actions">
          <button className="start-btn" onClick={onRestart}>
            🔁 다시 하기
          </button>
          <button className="menu-btn" onClick={onMenu}>
            메인으로 (강화 상점)
          </button>
          <button className="menu-btn" onClick={copy}>
            {copied ? '✅ 복사됨!' : '📋 결과 복사 (공유용)'}
          </button>
        </div>
      </div>
    </div>
  );
}
