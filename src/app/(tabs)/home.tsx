import { router } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { Avatar, Card, Pill, Screen, Txt } from '@/components/ui';
import { passageLabel } from '@/lib/bible';
import { addDays, dayName, fromIso, isoDate, mondayOf, today } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

function WeekStrip() {
  const { state } = useApp();
  const schedule = sel.activeSchedule(state);
  const monday = mondayOf(today());
  const sunday = addDays(monday, -1);
  const todayIso = isoDate(today());
  const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  const scheduledDates = new Set(
    schedule?.published ? schedule.days.map((d) => d.date) : [],
  );

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
      {days.map((d) => {
        const iso = isoDate(d);
        const isToday = iso === todayIso;
        return (
          <View key={iso} style={{ alignItems: 'center', width: 40 }}>
            <Txt variant="caption" color={isToday ? colors.ink : colors.muted}>
              {dayName(d, state.language)}
            </Txt>
            <Txt
              variant={isToday ? 'title' : 'body'}
              size={15}
              color={isToday ? colors.ink : colors.muted}
            >
              {d.getDate()}
            </Txt>
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                marginTop: 4,
                backgroundColor: isToday
                  ? colors.yellow
                  : scheduledDates.has(iso)
                    ? '#C9C7BE'
                    : 'transparent',
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

export default function Home() {
  const { state, t } = useApp();
  const group = sel.activeGroup(state);
  const schedule = sel.activeSchedule(state);
  const todayDay = sel.todayDay(state);
  const isLeader = sel.myRole(state) === 'leader';
  const kinds = sel.myResponseKinds(state);
  if (!group) return null;

  const prayer =
    state.language === 'ko' && schedule?.prayerPointKo
      ? schedule.prayerPointKo
      : schedule?.prayerPoint;
  const showPrayer = schedule && (schedule.published || isLeader) && !!prayer?.trim();
  const showChapter = schedule && (schedule.published || isLeader) && todayDay;

  return (
    <Screen>
      {/* header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
        }}
      >
        <Txt variant="title" size={20}>
          {t('home.hi', { name: sel.firstName(state) })}
        </Txt>
        <TouchableOpacity
          onPress={() => router.push(`/group/${group.id}`)}
          style={{ position: 'absolute', right: 0 }}
        >
          <Avatar name={sel.me(state)?.name ?? '?'} size={30} index={0} />
        </TouchableOpacity>
      </View>

      <View style={{ height: 10 }} />
      <WeekStrip />
      <View style={{ height: 16 }} />

      {/* community prayer card */}
      <Card dark>
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Txt variant="body" size={13} color={colors.yellow}>
            {t('home.prayerLabel')}
          </Txt>
          {isLeader && (
            <TouchableOpacity
              onPress={() => router.navigate('/(tabs)/manage')}
              style={{ position: 'absolute', right: 0 }}
            >
              <Txt variant="caption" color={colors.yellow}>
                {t('home.edit')}
              </Txt>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: 14 }} />
        {showPrayer ? (
          <>
            <Txt
              variant="quote"
              color={colors.onDark}
              size={15}
              numberOfLines={9}
              style={{ lineHeight: 24 }}
            >
              {prayer}
            </Txt>
            <View style={{ height: 18 }} />
            <Pill
              small
              label={t('home.more')}
              onPress={() => router.push('/prayer')}
              style={{ alignSelf: 'center' }}
            />
          </>
        ) : (
          <Txt variant="quote" center color={colors.mutedOnDark} style={{ paddingVertical: 20 }}>
            {t('home.prayerEmpty')}
          </Txt>
        )}
      </Card>

      {/* leader week status */}
      {isLeader && schedule && (
        <Txt variant="caption" center style={{ marginTop: 10 }}>
          {schedule.published ? t('home.weekPublished') : t('home.weekDraft')}
        </Txt>
      )}

      <View style={{ height: 14 }} />

      {/* today's chapter */}
      <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
        <Txt variant="button" size={14} color={colors.ink}>
          {t('home.todayLabel')}
        </Txt>
        <View style={{ height: 6 }} />
        {showChapter ? (
          <>
            <Txt variant="quoteBold" size={32} style={{ lineHeight: 42 }}>
              {passageLabel(todayDay.passage, state.language)}
            </Txt>
            {kinds.length > 0 && (
              <Txt variant="caption" style={{ marginTop: 2 }}>
                {kinds.includes('reflection') ? t('home.reflectionDone') : t('home.amenDone')}
              </Txt>
            )}
            <View style={{ height: 14 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pill small label={t('home.read')} onPress={() => router.push('/reading')} />
              {isLeader && (
                <Pill
                  small
                  kind="dark"
                  label={t('home.manage')}
                  onPress={() => router.navigate('/(tabs)/manage')}
                />
              )}
            </View>
          </>
        ) : (
          <>
            <Txt variant="quoteBold" size={22} color={colors.muted} style={{ lineHeight: 34 }}>
              {t('home.notScheduled')}
            </Txt>
            <View style={{ height: 8 }} />
            {isLeader ? (
              <>
                <View style={{ height: 6 }} />
                <Pill
                  small
                  kind="dark"
                  label={t('manage.startWeek')}
                  onPress={() => router.navigate('/(tabs)/manage')}
                />
              </>
            ) : (
              <Txt variant="caption">{t('home.notScheduledHint')}</Txt>
            )}
          </>
        )}
      </Card>

      {/* date context */}
      {todayDay && (
        <Txt variant="caption" center style={{ marginTop: 12 }}>
          {dayName(fromIso(todayDay.date), state.language)} · {fromIso(todayDay.date).getDate()}
        </Txt>
      )}
    </Screen>
  );
}
