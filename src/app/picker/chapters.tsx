import { router, useLocalSearchParams } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { BackChevron, Card, Screen, Txt } from '@/components/ui';
import { bookByName } from '@/lib/bible';
import { useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

export default function PickerChapters() {
  const { state, t } = useApp();
  const { day, book } = useLocalSearchParams<{ day: string; book: string }>();
  const bookEntry = book ? bookByName(book) : undefined;

  if (!bookEntry) {
    router.back();
    return null;
  }

  const chapters = Array.from({ length: bookEntry.chapters }, (_, i) => i + 1);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BackChevron />
        <Txt variant="title" size={24}>
          {state.language === 'ko' ? bookEntry.ko : bookEntry.en}
        </Txt>
      </View>
      <Txt variant="caption" style={{ marginLeft: 24, marginTop: 2 }}>
        {t('picker.chaptersSub', { n: bookEntry.chapters })}
      </Txt>
      <View style={{ height: 14 }} />
      <Card style={{ paddingVertical: 18 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          {chapters.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() =>
                router.push(
                  `/picker/passage?day=${day}&book=${encodeURIComponent(bookEntry.en)}&chapter=${c}`,
                )
              }
              style={{
                width: '14.28%',
                height: 46,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt variant="title" size={15} color={colors.ink}>
                  {c}
                </Txt>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
