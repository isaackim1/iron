import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { Avatar, BackChevron, Card, Pill, Screen, Txt } from '@/components/ui';
import { fmtTime } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors, radii } from '@/lib/theme';

export default function GroupDetail() {
  const { state, actions, t } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = state.groups.find((g) => g.id === id);
  if (!group) {
    router.back();
    return null;
  }
  if (!sel.isMemberOfGroup(state, group.id)) return <Redirect href="/(tabs)/home" />;

  const members = sel.groupMembers(state, group.id);
  const shown = members.slice(0, 4);
  const schedule = state.schedules.find(
    (s) => s.groupId === group.id && s.published,
  );
  const prayer =
    state.language === 'ko' && schedule?.prayerPointKo
      ? schedule.prayerPointKo
      : schedule?.prayerPoint;
  const announcement =
    state.language === 'ko' && schedule?.announcementKo
      ? schedule.announcementKo
      : schedule?.announcement;
  const pref = sel.notificationPref(state);
  const desc =
    state.language === 'ko' && group.descriptionKo
      ? group.descriptionKo
      : group.description;

  return (
    <Screen>
      <BackChevron />
      <View style={{ alignItems: 'center', marginTop: -8 }}>
        <Txt variant="quoteBold" size={28} style={{ lineHeight: 40 }}>
          {sel.groupName(state, group)}
        </Txt>
        {!!desc && (
          <Txt variant="caption">
            {t('gdetail.meta', { desc, n: members.length })}
          </Txt>
        )}
      </View>

      <View style={{ height: 18 }} />
      {!!prayer && (
        <Card dark style={{ padding: 18 }}>
          <Txt variant="body" center size={12} color={colors.yellow}>
            {t('gdetail.prayerLabel')}
          </Txt>
          <View style={{ height: 8 }} />
          <Txt
            variant="quote"
            center
            size={13}
            color={colors.onDark}
            numberOfLines={3}
            style={{ lineHeight: 21 }}
          >
            {prayer}
          </Txt>
          <View style={{ height: 12 }} />
          <Pill
            small
            label={t('gdetail.more')}
            onPress={() => router.push('/prayer')}
            style={{ alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 18 }}
          />
        </Card>
      )}

      {!!announcement && (
        <>
          <View style={{ height: 18 }} />
          <Txt variant="title" size={16} style={{ marginBottom: 8 }}>
            {t('gdetail.announcements')}
          </Txt>
          <Card style={{ padding: 16 }}>
            <Txt variant="body" size={13} style={{ lineHeight: 20 }}>
              {announcement}
            </Txt>
          </Card>
        </>
      )}

      <View style={{ height: 18 }} />
      <Txt variant="title" size={16} style={{ marginBottom: 8 }}>
        {t('gdetail.members', { n: members.length })}
      </Txt>
      <Card style={{ paddingVertical: 10, paddingHorizontal: 18 }}>
        {shown.map(({ user, role }, i) => (
          <View
            key={user.id}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
          >
            <Avatar name={sel.userName(state, user.id)} size={24} index={i} />
            <Txt variant="body" size={14} color={colors.ink} style={{ marginLeft: 10, flex: 1 }}>
              {sel.userName(state, user.id)}
            </Txt>
            {role === 'leader' && (
              <View
                style={{
                  backgroundColor: colors.cardDark,
                  borderRadius: radii.pill,
                  paddingVertical: 3,
                  paddingHorizontal: 10,
                }}
              >
                <Txt variant="button" size={10} color={colors.yellow}>
                  {t('gdetail.leader')}
                </Txt>
              </View>
            )}
          </View>
        ))}
        {members.length > shown.length && (
          <Txt variant="caption" style={{ paddingVertical: 8, marginLeft: 34 }}>
            {t('gdetail.plusMore', { n: members.length - shown.length })}
          </Txt>
        )}
      </Card>

      <View style={{ height: 18 }} />
      <Txt variant="title" size={16} style={{ marginBottom: 8 }}>
        {t('gdetail.settings')}
      </Txt>
      <Card style={{ paddingVertical: 6, paddingHorizontal: 18 }}>
        <TouchableOpacity
          onPress={() => router.push('/notification-time?from=settings')}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 13,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
          }}
        >
          <Txt variant="body" size={14}>
            {t('gdetail.reminder')}
          </Txt>
          <Txt variant="button" size={14} color={colors.ink}>
            {fmtTime(pref?.time ?? '07:40', state.language)} ›
          </Txt>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => actions.setLanguage(state.language === 'en' ? 'ko' : 'en')}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 13,
          }}
        >
          <Txt variant="body" size={14}>
            {t('gdetail.language')}
          </Txt>
          <Txt variant="button" size={14} color={colors.ink}>
            {state.language === 'en' ? 'English ›' : '한국어 ›'}
          </Txt>
        </TouchableOpacity>
      </Card>
      <View style={{ height: 20 }} />
    </Screen>
  );
}
