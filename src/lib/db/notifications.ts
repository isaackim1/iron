import { requireSupabase } from '../supabase';

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Owner-only upsert. Timezone always comes from the device at save time
 * (contract §3.9) — never hardcoded, never guessed by the server.
 */
export async function saveNotificationPref(args: {
  userId: string;
  time: string; // "HH:MM"
  enabled?: boolean;
}): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('notification_preferences').upsert({
    user_id: args.userId,
    enabled: args.enabled ?? true,
    time_of_day: args.time,
    timezone: deviceTimezone(),
  });
  if (error) throw error;
}
