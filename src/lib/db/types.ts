/**
 * Hand-written row types for the Iron schema (supabase/migrations/001).
 * Replace with `supabase gen types typescript` output once a project exists;
 * until then these mirror the migrations by hand.
 */

export interface ProfileRow {
  id: string;
  display_name: string;
  display_name_ko: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  name_ko: string | null;
  description: string | null;
  description_ko: string | null;
  status: 'active' | 'archived';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  group_id: string;
  user_id: string;
  role: 'leader' | 'member';
  status: 'active' | 'left' | 'removed';
  created_at: string;
  updated_at: string;
}

export interface InviteCodeRow {
  id: string;
  group_id: string;
  code: string;
  status: 'active' | 'rotated' | 'revoked';
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface WeeklyScheduleRow {
  id: string;
  group_id: string;
  week_start: string; // yyyy-mm-dd, always Monday
  status: 'draft' | 'published';
  published_at: string | null;
  prayer_point: string;
  prayer_point_ko: string | null;
  announcement: string | null;
  announcement_ko: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleDayRow {
  id: string;
  schedule_id: string;
  weekday: number; // 0 = Monday … 6 = Sunday
  date: string; // yyyy-mm-dd
  book: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  enabled: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReflectionRow {
  id: string;
  group_id: string;
  user_id: string;
  schedule_day_id: string | null;
  date: string; // yyyy-mm-dd
  book: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  highlighted_verses: number[];
  body: string;
  visibility: 'private' | 'shared';
  created_at: string;
  updated_at: string;
}

export interface AmenResponseRow {
  id: string;
  group_id: string;
  user_id: string;
  schedule_day_id: string | null;
  date: string; // yyyy-mm-dd
  created_at: string;
}

export interface NotificationPreferenceRow {
  user_id: string;
  enabled: boolean;
  time_of_day: string; // "HH:MM:SS"
  timezone: string;
  scope: 'all_groups';
  created_at: string;
  updated_at: string;
}
