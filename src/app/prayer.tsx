import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Pill, Screen, Txt } from '@/components/ui';
import { fmtDateShort, fromIso } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors, radii } from '@/lib/theme';

export default function PrayerExpanded() {
  const { state, t } = useApp();
  const schedule = sel.activeSchedule(state);
  const prayer =
    state.language === 'ko' && schedule?.prayerPointKo
      ? schedule.prayerPointKo
      : schedule?.prayerPoint;

  const sundayLabel = schedule
    ? fmtDateShort(fromIso(schedule.weekStart), state.language)
    : '';

  return (
    <Screen scroll={false}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.cardDark,
          borderRadius: radii.cardLg,
          marginTop: 12,
          marginBottom: 24,
          padding: 26,
        }}
      >
        <Txt variant="body" center size={13} color={colors.yellow}>
          {t('home.prayerLabel')}
        </Txt>
        <View style={{ height: 20 }} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <Txt variant="quote" color={colors.onDark} size={16} style={{ lineHeight: 27 }}>
            {prayer}
          </Txt>
          <View style={{ height: 24 }} />
          <Txt variant="caption" color={colors.mutedOnDark}>
            {t('prayer.from')} · {sundayLabel}
          </Txt>
        </ScrollView>
        <View style={{ height: 16 }} />
        <Pill
          small
          label={t('prayer.close')}
          onPress={() => router.back()}
          style={{ alignSelf: 'center' }}
        />
      </View>
    </Screen>
  );
}
