import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { BackChevron, Card, Screen, Txt } from '@/components/ui';
import { BIBLE_BOOKS } from '@/lib/bible';
import { fmtDayShort, fromIso } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

export default function PickerBooks() {
  const { state, t } = useApp();
  const { day } = useLocalSearchParams<{ day: string }>();
  const schedule = sel.activeSchedule(state);
  const canManage = sel.canManageActiveGroup(state);
  const dayEntry = schedule?.days.find((d) => String(d.weekday) === day);
  const dayLabel = dayEntry
    ? fmtDayShort(fromIso(dayEntry.date), state.language)
    : '';
  const currentBook = dayEntry?.passage.book;

  if (!canManage) return <Redirect href="/(tabs)/home" />;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BackChevron />
        <Txt variant="title" size={24}>
          {t('picker.books')}
        </Txt>
      </View>
      <Txt variant="caption" style={{ marginLeft: 24, marginTop: 2 }}>
        {t('picker.booksSub', { day: dayLabel })}
      </Txt>
      <View style={{ height: 14 }} />
      <Card style={{ paddingVertical: 6, paddingHorizontal: 20 }}>
        {BIBLE_BOOKS.map((b, i) => {
          const selected = b.en === currentBook;
          return (
            <TouchableOpacity
              key={b.en}
              activeOpacity={0.7}
              onPress={() => router.push(`/picker/chapters?day=${day}&book=${encodeURIComponent(b.en)}`)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 11,
                paddingHorizontal: 12,
                marginVertical: 1,
                borderRadius: 999,
                backgroundColor: selected ? colors.yellow : 'transparent',
                borderTopWidth: 0,
              }}
            >
              <Txt variant="title" size={15} style={{ flex: 1 }}>
                {state.language === 'ko' ? b.ko : b.en}
              </Txt>
              <Txt variant="caption" size={12}>
                {b.chapters}
              </Txt>
            </TouchableOpacity>
          );
        })}
      </Card>
      <View style={{ height: 12 }} />
      <Txt variant="caption" center style={{ marginBottom: 20 }}>
        {t('picker.order')}
      </Txt>
    </Screen>
  );
}
