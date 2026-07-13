import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { BackChevron, Card, Pill, Screen, Txt } from '@/components/ui';
import { sel, useApp } from '@/lib/store';
import { isSupabaseEnabled, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/**
 * Minimal account screen, reachable from My Groups for leaders and members
 * alike. Supabase mode shows the session email and signs out via auth (the
 * store's SIGNED_OUT listener clears in-memory state); demo mode shows the
 * demo profile and resets the seeded world instead.
 */
export default function Account() {
  const { state, actions, t } = useApp();
  const supabaseMode = isSupabaseEnabled();
  const [email, setEmail] = useState<string | null>(null);
  const [emailLoaded, setEmailLoaded] = useState(!supabaseMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setEmail(data.session?.user.email ?? null);
        setEmailLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setEmailLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Signed out (or demo reset): the index routes on to sign-in/welcome. Also
  // catches Back-navigation into this screen after signing out.
  if (!state.currentUserId) return <Redirect href="/" />;

  const me = sel.me(state);

  const signOut = async () => {
    setError(false);
    if (supabaseMode && supabase) {
      setBusy(true);
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setBusy(false);
        setError(true);
        return;
      }
      // In-memory state clears via the auth listener; replace so Back
      // cannot return into authenticated tabs.
      router.replace('/sign-in');
      return;
    }
    actions.resetDemoData();
    router.replace('/welcome');
  };

  const confirmSignOut = () => {
    Alert.alert(
      t('account.confirmTitle'),
      supabaseMode ? t('account.confirmBody') : t('account.confirmBodyDemo'),
      [
        { text: t('account.cancel'), style: 'cancel' },
        {
          text: t('account.signOut'),
          style: 'destructive',
          onPress: () => void signOut(),
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BackChevron />
        <Txt variant="title" size={24}>
          {t('account.title')}
        </Txt>
      </View>

      <View style={{ height: 24 }} />
      <Card>
        <Txt variant="label">{t('account.signedInAs')}</Txt>
        <View style={{ height: 6 }} />
        <Txt variant="quoteBold" size={17}>
          {supabaseMode
            ? emailLoaded
              ? (email ?? '—')
              : '…'
            : me
              ? sel.userName(state, me.id)
              : '—'}
        </Txt>
      </Card>

      {error && (
        <Txt variant="caption" center color={colors.danger} style={{ marginTop: 14 }}>
          {t('account.error')}
        </Txt>
      )}

      <View style={{ flex: 1 }} />
      <Pill
        label={busy ? t('account.signingOut') : t('account.signOut')}
        kind="dark"
        disabled={busy}
        onPress={confirmSignOut}
        style={{ alignSelf: 'center', paddingHorizontal: 44, marginBottom: 24 }}
      />
    </Screen>
  );
}
