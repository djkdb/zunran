// node scripts/summarize-study.mjs report1.json report2.json ...
// Only voluntarily supplied physical-device reports belong in a real cohort.
import { readFile } from 'node:fs/promises';
const files = process.argv.slice(2);
if (!files.length) throw new Error('테스터가 전달한 JSON 파일 경로를 지정하세요.');
const latest = new Map();
for (const file of files) {
  const r = JSON.parse(await readFile(file, 'utf8'));
  if (r.version !== 1 || typeof r.id !== 'string' || !Number.isFinite(r.exportedAt) || !Array.isArray(r.events)) throw new Error(`유효하지 않은 보고서: ${file}`);
  if (!latest.has(r.id) || latest.get(r.id).exportedAt < r.exportedAt) latest.set(r.id, r);
}
const reports = [...latest.values()];
const result = { reports: reports.length, played: 0, startedTwice: 0, d1: { eligible: 0, returned: 0 }, d7: { eligible: 0, returned: 0 } };
for (const r of reports) {
  const plays = r.events.filter((e) => e.type === 'play' && Number.isFinite(e.at)).sort((a, b) => a.at - b.at);
  if (!plays.length) continue;
  result.played++;
  if (new Set(r.events.filter((e) => e.type === 'start').map((e) => e.runId)).size >= 2) result.startedTwice++;
  for (const [key, day] of [['d1', 1], ['d7', 7]]) {
    const from = plays[0].at + day * 86400000;
    const until = from + 86400000;
    if (r.exportedAt < until) continue; // No observation after an export was made.
    result[key].eligible++;
    if (plays.some((e) => e.at >= from && e.at < until)) result[key].returned++;
  }
}
console.log(JSON.stringify(result, null, 2));
console.log('분모는 보고서를 전달했고 관찰 기간이 끝난 기기입니다. 미제출자/기록 삭제/재설치는 파악할 수 없어 전체 모집자의 유지율로 해석할 수 없습니다.');
