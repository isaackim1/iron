import { requireSupabase } from '../supabase';

/**
 * Group membership mutations all go through RPCs (see
 * supabase/migrations/003): there are deliberately no client INSERT policies
 * on groups, memberships, invite_codes, or weekly_schedules.
 */

export async function createGroupWithLeader(args: {
  name: string;
  weekStart: string; // yyyy-mm-dd, the device's current Monday
}): Promise<{ groupId: string; inviteCode: string }> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('create_group_with_leader', {
    p_name: args.name,
    p_week_start: args.weekStart,
  });
  if (error) throw error;
  return { groupId: data.group_id, inviteCode: data.invite_code };
}

export async function joinGroupByInviteCode(
  code: string,
): Promise<{ groupId: string } | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('join_group_by_invite_code', {
    p_code: code,
  });
  if (error) {
    // "invalid or expired invite code" is a normal user outcome, not a crash.
    if (error.message.includes('invalid or expired')) return null;
    throw error;
  }
  return { groupId: data.group_id };
}

export async function rotateInviteCode(groupId: string): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('rotate_invite_code', {
    p_group_id: groupId,
  });
  if (error) throw error;
  return data.invite_code;
}
