import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { BackChevron, Pill, Screen, Txt } from '@/components/ui';
import { passageLabel, versesFor } from '@/lib/bible';
import { fmtDayShort, fromIso } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

export default function ReflectionNew() {
  const { state, actions, t } = useApp();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit ? sel.reflectionById(state, edit) : undefined;

  const todayDay = sel.todayDay(state);
  const passage = editing?.passage ?? todayDay?.passage;
  const date = editing?.date ?? todayDay?.date;
  const highlightNs = editing?.highlightedVerses ?? state.draftVerses;

  const [body, setBody] = useState(editing ? sel.reflectionBody(state, editing) : '');
  const [visibility, setVisibility] = useState<'shared' | 'private'>(
    editing?.visibility ?? 'shared',
  );

  if (!passage || !date) {
    router.back();
    return null;
  }

  const verses = versesFor(passage).filter((v) => highlightNs.includes(v.n));

  const post = () => {
    actions.postReflection({ body: body.trim(), visibility, editId: editing?.id });
    if (editing) {
      router.back();
    } else if (visibility === 'shared') {
      router.replace('/reflection/posted');
    } else {
      router.navigate('/(tabs)/reflect');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <BackChevron />
        <Txt variant="caption" style={{ marginTop: 6 }}>
          {passageLabel(passage, state.language)} · {fmtDayShort(fromIso(date), state.language)}
        </Txt>
        <View style={{ height: 6 }} />
        <Txt variant="title" size={20} style={{ lineHeight: 30 }}>
          {t('reflect.title')}
        </Txt>

        {verses.length > 0 && (
          <>
            <View style={{ height: 12 }} />
            <Txt
              variant="quote"
              size={13}
              style={{ lineHeight: 22, textDecorationLine: 'underline' }}
            >
              {verses
                .map((v) => `${v.n} ${state.language === 'ko' ? v.ko : v.en}`)
                .join(' ')}
            </Txt>
          </>
        )}

        <View style={{ height: 16 }} />
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: radii.card,
            padding: 18,
            minHeight: 220,
          }}
        >
          <TextInput
            multiline
            autoFocus={!editing}
            value={body}
            onChangeText={setBody}
            placeholder={t('reflect.placeholder')}
            placeholderTextColor={colors.muted}
            style={{
              flex: 1,
              fontSize: 15,
              lineHeight: 24,
              fontFamily: fonts.quote(state.language),
              color: colors.charcoal,
              textAlignVertical: 'top',
            }}
          />
        </View>

        <View style={{ height: 18 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
          <Pill
            small
            label={t('reflect.share')}
            kind={visibility === 'shared' ? 'yellow' : 'white'}
            onPress={() => setVisibility('shared')}
            style={{ flex: 1 }}
          />
          <Pill
            small
            label={t('reflect.private')}
            kind={visibility === 'private' ? 'yellow' : 'white'}
            onPress={() => setVisibility('private')}
            style={{ flex: 1 }}
          />
        </View>
        <View style={{ height: 10 }} />
        <Txt variant="caption" center>
          {visibility === 'shared' ? t('reflect.shareHint') : t('reflect.privateHint')}
        </Txt>

        <View style={{ height: 22 }} />
        <Pill
          label={t('reflect.post')}
          disabled={!body.trim()}
          onPress={post}
          style={{ alignSelf: 'center', paddingHorizontal: 52, marginBottom: 20 }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
