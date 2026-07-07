import type { BiblePassage, Language } from './types';

export interface BibleBook {
  en: string;
  ko: string;
  chapters: number;
}

// All 66 books in traditional order.
export const BIBLE_BOOKS: BibleBook[] = [
  { en: 'Genesis', ko: '창세기', chapters: 50 },
  { en: 'Exodus', ko: '출애굽기', chapters: 40 },
  { en: 'Leviticus', ko: '레위기', chapters: 27 },
  { en: 'Numbers', ko: '민수기', chapters: 36 },
  { en: 'Deuteronomy', ko: '신명기', chapters: 34 },
  { en: 'Joshua', ko: '여호수아', chapters: 24 },
  { en: 'Judges', ko: '사사기', chapters: 21 },
  { en: 'Ruth', ko: '룻기', chapters: 4 },
  { en: '1 Samuel', ko: '사무엘상', chapters: 31 },
  { en: '2 Samuel', ko: '사무엘하', chapters: 24 },
  { en: '1 Kings', ko: '열왕기상', chapters: 22 },
  { en: '2 Kings', ko: '열왕기하', chapters: 25 },
  { en: '1 Chronicles', ko: '역대상', chapters: 29 },
  { en: '2 Chronicles', ko: '역대하', chapters: 36 },
  { en: 'Ezra', ko: '에스라', chapters: 10 },
  { en: 'Nehemiah', ko: '느헤미야', chapters: 13 },
  { en: 'Esther', ko: '에스더', chapters: 10 },
  { en: 'Job', ko: '욥기', chapters: 42 },
  { en: 'Psalms', ko: '시편', chapters: 150 },
  { en: 'Proverbs', ko: '잠언', chapters: 31 },
  { en: 'Ecclesiastes', ko: '전도서', chapters: 12 },
  { en: 'Song of Songs', ko: '아가', chapters: 8 },
  { en: 'Isaiah', ko: '이사야', chapters: 66 },
  { en: 'Jeremiah', ko: '예레미야', chapters: 52 },
  { en: 'Lamentations', ko: '예레미야애가', chapters: 5 },
  { en: 'Ezekiel', ko: '에스겔', chapters: 48 },
  { en: 'Daniel', ko: '다니엘', chapters: 12 },
  { en: 'Hosea', ko: '호세아', chapters: 14 },
  { en: 'Joel', ko: '요엘', chapters: 3 },
  { en: 'Amos', ko: '아모스', chapters: 9 },
  { en: 'Obadiah', ko: '오바댜', chapters: 1 },
  { en: 'Jonah', ko: '요나', chapters: 4 },
  { en: 'Micah', ko: '미가', chapters: 7 },
  { en: 'Nahum', ko: '나훔', chapters: 3 },
  { en: 'Habakkuk', ko: '하박국', chapters: 3 },
  { en: 'Zephaniah', ko: '스바냐', chapters: 3 },
  { en: 'Haggai', ko: '학개', chapters: 2 },
  { en: 'Zechariah', ko: '스가랴', chapters: 14 },
  { en: 'Malachi', ko: '말라기', chapters: 4 },
  { en: 'Matthew', ko: '마태복음', chapters: 28 },
  { en: 'Mark', ko: '마가복음', chapters: 16 },
  { en: 'Luke', ko: '누가복음', chapters: 24 },
  { en: 'John', ko: '요한복음', chapters: 21 },
  { en: 'Acts', ko: '사도행전', chapters: 28 },
  { en: 'Romans', ko: '로마서', chapters: 16 },
  { en: '1 Corinthians', ko: '고린도전서', chapters: 16 },
  { en: '2 Corinthians', ko: '고린도후서', chapters: 13 },
  { en: 'Galatians', ko: '갈라디아서', chapters: 6 },
  { en: 'Ephesians', ko: '에베소서', chapters: 6 },
  { en: 'Philippians', ko: '빌립보서', chapters: 4 },
  { en: 'Colossians', ko: '골로새서', chapters: 4 },
  { en: '1 Thessalonians', ko: '데살로니가전서', chapters: 5 },
  { en: '2 Thessalonians', ko: '데살로니가후서', chapters: 3 },
  { en: '1 Timothy', ko: '디모데전서', chapters: 6 },
  { en: '2 Timothy', ko: '디모데후서', chapters: 4 },
  { en: 'Titus', ko: '디도서', chapters: 3 },
  { en: 'Philemon', ko: '빌레몬서', chapters: 1 },
  { en: 'Hebrews', ko: '히브리서', chapters: 13 },
  { en: 'James', ko: '야고보서', chapters: 5 },
  { en: '1 Peter', ko: '베드로전서', chapters: 5 },
  { en: '2 Peter', ko: '베드로후서', chapters: 3 },
  { en: '1 John', ko: '요한일서', chapters: 5 },
  { en: '2 John', ko: '요한이서', chapters: 1 },
  { en: '3 John', ko: '요한삼서', chapters: 1 },
  { en: 'Jude', ko: '유다서', chapters: 1 },
  { en: 'Revelation', ko: '요한계시록', chapters: 22 },
];

