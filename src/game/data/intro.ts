// 첫 판 오프닝. 만화 컷처럼 한 칸씩 쌓인다.
// 여기는 대본 데이터만 둔다 — 그리는 일은 ui/IntroScene.tsx 가 한다.

export type PanelKind = 'calm' | 'trouble' | 'shout' | 'alba' | 'manager' | 'ask' | 'ready';

export interface IntroCast {
  defId: string;
  enemy: boolean;
  line?: string; // 말풍선
}

export interface IntroPanel {
  id: string;
  kind: PanelKind;
  caption?: string; // 칸 위 내레이션
  cast: IntroCast[];
  sfx?: string;
  shake?: boolean;
  flash?: 'red' | 'gold';
  hold: number; // 자동으로 다음 칸이 뜨기까지 (ms)
}

export const INTRO_PANELS: IntroPanel[] = [
  {
    id: 'calm',
    kind: 'calm',
    caption: '새벽 1시 47분. 평화로웠다.',
    cast: [{ defId: 'basic', enemy: true, line: '봉투 하나만요' }],
    hold: 1900,
  },
  {
    id: 'caller',
    kind: 'trouble',
    caption: '평화로울 리가 없었다.',
    cast: [{ defId: 'caller', enemy: true, line: '사장님 불러요, 사장님!' }],
    sfx: 'spawn',
    hold: 1900,
  },
  {
    id: 'crowd',
    kind: 'trouble',
    cast: [
      { defId: 'bag', enemy: true, line: '봉투값 왜 받아요?' },
      { defId: 'charger', enemy: true, line: '충전기 좀 빌립시다' },
      { defId: 'drunk', enemy: true, line: '사장님… 사랑해요…' },
    ],
    sfx: 'event',
    shake: true,
    hold: 2400,
  },
  {
    id: 'karen',
    kind: 'shout',
    caption: '그리고 새벽 3시.',
    cast: [{ defId: 'karen3am', enemy: true, line: '지금 몇 시인 줄 알아요?!' }],
    sfx: 'warning',
    shake: true,
    flash: 'red',
    hold: 2200,
  },
  {
    id: 'alba',
    kind: 'alba',
    caption: '혼자서는 감당이 안 됐다.',
    cast: [{ defId: 'alba', enemy: false, line: '…여보세요, 점장님?' }],
    sfx: 'damage',
    hold: 2100,
  },
  {
    id: 'manager',
    kind: 'manager',
    cast: [{ defId: 'manager', enemy: false, line: '야!!! 정신 안 차려?!' }],
    sfx: 'legendary',
    shake: true,
    flash: 'gold',
    hold: 2300,
  },
  {
    id: 'ask',
    kind: 'ask',
    caption: '점장이 출근했다.',
    cast: [{ defId: 'manager', enemy: false, line: '그래서, 성함이 어떻게 되시죠?' }],
    hold: 0, // 이름을 받을 때까지 기다린다
  },
];

// 이름을 넣은 뒤 뜨는 마지막 칸
export function finalPanel(name: string): IntroPanel {
  return {
    id: 'ready',
    kind: 'ready',
    cast: [{ defId: 'manager', enemy: false, line: `좋아 ${name}. 오늘 밤은 내가 지킨다.` }],
    sfx: 'record',
    flash: 'gold',
    hold: 0,
  };
}
