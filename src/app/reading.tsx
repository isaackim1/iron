import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BackChevron, Pill, Screen, Txt } from '@/components/ui';
import { passageLabel, versesFor } from '@/lib/bible';
import { sel, useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

export default function Reading() {
  const { state, actions, t } = useApp();
  // Route-level guard: members must not see disabled or still-hidden days,
  // even via direct/stale navigation. Leaders keep access to manage.
  const todayDay = sel.todayVisibleDay(state);

  useEffect(() => {
    actions.clearDraftVerses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!todayDay) {
    return <Redirect href="/(tabs)/home" />;
  }

  const verses = versesFor(todayDay.passage);
  const n = state.draftVerses.length;

  return (
    <Screen scroll={false}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.card,
          borderRadius: radii.cardLg,
          marginTop: 8,
          marginBottom: 16,
          paddingHorizontal: 24,
          paddingTop: 14,
          paddingBottom: 18,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <BackChevron />
          <View style={{ flex: 1, alignItems: 'center', marginRight: 20 }}>
            <Txt variant="button" size={14} color={colors.ink}>
              {t('home.todayLabel')}
            </Txt>
          </View>
        </View>
        <Txt variant="quoteBold" center size={30} style={{ lineHeight: 40, marginTop: 2 }}>
          {passageLabel(todayDay.passage, state.language)}
        </Txt>
        <Txt variant="caption" center size={11} style={{ marginTop: 4 }}>
          {n === 0 ? t('reading.hint') : t('reading.highlighted', { n })}
        </Txt>

        <ScrollView style={{ marginTop: 16, flex: 1 }} showsVerticalScrollIndicator={false}>
          <Text
            style={{
              fontFamily: fonts.quote(state.language),
              fontSize: 15,
              lineHeight: 27,
              color: colors.charcoal,
            }}
          >
            {verses.map((v) => {
              const highlighted = state.draftVerses.includes(v.n);
              const body = state.language === 'ko' ? v.ko : v.en;
              return (
                <Text
                  key={v.n}
                  suppressHighlighting
                  onPress={() => actions.toggleDraftVerse(v.n)}
                  style={
                    highlighted
                      ? { backgroundColor: 'rgba(255, 207, 0, 0.4)' }
                      : undefined
                  }
                >
                  <Text
                    style={{
                      fontFamily: fonts.title(state.language),
                      fontSize: 11,
                      color: highlighted ? colors.ink : colors.muted,
                    }}
                  >
                    {` ${v.n} `}
                  </Text>
                  {body}
                </Text>
              );
            })}
          </Text>
          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 12 }}>
          <Pill
            small
            kind="dark"
            label={t('reading.reflect')}
            onPress={() => router.push('/reflection/new')}
            style={{ paddingHorizontal: 30 }}
          />
          <Pill
            small
            label={t('reading.amen')}
            onPress={() => {
              actions.amenToday();
              router.push('/amen-done');
            }}
            style={{ paddingHorizontal: 34 }}
          />
        </View>
      </View>
    </Screen>
  );
}
