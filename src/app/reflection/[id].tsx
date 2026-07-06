import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { BackChevron, Pill, Screen, Txt } from '@/components/ui';
import { passageLabel, versesFor } from '@/lib/bible';
import { fmtDateLong, fromIso } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors, radii } from '@/lib/theme';

export default function ReflectionDetail() {
  const { state, t } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reflection = id ? sel.reflectionById(state, id) : undefined;
  const group = sel.activeGroup(state);

  if (!reflection) {
    router.back();
    return null;
  }

  const mine = reflection.userId === state.currentUserId;
  const verses = versesFor(reflection.passage).filter((v) =>
    reflection.highlightedVerses.includes(v.n),
  );

  return (
    <Screen>
      <BackChevron />
      <View style={{ height: 14 }} />
      <Txt variant="caption">
        {fmtDateLong(fromIso(reflection.date), state.language)}
        {!mine ? ` · ${sel.userName(state, reflection.userId)}` : ''}
      </Txt>
      <View style={{ height: 4 }} />
      <Txt variant="quoteBold" size={30} style={{ lineHeight: 42 }}>
        {passageLabel(reflection.passage, state.language)}
      </Txt>
      <View style={{ height: 10 }} />
      <View
        style={{
          alignSelf: 'flex-start',
          backgroundColor: reflection.visibility === 'shared' ? colors.cardDark : colors.input,
          borderRadius: radii.pill,
          paddingVertical: 5,
          paddingHorizontal: 14,
        }}
      >
        <Txt
          variant="button"
          size={11}
          color={reflection.visibility === 'shared' ? colors.yellow : colors.muted}
        >
          {reflection.visibility === 'shared' && group
            ? t('detail.sharedWith', { group: sel.groupName(state, group) })
            : t('detail.private')}
        </Txt>
      </View>

      {verses.length > 0 && (
        <>
          <View style={{ height: 20 }} />
          <Txt
            variant="quote"
            size={13.5}
            style={{ lineHeight: 23, textDecorationLine: 'underline' }}
          >
            {verses
              .map((v) => `${v.n} ${state.language === 'ko' ? v.ko : v.en}`)
              .join(' ')}
          </Txt>
        </>
      )}

      <View style={{ height: 18 }} />
      <Txt variant="quote" size={15} style={{ lineHeight: 26 }}>
        {sel.reflectionBody(state, reflection)}
      </Txt>

      <View style={{ height: 36 }} />
      {mine && (
        <Pill
          small
          kind="dark"
          label={t('detail.edit')}
          onPress={() => router.push(`/reflection/new?edit=${reflection.id}`)}
          style={{ alignSelf: 'center', paddingHorizontal: 36, marginBottom: 20 }}
        />
      )}
    </Screen>
  );
}
