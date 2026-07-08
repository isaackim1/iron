import { requireSupabase } from '../supabase';
import type { Reflection } from '../types';
import type { ReflectionRow } from './types';

export function mapReflection(row: ReflectionRow): Reflection {
  return {
    id: row.id,
    userId: row.user_id,
    groupId: row.group_id,
    date: row.date,
    passage: {
      book: row.book,
      chapter: row.chapter,
      verseStart: row.verse_start ?? undefined,
      verseEnd: row.verse_end ?? undefined,
    },
    highlightedVerses: row.highlighted_verses ?? [],
    body: row.body,
    visibility: row.visibility,
    createdAt: row.created_at,
  };
}

/**
 * The passage snapshot must be copied verbatim from the scheduled day — the
 * database trigger rejects mismatches (reflections stay readable even after
 * the day is later hidden or edited).
 */
export async function insertReflection(args: {
  groupId: string;
  userId: string;
  scheduleDayId: string;
  date: string;
  passage: { book: string; chapter: number; verseStart?: number; verseEnd?: number };
  highlightedVerses: number[];
  body: string;
  visibility: 'private' | 'shared';
}): Promise<Reflection> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('reflections')
    .insert({
      group_id: args.groupId,
      user_id: args.userId,
      schedule_day_id: args.scheduleDayId,
      date: args.date,
      book: args.passage.book,
      chapter: args.passage.chapter,
      verse_start: args.passage.verseStart ?? null,
      verse_end: args.passage.verseEnd ?? null,
      highlighted_verses: args.highlightedVerses,
      body: args.body,
      visibility: args.visibility,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapReflection(data as ReflectionRow);
}

/** Owner edit: body and visibility only — date/passage/author are immutable. */
export async function updateReflection(
  id: string,
  patch: { body: string; visibility: 'private' | 'shared' },
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('reflections')
    .update({ body: patch.body, visibility: patch.visibility })
    .eq('id', id);
  if (error) throw error;
}
