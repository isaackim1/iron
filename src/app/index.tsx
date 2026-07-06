import { Redirect } from 'expo-router';
import { useApp } from '@/lib/store';

export default function Index() {
  const { state } = useApp();
  if (state.currentUserId && state.activeGroupId) {
    return <Redirect href="/(tabs)/home" />;
  }
  return <Redirect href="/welcome" />;
}
