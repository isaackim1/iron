import * as Clipboard from 'expo-clipboard';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, BackChevron, Card, Pill, Screen, Txt } from '@/components/ui';
import { sel, useApp } from '@/lib/store';
import { colors, radii } from '@/lib/theme';

export default function Members() {
  const { state, t } = useApp();
  const [copied, setCopied] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const group = sel.activeGroup(state);
  const canManage = sel.canManageActiveGroup(state);

  if (!canManage) return <Redirect href="/(tabs)/home" />;
  if (!group) return null;

  const members = sel.groupMembers(state, group.id);
  const { responded, total } = sel.respondedCountToday(state);

  const share = async () => {
    await Clipboard.setStringAsync(group.inviteCode);
    setCopied(true);
  };

  return (
    <Screen>
      <BackChevron />
      <Txt variant="title" size={26}>
        {t('members.title')}
      </Txt>
      <Txt variant="caption" style={{ marginTop: 2 }}>
        {t('members.meta', { group: sel.groupName(state, group), n: members.length })}
      </Txt>

      <View style={{ height: 16 }} />
      <Card dark style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Txt variant="body" size={12} color={colors.yellow}>
          {t('members.codeLabel')}
        </Txt>
        <View style={{ height: 6 }} />
        <Txt
          variant="title"
          size={32}
          color="#FFFFFF"
          style={{ letterSpacing: 1, fontFamily: 'IstokWeb_700Bold' }}
        >
          {group.inviteCode}
        </Txt>
        <View style={{ height: 12 }} />
        <Pill
          small
          label={copied ? t('members.copied') : t('members.share')}
          kind={copied ? 'dark' : 'yellow'}
          onPress={share}
          style={copied ? { backgroundColor: '#474747' } : undefined}
        />
      </Card>

      <View style={{ height: 16 }} />
      <Card style={{ paddingVertical: 8, paddingHorizontal: 18 }}>
        {members.map(({ user, role }, i) => (
          <View
            key={user.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 9,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.hairline,
            }}
          >
            <Avatar name={sel.userName(state, user.id)} size={24} index={i} />
            <Txt variant="body" size={14} color={colors.ink} style={{ marginLeft: 10, flex: 1 }}>
              {sel.userName(state, user.id)}
            </Txt>
            {role === 'leader' ? (
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
            ) : null}
          </View>
        ))}
      </Card>
      <View style={{ height: 8 }} />
      <Txt variant="caption" center>
        {t('members.joinHint')}
      </Txt>

      <View style={{ height: 24 }} />
      <Txt variant="caption" center>
        {t('members.respondedToday', { x: responded, n: total })}
      </Txt>
      <View style={{ height: 10 }} />
      <Pill
        small
        label={reminderSent ? t('members.reminderSent') : t('members.reminder')}
        kind={reminderSent ? 'dark' : 'yellow'}
        onPress={() => setReminderSent(true)}
        style={{ alignSelf: 'center', marginBottom: 24 }}
      />
    </Screen>
  );
}
