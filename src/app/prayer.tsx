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
      {/* Card hugs its content: small notes make a small card, long notes
          grow to a max height and scroll inside. */}
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 24 }}>
        <View
          style={{
            backgroundColor: colors.cardDark,
            borderRadius: radii.cardLg,
            padding: 26,
            minHeight: 260,
            maxHeight: '88%',
          }}
        >
          <Txt variant="body" center size={13} color={colors.yellow}>
            {t('home.prayerLabel')}
          </Txt>
          <View style={{ height: 18 }} />
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
          >
            <Txt variant="quote" color={colors.onDark} size={16} style={{ lineHeight: 27 }}>
              {prayer}
            </Txt>
            <View style={{ height: 20 }} />
            <Txt variant="caption" color={colors.mutedOnDark}>
              {t('prayer.from')} · {sundayLabel}
            </Txt>
          </ScrollView>
          <View style={{ height: 18 }} />
          <Pill
            small
            label={t('prayer.close')}
            onPress={() => router.back()}
            style={{ alignSelf: 'center' }}
          />
        </View>
      </View>
    </Screen>
  );
}
