import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { BackChevron, Pill, Screen, Txt } from '@/components/ui';
import { DEMO_CODE } from '@/lib/mock';
import { sel, useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

export default function Join() {
  const { state, actions, t } = useApp();
  const [code, setCode] = useState('');
  const [name, setName] = useState(sel.me(state)?.name ?? '');
  const [error, setError] = useState(false);

  const submit = () => {
    if (actions.joinGroup(code, name)) {
      router.push('/notification-time');
    } else {
      setError(true);
    }
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
      <BackChevron />
      <View style={{ height: 48 }} />
      <Txt variant="title" center>
        {t('join.title')}
      </Txt>
      <View style={{ height: 8 }} />
      <Txt variant="body" center size={14} color={colors.charcoal}>
        {t('join.subtitle')}
      </Txt>
      <View style={{ height: 40 }} />
      <TextInput
        value={code}
        onChangeText={(v) => {
          setCode(v.toUpperCase());
          setError(false);
        }}
        placeholder={t('join.codePlaceholder')}
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        style={inputStyle}
      />
      <View style={{ height: 14 }} />
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('join.namePlaceholder')}
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      {error && (
        <Txt variant="caption" center color={colors.danger} style={{ marginTop: 14 }}>
          {t('join.invalid', { code: DEMO_CODE })}
        </Txt>
      )}
      <View style={{ height: 40 }} />
      <Txt variant="caption" center>
        {t('join.multi')}
      </Txt>
      <View style={{ height: 14 }} />
      <TouchableOpacity onPress={() => router.replace('/create')}>
        <Txt variant="caption" center style={{ textDecorationLine: 'underline' }}>
          {t('join.orCreate')}
        </Txt>
      </TouchableOpacity>
      <View style={{ flex: 1 }} />
      <Pill
        label={t('join.cta')}
        onPress={submit}
        disabled={!code.trim() || !name.trim()}
        style={{ alignSelf: 'center', paddingHorizontal: 56, marginBottom: 24 }}
      />
    </Screen>
  );
}
