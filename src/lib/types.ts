export type Language = 'en' | 'ko';
export type Role = 'leader' | 'member';

export interface UserProfile {
  id: string;
  name: string;
  nameKo?: string;
}

export interface Group {
  id: string;
  name: string;
  nameKo?: string;
  description: string;
  descriptionKo?: string;
  inviteCode: string;
  createdBy: string;
}

export interface Membership {
  userId: string;
  groupId: string;
  role: Role;
  joinedAt: string; // ISO date
}

export interface BiblePassage {
  book: string; // English book name, e.g. "Proverbs"
  chapter: number;
  verseStart?: number; // omitted = whole chapter
  verseEnd?: number;
}

/** Weekday index within the reading week: 0 = Monday … 6 = Sunday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduleDay {
  /** Supabase schedule_days row id; absent in local demo mode. */
  id?: string;
  weekday: Weekday;
  date: string; // ISO date (yyyy-mm-dd)
  passage: BiblePassage;
  /** Disabled days are rest days: no reading is shown to anyone. */
  enabled: boolean;
  /** Day's reading is visible to members once the week itself is published. */
  published: boolean;
}

export interface WeeklySchedule {
  id: string;
  groupId: string;
  weekStart: string; // ISO date of Monday
  days: ScheduleDay[];
  prayerPoint: string;
  prayerPointKo?: string;
  announcement?: string;
  announcementKo?: string;
  published: boolean;
}

/** A member's daily response: one-tap Amen or a written Reflection. */
export interface ResponseEntry {
  id: string;
  userId: string;
  groupId: string;
  date: string; // ISO date the response belongs to
  kind: 'amen' | 'reflection';
  reflectionId?: string;
  createdAt: string;
}

export interface Reflection {
  id: string;
  userId: string;
  groupId: string;
  date: string; // ISO date of the reading it responds to
  passage: BiblePassage;
  highlightedVerses: number[];
  body: string;
  /** Mock-only: seeded demo content carries both languages. Real user content is single-language. */
  bodyKo?: string;
  visibility: 'shared' | 'private';
  createdAt: string;
}

export interface NotificationPreference {
  userId: string;
  time: string; // "07:40" 24h
  timezone: string; // e.g. "Europe/Amsterdam"
}
