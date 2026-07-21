import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Logo, Pill, Screen, Txt } from '@/components/ui';
import { useApp } from '@/lib/store';
import { isSupabaseEnabled, supabase } from '@/lib/supabase';
import { colors, fonts, radii } from '@/lib/theme';

/**
 * Email OTP sign-in (Supabase mode only). Codes are typed in, not
 * deep-linked, so this works in Expo Go without any URL scheme setup.
 * Profile creation happens later, on the first join/create action.
 */
export default function SignIn() {
  const { state, t } = useApp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'send' | 'verify' | null>(null);

  // Once the provider has loaded the signed-in user, leave this screen.
  useEffect(() => {
    if (state.currentUserId) router.replace('/');
  }, [state.currentUserId]);

  // Demo mode has no auth; nothing routes here, but a stale link shouldn't strand anyone.
  if (!isSupabaseEnabled() || !supabase) return <Redirect href="/" />;
  const client = supabase;

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { error: sendError } = await client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (sendError) {
      setError('send');
    } else {
      setCode('');
      setStep('code');
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: verifyError } = await client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (verifyError) setError('verify');
    // On success the auth listener hydrates state; the effect above navigates.
  };

  const inputStyle = {
    backgroundColor: colors.input,
    borderRadius: radii.pill,
    paddingVertical: 16,
    paddingHorizontal: 24,
    fontSize: 17,
    textAlign: 'center' as const,
    fontFamily: fonts.title(state.language),
    color: colors.ink,
  };

  return (
    <Screen>
      <View style={{ height: 44 }} />
      <Logo height={92} />
      <View style={{ height: 28 }} />
      <Txt variant="title" center>
        {step === 'email' ? t('signin.title') : t('signin.codeTitle')}
      </Txt>
      <View style={{ height: 8 }} />
      <Txt variant="body" center size={14} style={{ maxWidth: 300, alignSelf: 'center' }}>
        {step === 'email'
          ? t('signin.subtitle')
          : t('signin.codeSubtitle', { email: email.trim() })}
      </Txt>
      <View style={{ height: 40 }} />

      {step === 'email' ? (
        <TextInput
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setError(null);
          }}
          placeholder={t('signin.emailPlaceholder')}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          style={inputStyle}
        />
      ) : (
        <TextInput
          value={code}
          onChangeText={(v) => {
            setCode(v.replace(/[^0-9]/g, ''));
            setError(null);
          }}
          placeholder={t('signin.codePlaceholder')}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="one-time-code"
          // 15 · OTP Entry — one field, Lato numeric, tabular, +30% tracking.
          style={[
            inputStyle,
            {
              fontFamily: fonts.numeric(state.language),
              fontVariant: ['tabular-nums'],
              fontSize: 22,
              letterSpacing: 22 * 0.3,
            },
          ]}
        />
      )}

      {error && (
        <Txt variant="caption" center color={colors.danger} style={{ marginTop: 14 }}>
          {error === 'send' ? t('signin.errorSend') : t('signin.errorVerify')}
        </Txt>
      )}

      {step === 'code' && (
        <>
          <View style={{ height: 24 }} />
          <TouchableOpacity onPress={() => void sendCode()} disabled={busy}>
            <Txt variant="caption" center style={{ textDecorationLine: 'underline' }}>
              {t('signin.resend')}
            </Txt>
          </TouchableOpacity>
        </>
      )}

      <View style={{ flex: 1 }} />
      <Pill
        label={
          step === 'email'
            ? busy
              ? t('signin.sending')
              : t('signin.sendCode')
            : busy
              ? t('signin.verifying')
              : t('signin.verify')
        }
        disabled={busy || (step === 'email' ? !email.trim().includes('@') : code.length !== 6)}
        onPress={() => void (step === 'email' ? sendCode() : verify())}
        style={{ alignSelf: 'center', paddingHorizontal: 56, marginBottom: 24 }}
      />
    </Screen>
  );
}
