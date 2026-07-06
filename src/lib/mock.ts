import { addDays, isoDate, mondayOf, today, todayReadingIndex } from './dates';
import type {
  Group,
  Membership,
  NotificationPreference,
  Reflection,
  ResponseEntry,
  ScheduleDay,
  UserProfile,
  Weekday,
  WeeklySchedule,
} from './types';

// ---------------------------------------------------------------------------
// Seed world. Everything is local + deterministic relative to the real week,
// so "today's chapter" always feels alive. Replaced by Supabase later.
// ---------------------------------------------------------------------------

export const DEMO_CODE = 'IRON-4217';

export const seedUsers: UserProfile[] = [
  { id: 'u-isaac', name: 'Isaac Kim', nameKo: '김이삭' },
  { id: 'u-hana', name: 'Hana Lee', nameKo: '이하나' },
  { id: 'u-minjun', name: 'Minjun Park', nameKo: '박민준' },
  { id: 'u-grace', name: 'Grace Cho', nameKo: '조은혜' },
  { id: 'u-daniel', name: 'Daniel Oh', nameKo: '오다니엘' },
  { id: 'u-sarah', name: 'Sarah Park', nameKo: '박사라' },
  { id: 'u-yohan', name: 'Yohan Kim', nameKo: '김요한' },
  { id: 'u-joon', name: 'Joon Seo', nameKo: '서준' },
  { id: 'u-jiho', name: 'Jiho Kang', nameKo: '강지호' },
  { id: 'u-somin', name: 'Somin Yu', nameKo: '유소민' },
  { id: 'u-eunji', name: 'Eunji Han', nameKo: '한은지' },
  { id: 'u-taeyang', name: 'Taeyang Kim', nameKo: '김태양' },
  { id: 'u-mia', name: 'Mia Chun', nameKo: '전미아' },
];

export const seedGroups: Group[] = [
  {
    id: 'g-honest',
    name: 'Honest People',
    nameKo: '정직한 사람들',
    description: 'Church youth group.',
    descriptionKo: '교회 청년부.',
    inviteCode: DEMO_CODE,
    createdBy: 'u-isaac',
  },
  {
    id: 'g-word',
    name: '말씀 묵상 그룹',
    nameKo: '말씀 묵상 그룹',
    description: 'Close friends group.',
    descriptionKo: '가까운 친구들 모임.',
    inviteCode: 'IRON-8021',
    createdBy: 'u-hana',
  },
];

export const seedMemberships: Membership[] = [
  { userId: 'u-isaac', groupId: 'g-honest', role: 'leader', joinedAt: '2026-05-03' },
  ...[
    'u-hana', 'u-minjun', 'u-grace', 'u-daniel', 'u-sarah', 'u-yohan',
    'u-joon', 'u-jiho', 'u-somin', 'u-eunji', 'u-taeyang', 'u-mia',
  ].map((userId) => ({
    userId,
    groupId: 'g-honest',
    role: 'member' as const,
    joinedAt: '2026-05-10',
  })),
  { userId: 'u-hana', groupId: 'g-word', role: 'leader', joinedAt: '2026-06-01' },
  ...['u-minjun', 'u-grace', 'u-sarah', 'u-yohan'].map((userId) => ({
    userId,
    groupId: 'g-word',
    role: 'member' as const,
    joinedAt: '2026-06-02',
  })),
];

function weekDays(monday: Date, book: string, firstChapter: number): ScheduleDay[] {
  return ([0, 1, 2, 3, 4] as Weekday[]).map((w) => ({
    weekday: w,
    date: isoDate(addDays(monday, w)),
    passage: { book, chapter: firstChapter + w },
  }));
}