export function bookByName(en: string): BibleBook | undefined {
  return BIBLE_BOOKS.find((b) => b.en === en);
}

/** Whole chapter after `p` in canonical order, rolling into the next book. */
export function nextChapterPassage(p: BiblePassage): BiblePassage {
  const idx = BIBLE_BOOKS.findIndex((b) => b.en === p.book);
  const book = BIBLE_BOOKS[Math.max(idx, 0)];
  if (p.chapter < book.chapters) return { book: book.en, chapter: p.chapter + 1 };
  const next = BIBLE_BOOKS[(Math.max(idx, 0) + 1) % BIBLE_BOOKS.length];
  return { book: next.en, chapter: 1 };
}

export function passageLabel(p: BiblePassage, lang: Language): string {
  const book = bookByName(p.book);
  const bookName = lang === 'ko' ? (book?.ko ?? p.book) : p.book;
  const range =
    p.verseStart != null
      ? `${p.chapter}:${p.verseStart}${p.verseEnd != null ? `–${p.verseEnd}` : ''}`
      : lang === 'ko'
        ? `${p.chapter}장`
        : `${p.chapter}`;
  return `${bookName} ${range}`;
}

export interface Verse {
  n: number;
  en: string;
  ko: string;
}

// Mock reading content for the seeded week (matches the Figma prototype,
// which shows these verses under the "Proverbs 24" label).
// English wording follows the public-domain World English Bible;
// Korean is an original classic-tone rendering (real translation will come
// from a licensed Bible API later).
const PROVERBS_SAMPLE: Verse[] = [
  {
    n: 15,
    en: 'A continual dropping on a rainy day and a contentious wife are alike:',
    ko: '다투는 아내는 비 오는 날 끊임없이 새는 지붕과 같으니',
  },
  {
    n: 16,
    en: 'restraining her is like restraining the wind, or like grasping oil in his right hand.',
    ko: '그를 말리는 것은 바람을 붙잡는 것 같고, 오른손으로 기름을 움켜쥐는 것 같으니라',
  },
  {
    n: 17,
    en: 'Iron sharpens iron; so a man sharpens his friend’s countenance.',
    ko: '철이 철을 날카롭게 하듯, 사람이 그의 친구를 날카롭게 하느니라',
  },
  {
    n: 18,
    en: 'Whoever tends the fig tree shall eat its fruit. He who looks after his master shall be honored.',
    ko: '무화과나무를 지키는 자는 그 열매를 먹고, 자기 주인을 섬기는 자는 존귀를 얻느니라',
  },
  {
    n: 19,
    en: 'Like water reflects a face, so a man’s heart reflects the man.',
    ko: '물에 얼굴이 비치듯, 사람의 마음도 그 삶에 비치느니라',
  },
  {
    n: 20,
    en: 'Sheol and Abaddon are never satisfied; and a man’s eyes are never satisfied.',
    ko: '스올과 멸망은 만족함이 없고, 사람의 눈도 만족함이 없느니라',
  },
  {
    n: 21,
    en: 'The crucible is for silver, and the furnace for gold; but man is refined by his praise.',
    ko: '은은 도가니로, 금은 풀무로, 사람은 그가 받는 칭찬으로 시험을 받느니라',
  },
  {
    n: 22,
    en: 'Though you grind a fool in a mortar with a pestle along with grain, yet his foolishness will not be removed from him.',
    ko: '미련한 자를 절구에 넣고 곡식과 함께 공이로 찧을지라도 그 미련이 벗겨지지 아니하느니라',
  },
];

/** Returns mock verse content for any passage. */
export function versesFor(p: BiblePassage): Verse[] {
  let verses: Verse[];
  if (p.book === 'Proverbs') {
    verses = PROVERBS_SAMPLE;
  } else {
    // Simple placeholder verses for non-seeded passages.
    verses = Array.from({ length: 8 }, (_, i) => ({
      n: i + 1,
      en: `Placeholder verse ${i + 1} for ${p.book} ${p.chapter} — real text arrives with the Bible API.`,
      ko: `${p.book} ${p.chapter}장 ${i + 1}절 자리 표시 본문 — 실제 본문은 성경 API 연동 후 제공됩니다.`,
    }));
  }
  if (p.verseStart != null) {
    const end = p.verseEnd ?? p.verseStart;
    const inRange = verses.filter((v) => v.n >= p.verseStart! && v.n <= end);
    if (inRange.length > 0) return inRange;
  }
  return verses;
}
