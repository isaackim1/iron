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
  const isLeader = sel.myRole(state) === 'leader';

  if (!isLeader) return <Redirect href="/(tabs)/home" />;
  if (!group || !schedule) return null;

  const prayerValue =
    state.language === 'ko' && schedule.prayerPointKo
      ? schedule.prayerPointKo
      : schedule.prayerPoint;
  const announcementValue =
    state.language === 'ko' && schedule.announcementKo
      ? schedule.announcementKo
      : (schedule.announcement ?? '');
  const canPublish = prayerValue.trim().length > 0;

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
      <Card style={{ paddingVertical: 8, paddingHorizontal: 20 }}>
        {schedule.days.map((d, i) => (
          <TouchableOpacity
            key={d.weekday}
            activeOpacity={0.7}
            onPress={() => router.push(`/picker/books?day=${d.weekday}`)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 13,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.hairline,
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
        ))}
      </Card>

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
