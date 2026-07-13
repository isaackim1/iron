import { requireSupabase } from '../supabase';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Owner-only notification preference save.
 *
 * We intentionally avoid `upsert` here. The database grants UPDATE only on
 * mutable preference columns, while an upsert containing `user_id` also tries
 * to update that immutable primary-key column.
 */
export async function saveNotificationPref(args: {
  userId: string;
  time: string;
  enabled?: boolean;
}): Promise<void> {
  const supabase = requireSupabase();

  const mutableValues = {
    enabled: args.enabled ?? true,
    time_of_day: args.time,
    timezone: deviceTimezone(),
    scope: 'all_groups',
  };

  // Existing preference: update only the mutable columns allowed by grants.
  const { data: updatedRows, error: updateError } = await supabase
    .from('notification_preferences')
    .update(mutableValues)
    .eq('user_id', args.userId)
    .select('user_id');

  if (updateError) {
    throw updateError;
  }

  if (updatedRows && updatedRows.length > 0) {
    return;
  }

  // First save: no existing row, so insert it.
  const { error: insertError } = await supabase
    .from('notification_preferences')
    .insert({
      user_id: args.userId,
      ...mutableValues,
    });

  if (!insertError) {
    return;
  }

  // Very unlikely concurrent first-save race: another request may have
  // inserted the row between our update and insert.
  if (insertError.code !== '23505') {
    throw insertError;
  }

  const { error: retryError } = await supabase
    .from('notification_preferences')
    .update(mutableValues)
    .eq('user_id', args.userId);

  if (retryError) {
    throw retryError;
  }
}
