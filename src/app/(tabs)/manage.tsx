import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Card, Pill, Screen, Txt } from '@/components/ui';
import { passageLabel } from '@/lib/bible';
import { dayName, fmtWeekRange, fromIso, mondayOf, today } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors, fonts } from '@/lib/theme';

export default function Manage() {
  const { state, actions, t } = useApp();
  const group = sel.activeGroup(state);
  const schedule = sel.activeSchedule(state);
  const isLeader = sel.canManageActiveGroup(state);

  if (!isLeader) return <Redirect href="/(tabs)/home" />;
  if (!group) return null;

  // Persisted schedules keep their original weekStart, so after a week
  // rolls over there may be no schedule for the current week yet.
  if (!schedule) {
    return (
      <Screen>
        <View style={{ height: 8 }} />
        <Txt variant="title" size={28}>
          {t('manage.title')}
        </Txt>
        <Txt variant="caption" style={{ marginTop: 2 }}>
          {t('manage.weekOf', {
            group: sel.groupName(state, group),
            range: fmtWeekRange(mondayOf(today()), state.language),
          })}
        </Txt>
        <View style={{ height: 20 }} />
        <Card style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Txt variant="quoteBold" size={17} color={colors.muted}>
            {t('manage.noWeek')}
          </Txt>
          <View style={{ height: 10 }} />
          <Txt variant="caption" center style={{ maxWidth: 280 }}>
            {t('manage.noWeekSub')}
          </Txt>
          <View style={{ height: 22 }} />
          <Pill small label={t('manage.startWeek')} onPress={actions.startWeek} />
        </Card>
        <View style={{ height: 24 }} />
        <TouchableOpacity onPress={() => router.push('/members')}>
          <Txt variant="button" center size={14} color={colors.ink}>
            {t('manage.membersInvite')}
          </Txt>
        </TouchableOpacity>
        <View style={{ height: 16 }} />
        <TouchableOpacity onPress={() => router.push('/groups')}>
          <Txt variant="button" center size={14} color={colors.ink}>
            {t('manage.myGroups')}
          </Txt>
        </TouchableOpacity>
      </Screen>
    );
  }

  const prayerValue =
    state.language === 'ko' && schedule.prayerPointKo
      ? schedule.prayerPointKo
      : schedule.prayerPoint;
  const announcementValue =
    state.language === 'ko' && schedule.announcementKo
      ? schedule.announcementKo
      : (schedule.announcement ?? '');
  const canPublish = prayerValue.trim().length > 0;
  const enabledDays = schedule.days.filter((d) => d.enabled);

  return (
    <Screen>
      <View style={{ height: 8 }} />
      <Txt variant="title" size={28}>
        {t('manage.title')}
      </Txt>
      <Txt variant="caption" style={{ marginTop: 2 }}>
        {t('manage.weekOf', {
          group: sel.groupName(state, group),
          range: fmtWeekRange(mondayOf(today()), state.language),
        })}
      </Txt>

      <View style={{ height: 20 }} />
      <Txt variant="title" size={16} style={{ marginBottom: 8 }}>
        {t('manage.chapters')}
      </Txt>
      {/* which days have a reading */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
          marginBottom: 8,
        }}
      >
        {schedule.days.map((d) => (
          <TouchableOpacity
            key={d.weekday}
            onPress={() => actions.setDayEnabled(d.weekday, !d.enabled)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: d.enabled ? colors.yellow : colors.input,
            }}
          >
            <Txt
              variant="button"
              size={12}
              color={d.enabled ? colors.ink : colors.muted}
            >
              {dayName(fromIso(d.date), state.language).slice(0, 1)}
            </Txt>
          </TouchableOpacity>
        ))}
      </View>
      <Txt variant="caption" center style={{ marginBottom: 10 }}>
        {t('manage.daysHint')}
      </Txt>

      <Card style={{ paddingVertical: 8, paddingHorizontal: 20 }}>
        {enabledDays.length === 0 ? (
          <Txt variant="caption" center style={{ paddingVertical: 16 }}>
            {t('manage.noDays')}
          </Txt>
        ) : (
          enabledDays.map((d, i) => (
            <View
              key={d.weekday}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.hairline,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push(`/picker/books?day=${d.weekday}`)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 13,
                }}
              >
                <Txt variant="caption" size={12} style={{ width: 64 }}>
                  {dayName(fromIso(d.date), state.language)} {fromIso(d.date).getDate()}
                </Txt>
                <Txt variant="quoteBold" size={16} style={{ flex: 1, lineHeight: 24 }}>
                  {passageLabel(d.passage, state.language)}
                </Txt>
                <Txt variant="caption" color={colors.muted}>
                  ›
                </Txt>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => actions.setDayPublished(d.weekday, !d.published)}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={{ paddingLeft: 14, paddingVertical: 13 }}
              >
                <Feather
                  name={d.published ? 'eye' : 'eye-off'}
                  size={15}
                  color={d.published ? colors.ink : colors.muted}
                />
              </TouchableOpacity>
            </View>
          ))
        )}
      </Card>
      <View style={{ height: 10 }} />
      <TouchableOpacity onPress={actions.autoFillWeek}>
        <Txt variant="caption" center>
          {t('manage.autofill')}
        </Txt>
      </TouchableOpacity>

      <View style={{ height: 20 }} />
      <Txt variant="title" size={16} style={{ marginBottom: 8 }}>
        {t('manage.prayer')}
      </Txt>
      <Card style={{ padding: 18 }}>
        <TextInput
          multiline
          value={prayerValue}
          onChangeText={actions.setPrayerPoint}
          placeholder={t('manage.prayerPlaceholder')}
          placeholderTextColor={colors.muted}
          style={{
            minHeight: 84,
            fontSize: 14,
            lineHeight: 21,
            fontFamily: fonts.quote(state.language),
            color: colors.charcoal,
            textAlignVertical: 'top',
          }}
        />
      </Card>

      <View style={{ height: 20 }} />
      <Txt variant="title" size={16} style={{ marginBottom: 8 }}>
        {t('manage.announcement')}
      </Txt>
      <Card style={{ padding: 18 }}>
        <TextInput
          multiline
          value={announcementValue}
          onChangeText={actions.setAnnouncement}
          placeholder={t('manage.announcementPlaceholder')}
          placeholderTextColor={colors.muted}
          style={{
            minHeight: 44,
            fontSize: 14,
            lineHeight: 21,
            fontFamily: fonts.body(state.language),
            color: colors.charcoal,
            textAlignVertical: 'top',
          }}
        />
      </Card>

      <View style={{ height: 26 }} />
      <Pill
        label={schedule.published ? t('manage.published') : t('manage.publish')}
        kind={schedule.published ? 'dark' : 'yellow'}
        disabled={schedule.published || !canPublish}
        onPress={actions.publishWeek}
        style={{ alignSelf: 'center', paddingHorizontal: 44 }}
      />
      <View style={{ height: 10 }} />
      <Txt variant="caption" center>
        {schedule.published || canPublish ? t('manage.publishHint') : t('manage.needPrayer')}
      </Txt>

      <View style={{ height: 24 }} />
      <TouchableOpacity onPress={() => router.push('/members')}>
        <Txt variant="button" center size={14} color={colors.ink}>
          {t('manage.membersInvite')}
        </Txt>
      </TouchableOpacity>
      <View style={{ height: 16 }} />
      <TouchableOpacity onPress={() => router.push('/groups')}>
        <Txt variant="button" center size={14} color={colors.ink}>
          {t('manage.myGroups')}
        </Txt>
      </TouchableOpacity>
      <View style={{ height: 20 }} />
    </Screen>
  );
}
