import { useState } from 'react';
import { readStudy, setStudyEnabled, studySummary } from '../platform/study';
export function StudySettings() {
  const [study, setStudy] = useState(readStudy);
  const [report, setReport] = useState('');
  const summary = study ? studySummary(study) : null;
  return <div className="study-settings">
    <b>플레이 테스트 참여</b>
    <p>동의하면 실행·새 근무·이어하기·10초 이상 플레이·종료 시각을 이 기기에만 기록합니다. 닉네임은 포함하지 않으며 자동 전송하지 않습니다.</p>
    <button className="sheet-row" aria-pressed={!!study} onClick={() => {
      setStudyEnabled(!study); setStudy(readStudy()); setReport('');
    }}>{study ? '참여 중 · 끄고 테스트 기록 삭제' : '동의하고 테스트 기록 시작'}</button>
    {summary && <>
      <p>시작 {summary.starts}회 · 완료 {summary.finishes}회<br />D1 {summary.d1} · D7 {summary.d7}</p>
      <p>첫 실제 플레이 후 24~48시간 / 168~192시간 내 재플레이 기준입니다. 다른 기기 기록은 합쳐지지 않습니다.</p>
      <button className="sheet-row" onClick={() => setReport(JSON.stringify({ exportedAt: Date.now(), ...readStudy() }, null, 2))}>테스트 기록 보기·복사</button>
    </>}
    {report && <label>아래 기록을 선택해 복사한 뒤 테스트 담당자에게 전달하세요.<textarea aria-label="테스트 기록" readOnly value={report} onFocus={(e) => e.currentTarget.select()} /></label>}
  </div>;
}