export function buildSeedSchedules(): WeeklySchedule[] {
  const monday = mondayOf(today());
  return [
    {
      id: 's-honest',
      groupId: 'g-honest',
      weekStart: isoDate(monday),
      days: weekDays(monday, 'Proverbs', 20),
      prayerPoint:
        '“Lord, may You alone be the center of our youth group. In the balance of the Word and service, may we never lose what is essential — and may the love for God come before busyness or roles. May we be a youth group that comes to know You more deeply through the Word, and grows to resemble Jesus through our lives.”',
      prayerPointKo:
        '“주님, 우리 청년부의 중심이 오직 주님 되게 하소서. 말씀과 섬김의 균형 속에서 본질을 잃지 않게 하시고, 바쁨이나 역할보다 하나님을 사랑하는 마음이 먼저이게 하소서. 말씀으로 주님을 더 깊이 알아가고, 삶으로 예수님을 닮아가는 청년부 되게 하소서.”',
      announcement: 'No fellowship dinner this Saturday — we gather Sunday 11:00.',
      announcementKo: '이번 주 토요일 친교 모임은 쉬어요 — 주일 11시에 모여요.',
      published: true,
    },
    {
      id: 's-word',
      groupId: 'g-word',
      weekStart: isoDate(monday),
      days: weekDays(monday, 'John', 11),
      prayerPoint:
        '“Father, keep us abiding in the vine this week — not producing for You, but remaining with You.”',
      prayerPointKo:
        '“아버지, 이번 주에도 포도나무이신 주님 안에 거하게 하소서 — 주님을 위해 무언가를 만들어내기보다, 주님과 함께 머물게 하소서.”',
      published: true,
    },
  ];
}

export function buildSeedActivity(): {
  responses: ResponseEntry[];
  reflections: Reflection[];
} {
  const monday = mondayOf(today());
  const ti = todayReadingIndex();
  const todayIso = isoDate(addDays(monday, ti));
  const yesterdayIso = isoDate(addDays(monday, ti - 1)); // may fall on Sunday; fine for mock
  const todayCh = 20 + ti;

  const reflections: Reflection[] = [
    {
      id: 'r-hana',
      userId: 'u-hana',
      groupId: 'g-honest',
      date: todayIso,
      passage: { book: 'Proverbs', chapter: todayCh },
      highlightedVerses: [17, 18],
      body:
        'Iron doesn’t sharpen itself. It needs friction — another edge, pressure, contact. Left alone it dulls. The same is true of us. Verse 17 is about the gift of honest community. Not comfortable community — honest community. The kind where someone loves you enough to push back, to ask the hard question, to sit with you in the uncomfortable truth. That kind of sharpening requires trust, and trust requires showing up consistently. Together these verses describe what our group is trying to be — a place where we show up for each other daily, tend the Word together, and trust that the fruit will come.',
      bodyKo:
        '철은 스스로 날카로워지지 않는다. 마찰이 필요하다 — 또 다른 날, 압력, 맞닿음. 홀로 두면 무뎌진다. 우리도 마찬가지다. 17절은 정직한 공동체라는 선물에 대한 말씀이다. 편안한 공동체가 아니라 정직한 공동체. 나를 사랑하기에 반대 의견을 말해 주고, 어려운 질문을 던지고, 불편한 진실 앞에 함께 앉아 주는 공동체. 그런 날카로움에는 신뢰가 필요하고, 신뢰는 꾸준히 함께하는 데서 자란다. 이 두 구절은 우리 그룹이 되고자 하는 모습이다 — 매일 서로를 찾아오고, 함께 말씀을 가꾸며, 열매는 반드시 온다고 믿는 자리.',
      visibility: 'shared',
      createdAt: `${todayIso}T19:47:00`,
    },
    {
      id: 'r-joon',
      userId: 'u-joon',
      groupId: 'g-honest',
      date: todayIso,
      passage: { book: 'Proverbs', chapter: todayCh },
      highlightedVerses: [18],
      body:
        'Verse 18 hit me — the fig tree does not fruit overnight. Faithfulness is slow. God, teach me to keep showing up when nothing seems to happen.',
      bodyKo:
        '18절이 마음에 박혔다 — 무화과나무는 하루아침에 열매 맺지 않는다. 신실함은 느리다. 하나님, 아무 일 없어 보일 때에도 계속 나아가게 가르쳐 주세요.',
      visibility: 'shared',
      createdAt: `${todayIso}T20:12:00`,
    },
    {
      id: 'r-minjun',
      userId: 'u-minjun',
      groupId: 'g-honest',
      date: yesterdayIso,
      passage: { book: 'Proverbs', chapter: todayCh - 1 },
      highlightedVerses: [4, 5],
      body:
        'Ambition without God at the center burns fast and leaves nothing. What am I actually building toward — and who am I building it with?',
      bodyKo:
        '중심에 하나님이 없는 야망은 빨리 타오르고 아무것도 남기지 않는다. 나는 지금 무엇을 향해, 누구와 함께 쌓아 가고 있는가.',
      visibility: 'shared',
      createdAt: `${yesterdayIso}T21:03:00`,
    },
  ];

  const amenUsers = ['u-hana', 'u-minjun', 'u-grace', 'u-daniel', 'u-sarah', 'u-jiho'];
  const responses: ResponseEntry[] = [
    ...amenUsers.map((userId, i) => ({
      id: `resp-amen-${i}`,
      userId,
      groupId: 'g-honest',
      date: todayIso,
      kind: 'amen' as const,
      createdAt: `${todayIso}T08:${String(10 + i).padStart(2, '0')}:00`,
    })),
    {
      id: 'resp-r-hana',
      userId: 'u-hana',
      groupId: 'g-honest',
      date: todayIso,
      kind: 'reflection',
      reflectionId: 'r-hana',
      createdAt: `${todayIso}T19:47:00`,
    },
    {
      id: 'resp-r-joon',
      userId: 'u-joon',
      groupId: 'g-honest',
      date: todayIso,
      kind: 'reflection',
      reflectionId: 'r-joon',
      createdAt: `${todayIso}T20:12:00`,
    },
    {
      id: 'resp-r-minjun',
      userId: 'u-minjun',
      groupId: 'g-honest',
      date: yesterdayIso,
      kind: 'reflection',
      reflectionId: 'r-minjun',
      createdAt: `${yesterdayIso}T21:03:00`,
    },
  ];

  return { responses, reflections };
}

