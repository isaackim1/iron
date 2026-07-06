import { router } from 'expo-router';
import { View } from 'react-native';
import { Pill, Screen, Txt } from '@/components/ui';
import { versesFor } from '@/lib/bible';
import { fmtDayShort, fromIso } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

export default function AmenDone() {
  const { state, actions, t } = useApp();
  const todayDay = sel.todayDay(state);
  const highlighted = todayDay
    ? versesFor(todayDay.passage).filter((v) => state.draftVerses.includes(v.n))
    : [];

  const done = () => {
    actions.clearDraftVerses();
    router.navigate('/(tabs)/home');
  };

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
        <View style={{ flex: 1 }} />
        <Txt variant="title" size={40} style={{ lineHeight: 52 }}>
          {t('amen.title')}
        </Txt>
        <View style={{ height: 30 }} />
        {highlighted.length > 0 ? (
          <>
            <Txt variant="title" size={15}>
              {t('amen.versesLabel')}
            </Txt>
            <View style={{ height: 14 }} />
            <Txt
              variant="quote"
              center
              size={14}
              style={{
                lineHeight: 24,
                maxWidth: 320,
                textDecorationLine: 'underline',
              }}
            >
              {highlighted
                .map((v) => `${v.n} ${state.language === 'ko' ? v.ko : v.en}`)
                .join(' ')}
            </Txt>
          </>
        ) : (
          <Txt variant="quote" center size={14} color={colors.muted}>
            {t('amen.noVerses')}
          </Txt>
        )}
        <View style={{ height: 30 }} />
        {todayDay && (
          <Txt variant="caption">
            {t('amen.marked', {
              date: fmtDayShort(fromIso(todayDay.date), state.language),
            })}
          </Txt>
        )}
        <View style={{ flex: 1.4 }} />
        <Pill
          small
          kind="dark"
          label={t('amen.save')}
          onPress={done}
          style={{ paddingHorizontal: 40, marginBottom: 30 }}
        />
      </View>
    </Screen>
  );
}
