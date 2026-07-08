import { requireSupabase } from '../supabase';
import type { UserProfile } from '../types';
import type { ProfileRow } from './types';

export function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    name: row.display_name,
    nameKo: row.display_name_ko ?? undefined,
  };
}

/**
 * The signed-in user's profile, creating it on first need. Join/Create screens
 * already ask for a name, so profile creation piggybacks on the first group
 * action instead of adding a separate onboarding step. An existing profile's
 * name is left alone — joining another group must not rename you.
 */
export async function getOrCreateProfile(name: string): Promise<UserProfile> {
  const supabase = requireSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('not signed in');

  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return mapProfile(existing as ProfileRow);

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: uid, display_name: name.trim() })
    .select('*')
    .single();
  if (insertError) throw insertError;
  return mapProfile(created as ProfileRow);
}

export async function getMyProfile(): Promise<UserProfile | null> {
  const supabase = requireSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data as ProfileRow) : null;
}
