import { Redirect } from 'expo-router';
import { useApp } from '@/lib/store';
import { isSupabaseEnabled } from '@/lib/supabase';

export default function Index() {
  const { state } = useApp();
  // Supabase mode: authentication comes first; everything else follows it.
  if (isSupabaseEnabled() && !state.currentUserId) {
    return <Redirect href="/sign-in" />;
  }
  if (state.currentUserId && state.activeGroupId) {
    return <Redirect href="/(tabs)/home" />;
  }
  return <Redirect href="/welcome" />;
}
