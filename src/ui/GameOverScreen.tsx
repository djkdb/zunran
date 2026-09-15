import { useState } from 'react';
import { UNIT_BY_ID } from '../game/data/units';
import { formatTime, RARITY_COLOR } from '../game/config';
import { UnitIcon } from './UnitIcon';
import { Icon } from './Icon';
import type { RunResult } from '../App';

export function GameOverScreen({ result, onRestart, onMenu }: { result: RunResult; onRestart: () => void; onMenu: () => void }) {
  const mvp = result.mvp ? UNIT_BY_ID[result.mvp] : null;
  const [copied, setCopied] = useState(false);
  const shareText = `편의점 야간근무 — 새벽 3시, 혼자 남았다.\nWAVE ${result.wave} · 생존 ${formatTime(result.time)} · 손님 ${result.kills}명 처리${mvp ? ` · MVP ${mvp.name}` : ''}${result.newRecord ? ' · 신기록' : ''}\n${location.href}`;
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
        <div className="gameover-head">
          <div className="gameover-title">영업 종료</div>
          <div className="gameover-quip">{result.quip}</div>
        </div>
        <div className="gameover-body">
          {result.newRecord && (
            <div className="new-record">
              <Icon name="trophy" size={20} strokeWidth={2.4} />
              신기록
            </div>
          )}
          <div className="gameover-stats">
            <div>
              <span>생존 시간</span>
              <b>{formatTime(result.time)}</b>
            </div>
            <div>
              <span>최고 웨이브</span>
              <b>{result.wave}</b>
            </div>
            <div>
              <span>처리한 손님</span>
              <b>{result.kills}</b>
            </div>
            <div>
              <span>획득 코인</span>
              <b>{result.coins.toLocaleString()}</b>
            </div>
            <div>
              <span>뽑기 / 합성</span>
              <b>
                {result.draws}/{result.merges}
              </b>
            </div>
            <div>
              <span>보스 처치</span>
              <b>{result.bossKills}</b>
            </div>
          </div>
          {mvp && (
            <div className="mvp">
              <div className="mvp-rarity" style={{ background: RARITY_COLOR[mvp.rarity] }} />
              <div className="mvp-inner">
                <UnitIcon defId={mvp.id} size={42} />
                <div>
                  <div className="mvp-label">이번 근무 MVP</div>
                  <div className="mvp-name">{mvp.name}</div>
                  <div className="mvp-dmg">누적 피해 {result.mvpDamage.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}
          <div className="gameover-summary">이번 야간근무에서 처리한 손님: {result.kills}명</div>
          <div className="gameover-points">
            <Icon name="cash" size={18} strokeWidth={2.4} />
            야간 수당 +{result.metaPoints}
          </div>
          <div className="gameover-actions">
            <button className="start-btn" onClick={onRestart}>
              <Icon name="restart" size={24} strokeWidth={2.4} />
              다시 하기
            </button>
            <button className="menu-btn" onClick={onMenu}>
              메인으로 (강화 상점)
            </button>
            <button className="menu-btn" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={16} strokeWidth={2.2} />
              {copied ? '복사됨' : '결과 복사 (공유용)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
