import { requireSupabase } from '../supabase';

/**
 * One-tap Amen. The unique (group_id, user_id, date) index makes a double tap
 * a constraint violation — treated as success (the Amen exists either way).
 */
export async function insertAmen(args: {
  groupId: string;
  userId: string;
  scheduleDayId: string;
  date: string;
}): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('amen_responses').insert({
    group_id: args.groupId,
    user_id: args.userId,
    schedule_day_id: args.scheduleDayId,
    date: args.date,
  });
  if (error && error.code !== '23505') throw error; // 23505 = already amened
}
