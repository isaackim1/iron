import type { Language } from './types';

/** yyyy-mm-dd in local time */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing `d` (weeks run Mon–Sun). */
export function mondayOf(d: Date): Date {
  const out = new Date(d);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  out.setDate(d.getDate() - dow);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

export function today(): Date {
  return new Date();
}

/** Index of today within the Mon–Sun reading week (0–6). */
export function todayReadingIndex(): number {
  return (today().getDay() + 6) % 7; // 0 = Mon … 6 = Sun
}

const MONTHS_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일'];

export function dayName(d: Date, lang: Language): string {
  const i = (d.getDay() + 6) % 7;
  return lang === 'ko' ? DAYS_KO[i] : DAYS_EN[i];
}

/** "Fri 17 Jul" / "7월 17일 금" */
export function fmtDayShort(d: Date, lang: Language): string {
  if (lang === 'ko') return `${d.getMonth() + 1}월 ${d.getDate()}일 ${dayName(d, lang)}`;
  return `${dayName(d, lang)} ${d.getDate()} ${MONTHS_EN[d.getMonth()]}`;
}

/** "17 Jul" / "7월 17일" */
export function fmtDateShort(d: Date, lang: Language): string {
  if (lang === 'ko') return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getDate()} ${MONTHS_EN[d.getMonth()]}`;
}

/** "Friday, 17 July 2026" / "2026년 7월 17일 금요일" */
export function fmtDateLong(d: Date, lang: Language): string {
  if (lang === 'ko') {
    const full = ['월', '화', '수', '목', '금', '토', '일'][(d.getDay() + 6) % 7];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${full}요일`;
  }
  const fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${fullDays[(d.getDay() + 6) % 7]}, ${d.getDate()} ${fullMonths[d.getMonth()]} ${d.getFullYear()}`;
}

/** "13–19 Jul" / "7월 13–19일" */
export function fmtWeekRange(monday: Date, lang: Language): string {
  const sunday = addDays(monday, 6);
  if (lang === 'ko')
    return `${monday.getMonth() + 1}월 ${monday.getDate()}–${sunday.getDate()}일`;
  return `${monday.getDate()}–${sunday.getDate()} ${MONTHS_EN[sunday.getMonth()]}`;
}

/** "07:40" → "7:40 AM" / "오전 7:40" */
export function fmtTime(hhmm: string, lang: Language): string {
  const [h, m] = hhmm.split(':').map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  return lang === 'ko' ? `${am ? '오전' : '오후'} ${h12}:${mm}` : `${h12}:${mm} ${am ? 'AM' : 'PM'}`;
}
