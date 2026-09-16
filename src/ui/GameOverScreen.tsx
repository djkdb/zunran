import { useEffect, useState } from 'react';
import { formatTime } from '../game/config';
import { audio } from '../game/audio/sfx';
import { ACHIEVEMENT_BY_ID } from '../game/data/achievements';
import type { SaveData } from '../game/save/storage';
import { RunReport } from './RunReport';
import { Certificate } from './Certificate';
import { Icon } from './Icon';
import type { SubmitResult } from '../game/rank/api';
import { NicknameField } from './NicknameField';
import type { RunResult } from '../App';

interface Props {
  result: RunResult;
  save: SaveData;
  rank: SubmitResult | null;
  needName: boolean; // 이름을 아직 안 정해서 전송을 보류 중
  onSubmitName: (name: string) => void;
  onRestart: () => void;
  onMenu: () => void;
}

// 랭킹 전송 결과를 한 줄로. 실패해도 "실패"라고만 말하지 않고 왜인지 알려 준다.
function rankLine(rank: SubmitResult | null, optIn: boolean): string | null {
  if (!optIn) return '랭킹 등록이 꺼져 있어 기록을 올리지 않았습니다.';
  if (!rank) return null; // 아직 전송 중
  switch (rank.status) {
    case 'ok':
      return rank.myRank ? `글로벌 랭킹 ${rank.myRank}위` : '랭킹에 기록을 올렸습니다';
    case 'unconfigured':
      return null; // 서버 미연결은 조용히 넘어간다
    case 'offline':
      return '네트워크가 끊겨 랭킹에 올리지 못했습니다';
    case 'rate-limited':
      return '잠시 뒤에 다시 올라갑니다';
    case 'rejected':
      return '기록 검증에 걸려 랭킹에 올리지 않았습니다';
    default:
      return '랭킹 전송에 실패했습니다';
  }
}

export function GameOverScreen({ result, save, rank, needName, onSubmitName, onRestart, onMenu }: Props) {
  const [copied, setCopied] = useState(false);
  const [cert, setCert] = useState(false);
  // 업적을 하나씩 띄운다 (한꺼번에 쏟아지면 안 읽힌다)
  const [toastIdx, setToastIdx] = useState(0);

  useEffect(() => {
    if (result.unlocked.length === 0) return;
    if (toastIdx >= result.unlocked.length) return;
    audio.play('achievement');
    const t = window.setTimeout(() => setToastIdx((i) => i + 1), 1700);
    return () => clearTimeout(t);
  }, [toastIdx, result.unlocked.length]);

  useEffect(() => {
    if (result.missionCleared) audio.play('missionClear');
  }, [result.missionCleared]);

  const shareText = `편의점 야간근무 —「${result.runTitle}」\nWAVE ${result.wave} · 생존 ${formatTime(result.time)} · 손님 ${result.kills}명 처리${
    result.bestCombo ? ` · 최고 콤보 ${result.bestCombo}` : ''
  }${result.newRecord ? ' · 신기록' : ''}\n${location.href}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 조용히 무시
    }
  };

  const rankMsg = rankLine(rank, save.rankOptIn);
  const current = result.unlocked[toastIdx] ? ACHIEVEMENT_BY_ID[result.unlocked[toastIdx]] : null;

  return (
    <div className="gameover">
      {current && (
        <div className="ach-toast" role="status">
          <span className="ach-toast-icon">
            <Icon name={current.icon} size={22} strokeWidth={2.2} />
          </span>
          <span className="ach-toast-body">
            <span className="ach-toast-label px">ACHIEVEMENT</span>
            <span className="ach-toast-title">{current.title}</span>
          </span>
        </div>
      )}

      <div className="gameover-card">
        <div className="gameover-head">
          <div className="gameover-title">영업 종료</div>
          <div className="gameover-quip">{result.quip}</div>
          {result.challengeName && <div className="gameover-daily px">ZUNRAN DAILY · {result.challengeName}</div>}
        </div>
        <div className="gameover-body">
          {result.newRecord && (
            <div className="new-record">
              <Icon name="trophy" size={20} strokeWidth={2.4} />
              신기록
            </div>
          )}

          <RunReport result={result} />

          <div className="gameover-points">
            <Icon name="cash" size={18} strokeWidth={2.4} />
            야간 수당 +{result.metaPoints}
          </div>

          {needName ? (
            <div className="gameover-rank ask">
              <NicknameField
                value=""
                onSave={onSubmitName}
                label="랭킹에 올릴 이름을 정해 주세요"
                cta="올리기"
                required
              />
            </div>
          ) : (
            rankMsg && (
              <div className={`gameover-rank ${rank?.status === 'ok' ? 'ok' : ''}`}>
                <Icon name="trophy" size={15} strokeWidth={2.4} />
                {rankMsg}
              </div>
            )
          )}

          <div className="gameover-actions">
            <button className="start-btn" onClick={onRestart}>
              <Icon name="restart" size={24} strokeWidth={2.4} />
              다시 하기
            </button>
            <button className="menu-btn cert-open" onClick={() => setCert(true)}>
              <Icon name="trophy" size={16} strokeWidth={2.2} />
              근무 인증서 보기
            </button>
            <button className="menu-btn" onClick={onMenu}>
              메인으로 (업적 {save.achievements.length})
            </button>
            <button className="menu-btn" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={16} strokeWidth={2.2} />
              {copied ? '복사됨' : '결과 복사 (텍스트)'}
            </button>
          </div>
        </div>
      </div>

      {cert && <Certificate result={result} onClose={() => setCert(false)} />}
    </div>
  );
}
