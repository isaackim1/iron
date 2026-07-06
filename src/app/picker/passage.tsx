import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { BackChevron, Pill, Screen, Txt } from '@/components/ui';
import { bookByName, passageLabel } from '@/lib/bible';
import { dayName, fromIso } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import type { Weekday } from '@/lib/types';
import { colors, fonts, radii } from '@/lib/theme';

export default function PickerPassage() {
  const { state, actions, t } = useApp();
  const { day, book, chapter } = useLocalSearchParams<{
    day: string;
    book: string;
    chapter: string;
  }>();
  const [mode, setMode] = useState<'whole' | 'range'>('whole');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('12');

  const bookEntry = book ? bookByName(book) : undefined;
  const ch = Number(chapter);
  const weekday = Number(day) as Weekday;
  const schedule = sel.activeSchedule(state);
  const canManage = sel.canManageActiveGroup(state);
  const dayEntry = schedule?.days.find((d) => d.weekday === weekday);

  if (!canManage) return <Redirect href="/(tabs)/home" />;

  if (!bookEntry || !ch || !dayEntry) {
    router.back();
    return null;
  }

  const dayShort = `${dayName(fromIso(dayEntry.date), state.language)} ${fromIso(dayEntry.date).getDate()}`;
  const whole = { book: bookEntry.en, chapter: ch };
  const wholeLabel = passageLabel(whole, state.language);
  const rangeLabel = `${state.language === 'ko' ? bookEntry.ko : bookEntry.en} ${ch}:${from}–${to}`;

  const confirm = () => {
    const passage =
      mode === 'whole'
        ? whole
        : {
            book: bookEntry.en,
            chapter: ch,
            verseStart: Math.max(1, Number(from) || 1),
            verseEnd: Math.max(Number(from) || 1, Number(to) || 1),
          };
    actions.setDayPassage(weekday, passage);
    router.navigate('/(tabs)/manage');
  };

  const numInput = (value: string, set: (v: string) => void) => (
    <TextInput
      value={value}
      onChangeText={(v) => set(v.replace(/[^0-9]/g, ''))}
      keyboardType="number-pad"
      maxLength={3}
      style={{
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 10,
        width: 52,
        paddingVertical: 6,
        textAlign: 'center',
        fontSize: 16,
        fontFamily: fonts.title(state.language),
        color: colors.ink,
      }}
    />
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BackChevron />
        <Txt variant="title" size={24}>
          {wholeLabel}
        </Txt>
      </View>
      <Txt variant="caption" style={{ marginLeft: 24, marginTop: 2 }}>
        {t('picker.passageSub', { day: dayShort })}
      </Txt>

      <View style={{ height: 18 }} />
      {/* whole chapter */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setMode('whole')}
        style={{
          backgroundColor: mode === 'whole' ? colors.yellow : colors.card,
          borderRadius: radii.cardSm,
          padding: 20,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="button" size={12} color={mode === 'whole' ? colors.charcoal : colors.muted}>
              {t('picker.whole')}
            </Txt>
            <View style={{ height: 4 }} />
            <Txt variant="title" size={17}>
              {t('picker.wholeValue', { label: wholeLabel })}
            </Txt>
          </View>
          {mode === 'whole' && (
            <Txt variant="title" size={20}>
              ✓
            </Txt>
          )}
        </View>
      </TouchableOpacity>

      <View style={{ height: 14 }} />
      {/* verse range */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setMode('range')}
        style={{
          backgroundColor: mode === 'range' ? colors.yellow : colors.card,
          borderRadius: radii.cardSm,
          padding: 20,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="button" size={12} color={mode === 'range' ? colors.charcoal : colors.muted}>
              {t('picker.range')}
            </Txt>
            <View style={{ height: 4 }} />
            <Txt variant="title" size={17}>
              {rangeLabel}
            </Txt>
          </View>
          {mode === 'range' ? (
            <Txt variant="title" size={20}>
              ✓
            </Txt>
          ) : (
            <Txt variant="caption" size={18}>
              ›
            </Txt>
          )}
        </View>
        {mode === 'range' && (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}
          >
            <Txt variant="caption" color={colors.charcoal}>
              {t('picker.from')}
            </Txt>
            {numInput(from, setFrom)}
            <Txt variant="caption" color={colors.charcoal}>
              {t('picker.to')}
            </Txt>
            {numInput(to, setTo)}
          </View>
        )}
      </TouchableOpacity>

      <View style={{ height: 18 }} />
      <Txt variant="caption" center>
        {t('picker.rangeHint', { day: dayShort })}
      </Txt>

      <View style={{ flex: 1 }} />
      <Pill
        label={t('picker.set', { day: dayShort })}
        onPress={confirm}
        style={{ alignSelf: 'center', paddingHorizontal: 44, marginBottom: 24 }}
      />
    </Screen>
  );
}
