import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { BackChevron, Pill, Screen, Txt } from '@/components/ui';
import { sel, useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

export default function Create() {
  const { state, actions, t } = useApp();
  const [groupName, setGroupName] = useState('');
  const [leaderName, setLeaderName] = useState(sel.me(state)?.name ?? '');

  const submit = () => {
    actions.createGroup(groupName, leaderName);
    router.push('/invite-code');
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
        {t('create.title')}
      </Txt>
      <View style={{ height: 8 }} />
      <Txt variant="body" center size={14} style={{ maxWidth: 320, alignSelf: 'center' }}>
        {t('create.subtitle')}
      </Txt>
      <View style={{ height: 40 }} />
      <Txt variant="caption" style={{ marginLeft: 24, marginBottom: 6 }}>
        {t('create.groupLabel')}
      </Txt>
      <TextInput
        value={groupName}
        onChangeText={setGroupName}
        placeholder={t('create.groupPlaceholder')}
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      <View style={{ height: 18 }} />
      <Txt variant="caption" style={{ marginLeft: 24, marginBottom: 6 }}>
        {t('create.nameLabel')}
      </Txt>
      <TextInput
        value={leaderName}
        onChangeText={setLeaderName}
        placeholder={t('create.namePlaceholder')}
        placeholderTextColor={colors.muted}
        style={inputStyle}
      />
      <View style={{ flex: 1 }} />
      <Pill
        label={t('create.cta')}
        onPress={submit}
        disabled={!groupName.trim() || !leaderName.trim()}
        style={{ alignSelf: 'center', paddingHorizontal: 56, marginBottom: 24 }}
      />
    </Screen>
  );
}
