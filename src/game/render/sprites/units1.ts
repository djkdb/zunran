import type { SpriteSheet } from '../spriteTypes';

// units1 배치: 알바생 + 편의점 설비(라면 진열대, 냉장고, 포스기, 커피머신, CCTV, 청소기, 냉동고).
// base.ts 와 같은 스타일: 16x16, 1px 어두운 외곽선, 캐릭터는 오른쪽을 봄, 투명 배경('.').
export const UNITS1_SPRITES: SpriteSheet = {
  // 야간 알바생: 검은 머리, 졸린 눈(가는 눈), 초록 조끼 + 파란 줄무늬, 노란 명찰, 흰 반팔, 머리 위 'z'
  alba: {
    w: 16,
    h: 16,
    palette: {
      k: '#111827', // 외곽선
      h: '#1f2937', // 머리카락
      f: '#fcd9b6', // 피부
      e: '#111827', // 눈
      g: '#22c55e', // 조끼 초록
      b: '#3b82f6', // 조끼 파란 줄
      w: '#ffffff', // 셔츠 흰색
      n: '#fde047', // 명찰
      p: '#334155', // 바지
      z: '#93c5fd', // 졸림 z
    },
    rows: [
      '.............zzz',
      '.....kkkkkk...z.',
      '....khhhhhhk.zzz',
      '....khhhhhhk....',
      '....khfffffk....',
      '....kfeefeek....',
      '....kffffffk....',
      '.....kffffk.....',
      '....kwgggggwk...',
      '...kwggngggwk...',
      '...kwbbbbbbwk...',
      '...kfggggggfk...',
      '....kppppppk....',
      '....kppkkppk....',
      '....kppk.kppk...',
      '....kkkk.kkkk...',
    ],
  },

  // 라면 진열대: 3단 선반, 빨강/주황 라면 봉지가 줄지어 꽂힘
  ramenShelf: {
    w: 16,
    h: 16,
    palette: {
      k: '#111827', // 외곽선
      t: '#d1d5db', // 선반 상판(밝음)
      s: '#9ca3af', // 선반 판
      d: '#4b5563', // 선반 뒷판(어두움)
      r: '#ef4444', // 빨간 라면
      m: '#b91c1c', // 빨간 라면 그림자
      o: '#f97316', // 주황 라면
      n: '#c2410c', // 주황 라면 그림자
      y: '#fde047', // 봉지 라벨/하이라이트
    },
    rows: [
      'kkkkkkkkkkkkkkkk',
      'kttttttttttttttk',
      'krydoydrydoydryk',
      'krrdoodrrdoodrrk',
      'kmmdnndmmdnndmmk',
      'kssssssssssssssk',
      'koydrydoydrydoyk',
      'koodrrdoodrrdook',
      'knndmmdnndmmdnnk',
      'kssssssssssssssk',
      'krydoydrydoydryk',
      'krrdoodrrdoodrrk',
      'kmmdnndmmdnndmmk',
      'kssssssssssssssk',
      'kddddddddddddddk',
      'kkkkkkkkkkkkkkkk',
    ],
  },

  // 음료 냉장고: 하늘색 상단 + 조명, 흰 프레임, 유리문 안에 여러 색 캔, 오른쪽 손잡이
  fridge: {
    w: 16,
    h: 16,
    palette: {
      k: '#111827', // 외곽선
      w: '#ffffff', // 흰 프레임
      c: '#7dd3fc', // 하늘색 상단
      b: '#bae6fd', // 유리
      l: '#fef08a', // 조명
      s: '#94a3b8', // 선반
      d: '#0ea5e9', // 손잡이(진한 파랑)
      r: '#ef4444', // 빨간 캔
      g: '#22c55e', // 초록 캔
      o: '#f97316', // 주황 캔
      p: '#a855f7', // 보라 캔
    },
    rows: [
      '.kkkkkkkkkkkkkk.',
      'kcccccccccccccck',
      'kcllllllllllllck',
      'kcccccccccccccck',
      'kwkkkkkkkkkkkkwk',
      'kwkbbbbbbbbbbkwk',
      'kwkbrrbggboobkwk',
      'kwkbrrbggboobkdk',
      'kwksssssssssskdk',
      'kwkbppbrrbggbkdk',
      'kwkbppbrrbggbkdk',
      'kwksssssssssskwk',
      'kwkboobppbrrbkwk',
      'kwkboobppbrrbkwk',
      'kwkkkkkkkkkkkkwk',
      'kkkkkkkkkkkkkkkk',
    ],
  },

  // 포스기: 왼쪽 모니터(남색 화면 + 파란 UI), 오른쪽 영수증 프린터(종이 위로 나옴), 아래 키패드
  pos: {
    w: 16,
    h: 16,
    palette: {
      k: '#111827', // 외곽선
      n: '#1e3a8a', // 화면 배경(남색)
      c: '#93c5fd', // UI 헤더/텍스트(연파랑)
      b: '#3b82f6', // UI 버튼(파랑)
      w: '#ffffff', // 영수증 / 키
      l: '#cbd5e1', // 영수증 인쇄 줄
      g: '#9ca3af', // 본체 회색
      h: '#d1d5db', // 본체 하이라이트 / 키 그림자
      y: '#fbbf24', // 엔터 키(노랑)
      r: '#ef4444', // 취소 키(빨강)
      e: '#22c55e', // 프린터 LED
    },
    rows: [
      '..........kwwwk.',
      'kkkkkkkkkkkwwwk.',
      'knnnnnnnnkkwlwk.',
      'kncccccnnkkwwwk.',
      'knbbnbbnnkkkkkkk',
      'knbbnbbnnkghhhgk',
      'knnccnnnnkgggggk',
      'kkkkkkkkkkggeggk',
      'khhhhhhhhhhhhhhk',
      'kggggggggggggggk',
      'kgwwgwwgwwgyyygk',
      'kghhghhghhgyyygk',
      'kggggggggggggggk',
      'kgwwgwwgwwgrrrgk',
      'kghhghhghhgrrrgk',
      'kkkkkkkkkkkkkkkk',
    ],
  },

  // 커피머신: 은색 본체 + 검은 패널(빨간 버튼, 초록 램프), 아래 추출부에 커피 잔 + 김
  coffee: {
    w: 16,
    h: 16,
    palette: {
      k: '#111827', // 외곽선
      s: '#9ca3af', // 은색 본체
      t: '#e5e7eb', // 은색 하이라이트 / 받침
      d: '#374151', // 검은 조작 패널
      a: '#1f2937', // 추출부(어두운 안쪽)
      r: '#ef4444', // 빨간 버튼
      g: '#22c55e', // 초록 램프
      w: '#ffffff', // 컵 / 김
      e: '#d1d5db', // 컵 그림자
      c: '#78350f', // 커피
    },
    rows: [
      '.kkkkkkkkkkkkkk.',
      'kttttttttttttttk',
      'kssssssssssssssk',
      'kddddddddddddddk',
      'kdrrddddddddgddk',
      'kdrrdddddddddddk',
      'kddddddddddddddk',
      'kssssssssssssssk',
      'ksskaaaaaaaakssk',
      'ksskaaakkaaakssk',
      'ksskawacaawakssk',
      'ksskakwccwkakssk',
      'ksskakwwwwkwkssk',
      'ksskakewwekwkssk',
      'ksskttttttttkssk',
      'kkkkkkkkkkkkkkkk',
    ],
  },

  // CCTV: 흰 박스형 카메라(오른쪽 렌즈, 빨간 녹화 LED) + 아래 브래킷/받침
  cctv: {
    w: 16,
    h: 16,
    palette: {
      k: '#111827', // 외곽선
      w: '#ffffff', // 카메라 몸체
      e: '#e5e7eb', // 몸체 그림자
      d: '#6b7280', // 브래킷
      b: '#1f2937', // 렌즈
      l: '#60a5fa', // 렌즈 반사광
      r: '#ef4444', // 녹화 LED
    },
    rows: [
      '..kkkkkkkkk.....',
      '.kwwwwwwwwwk....',
      '.kwwwwwwwwwkkkkk',
      '.kwrwwwwwwwklbbk',
      '.kwwwwwwwwwkbbbk',
      '.kwwwwwwwwwkbbbk',
      '.kweeeeeeeekkkkk',
      '.keeeeeeeeek....',
      '..kkkkkkkkk.....',
      '.....kdddk......',
      '......kdk.......',
      '......kdk.......',
      '......kdk.......',
      '.....kdddk......',
      '...kkdddddkk....',
      '...kkkkkkkkk....',
    ],
  },

  // 청소기: 빨간 원통 본체(회색 띠, 바퀴) + 위로 도는 회색 호스 + 왼쪽 바닥 흡입구
  vacuum: {
    w: 16,
    h: 16,
    palette: {
      k: '#111827', // 외곽선
      r: '#ef4444', // 본체 빨강
      m: '#b91c1c', // 본체 그림자
      p: '#fca5a5', // 본체 하이라이트
      g: '#9ca3af', // 회색 띠 / 바퀴 / 흡입구
      d: '#6b7280', // 호스
    },
    rows: [
      '..kkkkkkkk......',
      '.kddddddddk.....',
      '.kdkkkkkkdk.....',
      '.kdk.....kdk....',
      '.kdk...kkdkkkkk.',
      '.kdk..kppgrrrrrk',
      '.kdk..kprrrrrrrk',
      '.kdk..krrrrrrrrk',
      '.kdk..kggggggggk',
      '.kdk..krrrrrrrrk',
      '.kdk..krrrrrrrrk',
      '.kdk..kmmmmmmmmk',
      '.kdk...kkmmmmkk.',
      'kkdkkkk.kggkkggk',
      'kggggggkkggkkggk',
      'kkkkkkkk.kk..kk.',
    ],
  },

  // 아이스크림 냉동고: 흰 몸체 + 파란 띠, 유리 뚜껑 안에 막대 아이스크림(분홍/노랑/초록/주황)
  freezer: {
    w: 16,
    h: 16,
    palette: {
      k: '#111827', // 외곽선
      w: '#ffffff', // 흰 몸체
      e: '#e5e7eb', // 몸체 그림자 / 손잡이 / 막대
      b: '#38bdf8', // 파란 포인트
      l: '#bae6fd', // 유리
      p: '#f472b6', // 분홍 아이스크림
      y: '#fde047', // 노랑 아이스크림
      g: '#4ade80', // 초록 아이스크림
      o: '#fb923c', // 주황 아이스크림
    },
    rows: [
      '.kkkkkkkkkkkkkk.',
      'kbbbbbbbbbbbbbbk',
      'kbwwllllllllllbk',
      'kbpplyylggloolbk',
      'kbpplyylggloolbk',
      'kblellellellelbk',
      'kbbbbbeeeebbbbbk',
      'kwwwwwwwwwwwwwwk',
      'kwwwwwwwwwwwwwwk',
      'kwbbbbbwwbbbbbwk',
      'kwbbbbbwwbbbbbwk',
      'kwwwwwwwwwwwwwwk',
      'kewwwwwwwwwwwwek',
      'keeeeeeeeeeeeeek',
      'kkkkkkkkkkkkkkkk',
      '.kk..........kk.',
    ],
  },
};
