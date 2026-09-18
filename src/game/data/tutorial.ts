import type { UISnapshot } from '../types';

// 첫 판 안내 단계.
//
// 규칙을 글로 4줄 읽히는 대신 다섯 가지를 직접 해보게 한다. 이 게임이
// 뽑기 게임이 아니라 '합성해서 키우고 자리를 잡아주는' 게임이라는 걸
// 설명으로 아는 것과 한 번 해본 것은 다르다.
//
// 판정은 전부 이미 있는 통계에서 읽는다. 안내 전용 플래그를 새로 만들면
// 저장 구조와 엔진에 안내용 상태가 번지므로 그러지 않는다.
export interface TutorialStep {
  id: string;
  label: string;
  done: boolean;
}

export function tutorialSteps(snap: UISnapshot): TutorialStep[] {
  // 인접 보너스는 고른 유닛에서만 보이므로, 네 번 이상 옮겼으면
  // 배치를 이해한 것으로 본다 (아무것도 못 고른 채 갇히지 않게).
  const adjSeen = snap.selected ? snap.selected.adjSameRole > 0 || snap.selected.adjNearSupport : false;
  return [
    { id: 'draw', label: '유닛을 뽑는다', done: snap.stats.draws >= 1 },
    { id: 'move', label: '유닛을 끌어 원하는 칸에 놓는다', done: snap.stats.moves >= 1 },
    { id: 'merge', label: '같은 유닛 3개를 모아 합성한다', done: snap.stats.merges >= 1 },
    { id: 'reward', label: '보상 3장 중 하나를 고른다', done: snap.rewardsTaken >= 1 },
    { id: 'adj', label: '옆자리에 같은 계열이나 지원 유닛을 붙인다', done: adjSeen || snap.stats.moves >= 4 },
  ];
}
