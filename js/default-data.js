export const DEFAULT_SETTINGS = {
  title: '수학 실험실',
  subtitle: '수업과 학급 운영에 필요한 도구를 한곳에서 시작하세요.',
  notice: '',
  footer: 'MATHEMATICS LAB · Easy NO',
  backgroundImage: '',
  backgroundOverlay: 58
};

export const DEFAULT_CATEGORIES = {
  lesson: { name: '수업 자료', order: 10 },
  math: { name: '수학 탐구', order: 20 },
  game: { name: '수학 게임', order: 30 },
  coding: { name: '코딩 · 게임', order: 40 },
  class: { name: '학급 운영', order: 50 }
};

export const DEFAULT_APPS = {
  app_lesson_start: {
    title: '요원 브리핑',
    description: '이차함수의 최대·최소를 탐구하는 수업용 프레젠테이션입니다.',
    category: 'lesson', icon: '🎯', color: '#6d5dfc',
    primaryLabel: '수업 시작', primaryUrl: 'lesson_start.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: true, isNew: false, order: 10
  },
  app_quadratic: {
    title: '이차함수 데이터 시뮬레이터',
    description: '그래프를 직접 조작하며 이차함수의 최대·최소를 확인합니다.',
    category: 'math', icon: '📈', color: '#2563eb',
    primaryLabel: '실행', primaryUrl: 'quadratic.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 20
  },
  app_lock: {
    title: '자물쇠 방탈출',
    description: '최대·최소 조건을 만족하는 이차함수를 찾아 암호를 해독합니다.',
    category: 'math', icon: '🔐', color: '#0f766e',
    primaryLabel: '실행', primaryUrl: 'lock.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 30
  },
  app_fence: {
    title: '울타리 최대 넓이',
    description: '철망의 길이와 넓이의 관계를 이차함수로 탐구합니다.',
    category: 'math', icon: '🏠', color: '#0891b2',
    primaryLabel: '실행', primaryUrl: 'fence.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 40
  },
  app_pig: {
    title: '돼지게임',
    description: '확률과 선택 전략을 활용하는 기본 주사위 게임입니다.',
    category: 'game', icon: '🐷', color: '#db2777',
    primaryLabel: '기본판', primaryUrl: 'pig.html',
    secondaryLabel: '더블 주사위', secondaryUrl: 'pig2.html', openMode: 'new',
    visible: true, featured: true, isNew: false, order: 50
  },
  app_nunchi: {
    title: '눈치게임',
    description: '친구들과 심리전을 펼치며 전략적으로 숫자를 선택합니다.',
    category: 'game', icon: '👀', color: '#ea580c',
    primaryLabel: '실행', primaryUrl: 'nunchi.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 60
  },
  app_auction: {
    title: '마이너스 경매',
    description: '음수의 크기와 손익 개념을 활용하는 경매 게임입니다.',
    category: 'game', icon: '🔨', color: '#b45309',
    primaryLabel: '실행', primaryUrl: 'auction.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 70
  },
  app_stock: {
    title: '교실 주식게임',
    description: '모둠별로 주식을 사고팔며 자산을 겨루는 실시간 수업 게임입니다.',
    category: 'game', icon: '📊', color: '#dc2626',
    primaryLabel: '교사용', primaryUrl: 'https://fir-stock-game.web.app/teacher.html',
    secondaryLabel: '학생용', secondaryUrl: 'https://fir-stock-game.web.app/student.html', openMode: 'new',
    visible: true, featured: true, isNew: false, order: 80
  },
  app_mafia: {
    title: '교실 마피아',
    description: '역할 배정과 밤 행동, 토론과 투표를 실시간으로 진행합니다.',
    category: 'game', icon: '🎭', color: '#7c3aed',
    primaryLabel: '교사용', primaryUrl: 'https://classroom-mafia-6fd9e.web.app/admin.html',
    secondaryLabel: '학생용', secondaryUrl: 'https://classroom-mafia-6fd9e.web.app/', openMode: 'new',
    visible: true, featured: true, isNew: false, order: 90
  },
  app_editor: {
    title: '라이브 코드 에디터',
    description: 'HTML 코드를 수정하고 결과를 즉시 확인하는 실습 도구입니다.',
    category: 'coding', icon: '⌨️', color: '#4f46e5',
    primaryLabel: '실행', primaryUrl: 'editor.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 100
  },
  app_shooter: {
    title: '화력 슈팅 서바이버',
    description: '연산 능력을 강화하며 적을 물리치는 슈팅 게임입니다.',
    category: 'coding', icon: '🚀', color: '#e11d48',
    primaryLabel: '실행', primaryUrl: 'shooter.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 110
  },
  app_survival: {
    title: '스페이스 서바이벌',
    description: '우주 공간에서 끝까지 살아남는 액션 게임입니다.',
    category: 'coding', icon: '🛡️', color: '#0369a1',
    primaryLabel: '실행', primaryUrl: 'survival.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 120
  },
  app_seat: {
    title: '교실 올인원 배정기',
    description: '자리 배치와 청소구역 배정을 한 화면에서 관리합니다.',
    category: 'class', icon: '🪑', color: '#059669',
    primaryLabel: '실행', primaryUrl: 'seat.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: true, isNew: false, order: 130
  },
  app_random: {
    title: '핀볼 랜덤 뽑기',
    description: '발표자와 당번을 역동적인 핀볼 애니메이션으로 추첨합니다.',
    category: 'class', icon: '🎲', color: '#9333ea',
    primaryLabel: '실행', primaryUrl: 'random.html',
    secondaryLabel: '', secondaryUrl: '', openMode: 'new',
    visible: true, featured: false, isNew: false, order: 140
  }
};
