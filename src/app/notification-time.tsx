import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, TouchableOpacity, View } from 'react-native';
import { BackChevron, Pill, Screen, Txt } from '@/components/ui';
import { fmtTime } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

const ROW = 44;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const MERIDIEM = [0, 1]; // 0 = AM, 1 = PM

function WheelColumn({
  values,
  index,
  onChange,
  width,
  render,
  numeric,
}: {
  values: number[];
  index: number;
  onChange: (i: number) => void;
  width: number;
  render: (v: number) => string;
  numeric?: boolean;
}) {
  const { state } = useApp();
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    // contentOffset is iOS-only; scroll into place explicitly for Android.
    const id = setTimeout(
      () => ref.current?.scrollTo({ y: index * ROW, animated: false }),
      0,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ScrollView
      ref={ref}
      style={{ height: ROW * 5, width }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW}
      decelerationRate="fast"
      contentOffset={{ x: 0, y: index * ROW }}
      onMomentumScrollEnd={(e) => {
        const i = Math.round(e.nativeEvent.contentOffset.y / ROW);
        onChange(Math.max(0, Math.min(values.length - 1, i)));
      }}
    >
      <View style={{ height: ROW * 2 }} />
      {values.map((v, i) => (
        <View
          key={v}
          style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt
            variant="title"
            size={i === index ? 26 : 18}
            color={i === index ? colors.ink : colors.muted}
            style={{
              opacity: i === index ? 1 : 0.5,
              fontFamily: numeric
                ? fonts.numeric(state.language)
                : fonts.title(state.language),
              fontVariant: numeric ? ['tabular-nums'] : undefined,
              lineHeight: 32,
            }}
          >
            {render(v)}
          </Txt>
        </View>
      ))}
      <View style={{ height: ROW * 2 }} />
    </ScrollView>
  );
}

export default function NotificationTime() {
  const { state, actions, t } = useApp();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const pref = sel.notificationPref(state);
  const [initH, initM] = (pref?.time ?? '07:40').split(':').map(Number);

  const [hourIdx, setHourIdx] = useState(HOURS.indexOf(initH % 12 === 0 ? 12 : initH % 12));
  const [minIdx, setMinIdx] = useState(Math.round(initM / 5) % 12);
  const [pm, setPm] = useState(initH >= 12);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reminderOn, setReminderOn] = useState(true);

  const hour24 = (HOURS[hourIdx] % 12) + (pm ? 12 : 0);
  const time = `${String(hour24).padStart(2, '0')}:${String(MINUTES[minIdx]).padStart(2, '0')}`;

  const finish = () => {
    actions.setNotificationTime(time);
    if (from === 'settings') {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  };

  return (
    <Screen scroll={false}>
      <BackChevron />
      <View style={{ height: 40 }} />
      <Txt variant="title" center style={{ fontSize: 23 }}>
        {pickerOpen ? t('notif.pickTitle') : t('notif.title')}
      </Txt>
      <View style={{ height: 12 }} />
      <Txt variant="body" center size={14}>
        {t('notif.subtitle')}
      </Txt>
      <View style={{ height: 40 }} />

      {pickerOpen ? (
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 300, height: ROW * 5, justifyContent: 'center' }}>
            {/* selection band */}
            <View
              style={{
                position: 'absolute',
                top: ROW * 2 - 6,
                left: 0,
                right: 0,
                height: ROW + 12,
                backgroundColor: colors.yellow,
                opacity: 0.22,
                borderRadius: 18,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <WheelColumn
                values={HOURS}
                index={hourIdx}
                onChange={setHourIdx}
                width={80}
                numeric
                render={(v) => String(v)}
              />
              <WheelColumn
                values={MINUTES}
                index={minIdx}
                onChange={setMinIdx}
                width={80}
                numeric
                render={(v) => String(v).padStart(2, '0')}
              />
              <WheelColumn
                values={MERIDIEM}
                index={pm ? 1 : 0}
                onChange={(i) => setPm(i === 1)}
                width={90}
                render={(v) =>
                  state.language === 'ko'
                    ? v === 0
                      ? '오전'
                      : '오후'
                    : v === 0
                      ? 'AM'
                      : 'PM'
                }
              />
            </View>
          </View>
          <View style={{ height: 18 }} />
          <Txt variant="caption">{t('notif.timezone')}</Txt>
          <View style={{ height: 26 }} />
          <Pill small label={t('notif.save')} onPress={() => setPickerOpen(false)} />
        </View>
      ) : (
        <View style={{ alignItems: 'center' }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setPickerOpen(true)}
            style={{
              backgroundColor: colors.yellow,
              borderRadius: radii.cardLg,
              paddingVertical: 34,
              paddingHorizontal: 44,
              alignItems: 'center',
              alignSelf: 'stretch',
              marginHorizontal: 14,
            }}
          >
            <Txt variant="button" size={13} color={colors.ink}>
              {t('notif.cardLabel')}
            </Txt>
            <View style={{ height: 8 }} />
            <Txt variant="title" size={38} style={{ lineHeight: 48 }}>
              {fmtTime(time, state.language)} ›
            </Txt>
          </TouchableOpacity>
          <View style={{ height: 30 }} />
          <Switch
            value={reminderOn}
            onValueChange={setReminderOn}
            trackColor={{ true: colors.charcoal, false: colors.input }}
            thumbColor="#FFFFFF"
          />
          <View style={{ height: 8 }} />
          <Txt variant="caption">{t('notif.reminderOn')}</Txt>
          <View style={{ height: 14 }} />
          <Txt variant="caption">{t('notif.hint')}</Txt>
        </View>
      )}

      <View style={{ flex: 1 }} />
      {!pickerOpen && (
        <Pill
          label={from === 'settings' ? t('notif.save') : t('notif.continue')}
          onPress={finish}
          style={{ alignSelf: 'center', paddingHorizontal: 48, marginBottom: 24 }}
        />
      )}
    </Screen>
  );
}