/**
 * Demo history attached to a newly-joined member so My Reflections and the
 * feed feel lived-in from the first minute. Removed once real data exists.
 */
export function buildJoinerHistory(
  userId: string,
): { responses: ResponseEntry[]; reflections: Reflection[] } {
  const monday = mondayOf(today());
  const ti = todayReadingIndex();
  const d1 = isoDate(addDays(monday, ti - 1));
  const d2 = isoDate(addDays(monday, ti - 2));

  const reflections: Reflection[] = [
    {
      id: `r-${userId}-priv`,
      userId,
      groupId: 'g-honest',
      date: d1,
      passage: { book: 'Proverbs', chapter: 20 + Math.max(ti - 1, 0) },
      highlightedVerses: [4],
      body:
        'Ambition without God at the center burns fast and leaves nothing. What am I actually building toward…',
      bodyKo:
        '중심에 하나님이 없는 야망은 빨리 타오르고 아무것도 남기지 않는다. 나는 지금 무엇을 향해 쌓아 가고 있는가…',
      visibility: 'private',
      createdAt: `${d1}T22:14:00`,
    },
    {
      id: `r-${userId}-shared`,
      userId,
      groupId: 'g-honest',
      date: d2,
      passage: { book: 'Proverbs', chapter: 20 + Math.max(ti - 2, 0) },
      highlightedVerses: [1],
      body:
        'A good name — reputation built slowly, spent quickly. Lord, guard what I say when no one from church is around.',
      bodyKo:
        '좋은 이름 — 천천히 쌓이고 순식간에 사라지는 것. 주님, 교회 사람들이 없는 자리에서 하는 말을 지켜 주세요.',
      visibility: 'shared',
      createdAt: `${d2}T21:40:00`,
    },
  ];

  const responses: ResponseEntry[] = [
    {
      id: `resp-${userId}-amen`,
      userId,
      groupId: 'g-honest',
      date: d1,
      kind: 'amen',
      createdAt: `${d1}T08:05:00`,
    },
    ...reflections.map((r) => ({
      id: `resp-${r.id}`,
      userId,
      groupId: 'g-honest',
      date: r.date,
      kind: 'reflection' as const,
      reflectionId: r.id,
      createdAt: r.createdAt,
    })),
  ];

  return { responses, reflections };
}

export const seedNotificationPrefs: NotificationPreference[] = [
  { userId: 'u-isaac', time: '07:40', timezone: 'Europe/Amsterdam' },
];
