import { router } from 'expo-router';
import { View } from 'react-native';
import { Pill, Screen, Txt } from '@/components/ui';
import { sel, useApp } from '@/lib/store';
import { colors, radii } from '@/lib/theme';

export default function ReflectionPosted() {
  const { state, t } = useApp();
  const group = sel.activeGroup(state);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1 }} />
        <Txt variant="title" size={38} style={{ lineHeight: 50 }}>
          {t('posted.title')}
        </Txt>
        <View style={{ height: 20 }} />
        {group && (
          <View
            style={{
              backgroundColor: colors.cardDark,
              borderRadius: radii.pill,
              paddingVertical: 8,
              paddingHorizontal: 20,
            }}
          >
            <Txt variant="button" size={12} color={colors.yellow}>
              {t('posted.sharedWith', { group: sel.groupName(state, group) })}
            </Txt>
          </View>
        )}
        <View style={{ height: 22 }} />
        <Txt variant="body" center size={14} style={{ maxWidth: 280, lineHeight: 23 }}>
          {t('posted.body')}
        </Txt>
        <View style={{ height: 12 }} />
        <Txt variant="caption">{t('posted.alsoSaved')}</Txt>
        <View style={{ flex: 1.3 }} />
        <Pill
          label={t('posted.seeFeed')}
          onPress={() => router.navigate('/(tabs)/feed')}
          style={{ paddingHorizontal: 44, marginBottom: 30 }}
        />
      </View>
    </Screen>
  );
}
