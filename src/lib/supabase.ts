import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null when env vars are absent: the app then runs in local demo mode
 * (seeded mock data, AsyncStorage persistence) instead of crashing.
 * The two modes never mix — the choice is made once, at module load.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          // Email OTP codes are typed in, not deep-linked, so there is no
          // URL to detect a session in (and RN has no window.location).
          detectSessionInUrl: false,
        },
      })
    : null;

export function isSupabaseEnabled(): boolean {
  return supabase !== null;
}

/** The configured client, for call sites that run only in Supabase mode. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}
