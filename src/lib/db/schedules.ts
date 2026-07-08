import { requireSupabase } from '../supabase';
import type { BiblePassage } from '../types';

export async function startWeek(groupId: string, weekStart: string): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('start_week', {
    p_group_id: groupId,
    p_week_start: weekStart,
  });
  if (error) throw error;
  return data as string;
}

export async function publishWeek(scheduleId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('publish_weekly_schedule', {
    p_schedule_id: scheduleId,
  });
  if (error) throw error;
}

/**
 * Leader text edits. Setting the base-language text clears the Korean variant,
 * matching the local reducer (seeded bilingual content is demo-only; real
 * content is single-language).
 */
export async function setPrayerPoint(scheduleId: string, text: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('weekly_schedules')
    .update({ prayer_point: text, prayer_point_ko: null })
    .eq('id', scheduleId);
  if (error) throw error;
}

export async function setAnnouncement(scheduleId: string, text: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('weekly_schedules')
    .update({ announcement: text, announcement_ko: null })
    .eq('id', scheduleId);
  if (error) throw error;
}

export async function setDayPassage(dayId: string, passage: BiblePassage): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('schedule_days')
    .update({
      book: passage.book,
      chapter: passage.chapter,
      verse_start: passage.verseStart ?? null,
      verse_end: passage.verseEnd ?? null,
    })
    .eq('id', dayId);
  if (error) throw error;
}

export async function setDayEnabled(dayId: string, enabled: boolean): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('schedule_days')
    .update({ enabled })
    .eq('id', dayId);
  if (error) throw error;
}

export async function setDayPublished(dayId: string, published: boolean): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('schedule_days')
    .update({ published })
    .eq('id', dayId);
  if (error) throw error;
}
